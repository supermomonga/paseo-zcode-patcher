# 製品仕様

最終更新: 2026-09-05

状態: 実装・ローカルアプリ検証完了

## 1. 目的

`paseo-zcode-patcher`は、ZCodeをPaseoのネイティブなAgent providerとして利用できる`/Applications/PaseoZCode.app`を生成する。ZCodeのstreaming、reasoning、tool実行、権限確認、構造化質問、プラン提案、todo、model・thinking level・mode選択、session persistenceをPaseoの既存UIへ直接写像する。

特にプランモードでは、Markdownプランを「タスク」ではなくPaseo既存の`PlanCard`として表示し、ZCodeが提示したApprove/Dismissの意味を保持したまま応答する。

## 2. 対象範囲

初版がサポートする組合せは次だけである。

| 項目 | 値 |
| --- | --- |
| Paseo | 0.7.2 |
| Paseo source commit | `9400a49af670fdb5db4af58e73f8df98588dbea9` |
| platform / architecture | `darwin` / `arm64` |
| 元`app.asar` SHA-256 | `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` |
| ZCode | 3.11.2 |
| ZCode CLI | 0.16.5 |
| ZCode host artifact | `zcode-host-3.11.2` |
| ZCode host protocol | `zcode-task-v1` |
| Node.js | 22.12.0以上 |

次は初版の対象外である。

- ACP client/server機能
- rendererの変更または新しいUI component
- Linux、Windows、macOS x64
- 複数Paseo versionまたは複数ZCode versionの同時サポート
- ZCodeのinstall、update、login、logout、credential管理
- PaseoまたはZCodeの設定ファイル自動変更
- ZCode browser backendの代替実装
- voice、rewind、Paseo native tools、追加workspace directory
- upstream PaseoへのPR、独自署名証明書による再配布

## 3. 利用者向けフロー

### 3.1 パッチ生成

1. 利用者がPaseoとZCodeを終了する。
2. `paseo-zcode-patcher patch`を実行する。
3. patcherがPaseoとZCodeの実体、version、hash、必要なexport、runtime smokeを検証する。
4. `/Applications/Paseo.app`を変更せず、一時コピーへoverlayを適用する。
5. 一時コピーを検証・ad-hoc署名し、`/Applications/PaseoZCode.app`として配置する。
6. 利用者が`PaseoZCode.app`を起動すると、`ZCode` providerが利用可能になる。

### 3.2 Agent利用

- provider一覧では`ZCode`として表示する。
- model、thinking level、modeはZCode workspace stateから取得する。
- modeは`build`、`edit`、`plan`、`yolo`を公開する。`yolo`だけをunattended modeとして明示する。
- ZCode session IDをPaseoのnative persistence handleとして保持し、同じworkspaceでresumeする。
- text、image、audio、file attachment、MCP server、slash commandは、検証済みnative contractで表現できる範囲だけを公開する。

### 3.3 プラン体験

ZCodeが次のいずれかを送った場合、専用のプラン承認として扱う。

- `permission.request`かつ`toolName === "ExitPlanMode"`
- `userInput.request`かつ`schema.interaction === "plan_approval"`

providerは同じnative requestに含まれる`input.plan`、request ID、option ID、allow/denyの意味を検証し、Paseoへ`AgentPermissionRequest`の`kind: "plan"`として通知する。Paseoは既存`PlanCard`でMarkdownを表示する。

- Approveは選択されたnative allow optionへ正確に戻す。
- Dismissは実在するnative deny option、またはnative user-inputの`decline`へ戻す。
- 応答後はZCode側で保留中だった同じturnを継続させる。Paseoから合成promptを追加送信しない。
- plan proposalはtodoへ変換しない。
- ZCode snapshotの`todos`は独立して`AgentTimelineItem { type: "todo" }`へ変換し、`TodoListCard`へ表示する。

## 4. 機能要件

### FR-1: Provider availabilityとcatalog

