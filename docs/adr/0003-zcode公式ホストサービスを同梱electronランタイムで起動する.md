---
number: 3
title: ZCode公式ホストサービスを同梱Electronランタイムで起動する
status: accepted
date: 2026-09-04
links:
- target: 2
  kind: relatesto
- target: 5
  kind: relatesto
---

# ZCode公式ホストサービスを同梱Electronランタイムで起動する

## Context and Problem Statement

PaseoからZCodeのmodel/provider registry、credential、runtime headers、sessionを利用する必要がある。`zcode.cjs app-server --stdio`の直接経路ではdesktop provider registryを利用できず、system Nodeでhost moduleを起動するとZCodeが配布したruntimeとの組合せを崩す。

## Decision Drivers

* ZCode Desktopと同じprovider/credential経路を利用できること
* 公式配布物のruntimeとhost実装の組を維持すること
* ZCode artifactをcopy、改変、再配布しないこと
* verified install root外のruntime/moduleを起動しないこと

## Considered Options

* 公式host serviceをZCode同梱ElectronのNode互換modeで起動する
* `zcode.cjs app-server --stdio`を直接起動する
* Paseo同梱Nodeまたはsystem Nodeでhost moduleを起動する

## Decision Outcome

採用: **公式host serviceをZCode同梱ElectronのNode互換modeで起動する**。

`/Applications/ZCode.app`内のZCode Helperを`ELECTRON_RUN_AS_NODE=1`で起動し、worker内で検証済み`app.asar/out/host`を利用する。executable、CLI、metadata、host index、RPC moduleは同じrealpath配下から解決し、system runtimeへfallbackしない。

### Consequences

* Good, because ZCode Desktopと同じmodel/provider/credential処理を利用できる。
* Good, because adapter独自のcredential実装が不要になる。
* Good, because ZCode artifactをrepositoryやreleaseへ含めずに済む。
* Bad, because private host artifactをZCode releaseごとに再検証する必要がある。
* Bad, because 利用者は対応する公式ZCodeを別途installする必要がある。

### Confirmation

discovery testで同一install root、metadata semantics、platform、hash、exportsを検証する。実機でhost initialize、workspace state、session、実モデル応答を確認する。source検索でsystem Node/PATH fallbackとZCode artifactの同梱がないことを確認する。

## Pros and Cons of the Options

### Bundled Electron runtime

* Good, because 公式Desktopと同じruntime contractを保持する。
* Bad, because private hostの変更を追跡する必要がある。

### Direct CLI app-server

* Good, because 起動shapeが単純である。
* Bad, because 必要なprovider registryを利用できず製品要件を満たさない。

### Other Node runtime

* Good, because Paseo processだけで完結して見える。
* Bad, because ZCodeが配布・検証していないruntime組合せになる。

## More Information

[Architecture](../architecture.md)と[ZCode private host protocol](../zcode-private-protocol.md)を参照する。
