# Testing and compatibility

最終更新: 2026-09-05

## 1. 互換性方針

初版はPaseo 0.7.2/macOS arm64とZCode 3.11.2の一組だけをサポートする。PaseoまたはZCodeの新版へ対応するときは、manifest、overlay、fixture、test、実機証拠、文書を同じ変更で置き換える。過去versionの分岐を追加しない。

## 2. Patcher unit tests

- platform、architecture、Node versionの拒否条件
- manifest/overlay/entry hashの検証
- 元Paseo version、architecture、ASAR hashの検証
- ZCode discovery/compatibility/smokeの成功と失敗
- Paseo/ZCode関連process検出
- 固定出力とsymlinkの削除制約
- fixture ASARのpacked data、metadata、欠落unpacked entry保持
- renderer resourceの元hash検証、固定file置換、置換後hash検証
- marker、integrity block、overlay、生成hashの決定性
- 未対応ASAR、未知entry、容量不足、中断時cleanup
- bundle/xattr比較と署名command construction

## 3. Overlay/provider tests

### Provider registration

- `zcode`がbuilt-in definition、factory、contractへ一度だけ登録される
- 既存provider definitions/factories/contractsが変わらない
- mode visualsと`yolo.isUnattended`が一致する
- `zcode`が既存`glm-acp-agent` catalog icon IDへ解決される
- renderer buildではmain bundleだけがresource overlayに含まれ、新しい画像assetが含まれない

### Runtime discovery

- `/Applications/ZCode.app`配下の正しいpathを解決する
- metadata semanticsと`darwin-arm64`を完全一致で検証する
- app/CLI version、host/RPC hash、required exportsを検証する
- root外symlink、未知version/hash/export、別platformを拒否する
- CLI-only hash差分は`modified` diagnostic、host差分はunsupportedになる
- system Node/PATH fallbackが存在しない

### Host bridge

- request ID相関、single writer、frame上限、timeout、late response
- method allowlistとsubscription lifecycle
- stdout/stderr隔離、child exit、graceful/forced cleanup
- browser requestへpayloadを複製せず`backend_unavailable`を返す
- native session parameterを`taskId`へ正しく変換する

### Session lifecycle

- subscribe-before-send
- create/resume/list/import/history/close
- sessionとcanonical workspaceのbinding
- single active turn、second prompt拒否
- cancel exactly once、terminal event待機、active prompt非再送
- history message/reasoning/file/tool/todoの順序

### Catalog and controls

- model refの可逆ID、重複/unknown ID拒否
- thinking optionのcurrent/available/set
- modeのcurrent/available/setと未知mode拒否
- sessionの`state.updated.patch.mode.current`、`session.updated`のmode変更payload、snapshotからのmode同期。各経路と手動変更の応答が重なった場合の重複抑止
- modeを含まないpatchとsession以外のscopeでmodeを変更しないこと。不正な通知、別session/workspace、未知modeでturnを失敗させること
- model provider未設定時のactionable diagnostic
- slash commandsとMCP server mapping

### Streaming and tools

- text/reasoning chunkの連結とmessage ID
- tool scheduled/start/progress/result/error transition
- 入力を省略した子ツールの開始・成功・失敗を含む履歴が、JSON変換後も実際のWebSocket validatorを通ること。親の入力と最終回答も保持する。
- usage、title、terminal reason
- unknown event/result/transitionのfail-closed

### Interaction

- native permission optionとPaseo actionの一対一対応
- allow/deny、allow-once/always相当のnative option ID保持
- `escalate`/`modify`、unknown/stale action、missing denyの拒否
- structured questionのsingle/multiple select、label/value逆変換
- dismiss、cancel、disconnect、timeout時にallowを返さない

### Plan and todo

- 両plan sourceの認識条件
- Markdown欠落、allow/deny不足、不正optionの拒否
- `kind: "plan"`、`input.plan`、`metadata.planText`、action mapping
- Approve/Dismissがoriginal requestへexactly onceで戻る
- response後に合成follow-up promptを送らない
- Approveの応答後もnative mode通知まではPlanを維持し、遅れて届く`build` / `edit` / `yolo`への変更を反映すること。承認処理から`setMode`を送らないこと
- Dismissではmodeを変更しないこと。実行中のPlanへの移行も反映すること
- planとtodoを別eventとして同時に保持できる
- todo空配列で古い表示を消す

