# Implementation status

最終更新: 2026-09-06

## 現在の状態

Paseo 0.7.2 / macOS arm64 と ZCode 3.11.2 の固定された組合せに対する patcher、Paseo source patch、ZCode provider、overlay を実装している。コンテキスト使用量と使用中の接続先の個人契約クオータを既存メーターへ接続し、インストール済み`/Applications/PaseoZCode.app`へ反映した。今回の実機・実画面確認は下記の「コンテキスト使用量とクオータ表示」に記録している。それ以前の各節は、各修正時点の検証記録である。repository に Paseo/ZCode のアプリ本体や資格情報は含まない。

| Area | Status | 証拠 |
| --- | --- | --- |
| Architecture/ADR | complete | ADR 0002–0015 は Accepted、`adrs doctor` は error 0 |
| Patcher CLI | complete | `patch` 以外を拒否し、固定 path、preflight、process 検出、cleanup をテスト |
| ASAR patcher | complete | header 保持、entry hash、marker、整合性情報、決定性を fixture で検証 |
| Paseo source patch | complete | 固定 commit に whitespace error なしで適用し、protocol/server の型検査、build、provider icon focused test に成功 |
| ZCode runtime discovery | complete | app/CLI/host/RPC の version、hash、export、path を実機と自動テストで検証 |
| Host bridge | complete | method allowlist、schema、request 相関、上限、timeout、終了処理を実装 |
| Provider/session mapper | complete | catalog、stream、履歴、permission、question、plan、todo、cancel を実装 |
| Overlay/manifest | complete | ASAR 26 entry、renderer resource 1 entryと生成hashをmanifestに固定 |
| Provider runtime evidence | verified | 今回の実機hostでコンテキスト現在値・再開後の値・個人契約クオータの一致を確認 |
| macOS app/signing | verified | 今回の`/Applications/PaseoZCode.app`でmanifest hash一致、元Paseo ASAR不変、strict署名を確認。3回の独立cold startは過去の検証 |
| UI integration | verified | 今回の実画面で円アイコン・コンテキスト・契約名・クオータを確認し、ZCode公式の個人契約表示と照合 |

## ソース配布とローカル生成（2026-09-06）

Gitでソースコードのみを配布し、利用者のPCで固定Paseoソースを取得・検証してoverlayを生成する方式へ変更した。`npm run build`はCLIのコンパイル、公式archiveの取得とSHA-256照合、既存のsource patch適用・テスト・型検査・server/renderer build、生成manifestの照合、artifact testを順に実行する。生成manifest全体はGit管理の`manifests/paseo-0.7.2-arm64.json`と一致する必要がある。

新しい手順で実downloadから全buildまで成功した。Paseo側487 test（361件とapp 126件）、local artifact test 3件が成功し、全26 ASAR entryと1 renderer resource、overlay全体、生成後ASARのhashは下記の既存検証値と一致した。build後に取得sourceと依存関係の一時directoryが削除されることも確認した。

`artifacts/`、`dist/`、`node_modules/`のないソース一式でも`npm ci --ignore-scripts`、`npm test`、`npm run build:cli`が成功した。unit testは22件成功・実機opt-in 1件skip。新規5 testは正常なdownload・展開、hash不一致での未展開、HTTP error、network error、展開失敗を扱う。生成物のない`test:artifact`は3件とも失敗し、patchコマンドもアプリを検査する前にbuildを案内して終了した。

Gitのartifacts追跡は0件で、過去の履歴は書き換えていない。型検査・整形・diff検査は成功。ADR 0015はAcceptedとしてADR 0008を部分改訂し、目次を再生成した。`adrs doctor`は0 error、ADR 0001の既存warning/infoのみ。

今回の変更では既存アプリへのパッチ適用やUI再検証は行っていない。生成物が既存の検証値と一致することを確認しており、以下の実機・実画面の記録は各節に記載した以前の検証結果である。

## 固定された成果物

