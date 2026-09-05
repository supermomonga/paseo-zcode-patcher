# paseo-zcode-patcher

Paseo 0.7.2 に ZCode 3.11.2 専用の組み込みプロバイダーを追加した、ローカル用の macOS arm64 アプリコピーを生成します。ACP や外部 `zcode-acp` プロセスは実行経路に含みません。

## 対応環境

- macOS arm64
- Node.js 22.12.0 以上
- `/Applications/Paseo.app` 公式 0.7.2（対応 ASAR の SHA-256 を厳密検証）
- `/Applications/ZCode.app` 公式 3.11.2 / CLI 0.16.5

上記以外のバージョン、別のインストール先、変更済み ZCode host は拒否します。互換性を推測するフォールバックはありません。

## 使用方法

Paseo、ZCode、および `zcode-acp` など ZCode host を利用するプロセスを終了してから実行します。

```console
npm ci --ignore-scripts
npm run build
node dist/src/cli.js patch
```

成功すると `/Applications/PaseoZCode.app` が作成されます。元の `/Applications/Paseo.app` と `/Applications/ZCode.app` は変更しません。既存の出力がある場合は、すべての事前検証が成功した後に限り置き換えます。

固定対象では、生成 ASAR とrenderer resourceのhash、strict 署名、3 回の独立した cold start、ZCode の 4 model、既存 `PlanCard`、GLM Agentと同じZ.ai iconの表示まで実機確認済みです。結果は [実装状況](docs/implementation-status.md) を参照してください。

現在のPlan承認後のモード同期修正はリポジトリ内のみの更新です。この修正のインストール済みアプリへの反映と実画面確認は未実施です。

## 開発と検証

```console
npm test
npm run typecheck
npm run build
npm run format:check
npm audit
```

固定 Paseo source commit のクリーンな checkout から overlay を再生成する場合:

```console
npm run build:overlay -- --paseo-source /path/to/paseo-at-9400a49af670fdb5db4af58e73f8df98588dbea9
```

詳細な仕様、セキュリティ境界、実機検証項目は [docs/README.md](docs/README.md) を参照してください。

## データと資格情報

プロバイダーはインストール済み ZCode の公式 host service を使います。ZCode のログイン、資格情報、モデルプロバイダー設定は ZCode が所有し、このパッチャーは作成・更新・コピーしません。プロンプト、workspace 情報、モデル通信は ZCode の利用条件とプライバシーポリシーに従います。Paseo 側の履歴保存とログは別に管理されます。

## 配布

Paseo と ZCode のアプリ本体は同梱しません。現在、参照した非公開プロジェクトの配布ライセンスが明示されていないため、この package は `private` のままです。公開配布前に [NOTICE](NOTICE) と [docs/security-and-licensing.md](docs/security-and-licensing.md) の条件を確認してください。
