# Paseo ZCode provider contract

最終更新: 2026-09-05

この文書は、Paseo 0.7.2の`AgentClient` / `AgentSession`へZCode 3.11.2を直接接続する公開・内部contractを定義する。renderer contractは変更しない。

## 1. Provider definition

| Field | Value |
| --- | --- |
| ID | `zcode` |
| Label | `ZCode` |
| Description | `ZCode workspace agent with native planning, tools, and model selection` |
| Built-in | yes |
| Enabled by default | yes |
| Static default mode | `null`。ZCode workspaceの現在値を使用 |

provider manifestへ次のmode visualsを追加する。

| Native ID | Label | Color | Unattended |
| --- | --- | --- | --- |
| `build` | Ask Before Changes | `safe` | no |
| `edit` | Edit Automatically | `moderate` | no |
| `plan` | Plan Mode | `planning` | no |
| `yolo` | Full Access | `dangerous` | yes |

公開capabilityは次のとおりとする。

```ts
{
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsSessionListing: true,
  supportsDynamicModes: true,
  supportsMcpServers: true,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
  supportsNativePaseoTools: false,
  supportsRewindConversation: false,
  supportsRewindFiles: false,
  supportsRewindBoth: false,
}
```

## 2. `AgentClient` mapping

| Paseo method | ZCode operation |
| --- | --- |
| `isAvailable` | discovery、compatibility、軽量runtime smoke |
| `getDiagnostic` | version/hash/export/smokeの伏字済み結果 |
| `fetchCatalog` | `initialize` + `readWorkspaceState` |
| `createSession` | `createSession({ persistence: "immediate" })` |
| `resumeSession` | `resumeSession`、workspace一致検証、subscription再確立 |
| `listImportableSessions` | `listSessions({ includeArchived: false })` |
| `importSession` | `readSession`でhistoryを取得してresume可能なsessionを返す |
| `shutdown` | session、subscription、bridge、childを閉じる |

ZCodeのmodel catalogはworkspace stateから取得する。workspace scopeでは指定`cwd`、global scopeではPaseoの既存providerと同様に`node:os.homedir()`を探索用workspaceとして使い、`initialize`と`readWorkspaceState`だけを実行する。catalog取得のためにsessionを作成したりpromptを送信したりしない。どちらのscopeでも既定model一覧を推測しない。

## 3. Catalog mapping

### Model

ZCodeの`ModelRef { providerId, modelId, variant? }`を次の可逆IDへ変換する。

```ts
JSON.stringify([providerId, modelId, variant ?? null])
```

labelはZCode GUIと同じく`modelId`、descriptionは`providerLabel`を使用する。重複ID、不正tuple、現在modelがavailable listに存在しない場合はcatalogを拒否する。

### Thinking option

ZCode 3.11.2はworkspace stateでは`thoughtLevel.current`を返さず、`defaultLevel`と`available`を返す。session snapshotでは`current`も返る。`thoughtLevel.enabled`かつavailableが存在する場合、`current ?? defaultLevel`を既定値としてPaseoの`thinkingOptions`へ写像する。既定値がない、またはavailableに含まれない場合はcatalogを拒否する。`setThinkingOption`は`setThoughtLevel`へ変換し、未知IDを拒否する。

### Mode

`getAvailableModes`は4つの固定modeを返し、`getCurrentMode`はsnapshotの現在値を返す。`setMode`はnative `setMode`を呼び、返却snapshotで変更を再確認して`mode_changed`を通知する。

## 4. `AgentSession` mapping

| Paseo method | Behavior |
| --- | --- |
| `startTurn` / `run` | prompt変換後、subscriptionを先に確立して`sendPrompt` |
| `subscribe` | provider内部のsingle event dispatcherへ登録 |
| `streamHistory` | `readSession`のmessage/tool partsを時系列に変換 |
| `getRuntimeInfo` | current model、thinking、mode、ZCode versionを返す |
| `setModel` | reversible model IDを`ModelRef`へ戻して`setModel` |
| `setThinkingOption` | `setThoughtLevel` |
| `setMode` | native `setMode` |
| `listCommands` | snapshotの`slashCommands` |
| `getPendingPermissions` | sessionのpending mapのsnapshot |
| `respondToPermission` | pending native interactionへexactly onceで応答 |
| `interrupt` | `stopGeneration({ taskId })`、terminal eventを待つ |
| `close` | cancel、pending解決、subscription dispose、native close |
| `describePersistence` | `{ provider: "zcode", sessionId, nativeHandle: sessionId }` |

`startTurn`と`run`はPaseoから渡された`AgentRunOptions.clientMessageId`を保持し、送信したpromptに対応するlive `user_message`へ同じIDを付与する。PaseoはこのIDでcomposerの送信済み発言とprovider echoを照合する。IDのない別のuser messageを本文一致だけで除外しない。

`steerActiveTurn`、feature、rewind、out-of-band promptは初版では公開しない。

## 5. Prompt input

- text blockは順序を保持してnative textへ連結する。
- image/audio/fileはfilename、MIME type、dataまたはabsolute local pathを保持する。
- URI metadataよりpayload bytesを優先する。
- unsupported URI scheme、相対path、未知content blockはprompt送信前に拒否する。
- MCP serverはcreate/resume時に渡し、active turn中の変更を拒否する。

