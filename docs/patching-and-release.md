# パッチ・ビルド・配布仕様

最終更新: 2026-09-06

## 1. 公開CLI

Gitでソースコードのみを配布する。利用者はcheckoutで`npm ci --ignore-scripts`と`npm run build`を実行し、ローカルに生成・検証したoverlayを使って次のコマンドを実行する。

```console
node dist/src/cli.js patch
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
3. 元Paseoがsymlinkでないdirectoryで、version、architecture、元ASAR hash、元renderer resource hashが対応対象と一致する。
4. ZCode discovery、artifact identity、host contract、CLI runtime smokeが成功する。
5. Paseo GUI、renderer、Helper、daemon、supervisor、およびproviderが起動したZCode host childが停止している。
6. 一時bundleとASAR生成に必要な空き容量がある。
7. `/Applications/Paseo.app`と`/Applications/ZCode.app`が処理中も同一であることを再検証できる。

関連processはPIDを示して拒否し、自動終了しない。processのcommand lineは長大な埋め込みsourceや利用者の引数を含み得るため表示しない。全事前検証が成功するまで既存出力を削除しない。

## 3. アプリ生成

1. 事前検証後、固定出力が存在すればtarget pathを厳密に検証して削除する。symlinkならリンク自体だけを対象とする。
2. `/usr/bin/ditto --clone`で`/Applications`内の一意な一時bundleへ元Paseoをコピーする。
3. clone内ASARとrenderer resourceが元hashと一致することを確認する。
4. clone内ASARへprovider overlayを適用し、固定されたmain renderer bundleへresource overlayを適用する。
5. ASAR/resource overlay entry、marker、ASAR全体のhashをmanifestで検証する。
6. `ditto --clone`で保持されないsymlink timestampを元bundleへ合わせる。
7. manifestで宣言したASAR/resource entry以外のentry type、mode、uid、gid、size、mtime/birthtime、file hashまたはsymlink target、bundle xattrを比較する。
8. 元entitlementsを保持して一時bundle全体をad-hoc再署名する。
9. strict code-sign verification、ASAR、renderer resource、xattrを再検証する。
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
  "overlaySha256": "be8c60fbdd29c50724d8ecfb133e2cc6b6f1be479e0a7fb732dd5cf03442478e",
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
- rendererの`zcode` icon IDを既存の`glm-acp-agent` catalog iconへ対応付け
- protocol/client/serverへ任意のagentIdによる使用量取得を追加し、既存メーターから対象セッションへ接続
- focused testと必要なpackage dependencyを追加

renderer変更はZCode icon IDの対応付け、新規draftのPlan直前のmode受け渡し、既存コンテキストメーターへのセッション単位のクオータ取得の接続に限定する。既存providerと既存ACP clientの実装は変更しない。共通clientの使用量取得には任意のagentIdを追加する。新しい画像assetやZCode専用componentは追加しない。

`scripts/build-overlay.ts`はGitHubの公式Paseo repositoryから固定commitのsource archiveを取得し、`src/constants.ts`のSHA-256と一致してから一時directoryへ展開する。そこでsource patch適用、frozen install、公式postinstallによる依存パッチ適用、protocol/server/provider/icon/form focused testとアプリ専用設定でのdraft保存test、typecheck、server build、Electron向けrenderer exportを行い、overlayとmanifestを生成する。renderer exportはmain bundleと参照用`index.html`以外が元アプリと同一であることを検証し、main bundleだけを元と同じ固定pathへ置換するresource entryとして保存する。生成manifest全体をGit管理の`manifests/paseo-0.7.2-arm64.json`と比較し、一致した生成物だけを`artifacts/`へ配置する。取得したsourceと依存関係は成功・失敗時とも一時directoryから削除する。既存のlocal checkout指定、最新版取得、生成済みoverlayのdownload、hash不一致の自動許容は提供しない。

ZCode接続実装は`zcode-acp`参照commitの意味論をNode.jsへ移植する。Bun API、ACP server、ACP型、ACP fallbackをoverlayへ含めない。

## 6. Manifest

Git管理の`manifests/paseo-0.7.2-arm64.json`を次の検証値の正本とする。ローカル生成後の`artifacts/paseo-0.7.2-arm64/manifest.json`はこの内容と一致し、patcherが実際のfile hashを再検証する。

- Paseo version、source commit、platform、architecture
- 元・生成ASAR SHA-256
- ASARの追加・置換entryとrenderer resource置換entryの元・生成hash
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

## 9. ソース配布とローカル生成

Gitではソースコード、ソースパッチ、固定commitと取得archiveのSHA-256、検証用manifest、テスト、文書、license/noticeを管理する。生成済みCLI、overlay、アプリ本体、npm packageは配布しない。`private: true`はnpmへの誤公開を防ぐため保持する。

`artifacts/`と`dist/`はローカル生成物としてGit管理から除外する。既存のGit履歴は書き換えないため、過去commitに含まれる生成物は残る。

`npm run build`は`build:cli`、source取得・検証とoverlay生成、`test:artifact`を順に実行する。`npm test`は生成物不要のunit testを実行し、`npm run test:artifact`は生成物が存在しない場合も失敗する。元アプリと生成物のhash検証に成功してから、利用者がpatchコマンドを実行する。

対応versionやsource patchを変更するときは、取得元とarchive hash、検証用manifest、期待hash、テスト、文書を合わせて更新する。入力やbuild環境が変わって生成物のhashが一致しなければ原因を調査し、検証を省略して進めない。
