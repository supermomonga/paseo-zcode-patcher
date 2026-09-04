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
- marker、integrity block、overlay、生成hashの決定性
- 未対応ASAR、未知entry、容量不足、中断時cleanup
- bundle/xattr比較と署名command construction

## 3. Overlay/provider tests

### Provider registration

- `zcode`がbuilt-in definition、factory、contractへ一度だけ登録される
- 既存provider definitions/factories/contractsが変わらない
- mode visualsと`yolo.isUnattended`が一致する
- renderer sourceとrenderer build artifactがoverlayに含まれない

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
- model provider未設定時のactionable diagnostic
- slash commandsとMCP server mapping

### Streaming and tools

- text/reasoning chunkの連結とmessage ID
- tool scheduled/start/progress/result/error transition
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
- planとtodoを別eventとして同時に保持できる
- todo空配列で古い表示を消す

## 4. Overlay build checks

固定Paseo source commitの一時archive上で次を実行する。

1. source patchをwhitespace errorなしで適用
2. frozen dependency install
3. protocol/provider registry/schema focused tests
4. ZCode provider/discovery/bridge/session/mapper tests
5. protocol/server typecheckとbuild
6. overlay entry import smoke
7. manifest/marker/hash生成
8. 同じ入力で二回生成し、byte-for-byte一致を確認

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
- `build`、`edit`、`plan`、`yolo`の切替
- session create、prompt、複数stream chunk、reasoning、usage
- read-only toolとwrite tool、allow/deny
- structured single/multiple question
- attachmentとMCP server
- cancel、resume、history、session list/import

### Plan UX

1. `plan` modeを選択する。
2. Markdownを複数段落・見出し・リストで生成させる。
3. `PlanCard`としてMarkdown全体が表示されることを確認する。
4. todoが存在する場合、別の`TodoListCard`として表示されることを確認する。
5. Dismissし、workspaceが変更されずnative deny/declineが返ることを確認する。
6. 再度planを作成してApproveし、同じnative turnが実装へ進むことを確認する。
7. `permission-plan-card` test IDが使用され、renderer差分がないことを確認する。

## 6. Negative runtime tests

- ZCodeなし、旧/new version、host hash/export差分
- ZCode loginなし、model providerなし
- malformed frame、unknown event、sequence duplicate/regression、child crash
- interaction中のinterrupt、session close、daemon shutdown
- UIからのstale/double response
- unsupported MCP/attachment/question shape
- PaseoまたはZCode更新後に、既存patched appがprovider unavailableを表示する

## 7. 2026-09-05 実施結果

- patcher test: 19件中18件成功、インストール済みZCodeを使う1件は通常実行ではskip。`RUN_ZCODE_RUNTIME_TEST=1`では同テストも成功。
- overlay test: 10 file、91件成功。
- protocol/serverの型検査とbuild、overlay entry importに成功。
- 18 entryのoverlayを同一入力からbyte-for-byteで再生成し、manifestのhashと一致。
- 実機providerでcatalog、短いprompt、stream、usage、session list、resume、history、cancel後のcleanupを確認。
- Plan Dismissでworkspace不変、Plan Approveで同じturnから実装へ進むことを確認。
- renderer、ACP route、外部`zcode-acp`実行経路がsource patchとoverlayに含まれないことを確認。
- patcher packageの`npm audit`は0件。固定Paseo 0.7.2 sourceの`npm ci`は上流依存に101件（low 8、moderate 44、high 42、critical 7）を報告。
- 許可された旧`zcode-acp`由来のZCode Helperを終了後、`/Applications/PaseoZCode.app`の生成に成功。生成ASARとmanifestのhash一致、元Paseo ASAR不変、strict署名を確認。
- 異なる`PASEO_HOME`とElectron user-data directoryで3回cold startし、毎回daemonがrunningになり、終了時にlifecycle RPCで正常停止した。
- 実画面でZCodeが「利用可能・4つのモデル」と表示され、model pickerにも4 modelが現れることを確認。
- ZCodeの`plan` modeでMarkdown、Approve、Dismissが既存`PlanCard`に表示されることを画面で確認し、画像を記録した。Dismiss後にworkspace変更と残存processがないことを確認。
- todoをplanとは別のtimeline eventとして`TodoListCard`へ渡すことはfocused testで確認。renderer差分はない。
- ZCode 3.11.2のworkspace stateが`thoughtLevel.current`なしで`defaultLevel`を返す実機contractを確認し、Thinking選択肢がmodel catalogから消える問題を修正。workspace既定値の採用と不正な既定値の拒否をfocused testで確認。
- 修正版アプリでThinkingの既定値`Max`、選択肢`Low` / `High` / `Max`を確認。`High`を指定して開始したsessionが正常応答し、composerでも`High`を保持することを確認。

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
3. source patchを新commitへ移植し、renderer無変更を再確認する。
4. overlay/manifest/hashを置換する。
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
