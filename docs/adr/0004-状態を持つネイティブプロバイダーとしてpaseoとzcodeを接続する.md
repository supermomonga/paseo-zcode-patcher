---
number: 4
title: 状態を持つネイティブプロバイダーとしてPaseoとZCodeを接続する
status: accepted
date: 2026-09-04
links:
- target: 2
  kind: relatesto
- target: 6
  kind: relatesto
- target: 7
  kind: relatesto
---

# 状態を持つネイティブプロバイダーとしてPaseoとZCodeを接続する

## Context and Problem Statement

Paseo `AgentSession`とZCode private RPCはsession、prompt完了、subscription、permission、user input、cancelの状態機械が異なる。eventを逐次変換するだけでは、欠落、二重応答、誤った成功終了、tool再実行を防げない。

## Decision Drivers

* workspace、session、turn、interactionの状態を明示すること
* subscribe-before-sendとevent順序を保証すること
* request/responseをexactly onceで相関すること
* active promptの危険な自動再送を防ぐこと
* private protocol変更をPaseo surfaceから隔離すること

## Considered Options

* protocol-neutral session coordinatorを中心にしたstateful provider
* request/event単位のstateless mapper
* Paseo stateとZCode stateを独立保持してbest-effort同期する

## Decision Outcome

採用: **protocol-neutral session coordinatorを中心にしたstateful provider**。

runtime discovery、host bridge、private protocol client、session coordinator、Paseo event mapperを分離する。coordinatorはnative session ID、canonical workspace、active turn、event sequence、pending interactionを保持する。同一sessionのactive turnは一つとし、second promptはqueueせず拒否する。

### Consequences

* Good, because lifecycleとordering invariantをtest可能にできる。
* Good, because permission/question/planのresponseを元requestへ戻せる。
* Good, because unknown eventやchild crashを正常終了へ丸めずに済む。
* Bad, because connection/session/turnごとの状態管理が必要になる。
* Bad, because mapperだけでなくtransitionとcleanupのtestが必要になる。

### Confirmation

golden traceとunit testでsubscribe-before-send、sequence、single active turn、cancel、late response、double response、child exit、shutdownを確認する。active promptをnew childへ再送しないtestを置く。

## Pros and Cons of the Options

### Stateful provider

* Good, because 異なる状態機械を一か所で整合できる。
* Bad, because 実装量は増える。

### Stateless mapper

* Good, because 個々のevent変換は短い。
* Bad, because terminal、permission、cancel、orderingを正しく扱えない。

### Best-effort dual state

* Good, because 各protocolの内部表現を保持できる。
* Bad, because 同期不整合と不要なID mappingが増える。

## More Information

[Architecture](../architecture.md)と[Provider contract](../provider-contract.md)を参照する。
