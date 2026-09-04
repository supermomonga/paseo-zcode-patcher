---
number: 8
title: 検証済みoverlayで破棄可能なPaseoアプリコピーを生成する
status: accepted
date: 2026-09-04
links:
- target: 5
  kind: relatesto
- target: 9
  kind: relatesto
- target: 10
  kind: relatesto
- target: 11
  kind: amendedby
---

# 検証済みoverlayで破棄可能なPaseoアプリコピーを生成する

## Context and Problem Statement

ZCode providerにはPaseo protocol/serverのsource変更が必要だが、Paseo forkのアプリ配布やインストール済みアプリへのin-place変更はこのtoolの目的ではない。対象buildと差分を監査でき、失敗時に元Paseoを壊さない方式が必要である。

## Decision Drivers

* 元Paseoを常に不変に保つこと
* target buildとoverlayをhashで厳密に限定すること
* source-level test/buildを経た成果物だけを適用すること
* 途中状態を固定出力として公開しないこと
* rendererなど無関係なentryを変更しないこと

## Considered Options

* version固定overlayを一時アプリコピーへ適用して検証後に配置する
* `/Applications/Paseo.app`をin-placeで更新しbackup/restoreする
* Paseo forkの完成アプリを継続配布する
* minified JavaScriptやASARを文字列置換する

## Decision Outcome

採用: **version固定overlayを一時アプリコピーへ適用して検証後に配置する**。

`/usr/bin/ditto --clone`で一時bundleを作り、元ASARのpacked dataを保持する`header-preserving-append-v1`でprovider overlayとdeterministic markerだけを追加・置換する。全entry、ASAR、bundle metadata、署名を検証後、`/Applications/PaseoZCode.app`へatomic renameする。元Paseoは変更しない。

### Consequences

* Good, because 元Paseoを修復するrestore pathが不要になる。
* Good, because targetと差分をmanifest/hashで監査できる。
* Good, because 失敗時は一時/出力copyだけを削除できる。
* Bad, because Paseo versionごとにoverlayとmanifestを再生成する必要がある。
* Bad, because アプリcopy分のdisk容量が必要になる。

### Confirmation

fixture ASARでdata/metadata保持、determinism、unsupported target拒否を確認する。実機で元bundle不変、一時失敗cleanup、fixed output、final ASAR/hashを確認する。

## Pros and Cons of the Options

### Disposable verified copy

* Good, because failure domainを新しいcopyへ限定できる。
* Bad, because copyとsigningの検証量が増える。

### In-place patch

* Good, because アプリが一つで済む。
* Bad, because 失敗、自動更新、backup mismatchで元installを壊し得る。

### Forked app distribution

* Good, because 通常build pipelineを利用できる。
* Bad, because 継続的なfork配布とupstream追従を引き受ける。

### Binary string replacement

* Good, because 短い処理に見える。
* Bad, because 再現性、構造検証、source-level testを失う。

## More Information

[Patch and release](../patching-and-release.md)と[ADR 0009](0009-元entitlementsを保持してパッチ済みアプリをad-hoc署名する.md)を参照する。
