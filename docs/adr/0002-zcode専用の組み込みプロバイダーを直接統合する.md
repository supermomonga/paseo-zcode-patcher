---
number: 2
title: ZCode専用の組み込みプロバイダーを直接統合する
status: accepted
date: 2026-09-04
links:
- target: 3
  kind: relatesto
- target: 4
  kind: relatesto
- target: 7
  kind: relatesto
- target: 11
  kind: amendedby
---

# ZCode専用の組み込みプロバイダーを直接統合する

## Context and Problem Statement

ZCodeのMarkdownプラン、権限、構造化入力をPaseoで自然に表示する必要がある。ACP 1.4.0ではplan stateと承認要求を標準fieldで直接結び付けられず、汎用ACP providerだけでは既存`PlanCard`とnative approvalを確実に対応させられない。一方、ZCode private requestにはプラン本文、request ID、option ID、allow/denyの意味が同じrequestに含まれる。

## Decision Drivers

* ZCode固有のinteractionを欠落なくPaseo UIへ写像すること
* plan proposalと実行タスク一覧を分離すること
* ACPの非公式拡張や`_meta`合意へ依存しないこと
* rendererと既存providerを変更しないこと
* 外部adapter processを追加せずPaseoのsession lifecycleへ統合すること

## Considered Options

* `zcode` built-in providerをPaseo serverへ直接追加する
* `zcode-acp`をgeneric ACP providerから利用する
* ACPへZCode/Paseo専用の非公式metadata規約を追加する
* rendererにACP plan approval専用処理を追加する

## Decision Outcome

Chosen option: **Paseo serverへ`zcode` built-in providerを直接追加する**。ZCodeのnative interactionをPaseoのprovider contractへ直接対応させ、ACPでは表現しきれないplan approvalを保持できるためである。

providerはPaseoの`AgentClient` / `AgentSession`を実装し、ZCode private hostとの通信、session state、event mapping、interaction responseを所有する。外部`zcode-acp` binaryやACP SDKはruntime dependencyにしない。ZCode接続の意味論は固定した`zcode-acp`参照commitを基準にNode.jsへ移植する。

### Consequences

* Good, because native plan requestを既存`PlanCard`へ直接結び付けられる。
* Good, because permission、question、実行タスク一覧、model、modeもPaseoのnative contractへ写像できる。
* Good, because ACPの不安定仕様やclient capabilityに依存しない。
* Bad, because Paseo patchがZCode private protocolの保守責任を持つ。
* Bad, because `zcode-acp`と同じnative contractを別のruntime向けに追跡する必要がある。

### Confirmation

provider manifest/registryに`zcode`がbuilt-inとして登録され、ACP clientを生成しないtestを置く。runtime traceでPaseo daemonからZCode hostへ直接通信し、process treeに`zcode-acp`が存在しないことを確認する。renderer diffが空で、plan、question、実行タスク一覧が既存componentへ表示されることを実機で確認する。

## Pros and Cons of the Options

### Direct built-in provider

* Good, because ZCodeとPaseoの意味を一対一で接続できる。
* Good, because plan approvalに追加の相関規約が不要である。
* Bad, because patchとversion追従の範囲が広がる。

### Generic ACP provider

* Good, because ZCode接続責任を`zcode-acp`へ分離できる。
* Bad, because plan stateとapprovalの標準相関がなく、求めるUXを保証できない。

### Private ACP metadata convention

* Good, because 変更量を限定できる可能性がある。
* Bad, because agent/client間の暗黙合意が必要で汎用ACPではなくなる。

### Renderer extension

* Good, because 独自UI stateを扱える。
* Bad, because 既存`PlanCard` contractで足りる要件に対して変更範囲が大きい。

## More Information

[製品仕様](../product-specification.md)、[Provider contract](../provider-contract.md)、[ADR 0007](0007-プラン提案を既存plancardへ直接写像しtodoと分離する.md)を参照する。
