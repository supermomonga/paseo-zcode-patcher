---
number: 7
title: プラン提案を既存PlanCardへ直接写像しtodoと分離する
status: accepted
date: 2026-09-04
links:
- target: 2
  kind: relatesto
- target: 4
  kind: relatesto
- target: 6
  kind: relatesto
---

# プラン提案を既存PlanCardへ直接写像しtodoと分離する

## Context and Problem Statement

ZCodeのMarkdown plan proposalを実行タスク一覧として表示すると、利用者には「実装前に承認するプラン」ではなく「実行中のタスク」と見える。ACP経由ではplan stateとapproval requestの標準相関が不足するが、ZCode native approval requestはMarkdown、request ID、optionsを一緒に持つ。Paseo 0.7.2のrendererはすでに`AgentPermissionRequest.kind === "plan"`を`PlanCard`へ表示できる。

## Decision Drivers

* Markdown planを承認前に完全に表示すること
* Approve/Dismissをoriginal native requestへ確実に戻すこと
* plan proposalとexecution task listを別の概念・UIとして扱うこと
* rendererを変更しないこと
* private metadata規約や別messageの相関を不要にすること

## Considered Options

* native approval requestをPaseoの`kind: "plan"`へ直接写像する
* Markdown planをtask-list timelineへ変換する
* 通常tool permission cardとして表示する
* rendererへZCode専用plan componentを追加する

## Decision Outcome

Chosen option: **native approval requestをPaseoの`kind: "plan"`へ直接写像する**。一つのnative requestに含まれるMarkdownとoptionをそのまま既存`PlanCard`へ渡し、plan proposalとexecution task listを別の状態として管理できるためである。

`ExitPlanMode` permissionまたは`schema.interaction === "plan_approval"` user inputだけをplan approvalとして認識する。`input.plan`を`input.plan`と`metadata.planText`へ入れ、native optionsからPaseo actionsを作る。native correlation dataはsession内pending mapに保持する。snapshotの実行タスク一覧は独立したPaseo timeline itemへ変換する。

Approve後はnative responseを返して同じturnの継続を待つ。Codex providerのような合成follow-up promptは送らない。

### Consequences

* Good, because 既存`PlanCard`でCodex等と一貫したプラン体験になる。
* Good, because planと実行タスク一覧を同時に独立表示できる。
* Good, because plan IDや`_meta`相関が不要になる。
* Bad, because native request shapeが変わればmappingを再検証する必要がある。
* Bad, because Paseo actionで表現できないnative optionは安全に拒否する必要がある。

### Confirmation

focused testで両native source、Markdown、actions、Approve/Dismiss、double response、cleanupを検証する。renderer sourceがoverlayに含まれないことをassertし、実機で`permission-plan-card`と別の`TodoListCard`表示を確認する。

## Pros and Cons of the Options

### Existing PlanCard contract

* Good, because 既存の専用UIとaccessibilityを再利用できる。
* Good, because native request単位で相関できる。
* Bad, because providerが厳密なaction mappingを持つ必要がある。

### Todo conversion

* Good, because task-list UIは既に存在する。
* Bad, because proposalとtaskの意味が異なり、利用者へ誤って伝わる。

### Generic tool permission

* Good, because permission infrastructureを再利用できる。
* Bad, because Markdown planの主目的と表示を表現できない。

### New renderer component

* Good, because ZCode固有表現を自由に追加できる。
* Bad, because 既存PlanCardで満たせる要件に対してpatch範囲が不必要に広い。

## More Information

[Provider contractのPlan approval](../provider-contract.md#9-plan-approval)を参照する。
