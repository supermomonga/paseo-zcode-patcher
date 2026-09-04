---
number: 9
title: 元entitlementsを保持してパッチ済みアプリをad-hoc署名する
status: accepted
date: 2026-09-04
links:
- target: 8
  kind: relatesto
---

# 元entitlementsを保持してパッチ済みアプリをad-hoc署名する

## Context and Problem Statement

ASARを変更すると元Paseoの配布署名は無効になる。署名なしまたはentitlementsを失った再署名ではmacOSが起動を拒否したり、GUI、renderer、Helper、daemonのruntime条件が変わったりする。provenance/xattr削除による回避は安全な解決ではない。

## Decision Drivers

* patched appがmacOSのstrict署名検証と実行条件を満たすこと
* 元bundleのentitlementsを各code objectで保持すること
* provenanceを削除・改変しないこと
* 署名変更を一時copyだけへ限定すること

## Considered Options

* 元entitlementsを保持して一時copyをad-hoc再署名する
* 署名を変更しない
* entitlementsなしでad-hoc署名する
* xattr/provenanceを削除して起動制約を回避する
* Developer IDで署名・notarizeする

## Decision Outcome

採用: **元entitlementsを保持して一時copyをad-hoc再署名する**。

元Paseoから各code objectのentitlementsを抽出し、内側から外側の順でad-hoc署名する。最外bundleを最後に署名し、`codesign --verify --deep --strict`を必須とする。署名はbundle比較後、fixed outputへのrename前に行う。provenanceを削除しない。

### Consequences

* Good, because patched copyが元アプリに必要なruntime entitlementを保持する。
* Good, because 署名変更が破棄可能なcopyだけに限定される。
* Good, because xattr削除に依存しない。
* Bad, because 元のDeveloper ID署名とnotarizationは保持できない。
* Bad, because codesignによる許容xattr差分を実測・検証する必要がある。

### Confirmation

全code objectのentitlements比較、strict/deep verify、cold startを確認する。`com.apple.macl`以外のxattrが意図せず変化しないことを検証し、元Paseoの署名/hashが不変であることを確認する。

## Pros and Cons of the Options

### Entitlement-preserving ad-hoc signing

* Good, because local patched copyを実行可能にできる。
* Bad, because 公式配布署名にはならない。

### No resigning

* Good, because 署名処理を追加しない。
* Bad, because ASAR変更後の署名が無効なままになる。

### Ad-hoc without entitlements

* Good, because commandは単純になる。
* Bad, because native processの実行条件を壊す。

### Remove xattrs

* Good, because 一部環境で起動する可能性がある。
* Bad, because provenance改変であり、根本的な署名整合を解決しない。

### Developer ID/notarization

* Good, because 配布向けidentityを得られる。
* Bad, because 証明書、notarization、再配布責任を追加し初版範囲を超える。

## More Information

[Patch and releaseの署名](../patching-and-release.md#7-署名とxattr)を参照する。
