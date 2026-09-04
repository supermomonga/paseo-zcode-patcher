# paseo-zcode-patcher 設計文書

最終更新: 2026-09-05

状態: **実装・ローカルアプリ検証完了**

`paseo-zcode-patcher` は、公式 Paseo Desktop にZCode専用の組み込みプロバイダーを追加した、破棄可能なアプリコピーを生成するパッチャーである。ZCodeとの通信にACPを使わず、インストール済みZCodeの公式host serviceをPaseo serverから直接利用する。

## 固定した方針

- パッチ生成、安全検証、ASAR overlay、アプリコピー、署名は`paseo-acp-patcher`の方式を踏襲する。
- ZCodeの探索、互換性判定、host起動、session管理、event変換は`zcode-acp`の検証済み実装をNode.js向けに移植する。
- provider IDは`zcode`とし、Paseoの組み込みプロバイダーとして登録する。
- ACPおよび外部`zcode-acp`プロセスは実行経路に含めない。
- interaction用renderer componentは変更せず、既存の`PlanCard`、`QuestionFormCard`、`TodoListCard`を使用する。ZCodeのprovider iconだけはPaseo標準のGLM Agent iconへ対応付ける。
- 初版はPaseo 0.7.2 / macOS arm64とZCode 3.11.2の組合せだけを厳密にサポートする。
- `/Applications/Paseo.app`、`/Applications/ZCode.app`、Paseo設定、ZCode設定・credentialは変更しない。

## 文書一覧

- [製品仕様](product-specification.md): 目的、対象範囲、利用者向け動作、受け入れ条件
- [アーキテクチャ](architecture.md): component、状態、data flow、障害境界
- [Paseo provider contract](provider-contract.md): `AgentClient`実装とUIへの写像
- [ZCode private host protocol](zcode-private-protocol.md): 現在のversion固有contract
- [パッチ・ビルド・配布仕様](patching-and-release.md): overlay、ASAR、アプリコピー、署名
- [Testing and compatibility](testing-compatibility.md): test、実機確認、version更新手順
- [Security and licensing](security-and-licensing.md): 権限、credential、ログ、配布境界
- [Implementation status](implementation-status.md): 実装済み範囲、生成 hash、実機証拠、残るローカル確認
- [References](references.md): 根拠にしたsource、commit、文書
- [ADR一覧](adr/README.md): 採用済みの設計判断

## 現在固定している参照点

| 対象 | 参照値 |
| --- | --- |
| Paseo | 0.7.2 / source commit `9400a49af670fdb5db4af58e73f8df98588dbea9` |
| 元Paseo `app.asar` | SHA-256 `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` |
| ZCode | 3.11.2 / CLI 0.16.5 / host `zcode-host-3.11.2` |
| ZCode host protocol | `zcode-task-v1` |
| `paseo-acp-patcher`参照commit | `6c5c824e6eaa581f90cb1e809e1a59d61d2740f4` |
| `zcode-acp`参照commit | `7b3af187d7ee732e9043aed873a863fc855625c2` |

生成済み overlay は ASAR 18 entryとrenderer resource 1 entryで、overlay SHA-256 は `c8bcb816905f5416299919a8f04ab37fd07888d8476ce16b38c236678886aa03`、生成後 ASAR SHA-256 は `48ebc26679c0af07ba68f94b1a573f58475af5abfcf9f545f60d6001b1a38f78` である。entry ごとの hash は `artifacts/paseo-0.7.2-arm64/manifest.json` を正とする。

provider と `/Applications/PaseoZCode.app` の実機検証は完了している。生成 hash、strict 署名、3 回の独立 cold start、ZCode の利用可能表示、PlanCard、model pickerとcomposerのZCode iconの画面確認結果は [Implementation status](implementation-status.md) に記録する。
