---
number: 10
title: PaseoとZCodeの外部状態をパッチャーから変更しない
status: accepted
date: 2026-09-04
links:
- target: 6
  kind: relatesto
- target: 8
  kind: relatesto
---

# PaseoとZCodeの外部状態をパッチャーから変更しない

## Context and Problem Statement

patcherがprovider設定、ZCode install/update、login/logout、credential、既存processまで自動管理すると、ASAR patch以外の状態変更が増え、失敗時の責任範囲と利用者の意図が曖昧になる。direct providerはbuilt-in登録できるため、設定自動更新も不要である。

## Decision Drivers

* patcherの副作用を破棄可能な出力copyへ限定すること
* credentialとprovider設定の所有者をZCodeに保つこと
* 利用者の既存Paseo設定を保持すること
* process終了やinstall/updateを明示的な利用者操作にすること

## Considered Options

* patcherは元アプリと外部状態を読み取り検証だけする
* Paseo provider設定を自動追加する
* ZCodeを自動install/update/loginする
* 関連processを自動終了してpatchを続行する

## Decision Outcome

採用: **patcherは元アプリと外部状態を読み取り検証だけする**。

変更対象は一時Paseo copyと固定出力`/Applications/PaseoZCode.app`だけとする。元Paseo、元ZCode、Paseo config、ZCode settings/credentials、source checkoutを変更しない。関連processが動作中ならPID/commandを表示して拒否し、自動終了しない。ZCode install/login/updateは利用者が公式手段で行う。

### Consequences

* Good, because 副作用とrollback対象が明確になる。
* Good, because credentialやuser preferenceをpatcherが所有しない。
* Good, because built-in providerのため設定注入が不要である。
* Bad, because 利用者はprocess停止とZCode準備を自分で行う必要がある。
* Bad, because patcherはunsupported/missing ZCodeを自動修復しない。

### Confirmation

testでwrite/delete targetがtemporary/fixed outputだけであることを確認する。実機patch前後で元Paseo/ZCode、config、credential metadataのhash/mtimeが不変であることを確認する。process検出時にkillせず終了することを確認する。

## Pros and Cons of the Options

### Read-only external state

* Good, because 責任境界と失敗時状態が明確である。
* Bad, because setupを完全自動化しない。

### Auto-edit Paseo config

* Good, because 利用者の設定作業を減らせる。
* Bad, because built-in providerには不要で既存設定を壊し得る。

### Auto-manage ZCode

* Good, because 不足を自動修復できる可能性がある。
* Bad, because 公式install、terms、credential、update policyへ介入する。

### Auto-kill processes

* Good, because patchを続行しやすい。
* Bad, because 利用者の未保存状態を失わせる可能性がある。

## More Information

[Patch and releaseのExternal state](../patching-and-release.md#8-external-state)を参照する。
