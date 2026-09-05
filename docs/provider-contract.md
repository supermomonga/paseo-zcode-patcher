# Paseo ZCode provider contract

最終更新: 2026-09-05

この文書は、Paseo 0.7.2の`AgentClient` / `AgentSession`へZCode 3.11.2を直接接続する公開・内部contractを定義する。interaction用renderer contractは変更せず、provider icon IDを既存catalogへ対応付け、コンテキストとクオータを既存メーターへ渡す。

## 1. Provider definition

| Field | Value |
| --- | --- |
| ID | `zcode` |
| Label | `ZCode` |
| Description | `ZCode workspace agent with native planning, tools, and model selection` |
| Built-in | yes |
| Enabled by default | yes |
| Static default mode | `null`。ZCode workspaceの現在値を使用 |
| Icon | Paseo標準の`glm-acp-agent` catalog icon |

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

`getAvailableModes`は4つの固定modeを返し、`getCurrentMode`はsnapshotの現在値を返す。`setMode`はnative `setMode`を呼び、返却snapshotで変更を再確認する。snapshot、手動変更の応答、対象sessionの`state.updated.patch.mode.current`、`session.updated`内のmode変更に共通の更新処理を使い、モードが変わったときだけ`mode_changed`を通知する。同じ値の再通知ではイベントを重複させない。

`state.updated`は通知形式と対象sessionを検証し、workspaceが指定されていれば要求したworkspaceとの一致も確認する。session以外のscopeとmodeを含まないpatchはsessionのmodeを変更しない。不正なmodeや別sessionの通知はprotocol errorとして扱う。

Plan承認後の遷移先はZCodeが決める。ZCode 3.11.2の`exitPlanMode`は`prePlanMode ?? "build"`を選び、Planに入る前のmodeが記憶されていればそこへ戻る。記憶がなければ`build`（Ask Before Changes）になる。起動時にPlanを指定しても、native session作成後に別modeから変更した場合はそのmodeが記憶される。providerは承認後のnative通知を反映し、追加の`setMode`や合成promptで遷移先を上書きしない。

公式runtimeの`updateConfig`と`enterPlanMode`は、現在値がPlan以外のときだけ`prePlanMode`を記憶する。Planを再指定しても記憶を上書きしない。`exitPlanMode`は記憶したmodeを復元してから`prePlanMode`を消去し、`session_mode_changed`を記録する。protocolの`mapSessionEventType`はこのイベントを`session.updated`へ写像し、`{ mode, previousMode, source: "tool" | "command", toolCallId? }`をpayloadに保持する。providerは`previousMode`を持つpayloadをこの契約で検証する。ツールによる変更では`state.updated`が届かないため、このイベントを無視してはならない。復帰先をprovider内で別途記憶・推測しない。

### 新規作成画面からのPlan開始

Paseoのdraftでは、ZCodeの非Plan modeから`plan`へ変更した際の選択を`planReturnMode`として保持する。Plan再指定は保持し、非Plan・別host・別providerへ移れば消去する。作成画面を最初からPlanで開いた場合、別のdraftの復帰先は引き継がない。

作成要求の既存`providerOptions.planReturnMode`に`build` / `edit` / `yolo`だけを許す。指定時は`modeId: "plan"`を必須とし、不正値・未知option・矛盾した組合せをnative session作成前に拒否する。providerは新規作成後にmodelとThinkingを設定し、その後このmode、それから`plan`を適用し、ZCode自身に`prePlanMode`を記憶させる。この初期化はresume時には繰り返さない。承認処理から追加のmode変更やpromptは送らない。

ZCode GUIは送信前にsessionを事前作成するため、通常の新規作成画面でもランタイムへのmode変更が起きる。Paseoでは事前作成のライフサイクルを追加せず、送信前の選択を作成時まで保持して同じmode遷移を再現する。GUIの準備タイミングに依存する競合状態は再現対象としない。根拠と範囲は[ADR 0012](adr/0012-新規セッションのplan直前の選択をzcodeへ引き継ぐ.md)に記録する。

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

## コンテキストとアカウント使用量

`runtime.contextUsage.used / size`を`AgentUsage.contextWindowUsedTokens / contextWindowMaxTokens`へ写像する。初期snapshotと再開snapshotを購読開始時にも通知する。値がない場合は未取得として扱い、累積トークン数や架空のゼロで埋めない。現在値はモデル完了・圧縮・モデル変更・ターン終了で更新する。

`provider.usage.list.request`と`DaemonClient.listProviderUsage`に任意の`agentId`を追加する。指定時はサーバーが対象sessionの任意メソッド`getProviderUsage()`を呼ぶ。対応メソッドがない既存providerと、agentIdなしの一覧は既存のProviderUsageServiceを使う。ZCodeの未対応接続先や取得失敗は明示的な`ProviderUsage`を返し、他のアカウントの一覧へ代替しない。

クオータは現在モデルの接続先だけを対象とし、個人契約のZ.ai／BigModel（Coding Plan、Start Plan、公式hostが利用できるAPI接続先）に対応する。Team Planと任意の第三者接続先は未対応。取得結果は`providerId: "zcode"`にまとめ、接続先名・プラン・時間窓ごとの割合・リセット時刻を共通カードへ渡す。Coding Planは5時間・週間・月間ツールの順に表示し、月間ツールの残量行は省略する。Start Planの残量表示は保持する。

フロントエンドはセッション・モデルをquery keyに含め、host側はセッションごとに接続先を識別して5分間キャッシュする。同一接続先の進行中の取得を共有し、別接続先の遅延応答で現在のキャッシュを上書きしない。nativeエラー詳細はクライアントへ渡さず、クオータ失敗で進行中のturnを失敗させない。根拠は[ADR 0013](adr/0013-セッションの使用量を公式hostから取得して既存メーターへ渡す.md)。

Coding Planのリセット権は公式`getCodingPlanResetStatus`を同じ接続先で読み、期限切れを除いた枠別の回数と最短期限（UTC）を詳細行へ渡す。ゼロ件と取得失敗を区別し、読み取り失敗でも通常クオータは保持する。リセットを消費するメソッドは公開しない。[ADR 0014](adr/0014-公式hostからリセット権の残数と期限を読み取る.md)を参照する。
