---
number: 5
title: 最新の検証済みPaseoとZCodeの組合せだけをサポートする
status: accepted
date: 2026-09-04
links:
- target: 3
  kind: relatesto
- target: 8
  kind: relatesto
---

# 最新の検証済みPaseoとZCodeの組合せだけをサポートする

## Context and Problem Statement

PaseoのASAR layoutとZCode host serviceはいずれも、今回のpatch/providerに対する公開versioned APIではない。表示versionや広いrangeだけで互換性を推測すると、壊れたアプリや誤ったpermission semanticsを実行する危険がある。

## Decision Drivers

* unknown artifactを変更・起動前に拒否すること
* support表明を再現可能なhashと実機証拠へ結び付けること
* 過去version分岐とfixtureを累積させないこと
* Paseo patch compatibilityとZCode runtime compatibilityを別々に検証すること

## Considered Options

* 最新の検証済みPaseo/ZCode一組だけを厳密にサポートする
* 複数の過去versionをmanifestへ累積する
* version rangeとbest-effort fallbackを使う

## Decision Outcome

Chosen option: **最新の検証済みPaseo/ZCode一組だけを厳密にサポートする**。private contractに対するsupport表明を、実測済みのsource commit、ASAR、host module、RPC module、required exportsへ限定できるためである。

初版はPaseo 0.7.2/source commit `9400a49af670fdb5db4af58e73f8df98588dbea9`/macOS arm64/元ASAR hash `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b`と、ZCode 3.11.2/CLI 0.16.5/`zcode-host-3.11.2`/`zcode-task-v1`だけを対象とする。新版対応ではdescriptor、overlay、manifest、fixtures、tests、documentsを置き換え、旧versionを残さない。

### Consequences

* Good, because support表明と検証証拠が一対一になる。
* Good, because unknown schemaやmethodを実行しない。
* Good, because 組合せ爆発を避けられる。
* Bad, because PaseoまたはZCode更新のたびに再生成と実機確認が必要になる。
* Bad, because 利用者はsupported pairへ合わせる必要がある。

### Confirmation

manifestがPaseo一組とZCode一組だけを表すtestを置く。旧/new version、same-version hash差分、required export差分を拒否する。release前にcurrent pairで全runtime scenarioを完走する。

## Pros and Cons of the Options

### One verified pair

* Good, because private contractの不確実性をfail closedにできる。
* Bad, because upgrade追従がrelease条件になる。

### Multiple historical versions

* Good, because 古いinstallを継続利用できる。
* Bad, because 実機再検証できないsupport表明が残りやすい。

### Version range/fallback

* Good, because unknown versionでも動く可能性がある。
* Bad, because permissionやtool semanticsの破壊を実行前に検出できない。

## More Information

[Testing and compatibility](../testing-compatibility.md)を参照する。