| 項目 | 値 |
| --- | --- |
| package | `paseo-zcode-patcher@0.1.0`、`private: true` |
| ASAR overlay entry 数 | 26 |
| renderer resource entry 数 | 1 |
| renderer resource SHA-256 | `0449533ce96288b2771b5646a38844fed6e25749acf74927a4a2635234670160` |
| overlay SHA-256 | `be8c60fbdd29c50724d8ecfb133e2cc6b6f1be479e0a7fb732dd5cf03442478e` |
| 生成後 `app.asar` SHA-256 | `047ef7bd7c061e2fbaedb73c411c0e611fea6306c3cf674d9e5001b69229d534` |
| 元 `app.asar` SHA-256 | `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` |
| ZCode host index SHA-256 | `30911a90dadc5c384959d00d95ccc70c8cf38c74a9cb99c3168b0897d046d215` |
| ZCode RPC module SHA-256 | `e66203598b60d8728260ad7631f295f9d6deb8276b06e8f0cab8776773c75b31` |

overlay は固定 Paseo source archive から独立に再生成して同じ hash になることを確認する。manifest と artifact test は上記の値を直接検証する。

## 実機 provider 検証

インストール済み ZCode 3.11.2 の公式 host を使い、資格情報を表示・複製せず次を確認した。

- provider catalog は 4 model と `build` / `edit` / `plan` / `yolo` を返す。
- 短い prompt は複数の stream/timeline event、usage、最終応答を返し、終了後に provider process を残さない。
- session list、resume、history は user message、reasoning、assistant message、todo を復元する。
- host が配信対象外 event を除外するため sequence に欠番が生じることを実測し、重複・逆行だけを異常として拒否する。
- Plan の Dismiss は workspace を変更せず、Approve は同じ native turn で実装へ進み、検証用ファイルを作成する。

## macOS アプリ検証

利用者の許可を得て、終了済みの別作業 `zcode-acp` から残っていた ZCode Helper（PID 13628、15686、16664）を終了した。これらは Unix の `Z` 状態ではなく、親作業の終了後も動作していた孤立プロセスだった。パッチャー自身は引き続き関連プロセスを自動終了せず、PID だけを示して拒否する。

その後、次を実機で確認した。

- `node dist/src/cli.js patch` が固定出力 `/Applications/PaseoZCode.app` を生成した。
- 出力 ASAR は当時のmanifest SHA-256と一致した。icon resource追加後の再生成値は`0c8e399e3df263ec32794d4e24c9e0b024ef5aac47b184b4e8f61fd6e3b7b3b5`である。
- 元 Paseo ASAR は SHA-256 `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` のままである。
- `codesign --verify --deep --strict --verbose=2` が成功した。
- 異なる `PASEO_HOME` と Electron user-data directory を使う cold start を 3 回行い、各回で画面と daemon の起動、終了時の lifecycle RPC による正常停止を確認した。
- 設定画面と新規 workspace の model picker で ZCode が 4 model を返した。
- model pickerのZCode providerと4 model、ZCode model選択後のcomposerに、GLM Agentと同じZ.ai iconが表示された。
- ZCode の `plan` mode で Markdown 全体、`Approve`、`Dismiss` が既存 `PlanCard` に表示された。確認セッションは Dismiss し、workspace を変更しなかった。
- todo は plan とは別の timeline event のまま `TodoListCard` へ渡されることを focused test で確認した。interaction表示のrendererは変更していない。
- 終了後に PaseoZCode、ZCode host、ZCode Helper の残存プロセスがないことを確認した。

### Thinking選択欄の修正

実機調査で、ZCode 3.11.2のworkspace stateはThinkingについて`enabled: true`、`available: low/high/max`、`defaultLevel: max`を返す一方、session作成前は`current`を返さないことを確認した。旧mapperは`current`がない場合にThinking options全体を省略していたため、Paseo composerに選択欄が表示されなかった。

