---
number: 15
title: ソースのみを配布し利用者のPCで検証済みoverlayを生成する
status: accepted
date: 2026-09-05
links:
- target: 8
  kind: amends
---

# ソースのみを配布し利用者のPCで検証済みoverlayを生成する

## Context and Problem Statement

本ツールはGitでソースコードのみを配布し、各利用者が自分のPCでPaseoへパッチを適用する。従来は生成済みoverlayをGitに同梱し、利用者のビルドをpatcherのコンパイルに限定していたが、生成物を配布しないという運用方針に合わない。

## Decision Drivers

* 生成済みCLI、overlay、npm package、アプリ本体を配布しないこと
* Gitに約30 MBの生成物を追加し続けないこと
* 利用者が指定ソースのcheckoutを手作業で準備せずにビルドできること
* 固定ソースと検証済み生成物のhash照合を維持すること

## Considered Options

* 公式の固定ソースを取得し、利用者のPCでoverlayを生成する
* Gitに生成済みoverlayを同梱する
* Releasesに生成済みoverlayを移し、利用時にdownloadする

## Decision Outcome

採用: **公式の固定ソースを取得し、利用者のPCでoverlayを生成する**。

`npm run build`でpatcherをコンパイルし、公式Paseo repositoryの固定commit archiveを取得する。Git管理のSHA-256と照合するまで展開せず、既存のソースパッチ適用、依存関係の固定install、テスト、型検査、server/renderer buildを実行する。取得元や期待hashを実行時に自動変更しない。

検証用manifestを`manifests/`で管理し、生成manifest全体との一致を要求する。検証後のoverlayとmanifestはGit管理外の`artifacts/`へ保存する。利用者はその後patchコマンドを実行する。取得ソースと依存関係は一時directoryに置き、成功・失敗時とも削除する。

生成物不要のunit testと、生成済みoverlayを必須とするartifact testを分離する。`private: true`はnpmへの誤公開防止として維持する。生成物を追跡対象から外しても過去のGit履歴は書き換えない。

ADR 0008の検証済みアプリコピー生成は維持し、overlayの準備を利用者のローカルbuildへ変更する。ソースパッチと参照コードのlicense条件は引き続き適用される。

### Consequences

* Good, because ソースのみを配布する運用と実装が一致する。
* Good, because Gitにはレビュー対象のソースと検証値だけが残る。
* Good, because 別の入力や環境で生成物が変化してもhash不一致で停止する。
* Bad, because 利用者にnetwork接続、build tools、時間、一時disk容量が必要になる。
* Bad, because 公式archiveの提供停止や内容変更時は原因調査と明示的な対応が必要になる。

### Confirmation

公式ソースの実downloadと全build、検証用manifestとの一致を確認する。unit testでは正常展開、hash不一致時の未展開、HTTP/network error、tar失敗を検証する。生成物なしでunit testが成功し、artifact testは未生成なら失敗することを確認する。Gitの追跡対象にartifactsが存在しないことも確認する。

## Pros and Cons of the Options

### 利用者のPCで生成

* Good, because 生成物を配布せず、固定ソースから再現できる。
* Bad, because 全利用者にbuild環境が必要になる。

### Gitへ同梱

* Good, because 利用者の準備時間を短縮できる。
* Bad, because ソースのみを配布する運用と合わず、生成物が履歴に蓄積する。

### Releasesから取得

* Good, because Gitの容量を減らせる。
* Bad, because 生成物の再配布は続くため今回の目的を満たさない。

## More Information

[パッチ・ビルド・配布仕様](../patching-and-release.md)と[ADR 0008](0008-検証済みoverlayで破棄可能なpaseoアプリコピーを生成する.md)を参照する。対応versionまたはsource patchの変更時は、検証用manifestと期待hashを検証結果に基づいて更新する。成果物の配布方針が変わる場合に再評価する。