## 4. Overlay build checks

固定Paseo source commitの一時archive上で次を実行する。

1. source patchをwhitespace errorなしで適用
2. frozen dependency install
3. protocol/provider registry/schema/provider icon focused tests
4. ZCode provider/discovery/bridge/session/mapper tests
5. protocol/server typecheckとbuild
6. Electron向けrenderer exportとmain bundle以外の同一性検証
7. overlay entry import smoke
8. manifest/marker/hash生成
9. 同じ入力で二回生成し、byte-for-byte一致を確認

## 5. 実機検証

macOS arm64、公式Paseo 0.7.2、公式ZCode 3.11.2、一時workspaceと隔離したPaseo user-dataを使う。credential内容は表示・コピーしない。

### Patch and launch

- patch前後で元Paseo/ZCodeのhashと署名が不変
- `PaseoZCode.app`のstrict署名検証
- daemon/renderer/helperのcold startを異なるuser-dataで3回
- provider snapshotでZCodeがreadyになる
- ZCode未起動状態からhost childを起動し、終了時に残存processがない

### Agent flow

- model catalogとthinking level
- model pickerとcomposerでZCodeがGLM Agentと同じiconを表示
- `build`、`edit`、`plan`、`yolo`の切替
- session create、prompt、複数stream chunk、reasoning、usage
- read-only toolとwrite tool、allow/deny
- structured single/multiple question
- attachmentとMCP server
- cancel、resume、history、session list/import

### 新規作成画面でのPlan開始

1. 最初のメッセージを送信する前にZCodeの`build` / `edit` / `yolo`を選択し、続けてPlanを選択する。
2. 初回promptからプランを提出させ、承認後に選択した非Plan modeへ戻って同じturnで実装が完了することを確認する。
3. Planを再選択しても復帰先が変わらず、Planから非Planへ戻して選び直すと新しい値になることを確認する。
4. 別の新規画面を最初からPlanで開いた場合、過去のdraftの復帰先を持ち越さないことを確認する。
5. schema、providerOptionsの受け渡し、native初期化順序とresume時の非再適用を自動testで確認する。

### Plan UX

1. `plan` modeを選択する。
2. Markdownを複数段落・見出し・リストで生成させる。
3. `PlanCard`としてMarkdown全体が表示されることを確認する。
4. todoが存在する場合、別の`TodoListCard`として表示されることを確認する。
5. Dismissし、workspaceが変更されずnative deny/declineが返ることを確認する。
6. 再度planを作成してApproveし、同じnative turnが実装へ進み、Paseoのmode表示がZCodeの現在値と一致することを確認する。遷移先はZCodeが保持する`prePlanMode`、記憶がなければ`build`である。
7. `permission-plan-card` test IDが使用され、interaction表示のrenderer差分がないことを確認する。

## 6. Negative runtime tests

- ZCodeなし、旧/new version、host hash/export差分
- ZCode loginなし、model providerなし
- malformed frame、unknown event、sequence duplicate/regression、child crash
- interaction中のinterrupt、session close、daemon shutdown
- UIからのstale/double response
- unsupported MCP/attachment/question shape
- PaseoまたはZCode更新後に、既存patched appがprovider unavailableを表示する

## 7. 2026-09-05 実施結果