protocol schemaへ`defaultLevel`を追加し、model catalogではsessionの`current`を優先し、存在しないworkspace stateでは`defaultLevel`を採用するよう修正した。enabledなcatalogの既定値が欠落するかavailable外の場合は、選択欄を黙って消さずprotocol errorとして拒否する。

修正版アプリの新規workspace画面で既定値`Max`と`Low` / `High` / `Max`の選択肢を確認し、`High`へ変更して開始したsessionでも`High`が保持されることを実機で確認した。

### ユーザー発言の重複表示修正

Paseoはcomposerから送信した発言を`clientMessageId`付きで先にtimelineへ記録し、providerが同じIDを付けたuser messageを返した場合は同じ発言として照合する。旧ZCode providerは`AgentRunOptions.clientMessageId`を破棄し、同じ本文をIDなしの別user messageとして通知していたため、画面に二重表示された。

`run`と`startTurn`からturn coordinatorへ`clientMessageId`を引き継ぎ、送信時のuser message通知へ同じIDを付与するよう修正した。これによりPaseoの既存照合処理がprovider通知を重複として正しく抑止し、providerが独自に生成した別のuser messageは従来どおり保持する。

修正版アプリで新規sessionを作成し、一意なpromptを送信した。user messageの吹き出しが1件だけ表示され、ZCodeの応答が正常に完了することを実画面で確認した。

### ZCode iconの修正

Paseoのprovider icon解決は未知のIDを汎用ロボアイコンへfallbackする。`zcode`はこの既知ID一覧に含まれないため、model pickerでロボアイコンになっていた。

`resolveProviderIconName("zcode")`を既存catalog ID `glm-acp-agent`へ明示的に解決し、PaseoがGLM Agent用に同梱するZ.ai SVGをそのまま再利用するよう修正した。新しい画像assetやZCode専用componentは追加していない。固定Paseo sourceから生成したmain renderer bundleだけをresource overlayへ追加し、元・生成hashとほかのrenderer build outputが不変であることを検証する。

icon対応済み`/Applications/PaseoZCode.app`を生成し、model pickerのZCode provider行と4 model、ZCode model選択後のcomposerで同じZ.ai iconを実画面確認した。終了後にPaseoZCode、ZCode host、ZCode Helperの残存processがないことも確認した。

### 子ツール実行後の履歴同期修正の検証

