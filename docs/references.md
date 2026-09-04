# References

最終更新: 2026-09-05

## 1. Paseo patching reference

Repository: `paseo-acp-patcher`

参照commit: `6c5c824e6eaa581f90cb1e809e1a59d61d2740f4`

参照対象:

- `docs/reference/implementation-specification.md`
- `src/asar-patcher.ts`
- `src/bundle-verification.ts`
- `src/process-check.ts`
- `src/commands/patch.ts`
- `scripts/build-overlay.ts`
- `artifacts/paseo-0.7.2-arm64/manifest.json`
- ADR 0003、0007、0008、0009、0010

採用する内容はversion固定overlay、header-preserving ASAR更新、破棄可能なアプリコピー、元entitlements保持のad-hoc署名、external state非変更である。ACP V1 client、SDK、elicitation変換は採用しない。

## 2. ZCode headless reference

Repository: [supermomonga/zcode-acp](https://github.com/supermomonga/zcode-acp)

参照commit: [`7b3af187d7ee732e9043aed873a863fc855625c2`](https://github.com/supermomonga/zcode-acp/commit/7b3af187d7ee732e9043aed873a863fc855625c2)

参照対象:

- `src/zcode/discovery/`
- `src/zcode/host/`
- `src/zcode/protocol/v1/host-schemas.ts`
- `src/domain/session-service.ts`
- `docs/03-architecture.md`
- `docs/04-zcode-private-protocol.md`
- `docs/07-security-licensing.md`
- `docs/08-testing-compatibility.md`
- ADR 0003、0004、0005、0007、0010

採用する内容は公式host起動、artifact/protocol descriptor分離、strict compatibility、stateful session変換、native interaction/credential境界、plan recognitionである。ACP server、ACP schema、plan operations、Bun固有API、cross-platform binary buildは採用しない。

## 3. Paseo source contract

Repository: Paseo source checkout

対象commit: `9400a49af670fdb5db4af58e73f8df98588dbea9`

確認対象:

- `packages/protocol/src/provider-manifest.ts`
- `packages/protocol/src/provider-config.ts`
- `packages/protocol/src/agent-types.ts`
- `packages/server/src/server/agent/agent-sdk-types.ts`
- `packages/server/src/server/agent/provider-registry.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/components/question-form-card.tsx`

このcommitでは`AgentPermissionRequest.kind === "plan"`と`metadata.planText`または`input.plan`を既存`PlanCard`へ表示できる。`kind === "question"`と`input.questions`は既存`QuestionFormCard`を使い、`AgentTimelineItem.type === "todo"`は既存`TodoListCard`を使う。この既存contractを利用し、interaction表示のrenderer差分を作らない。provider iconについてだけ、既存GLM Agent catalog iconへの対応付けを追加する。

## 4. Version evidence

現在のZCode descriptorは次のsourceから取得した。

- `zcode-acp/src/zcode/discovery/manifest.ts`
- `zcode-acp/src/zcode/discovery/types.ts`
- `zcode-acp/docs/04-zcode-private-protocol.md`
- `zcode-acp/docs/08-testing-compatibility.md`

Paseoの元ASAR hash、source commit、patch formatは次から取得した。

- `paseo-acp-patcher/docs/reference/implementation-specification.md`
- `paseo-acp-patcher/artifacts/paseo-0.7.2-arm64/manifest.json`

## 5. Verification rule

参照commitは設計根拠であり、runtime compatibilityの代替ではない。実装・release時にはlocal source checkoutと実際のinstalled artifactを再検証し、差分があれば本repositoryのdescriptor、schemas、tests、documents、ADRの適用範囲を更新する。