- patcher test: 21件中20件成功、インストール済みZCodeを使う1件は通常実行ではskip。`RUN_ZCODE_RUNTIME_TEST=1`では同テストも成功。
- overlay test: 11 file、100件成功。入力なし子ツールの成功・失敗と履歴同期の回帰testを含む。
- protocol/serverの型検査とbuild、renderer export、overlay entry importに成功。
- ASAR 19 entryとrenderer resource 1 entryのoverlayを同じ入力から2回生成し、overlay/ASAR/resourceのhashが一致。
- 実機providerでcatalog、短いprompt、stream、usage、session list、resume、history、cancel後のcleanupを確認。
- Plan Dismissでworkspace不変、Plan Approveで同じturnから実装へ進むことを確認。
- ZCode icon IDの対応付けと新規draftのmode受け渡し以外のrenderer変更、ACP route、外部`zcode-acp`実行経路がsource patchとoverlayに含まれないことを確認。
- patcher packageの`npm audit`は0件。固定Paseo 0.7.2 sourceの`npm ci`は上流依存に101件（low 8、moderate 44、high 42、critical 7）を報告。
- 許可された旧`zcode-acp`由来のZCode Helperを終了後、`/Applications/PaseoZCode.app`の生成に成功。生成ASARとmanifestのhash一致、元Paseo ASAR不変、strict署名を確認。
- 異なる`PASEO_HOME`とElectron user-data directoryで3回cold startし、毎回daemonがrunningになり、終了時にlifecycle RPCで正常停止した。
- 実画面でZCodeが「利用可能・4つのモデル」と表示され、model pickerにも4 modelが現れることを確認。
- ZCodeの`plan` modeでMarkdown、Approve、Dismissが既存`PlanCard`に表示されることを画面で確認し、画像を記録した。Dismiss後にworkspace変更と残存processがないことを確認。
- todoをplanとは別のtimeline eventとして`TodoListCard`へ渡すことはfocused testで確認。interaction表示のrenderer差分はない。
- ZCode 3.11.2のworkspace stateが`thoughtLevel.current`なしで`defaultLevel`を返す実機contractを確認し、Thinking選択肢がmodel catalogから消える問題を修正。workspace既定値の採用と不正な既定値の拒否をfocused testで確認。
- composerから渡された`clientMessageId`をZCode providerのuser message通知へ引き継ぐことをfocused testで確認。Paseoの既存照合処理により送信済み発言が二重登録されず、IDなしの独立したuser messageを誤って除外しない。
- 修正版アプリの新規sessionで一意なpromptを送信し、user messageの吹き出しが1件だけ表示され、ZCodeの応答が正常に完了することを実画面で確認。
- 修正版アプリでThinkingの既定値`Max`、選択肢`Low` / `High` / `Max`を確認。`High`を指定して開始したsessionが正常応答し、composerでも`High`を保持することを確認。
- icon修正版アプリのmodel pickerでZCode providerと4 modelにGLM Agentと同じZ.ai iconが表示され、ZCode model選択後のcomposerにも同じiconが表示されることを確認。
- `npm pack --dry-run`でmanifestが参照するASAR 19 entryとrenderer resource 1 entryがpackageへ含まれることを確認。

### Plan承認後のモード同期修正

前回のstate通知だけを使った検証では、実際の承認後に届く`session.updated`を検証できていなかった。実機で再現して採取した通知形式を回帰testへ追加した。関連123 testとprotocol/serverの型検査・build、renderer export、overlay再生成が成功した。patcherは通常実行で20 test成功、実機runtimeのopt-in testは1件skip。別途opt-inを有効にしてruntime test 3件すべてが成功した。型検査、build、format確認、生成ASARの決定性とartifact hash検証も成功した。

実機providerで`build` / `edit` / `yolo`からPlanを2回指定して承認し、3例すべてで直前のmodeへの復帰、provider値との一致、同じturnでのファイル作成を確認した。修正版を`/Applications/PaseoZCode.app`へ反映し、実画面でも`Edit automatically → Plan mode → Approve → Edit automatically`と実装完了を確認した。更新後のASAR hash、元Paseo ASAR不変、strict署名も確認済み。詳細は[実装状況](implementation-status.md)を参照する。

### 新規作成画面のPlan直前の選択

公式GUIの事前session作成とmode反映処理を調査し、新規draftでの非Plan→Planの選択をnative初期化へ引き継ぐ修正を検証した。初期model設定の前にmodeを変更した場合の実機catalog縮小も回帰testへ追加し、3件の失敗から修正後の成功を確認した。固定sourceの関連testは計334件（211件とworkspace layout store 123件）成功。protocol/serverの型検査・build、renderer export、overlay生成、patcherの20 test・型検査・build・format確認も成功した。app全体の型検査は未変更の固定sourceと同一の既存TS2322が1件あり、新規errorはない。

