---
number: 11
title: ZCodeプロバイダーにGLM Agentの既存アイコンを割り当てる
status: accepted
date: 2026-09-04
links:
- target: 2
  kind: amends
- target: 8
  kind: amends
- target: 7
  kind: amends
---

# ZCodeプロバイダーにGLM Agentの既存アイコンを割り当てる

## Context and Problem Statement

Paseoのprovider icon解決は未知のprovider IDを汎用ロボアイコンへfallbackする。`zcode`はbuilt-in providerとして追加される一方、Paseo rendererの既知icon IDではないため、model pickerではZCodeのブランドを表さないロボアイコンが表示される。Paseo標準の`GLM Agent` providerはZCodeと同じZ.aiの既存SVGをすでに同梱している。

## Decision Drivers

* ZCodeをmodel pickerとcomposerで識別できること
* Paseoが同梱するGLM Agentの既存SVGをそのまま再利用すること
* 新しい画像assetやZCode専用UI componentを追加しないこと
* source-level test/buildを経たrenderer成果物だけを配布すること
* 元Paseoアプリを変更せず、固定hashで置換範囲を検証すること

## Considered Options

* `zcode`を既存の`glm-acp-agent` catalog icon IDへ明示的に対応付ける
* ZCode専用SVGを複製して追加する
* provider manifestへ汎用icon fieldを追加する
* 汎用ロボアイコンのままにする

## Decision Outcome

採用: **`zcode`を既存の`glm-acp-agent` catalog icon IDへ明示的に対応付ける**。`resolveProviderIconName("zcode")`だけを`{ kind: "catalog", id: "glm-acp-agent" }`へ解決し、既存の`acp-provider-icons/glm-acp-agent.svg`を描画する。

この判断はADR 0002の「rendererを変更しない」を、ZCode固有interactionのためのrenderer変更を行わないという範囲に限定して改める。ZCode専用componentやassetは追加せず、icon IDの対応付けだけをrendererへ追加する。

rendererはASAR外の`Contents/Resources/app-dist`にあるため、固定Paseo sourceからElectron向けweb exportを実行し、main renderer bundleだけをresource overlayへ含める。元bundleと生成bundleのhashをmanifestへ固定し、固定パスの既存fileだけを置換する。生成時にはmain bundleと参照用`index.html`以外の全build outputが元アプリと同一であることを検証する。`index.html`は元のbundle pathを維持するため変更しない。

### Consequences

* Good, because ZCodeとGLM Agentが同じ既存Z.ai SVGを使う。
* Good, because 画像assetの複製と新しいUI componentが不要である。
* Good, because resource overlayも元fileと生成fileのhashで検証される。
* Bad, because provider/serverだけでなくrenderer buildもoverlay生成に必要になる。
* Bad, because Paseo version更新時にmain renderer bundleのpathとhashを再検証する必要がある。

### Confirmation

`resolveProviderIconName("zcode")`のfocused testでcatalog IDを検証する。overlay buildではrenderer exportの差分範囲、元resource hash、生成resource hashを検証し、patcher testでは想定外の元resourceを置換前に拒否する。生成後の`PaseoZCode.app`でmodel pickerとcomposerのZCode iconがGLM Agentと同じ図形になることを実機確認する。

## Pros and Cons of the Options

### Existing catalog icon mapping

* Good, because 既存assetを唯一の正として再利用できる。
* Good, because 変更対象がprovider ID解決の一条件に限定される。
* Bad, because renderer bundleを配布差分へ含める必要がある。

### Dedicated ZCode SVG

* Good, because 独立した見た目を選べる。
* Bad, because 同じブランドassetを複製し、追跡対象を増やす。

### Generic manifest icon field

* Good, because 将来ほかのproviderでも利用できる可能性がある。
* Bad, because 現在の一対一対応に対してprotocolとrendererの汎用contract追加は過剰である。

### Keep the bot fallback

* Good, because 変更が不要である。
* Bad, because ZCodeを識別できず、要求を満たさない。

## More Information

[Patch and release](../patching-and-release.md)、[Testing and compatibility](../testing-compatibility.md)、[ADR 0002](0002-zcode専用の組み込みプロバイダーを直接統合する.md)、[ADR 0007](0007-プラン提案を既存plancardへ直接写像しtodoと分離する.md)、[ADR 0008](0008-検証済みoverlayで破棄可能なpaseoアプリコピーを生成する.md)を参照する。
