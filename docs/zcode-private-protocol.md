# ZCode private host protocol

最終更新: 2026-09-05

この文書は、初版が対応するZCode 3.11.2固有のcontractを記録する。公開APIではないため、記載したartifact identityに完全一致する場合だけ利用する。

## 1. Artifact identity

| Field | Value |
| --- | --- |
| Artifact ID | `zcode-host-3.11.2` |
| App version | `3.11.2` |
| CLI version | `0.16.5` |
| CLI SHA-256 | `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8` |
| Host index | `out/host/index.js` |
| Host index SHA-256 | `30911a90dadc5c384959d00d95ccc70c8cf38c74a9cb99c3168b0897d046d215` |
| RPC module | `out/host/chunk-KGXW6KHC.js` |
| RPC SHA-256 | `e66203598b60d8728260ad7631f295f9d6deb8276b06e8f0cab8776773c75b31` |
| Required exports | protocol `g`、client `i`、service `j` |
| Protocol ID | `zcode-task-v1` |

metadataは次を完全一致で検証する。

```json
{
  "runtime": "electron-node",
  "entry": "zcode.cjs",
  "source": "apps/zcode-cli/packages/cli/dist/zcode.cjs",
  "platform": "darwin-arm64"
}
```

`appBuild`とmetadata file全体のhashはdiagnosticとして記録するがcompatibility条件にはしない。CLI hashだけが異なる場合は`cliIntegrity: "modified"`と警告し、host index/RPC module/exportが一致する場合に限って起動を許す。

## 2. Runtime paths

install rootは`/Applications/ZCode.app`に固定する。次のpathは同じrealpath配下に存在し、所定のaccess modeを満たす必要がある。

```text
Contents/Frameworks/ZCode Helper.app/Contents/MacOS/ZCode Helper
Contents/Resources/glm/zcode.cjs
Contents/Resources/glm/.node-bundle-meta.json
Contents/Resources/app.asar
Contents/Info.plist
```

相対path、symlink解決後にinstall root外へ出るpath、別install rootから寄せ集めたfileを拒否する。

## 3. Launch

1. ZCode Helperを`ELECTRON_RUN_AS_NODE=1`で起動する。
2. childへ検証済みhost index、RPC module、artifact/protocol descriptorを固定値として渡す。
3. child内の`worker_threads.Worker`でhost indexをimportする。
4. Electron utility-processの`process.parentPort` event shapeをNode `MessagePort`へ変換する。
5. RPC moduleから検証済みexportを読み込み、`zcode-agent`と`zcode-task`channelを構成する。
6. allowlist済みoperationだけをline-delimited JSON bridgeへ公開する。

shellを介して起動せず、executableとargumentの配列を使う。Paseo daemonから継承したenvironment値はログへ出さない。

## 4. Internal bridge envelope

```json
{"id":1,"method":"initialize","params":{"workspacePath":"/workspace"}}
{"id":1,"result":{"available":true}}
{"method":"event","params":{"subscriptionId":"sub-1","event":{"type":"session.event"}}}
```

- UTF-8、1行1 JSON object
- `jsonrpc` fieldなし
- request IDはstringまたはinteger
- bounded frame size
- request/response相関とmethod別timeout
- single stdout writer
- malformed/unknown responseはfail closed
- pending entryがないlate responseは破棄して診断する

## 5. Service channelsとoperation

| Semantic operation | Service | Native method | Session parameter |
| --- | --- | --- | --- |
| cancel generation | `zcode-task` | `stopGeneration` | `taskId` |
| structured input | `zcode-task` | `respondElicitation` | `taskId` |
| permission | `zcode-task` | `respondPermission` | `taskId` |

provider内部では`sessionId`を使い、bridge adapterだけが`taskId`へrenameする。

common agent method allowlistは次とする。

```text
initialize
readWorkspaceState
createSession
resumeSession
listSessions
readSession
readSessionMessages
readSessionEvents
sendPrompt
closeSession
setModel
setThoughtLevel
setMode
getTaskTokenUsage
respondProviderRuntimeHeaders
disposeWorkspace
```

subscriptionは`onDynamicSessionEvent`だけを使用し、内部bridgeでは専用のsubscribe/unsubscribe operationとして扱う。

## 6. Session data

### Settings

- model: current `ModelRef`とavailable model options
- thought level: enabled、workspace既定値`defaultLevel`、session現在値`current`、available options
- mode: current string

未知mode、invalid model ref、duplicate model IDを拒否する。

### Snapshot

- session: ID、status、workspace、title、updatedAt
- messages: user/assistant part、reasoning、file、tool
- runtime: context usageとcost
- todos: content、`pending | in_progress | completed`、priority
- slash commands

snapshotのworkspace pathは要求したcanonical pathと一致しなければならない。

## 7. Dynamic events

top-levelでは次だけを受理する。

```text
snapshot
state.updated
permission.request
userInput.request
userInput.response
providerRuntimeHeaders.request
session.event
```

`session.event`は`eventId`、`sessionId`、non-negative `seq`、timestamp、delivery kind、type、payloadを必須とする。`desktop-continuous`では別のdynamic eventとして配送されるeventやfilter対象eventの番号が欠けるため、`seq`は狭義単調増加を要求し、重複と逆行を拒否する。増加方向の欠番は許容する。現在処理するevent typeはmodel streaming、tool update、turn completed/failed、title update、および実測上のno-op lifecycle eventに限定する。

未知typeを無視または正常終了へ丸めない。no-op扱いにするeventも、現在の検証済み一覧へ明示的に含める。

## 8. Reverse interaction

### Permission

requestは`requestId`、`sessionId`、任意turn ID、`toolCallId`、`toolName`、reason、risk、input、optionsを持つ。各optionは`optionId`、name、descriptionと、`allow | deny | escalate | modify`のnative responseを持つ。

通常permissionと`ExitPlanMode`を分離し、元option IDをexactly onceで返す。

### User input

requestはquestions、prompt、input、schemaを持つ。質問valueと表示labelを混同しない。plan approval markerは`schema.interaction === "plan_approval"`だけを使用する。

### Provider runtime headers

credentialと通常のheader生成は公式host内に任せる。interactive recovery requestには`headersApplied: false`を返してturnを失敗させる。header値をPaseoへ要求したり、偽の成功を返したりしない。

### Browser IPC

headless providerはZCode desktop browser backendを持たない。公式hostからの`browser-execute-request`には、同じrequest IDの`browser-execute-result`で`backend_unavailable`を即時に返す。request payloadを転送・保存しない。PaseoのMCP/browser機能へ代替転送しない。

## 9. Compatibility rule

起動前に次を順番に検証する。

1. install root、read/execute access、root内path
2. bundle metadata semanticsと`darwin-arm64`
3. app versionとCLI version
4. host index/RPC moduleのSHA-256
5. required exportsとprotocol ID
6. bundled CLIの`version`と`doctor --json` smoke

どれかが不一致ならproviderをunavailableにする。unsafe bypass、version range、旧response parser、system runtime fallbackは設けない。