最終providerを実機hostで新規Plan sessionとして作成し、modelをGLM-5.3-Flash、Thinkingをlowに指定した。初期復帰先build/edit/yoloと省略時buildの4例すべてで、最初のプラン承認後のnative/provider値が一致し、同じturnでファイル作成が完了した。

最終アプリの実画面でも、初回送信前のFull access→Planから承認後Full accessへ戻り、ファイル作成まで完了した。別の新規画面を初期Planのまま開始した場合は、前のFull accessを引き継がずAsk before changesへ戻り、通常のファイル変更確認を一度許可して実装が完了した。ASAR/renderer hash、元Paseo ASAR不変、strict署名とpackageへの全20 overlay entryの包含を確認した。詳細と既存型errorは[実装状況](implementation-status.md#新規作成画面のplan直前の選択)を参照する。

### コンテキスト使用量とクオータ表示

固定sourceの対象477 test、protocol/client/server/app型検査、build、source整形確認、renderer exportに成功した。patcherは20 test成功・実機opt-in test 1件skip、型検査・build・整形確認も成功。sourceのlintは修正前後で同じ25 error、新規errorは0だった。公式postinstallによる依存パッチを適用し、以前記録したapp型検査のTS2322も解消した。

対象testは新規・再開・複数turn・圧縮・モデル変更時の現在コンテキスト、累積usageとの分離、snapshot読み取りの共有、接続先別クオータ、モデル変更と取得完了の競合、5分のキャッシュ期限、未契約・失敗・不正レスポンス、既存providerの取得経路を検証する。固定sourceへの再適用結果53 fileと実装sourceのbyte一致、25 ASAR entryと1 renderer resourceのpackage包含、ASAR生成の決定性、manifest hashも確認した。

実機hostではコンテキスト`15611 / 1000000`とnative session再開時の復元を確認した。生成アプリでは円アイコン、ホバー、画面再読み込み後の復元を確認し、同一接続先のZCode公式`Individual Plan`画面と割合・リセット日時を照合した。Coding Plan以外の契約や別接続先同時利用などは対象testによる確認であり、実機アカウントを追加していない。詳細と実測表は[実装状況](implementation-status.md#コンテキスト使用量とクオータ表示)を参照する。

### リセット残数・期限と表示順

公式hostの読み取りAPIで、期限切れを除く5時間枠・週間枠の残数と最短期限を検証した。複数期限・ゼロ件・不正応答・取得失敗・Start Planでの非取得と、5時間→週間→月間ツールの順序・月間ツール残量の非表示を対象testへ追加した。対象482 testと4 packageの型検査が成功し、今回変更したsourceのlintは0 errorだった。実機の週間リセット1回と期限を公式応答で照合した。アプリ更新状況は[実装状況](implementation-status.md#リセット残数期限とクオータ表示順)を参照する。

## 8. Release判定

release可能なのは次をすべて満たす場合だけである。

- patcher/overlay/providerの全自動testが成功
- generated manifestとdocumented contractが一致
- 実機必須シナリオが成功
- PlanCard表示を画像で記録し、todo分離をfocused testで確認
- 元アプリ不変、patched app strict署名、process cleanupを確認
- secret fixtureがlog、ASAR、manifest、test outputに含まれない
- unsupported versionが実行前に拒否される

## 9. Version更新手順

### Paseo更新

1. source commitと公式ASARを特定する。
2. provider protocol/types/UI contractに変更がないか確認する。
3. source patchを新commitへ移植し、ZCode icon mapping、新規draftのmode受け渡し、セッション単位の使用量取得の接続以外のrenderer差分がないことを再確認する。
4. 元renderer bundle path/hashを含むoverlay/manifest/hashを置換する。
5. 全testと実機検証を完走する。
6. 旧Paseo entry、fixture、support記述を削除する。

### ZCode更新

1. app/CLI version、metadata、host index、RPC module、exportsを採取する。
2. `zcode-acp`のcurrent contractと差分を比較する。
3. artifact descriptorを置換し、意味論が変わる場合だけprotocol descriptor/mapperを変更する。
4. schemas、fixtures、文書を置換する。
5. permission、question、plan、todo、cancelを実機で再確認する。
6. 旧ZCode entry、fixture、support記述を削除する。

互換性をversion文字列だけから推測したり、旧parserをfallbackとして残したりしない。
