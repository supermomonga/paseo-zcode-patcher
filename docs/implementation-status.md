# Implementation status

最終更新: 2026-09-05

## 現在の状態

Paseo 0.7.2 / macOS arm64 と ZCode 3.11.2 の固定された組合せに対する patcher、Paseo source patch、ZCode provider、overlay を実装している。Plan承認後のモード同期に加え、新規作成画面でPlanを選ぶ直前のmodeもnative sessionへ引き継ぐよう修正し、インストール済み`/Applications/PaseoZCode.app`へ反映した。今回の実機・実画面確認は下記の「新規作成画面のPlan直前の選択」に記録している。それ以前の各節は、各修正時点の検証記録である。repository に Paseo/ZCode のアプリ本体や資格情報は含まない。

| Area | Status | 証拠 |
| --- | --- | --- |
| Architecture/ADR | complete | ADR 0002–0012 は Accepted、`adrs doctor` は error 0 |
| Patcher CLI | complete | `patch` 以外を拒否し、固定 path、preflight、process 検出、cleanup をテスト |
| ASAR patcher | complete | header 保持、entry hash、marker、整合性情報、決定性を fixture で検証 |
| Paseo source patch | complete | 固定 commit に whitespace error なしで適用し、protocol/server の型検査、build、provider icon focused test に成功 |
| ZCode runtime discovery | complete | app/CLI/host/RPC の version、hash、export、path を実機と自動テストで検証 |
| Host bridge | complete | method allowlist、schema、request 相関、上限、timeout、終了処理を実装 |
| Provider/session mapper | complete | catalog、stream、履歴、permission、question、plan、todo、cancel を実装 |
| Overlay/manifest | complete | ASAR 19 entry、renderer resource 1 entryと生成hashをmanifestに固定 |
| Provider runtime evidence | verified | 今回の実機hostで新規Plan開始の復帰先3種と履歴なしの計4例を検証し、native/provider値の一致と同じturnでのファイル作成を確認 |
| macOS app/signing | verified | 今回の`/Applications/PaseoZCode.app`でmanifest hash一致、元Paseo ASAR不変、strict署名を確認。3回の独立cold startは過去の検証 |
| UI integration | verified | 今回の実画面で初回送信前の`Full access → Plan`と初期Planの2例を検証。Approve後の表示はそれぞれFull accessとAsk before changes |

## 固定された成果物

| 項目 | 値 |
| --- | --- |
| package | `paseo-zcode-patcher@0.1.0`、`private: true` |
| ASAR overlay entry 数 | 19 |
| renderer resource entry 数 | 1 |
| renderer resource SHA-256 | `c1b30ac6f0f12f363145b721bbc3b5e3f680a25f38d95d46abe7b77f461e715e` |
| overlay SHA-256 | `f12dff31dff52579919cc84e92779613e4b17eed12e68cada8705fb3c1697b31` |
| 生成後 `app.asar` SHA-256 | `dc5b4045d65aef875d0e3fec07a7fd4ca118bb64b6e096c9c83cc8df108f77a5` |
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

## 配布上の制約

参照した `paseo-acp-patcher` と `zcode-acp` の固定 commit には配布ライセンスの宣言がなかった。権利関係を確認するまで package は公開せず、`private: true` を維持する。Paseo の Apache-2.0 notice と production dependency の license は `NOTICE` と `LICENSES/` に記録している。

また、overlay の build 元である Paseo 0.7.2 の固定 lockfile は `npm ci` 時点で 101 件（low 8、moderate 44、high 42、critical 7）の既知脆弱性を報告する。patcher 自身の production/development dependency は `npm audit` で 0 件である。Paseo の対応 version を変更せずに依存関係だけを差し替えることは、生成物の互換性を壊すため行わない。

## 変更禁止範囲

- ZCode icon IDの対応付けと新規draftのmode受け渡し以外のPaseo renderer、および既存interaction UI component
- 既存 Paseo provider と ACP 経路
- `zcode-acp` repository の公開 API または build
- 元 Paseo/ZCode install artifact
- Paseo/ZCode user settings と資格情報
- 過去 version 互換 fallback
