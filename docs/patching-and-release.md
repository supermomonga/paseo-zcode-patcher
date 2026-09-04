# パッチ・ビルド・配布仕様

最終更新: 2026-09-05

## 1. 公開CLI

初版の公開コマンドは一つだけである。

```console
paseo-zcode-patcher patch
```

入力と出力は固定する。

| Role | Path |
| --- | --- |
| 元Paseo | `/Applications/Paseo.app` |
| ZCode runtime | `/Applications/ZCode.app` |
| 出力 | `/Applications/PaseoZCode.app` |

非標準install root、output override、restore、in-place patchは初版では提供しない。

## 2. 事前検証

変更を始める前に次をすべて検証する。

1. macOS arm64、Node.js 22.12.0以上である。
2. patcher manifest、overlay各entry、overlay全体のhashが一致する。
3. 元Paseoがsymlinkでないdirectoryで、version、architecture、元ASAR hashが対応対象と一致する。
4. ZCode discovery、artifact identity、host contract、CLI runtime smokeが成功する。
5. Paseo GUI、renderer、Helper、daemon、supervisor、およびproviderが起動したZCode host childが停止している。
6. 一時bundleとASAR生成に必要な空き容量がある。
7. `/Applications/Paseo.app`と`/Applications/ZCode.app`が処理中も同一であることを再検証できる。

関連processはPIDを示して拒否し、自動終了しない。processのcommand lineは長大な埋め込みsourceや利用者の引数を含み得るため表示しない。全事前検証が成功するまで既存出力を削除しない。

## 3. アプリ生成

1. 事前検証後、固定出力が存在すればtarget pathを厳密に検証して削除する。symlinkならリンク自体だけを対象とする。
2. `/usr/bin/ditto --clone`で`/Applications`内の一意な一時bundleへ元Paseoをコピーする。
3. clone内ASARが元hashと一致することを確認する。
4. clone内ASARだけへversion固定overlayを適用する。
5. overlay entry、marker、ASAR全体のhashをmanifestで検証する。
6. `ditto --clone`で保持されないsymlink timestampを元bundleへ合わせる。
7. ASAR以外のentry type、mode、uid、gid、size、mtime/birthtime、file hashまたはsymlink target、bundle xattrを比較する。
8. 元entitlementsを保持して一時bundle全体をad-hoc再署名する。
9. strict code-sign verification、ASAR、xattrを再検証する。
10. 一時bundleを`/Applications/PaseoZCode.app`へrenameし、最終検証する。

失敗時は一時bundleと不完全な固定出力を削除し、元Paseoと元ZCodeが変わっていないことを再確認する。

## 4. ASAR patch format

通常の全展開・再梱包は行わない。元ASARのpacked data regionをそのまま保持し、追加・置換entryとmarkerを末尾へ決定的に追加する`header-preserving-append-v1`を使う。

- 変更entryの`offset`、`size`、`integrity`だけを更新する。
- その他のheader metadata、未変更entry、packed entry、実体欠落のunpacked entryを保持する。
- integrityはSHA-256、block size 4 MiBとする。
- timestampやmachine固有pathをASARへ含めない。
- 同じ元ASARとoverlayから同じ生成ASAR hashを得る。

marker pathは`paseo-zcode-patcher.json`とし、次を含める。

```json
{
  "patcherVersion": "<package version>",
  "paseoVersion": "0.7.2",
  "paseoSourceCommit": "9400a49af670fdb5db4af58e73f8df98588dbea9",
  "originalAsarSha256": "67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b",
  "overlaySha256": "26b27cf48778d6ea41f03dfc4ff99d6caf76fa64d2ae1335111b496c8494dedf",
  "zcodeArtifact": "zcode-host-3.11.2",
  "zcodeProtocol": "zcode-task-v1",
  "zcodeAcpReferenceCommit": "7b3af187d7ee732e9043aed873a863fc855625c2",
  "patchFormat": "header-preserving-append-v1"
}
```

markerはtimestampやmachine固有pathを含まず、上記の固定値から決定的に生成する。

## 5. Paseo source overlay

`patches/paseo-v0.7.2-zcode.patch`をTypeScript source差分の正本とする。差分は次に限定する。

- protocolのbuilt-in provider definitionへ`zcode`を追加
- server provider registryへZCode client factoryとcontractを追加
- Node互換のZCode discovery、host bridge、schema、session、mapperを追加
- focused testと必要なpackage dependencyを追加

renderer、既存provider、既存ACP client、既存SDKは変更しない。

`scripts/build-overlay.ts`は指定Paseo checkoutが固定commitでcleanであることを確認し、`git archive`で一時directoryへ展開する。そこでsource patch適用、frozen install、protocol/server focused test、typecheck、buildを行い、overlayとmanifestを生成する。指定checkoutのworking treeは変更しない。

ZCode接続実装は`zcode-acp`参照commitの意味論をNode.jsへ移植する。Bun API、ACP server、ACP型、ACP fallbackをoverlayへ含めない。

## 6. Manifest

`artifacts/paseo-0.7.2-arm64/manifest.json`は次の正本とする。

- Paseo version、source commit、platform、architecture
- 元・生成ASAR SHA-256
- 追加・置換entryの元・生成hash
- overlay hashとpatch format
- marker path
- ZCode app/CLI version、artifact/protocol ID、host/RPC hash、required exports
- `zcode-acp`参照commit

表示versionだけが一致するbuildへ適用しない。manifestにないentryやhash差分を自動許容しない。

## 7. 署名とxattr

ASAR変更後の配布署名は無効になるため、元bundleのentitlementsを抽出して各code objectへ保持し、最外bundleを最後に署名する。署名は固定出力へrenameする前の一時bundleに対してだけ行う。

`codesign --verify --deep --strict`を必須とする。`com.apple.macl`はcodesign処理で変わり得るため、実測で必要な一件だけ比較例外とする。それ以外のxattrはprovenanceを含めて元bundleと一致させる。xattr削除でGatekeeperを回避しない。

## 8. External state

patcherは次を行わない。

- 元Paseo/ZCodeのfile変更、署名変更、移動、削除
- Paseo provider設定の追加・更新
- ZCode login/logout、provider設定、credential更新
- ZCode download/update
- processの自動終了
- source checkoutの変更

利用可能性はpatched providerがruntimeで再検証する。patch時に成功しても、その後ZCodeが更新されてcontract不一致になればproviderをunavailableにする。

## 9. Release artifact

初版releaseはnpm package/CLI sourceとversion固定overlay/manifestを含み、PaseoまたはZCode本体を含めない。release前にlockfile、checksums、dependency license一覧を検証する。生成済み`PaseoZCode.app`自体は配布しない。