入力を省略した子ツール通知の扱いは[Provider contract](provider-contract.md#6-event-mapping)に定義する。通常ツールの入力と親の最終回答を保持し、子ツールの成功・失敗の両方を含む履歴応答がJSON変換後のWebSocket validatorに適合する回帰testを追加した。修正前は同testで失敗し、修正後は成功した。

固定ソースからのoverlay buildは関連100 testとprotocol/serverの型検査に成功した。生成したoverlayへ実機採取済みの通知35件を再投入し、初期snapshotを除く各通知後の履歴応答34回がすべてvalidatorを通り、親の最終回答と正常終了が保持されることを確認した。patcherは20 test成功、runtime opt-in testは通常実行で1件skip。今回変更したファイルに対するupstream lintは修正前後とも同じ既存10 errorで、新規errorはない。

ユーザーの許可により起動中の旧`zcode-acp`を終了し、修正版アプリを生成・署名した。インストール済みASARとmanifestのhash一致、元Paseo ASAR不変を確認した。元の会話を修正版アプリで開き、Exploreの結果を含む最終回答が表示され、履歴同期エラーが出ないことを確認した。元の会話へのプロンプト再送は行っていない。

### Plan承認後のモード同期修正

前回の`state.updated.patch.mode.current`とsnapshotからの同期だけでは不十分だった。前回の修正がインストール済みASARへ反映されていることをhashで確認したうえで、実機で`edit → plan → Approve`を再現すると、ZCodeは`edit`へ戻りファイル作成を完了する一方、providerは`plan`のままだった。

公式`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`を追跡した。`updateConfig`と`enterPlanMode`はPlan以外から入るときだけ`prePlanMode`を記憶し、Planの再指定では上書きしない。`exitPlanMode`は`prePlanMode ?? "build"`へ戻し、記憶を消去する。その際の`session_mode_changed`はprotocolの`mapSessionEventType`で`session.updated`へ変換され、`{ mode, previousMode, source, toolCallId? }`が保持される。実機でも承認後の`{ mode: "edit", previousMode: "plan", source: "tool", ... }`を観測し、この変更では`state.updated`が発行されないことを確認した。

providerが無視していた`session.updated`のmode変更payloadを検証し、既存のsnapshot更新処理を通して`mode_changed`へ反映するよう修正した。復帰先はZCode自身の記憶と決定に従い、providerから追加の`setMode`や実装開始promptは送らない。

実際の通知形式を使う回帰test 3件が修正前に失敗し、修正後はsession test 33件と固定sourceの関連test 123件が成功した。承認後の3モードへの復帰、実行中・待機中の変更、重複通知、不正なpayloadを検証した。前回追加したstate通知、snapshot、Dismiss、別session/workspaceの検証も継続して成功している。

固定sourceからprotocol/serverの型検査・build、renderer export、overlay再生成が成功した。同じoverlayから2回生成したASARのhashが一致し、manifest、artifact test、文書のhashを更新した。patcherは通常実行で20 test成功、runtime opt-in testは1件skip。別途`RUN_ZCODE_RUNTIME_TEST=1 npm test -- test/zcode-runtime.test.ts`で実機を使うtestを含む3件すべてが成功した。patcherの型検査、build、format確認も成功した。

実機ZCode hostに接続した修正版providerで、`build` / `edit` / `yolo`をそれぞれ選択してからPlanを2回指定し、プランを承認した。3例すべてで直前のmodeが復元され、providerの現在値とnative snapshotが一致し、同じturnで検証ファイルの作成が完了した。

修正版アプリを生成・署名し、インストール済みASARと現在のmanifestのhash一致、元Paseo ASAR不変、strict署名を確認した。専用の`/private/tmp/zcode-mode-ui-check`でUIセッションを`Edit automatically`から開始し、`Plan mode`へ変更した。Approve前に対象ファイルが存在しないことを確認し、Approve直後に画面が`Edit automatically`へ戻ることを画像とaccessibility treeで確認した。追加promptなしで`mode-ui-check.txt`（内容`OK`）が作成され、完了後も表示が保持された。既存のユーザーセッションにはpromptを送信していない。

### 新規作成画面のPlan直前の選択

前回の修正は既存native sessionのmode通知を同期するもので、新規作成画面内での選択履歴を引き継いでいなかった。公式ZCode 3.11.2のrendererを調査し、送信前から内部sessionを作成し、準備済みならUIのmode変更をそのsessionへ反映することを確認した。このため新規画面でも、非PlanからPlanへの変更をnativeが記憶できる。GUIが過去のdraftの非Plan modeを別途保存する仕様ではなく、事前作成の準備状況にも依存する。根拠と関数の対応は[private protocol](zcode-private-protocol.md#zcode-guiの新規セッションとplan復帰)に記録した。

Paseoの新規formで実際の非Plan→Planの選択を保持し、workspace draft/pending submissionを経て既存のproviderOptionsで作成時に渡す。model・Thinkingを設定した後、選択していた非Plan mode、Planの順にnativeへ適用する。復帰先は引き続きZCodeが決定し、承認処理からmode変更や追加promptは送らない。最初からPlanで開いた新規画面に過去のdraftの値は持ち越さず、resume時にも初期化を再実行しない。GUIのsession事前作成のタイミング差は再現しない。この限定したrenderer変更を[ADR 0012](adr/0012-新規セッションのplan直前の選択をzcodeへ引き継ぐ.md)でAcceptedとし、ADR 0002/0007/0011の改訂関係と目次を更新した。

最初のUI検証では、model設定前にmodeを変更するとnativeの返却catalogが現在modelの1件だけになり、選択済みの別modelが拒否される問題を検出した。実機応答を反映する回帰test 3件の失敗を確認し、初期化順序の修正で解消した。session/client testは41件成功。固定sourceの関連testは14 fileの211件とappのworkspace layout store 123件、計334件成功した。protocol/serverの型検査・build、renderer export、overlay生成も成功した。

app全体の型検査には既存の`draggable-list.native.tsx:122`の`dragGestureHostPresented`に関するTS2322が1件ある。固定commitの未変更appでも同一の出力となることを比較し、今回の追加による型errorはない。patcherは20件成功・通常実行のruntime test 1件skip、型検査・build・format確認も成功。別途runtime opt-in test 3件が成功し、packageに19 ASAR entryと1 renderer resourceが含まれることを確認した。

最終overlayのproviderを実機hostへ接続し、`GLM-5.3-Flash` / Thinking `low` / 初期`plan`で作成した。`planReturnMode`が`build` / `edit` / `yolo`の3例と、省略した1例すべてで、追加のmode変更をせず最初のプランを承認した。nativeとproviderの現在値はそれぞれ指定mode（省略時build）で一致し、同じturnで内容`OK`の検証ファイルを作成した。

最終成果物を`/Applications/PaseoZCode.app`へ反映し、ASAR・rendererのmanifest hash一致、元Paseo ASAR不変、strict署名を確認した。実画面で新規作成時に`Full access → Plan mode`を選び初回送信すると、Approve直後に`Full access`へ戻り、追加promptなしで`draft-yolo.txt`（内容`OK`）を作成して完了した。さらに別の新規作成画面を最初からPlanで開き、modeを変更せず送信すると、Approve直後の表示は`Ask before changes`になった。ファイル作成の通常確認をAllow onceで許可すると、追加promptなしで`draft-initial-plan.txt`（内容`OK`）を作成して完了した。両方の表示を画像とaccessibility treeで確認した。

### コンテキスト使用量とクオータ表示

`runtime.contextUsage.used / size`をコンテキスト現在値として使用し、新規・再開時のsnapshotとモデル応答完了・圧縮・モデル変更・ターン終了後の再取得から通知する。重複readをまとめ、数値が変わらなければ再通知しない。会話全体の累積usageとは分離する。

クオータ取得には任意の`agentId`をprotocol/client/serverへ通し、対象セッションの現在モデルから接続先を解決する。公式hostの`usage-stats.getEntitlementSnapshot`だけを許可し、`requirePreferredProvider: true`、`allowEnvApiKey: false`で別接続先への代替を禁止する。個人契約だけを対象とし、Coding Planの使用率0〜100とStart Planの残量比率0〜1を区別する。資格情報の取得・認証通信は公式hostが行う。

固定sourceの対象testは477件（17 fileの351件とapp 2 fileの126件）成功した。新規・再開・複数turn・圧縮・モデル変更、同一readの共有、累積値との分離、接続先別キャッシュ、5分の期限、モデル変更と遅延応答の競合、未契約・未対応・不正応答・取得失敗を検証した。共通client/serverの既存取得経路と非ZCodeの共有queryも成功している。

protocol/client/server/appの型検査、build、対象sourceの整形確認、renderer exportが成功した。以前app型検査で報告していた`dragGestureHostPresented`のTS2322は、`npm ci --ignore-scripts`で公式postinstallの依存パッチを適用していなかったことが原因だった。overlay生成で公式postinstallを実行し、既存の型エラーも解消した。変更対象sourceのlintは変更前後とも25 errorで、ファイルとruleの組合せ・件数は同一、新規errorは0。新設usage/UI hookファイルのlintは0 error。既存lint違反は今回修正していない。

patcherの通常testは20件成功・実機opt-in testは1件skip、型検査・build・整形確認も成功した。固定sourceへpatchを再適用した53 fileが実装sourceとbyte単位で一致した。overlayは25 ASAR entryと1 renderer resourceを含み、同じoverlayから生成したASARのhashは2回とも一致した。manifestとartifact testを更新し、`npm pack --dry-run`で全entryの包含も確認した。

2026-09-05 22:31 JST、最終overlayのproviderをZCode 3.11.2公式hostへ接続し、`builtin:zai-coding-plan` / `GLM-5.3`で検証した。新規sessionの短い応答後はコンテキスト`15611 / 1000000`、累積usageはinput `15828`・cached `192`・output `30`であり、混同されていない。同じnative sessionを再開して最初の購読でも`15611 / 1000000`を確認した。

クオータは接続先`Z.ai - Coding Plan`、プラン`GLM Coding Max`で、独立に取得した公式snapshotと次の値が一致した。リセット日時は公式ミリ秒値をUTCのISO日時へ変換し、ここではJSTで記録する。

| 項目 | Paseo使用率 | 公式残量率 | 公式リセット日時（JST） |
| --- | --- | --- | --- |
| 5時間 | 1% | 99% | 2026-09-06 01:27:40 |
| 週間 | 22% | 78% | 2026-09-11 00:41:15 |
| 月間ツール | 2% | 98% | 2026-09-20 00:41:15 |

月間ツールの残量は3896。公式画面の割合は丸められた値で、3896/4000から再計算して置き換えていない。

最終アプリを`/Applications/PaseoZCode.app`へ生成・署名し、元アプリ不変とmanifestのhashを検証した。関連processは自動終了していない。22:40〜22:47 JST、既存の検証workspace`/private/tmp/zcode-mode-ui-check`に別の検証用ZCode sessionを作成し、マイク左の円アイコンとホバー表示を画像・accessibility treeで確認した。複数モデル応答後は`3%使用・28k / 1mトークン`、上記の契約名・クオータ・残量が表示され、画面再読み込み後も復元された。22:45 JSTのZCode公式アプリ`Usage stats → Individual Plan`でも残量率99%・78%・98%と同じリセット日時を確認した。既存ユーザーsessionへのprompt送信は行っていない。

実機契約で照合したのはZ.ai Coding Planである。Start Plan、不正応答、別接続先の同時利用、圧縮後の減少は公式コードに基づく対象testで検証した。アプリを終了・再起動するUI検証は今回行っておらず、native session再開と画面再読み込みをそれぞれ検証した。取得前は既存の未取得リング、未対応・エラーは既存カードのメッセージ表示を使う。

設計判断はAcceptedの[ADR 0013](adr/0013-セッションの使用量を公式hostから取得して既存メーターへ渡す.md)に記録した。ADR 0008・0012を部分改訂し、資格情報境界のADR 0006を関連付け、目次を再生成した。`adrs doctor`は0 errorで、ADR 0001の既存warning/infoだけが残る。

### リセット残数・期限とクオータ表示順

公式hostの`getEntitlementSnapshot`にはリセット権が含まれないため、同じ`usage-stats`の読み取りAPI `getCodingPlanResetStatus`を追加した。現在のCoding Plan接続先を指定し、公式hostの厳密な接続先解決と資格情報取得を使用する。5時間・週間の各配列から期限切れを除外し、残数と最短期限を既存カードへ表示する。期限は端末のローカル時刻とUTCオフセット付きとする。取得失敗時は通常クオータを保持し、リセット情報だけ取得失敗として表示する。消費・請求・履歴既読化のAPIは許可していない。

Coding Planのクオータは5時間・週間・月間ツールの順に固定し、月間ツールの残量行を削除した。Start Planの残量は引き続き表示する。日時の詳細行に任意の`valueFormat: "datetime"`を追加し、UTCのISO日時をrenderer側でローカル時刻へ整形する。通常の文字列の詳細行はそのまま表示する。接続先hostと表示端末のタイムゾーンが異なっても、表示端末の設定に従う。

2026-09-05 22:57 JSTの実機hostは`availableFiveHourResets: []`、`availableWeekResets: [{ expireAt: 1790870399000 }]`を返した。当初のUTC表示は「週間リセット 1回」「最短期限 (UTC) 2026-10-01 15:59」だった。利用者の指定に合わせ、現在は端末側で変換し、日本時間では「最短期限 2026-10-02 00:59 +09:00」と表示する。この期限は公式画面の「1 reset available」「Expires in 26d 2h」と整合する。リセット権の消費は行っていない。

対象testは482件（356件＋app 126件）成功。今回変更した5 source fileのlintは0 error・0 warning、protocol/client/server/app型検査と整形確認、固定sourceからのoverlay再生成が成功した。patcherも20 test成功・実機opt-in test 1件skip、型検査・整形確認が成功している。ローカル時刻対応ではrendererと通信validatorを再生成し、26 ASAR entryと1 renderer resourceを含める。ADR 0014をAcceptedとしてADR 0013を部分改訂し、目次を再生成した。`adrs doctor`は0 error、既存ADR 0001のwarning/infoのみ。

ローカル時刻への変更では、UTC・日本時間・30分単位の時差・夏時間の有無を含む5 testを追加した。日本時間で`2026-10-02 00:59 +09:00`となることを確認し、対象testは計487件成功した。日時はUTCのISO文字列と`valueFormat: "datetime"`をprotocolで転送し、表示端末の`Intl.DateTimeFormat`で整形する。新しいfieldを検証する生成済み通信validatorもoverlayへ追加した。

アプリへの反映は、起動中の関連processをパッチャーが検出したため停止した。関連アプリの終了後に再実行し、画面を確認する必要がある。現在のmanifestは新しい生成物を表し、インストール済みアプリは更新待ちである。

### 使用量表示の英語文言

利用者の指定によりi18n化は行わず、ZCode providerが生成する使用量・クオータの日本語文言を英語へ変更した。クオータは`5-hour → Weekly → Monthly tools`、リセット残数は`5-hour resets` / `Weekly resets`、期限は`Earliest expiry`。回数は数値だけを表示する。取得失敗・未対応・未契約・ログイン要求・モデル変更時のメッセージとStart Planの残量ラベルも英語に統一した。公式の接続先名・プラン名・モデル名は変更していない。

変更はproviderと既存testの文言に限り、i18n用の通信拡張やrenderer変更は追加していない。ローカル日時の`2026-10-02 00:59 +09:00`形式、クオータの順序、月間ツール残量の非表示は維持する。対象session/usage test 55件が成功し、usage source/testのlintは0 error・0 warningだった。固定sourceからの再生成では全487 testとprotocol/client/server/app型検査が成功し、patcherの20 test・型検査・整形確認も成功した。rendererと他のruntime entryは不変で、生成物の変更はagent.js・usage.jsとmanifestに限られる。アプリ反映を再試行したが起動中の関連processを検出したため停止しており、今回もprocessは自動終了していない。

## 配布上の制約

参照した `paseo-acp-patcher` と `zcode-acp` の固定 commit には配布ライセンスの宣言がなかった。権利関係を確認するまで package は公開せず、`private: true` を維持する。Paseo の Apache-2.0 notice と production dependency の license は `NOTICE` と `LICENSES/` に記録している。

また、overlay の build 元である Paseo 0.7.2 の固定 lockfile は `npm ci` 時点で 101 件（low 8、moderate 44、high 42、critical 7）の既知脆弱性を報告する。patcher 自身の production/development dependency は `npm audit` で 0 件である。Paseo の対応 version を変更せずに依存関係だけを差し替えることは、生成物の互換性を壊すため行わない。

## 変更禁止範囲

- ZCode icon IDの対応付け、新規draftのmode受け渡し、セッション単位の使用量取得の接続以外のPaseo renderer、および既存interaction UI component
- 既存 Paseo provider と ACP 経路
- `zcode-acp` repository の公開 API または build
- 元 Paseo/ZCode install artifact
- Paseo/ZCode user settings と資格情報
- 過去 version 互換 fallback
