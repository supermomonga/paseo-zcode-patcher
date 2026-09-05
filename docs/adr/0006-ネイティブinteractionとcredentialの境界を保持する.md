---
number: 6
title: ネイティブinteractionとcredentialの境界を保持する
status: accepted
date: 2026-09-04
links:
- target: 4
  kind: relatesto
- target: 7
  kind: relatesto
- target: 10
  kind: relatesto
- target: 13
  kind: RelatesTo
---

# ネイティブinteractionとcredentialの境界を保持する

## Context and Problem Statement

providerはPaseo UI、ZCode interaction、workspace、credentialの境界に位置する。permissionやuser inputを似た別の応答へ丸めたり、credentialをproviderへ複製したりすると、利用者が意図しない権限付与やsecret漏えいにつながる。

## Decision Drivers

* native option/valueと利用者の選択を一対一で保持すること
* disconnect、timeout、unknown responseで安全側に停止すること
* credential/provider設定の所有者をZCodeに保つこと
* sensitive payloadをlogやPaseo metadataへ流さないこと

## Considered Options

* native interactionをlosslessに変換しcredential処理をZCodeへ委ねる
* unsupported interactionをdefault responseで補う
* providerがcredential/provider設定を直接管理する

## Decision Outcome

採用: **native interactionをlosslessに変換しcredential処理をZCodeへ委ねる**。

option ID、decision、question value、session/turn/request bindingをpending stateに保持する。allowへ安全に対応付けられない場合はallowを返さない。credential、provider registry、runtime headersの作成・保存・refresh・通常適用は公式ZCode hostへ委ね、providerは値を取得・保存・記録しない。

### Consequences

* Good, because UIの選択とZCodeが実行する権限を対応付けられる。
* Good, because credential形式とrefreshを再実装せずに済む。
* Good, because unsupported interactionを偽の成功にしない。
* Bad, because Paseo UIで表現できないnative decisionはturnを停止させる。
* Bad, because 継承environmentにsecretが含まれ得るため継続監査が必要になる。

### Confirmation

allow/deny/cancel、unknown/stale option、disconnect、timeout、structured input、provider header requestのtestを行う。secret fixtureを使い、log、metadata、ASAR、manifestへsecretが含まれないことを確認する。

## Pros and Cons of the Options

### Lossless interaction and ZCode-owned credentials

* Good, because 既存ZCode security modelを弱めない。
* Bad, because lossless変換できない機能は利用不可になる。

### Synthesized defaults

* Good, because turnを継続できる場合がある。
* Bad, because 利用者の同意なしに権限や入力を合成する危険がある。

### Provider-owned credentials

* Good, because 独自認証UXを作れる。
* Bad, because secret storageと攻撃面が増える。

## More Information

[Provider contract](../provider-contract.md)と[Security and licensing](../security-and-licensing.md)を参照する。