- provider IDは`zcode`、labelは`ZCode`とする。
- `/Applications/ZCode.app`の検出、compatibility gate、軽量runtime smokeが成功した場合だけavailableにする。
- model IDは`[providerId, modelId, variant|null]`のJSON文字列とし、native参照へ可逆に戻す。
- thinking optionsはZCodeの`thoughtLevel.available`から生成し、sessionの`current`またはworkspaceの`defaultLevel`を既定値にする。
- modeの現在値と選択肢をPaseoへ公開し、ZCodeが未知modeを返した場合は失敗させる。

### FR-2: Session lifecycle

- create、resume、history load、list、closeを実装する。
- native ZCode session IDをopaqueなsession IDとして保持する。
- `sessionId -> canonical workspace path`をbindingし、別workspaceからのresume/promptを拒否する。
- 一sessionにつきactive foreground turnは一つとし、同時promptはqueueせず拒否する。
- dynamic event subscriptionを`sendPrompt`より先に確立する。
- active promptをchild再起動後に自動再送しない。

### FR-3: Streamingとtimeline

- user/assistant message、reasoning delta、tool start/progress/result/error、usage、title、todoをPaseoの対応するeventへ変換する。
- native eventの順序、session ID、turn ID、sequenceを検証する。
- 未知event、未知terminal result、不正tool transitionを成功扱いせずturnを失敗させる。

### FR-4: Interaction

- 通常tool permissionはnative option IDとPaseo action IDを一対一に対応させる。
- structured user inputは既存`QuestionFormCard`へ変換し、表示labelからnative valueへ戻す対応表をpending stateに保持する。
- plan approvalは通常tool permissionと分離し、既存`PlanCard`を使用する。
- disconnect、timeout、cancel、不正optionではallowを返さない。
- `yolo`を暗黙に選択しない。

### FR-5: MCP、attachment、command

- Paseoのstdio/http/sse MCP設定をnative `mcpServers`へlosslessに変換できる場合だけ渡す。
- unsupported MCP fieldは無視せずsession作成を失敗させる。
- attachmentはZCode hostが受理するimage/audio/file shapeへ変換し、local file pathはabsolute pathとworkspace policyを検証する。
- snapshotのslash commandを`AgentSession.listCommands()`で公開する。

### FR-6: Diagnostics

- `isAvailable()`はunsupported version、path、hash、export、runtime smokeの失敗を`false`として返す。
- `getDiagnostic()`は失敗理由、検出version、host artifact/protocol、CLI integrity、runtime smokeを返す。
- credential、header、environment値、prompt/tool本文は診断へ含めない。

## 5. 非機能要件

- 同じ入力から同じASARを生成できること。
- 元Paseoと元ZCodeを常に不変に保つこと。
- unsupported artifactを推測やfallbackで起動しないこと。
- providerのstdout/stderrとPaseo daemonのprotocol/logを混在させないこと。
- shutdownでsubscription、pending interaction、child processを解放すること。
- renderer、既存provider、既存ACP経路へ変更を加えないこと。

## 6. 受け入れ条件

実装完了は次をすべて満たした時点とする。

1. patcherのtypecheck、unit test、format check、buildが成功する。
2. version固定Paseo sourceへpatchを適用し、protocol/serverのfocused testとbuildが成功する。
3. 元ASAR、overlay、生成ASAR、全変更entryのhashをmanifestへ固定できる。
4. `PaseoZCode.app`が厳密な署名検証を通り、元Paseoが変更されていない。
5. 実機でprovider catalog、session create/resume、streaming、reasoning、tool permission、structured input、cancelを確認できる。
6. plan modeでMarkdownが`PlanCard`、todosが`TodoListCard`に別々に表示される。
7. Approve/Dismissが正しいnative request IDとoption IDへexactly onceで返る。
8. unsupported Paseo/ZCode、未知event、不正interactionがfail closedになる。
9. credential、provider header、prompt/tool本文が生成物や既定ログへ混入しない。