## 6. Event mapping

| ZCode event/data | Paseo event/timeline |
| --- | --- |
| assistant text delta | `assistant_message` stream |
| reasoning delta | `reasoning` stream |
| tool scheduled/start/progress | running `tool_call` |
| tool result | completed `tool_call` |
| tool error | failed `tool_call` |
| snapshot `todos` | `{ type: "todo", items }` |
| context usage | `usage_updated` |
| title update | session metadata update |
| turn completed | `turn_completed` |
| turn failed | `turn_failed` |

tool detailは既存Paseo tool normalizerで安全に表現できる種類だけを具体型へ変換し、それ以外は`unknown` detailにraw input/outputを保持する。tool名だけから危険性や権限を推測しない。

ZCode 3.11.2の`source: "subagent"`を持つ子ツール通知は、入力のstream通知を伴わず、開始・完了通知にも`input`を含めない。この場合の入力不明はPaseoの既存`unknown` detailの`input: null`で表す。入力が提供される場合はその値を保持する。`undefined`のまま送ると必須fieldがJSONから消え、子ツールを含む履歴応答全体が拒否されるため、子ツールの開始・終了から履歴取得まで通信schemaに適合することを検証する。

## 7. Tool permission

native `permission.request.options`から各actionを次のように作る。

- `id`: native `optionId`
- `label`: native `name`
- `behavior`: `response.decision === "allow"`なら`allow`、`deny`なら`deny`
- `variant`: allowは`primary`または`secondary`、denyは`danger`
- `intent`: denyは`dismiss`

`escalate`と`modify`はPaseo 0.7.2のaction contractへlosslessに写像できないため、表示前にinteraction全体を拒否し、実在するdeny optionがあればそれを返す。allow/deny optionが一つもない場合もallowを合成しない。

Paseoからの`selectedActionId`は必須として検証し、元requestのoption ID、表示時に記録したbehaviorと一致する場合だけnative responseを返す。

## 8. Structured user input

通常の`userInput.request`は`kind: "question"`として既存`QuestionFormCard`へ送る。`input.questions`はPaseoのshapeへ変換し、各質問についてnative valueと表示labelの対応をpending stateに保持する。

- single/multiple selectを保持する。
- option labelとheaderはrequest内で一意でなければならず、multiple-selectの区切りに使われる`", "`をlabelへ含めない。
- Paseoが返す`updatedInput.answers[header]`を対応表でnative valueへ戻す。
- 自由記述はnative schemaが明示的に許す場合だけ公開する。
- 変換不能なschema、重複label、未知回答、空の必須回答は表示前に拒否する。
- Dismissは`decline`、interrupt/closeは`cancel`として返す。

## 9. Plan approval

### 9.1 Recognition

次のいずれかだけをplan approvalとする。

```text
permission.request.toolName == "ExitPlanMode"
userInput.request.schema.interaction == "plan_approval"
```

`input.plan`が空でないMarkdown文字列であることを必須とする。tool名やprompt本文の部分一致では判定しない。

### 9.2 Paseo request

```ts
{
  id: `zcode-plan:${nativeRequestId}`,
  provider: "zcode",
  name: "ZCodePlanApproval",
  kind: "plan",
  title: "Plan",
  description: nativeReasonOrPrompt,
  input: { plan: markdown },
  actions: mappedNativeOptions,
  metadata: {
    planText: markdown,
    source: "zcode_plan_approval",
  },
}
```

permission sourceでは、allow/denyのnative optionをそのままPaseo actionへ写像し、両方が存在することを必須とする。user-input sourceでは、単一選択の各native optionをallow actionへ写像し、Paseo側のDismiss用deny actionを一つ追加してnative `decline`へ対応させる。

native request ID、toolCall ID、response payloadはclient-visible metadataではなくsession内pending mapに保持する。

### 9.3 Response

- permission sourceではoriginal `requestId`と選択option IDを`respondPermission`へ返す。
- user-input sourceでは選択valueをnative structured contentへ戻し、`respondElicitation`へ返す。
- Dismiss/cancel/errorではallowを返さない。
- response後は同じnative turnの続行を待つため、`AgentPermissionResult.followUpPrompt`は返さない。
- plan approvalとtodoには共通IDや上書き関係を持たせない。

## 10. Todo

snapshotのtodoは順序を保持し、`content`、`status`、`priority`をPaseo `AgentTaskItem`へ変換する。空配列は直前のtodo表示を消すtimeline updateとして扱う。Markdown planをtodo itemへ入れない。

## 11. Pending stateとcleanup

- pending keyはPaseo request ID、値はnative source、request ID、turn ID、option/value map、resolved flagとする。
- 新planが届いても別requestを暗黙にdismissしない。ZCodeのrequest IDごとに独立して処理する。
- terminal event、interrupt、session close、bridge exitでは全pending requestをdeny/cancelし、UIへ`permission_resolved`を通知する。
- resolved requestへのlate UI responseはnativeへ送らず明示的なnot-found errorとする。
