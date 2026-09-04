# Implementation status

最終更新: 2026-09-05

## 現在の状態

Paseo 0.7.2 / macOS arm64 と ZCode 3.11.2 の固定された組合せに対する patcher、Paseo source patch、ZCode provider、検証済み overlay を実装し、`/Applications/PaseoZCode.app` の生成と実機確認まで完了した。repository に Paseo/ZCode のアプリ本体や資格情報は含まない。

| Area | Status | 証拠 |
| --- | --- | --- |
| Architecture/ADR | complete | ADR 0002–0010 は Accepted、`adrs doctor` は error 0 |
| Patcher CLI | complete | `patch` 以外を拒否し、固定 path、preflight、process 検出、cleanup をテスト |
| ASAR patcher | complete | header 保持、entry hash、marker、整合性情報、決定性を fixture で検証 |
| Paseo source patch | complete | 固定 commit に whitespace error なしで適用し、protocol/server の型検査と build に成功 |
| ZCode runtime discovery | complete | app/CLI/host/RPC の version、hash、export、path を実機と自動テストで検証 |
| Host bridge | complete | method allowlist、schema、request 相関、上限、timeout、終了処理を実装 |
| Provider/session mapper | complete | catalog、stream、履歴、permission、question、plan、todo、cancel を実装 |
| Overlay/manifest | complete | 18 entry と生成 hash を manifest に固定 |
| Provider runtime evidence | complete | 実機 host で catalog、prompt、resume/history、Plan の Dismiss/Approve を確認 |
| macOS app/signing | complete | `/Applications/PaseoZCode.app` を生成し、strict 署名、3 回の独立 cold start、正常停止を確認 |
| UI integration | complete | ZCode が「利用可能・4つのモデル」と表示され、実機 PlanCard に Markdown と Approve/Dismiss が表示されることを確認 |

## 固定された成果物

| 項目 | 値 |
| --- | --- |
| package | `paseo-zcode-patcher@0.1.0`、`private: true` |
| overlay entry 数 | 18 |
| overlay SHA-256 | `af28209c4bbb26c4bab2901feb2cb52d28e82dc3327f2b22d204005f5fdce5d4` |
| 生成後 `app.asar` SHA-256 | `6c3531db45cb75e9c2efd9748527c8cdb462ab13c10c8e5455e430ac369242c8` |
| 元 `app.asar` SHA-256 | `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` |
| ZCode host index SHA-256 | `30911a90dadc5c384959d00d95ccc70c8cf38c74a9cb99c3168b0897d046d215` |
| ZCode RPC module SHA-256 | `e66203598b60d8728260ad7631f295f9d6deb8276b06e8f0cab8776773c75b31` |

overlay は固定 Paseo source archive から独立に再生成して同じ hash になることを確認する。manifest と artifact test は上記の値を直接検証する。

## 実機 provider 検証

インストール済み ZCode 3.11.2 の公式 host を使い、資格情報を表示・複製せず次を確認した。

- provider catalog は 4 model と `build` / `edit` / `plan` / `yolo` を返す。
- 短い prompt は複数の stream/timeline event、usage、最終応答を返し、終了後に provider process を残さない。
- session list、resume、history は user message、reasoning、assistant message、todo を復元する。
- host が配信対象外 event を除外するため sequence に欠番が生じることを実測し、重複・逆行だけを異常として拒否する。
- Plan の Dismiss は workspace を変更せず、Approve は同じ native turn で実装へ進み、検証用ファイルを作成する。

## macOS アプリ検証

利用者の許可を得て、終了済みの別作業 `zcode-acp` から残っていた ZCode Helper（PID 13628、15686、16664）を終了した。これらは Unix の `Z` 状態ではなく、親作業の終了後も動作していた孤立プロセスだった。パッチャー自身は引き続き関連プロセスを自動終了せず、PID だけを示して拒否する。

その後、次を実機で確認した。

- `node dist/src/cli.js patch` が固定出力 `/Applications/PaseoZCode.app` を生成した。
- 出力 ASAR は当時のmanifest SHA-256 `0fa10f90161111128e83da0420851ef3c78b548ec8d2ade26fe49e891219bd32` と一致した。
- 元 Paseo ASAR は SHA-256 `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b` のままである。
- `codesign --verify --deep --strict --verbose=2` が成功した。
- 異なる `PASEO_HOME` と Electron user-data directory を使う cold start を 3 回行い、各回で画面と daemon の起動、終了時の lifecycle RPC による正常停止を確認した。
- 設定画面と新規 workspace の model picker で ZCode が 4 model を返した。
- ZCode の `plan` mode で Markdown 全体、`Approve`、`Dismiss` が既存 `PlanCard` に表示された。確認セッションは Dismiss し、workspace を変更しなかった。
- todo は plan とは別の timeline event のまま `TodoListCard` へ渡されることを focused test で確認した。renderer は変更していない。
- 終了後に PaseoZCode、ZCode host、ZCode Helper の残存プロセスがないことを確認した。

### Thinking選択欄の修正

実機調査で、ZCode 3.11.2のworkspace stateはThinkingについて`enabled: true`、`available: low/high/max`、`defaultLevel: max`を返す一方、session作成前は`current`を返さないことを確認した。旧mapperは`current`がない場合にThinking options全体を省略していたため、Paseo composerに選択欄が表示されなかった。

protocol schemaへ`defaultLevel`を追加し、model catalogではsessionの`current`を優先し、存在しないworkspace stateでは`defaultLevel`を採用するよう修正した。enabledなcatalogの既定値が欠落するかavailable外の場合は、選択欄を黙って消さずprotocol errorとして拒否する。

修正版アプリの新規workspace画面で既定値`Max`と`Low` / `High` / `Max`の選択肢を確認し、`High`へ変更して開始したsessionでも`High`が保持されることを実機で確認した。

### ユーザー発言の重複表示修正

Paseoはcomposerから送信した発言を`clientMessageId`付きで先にtimelineへ記録し、providerが同じIDを付けたuser messageを返した場合は同じ発言として照合する。旧ZCode providerは`AgentRunOptions.clientMessageId`を破棄し、同じ本文をIDなしの別user messageとして通知していたため、画面に二重表示された。

`run`と`startTurn`からturn coordinatorへ`clientMessageId`を引き継ぎ、送信時のuser message通知へ同じIDを付与するよう修正した。これによりPaseoの既存照合処理がprovider通知を重複として正しく抑止し、providerが独自に生成した別のuser messageは従来どおり保持する。

修正版アプリで新規sessionを作成し、一意なpromptを送信した。user messageの吹き出しが1件だけ表示され、ZCodeの応答が正常に完了することを実画面で確認した。

### 子ツール実行後の履歴同期修正の検証

入力を省略した子ツール通知の扱いは[Provider contract](provider-contract.md#6-event-mapping)に定義する。通常ツールの入力と親の最終回答を保持し、子ツールの成功・失敗の両方を含む履歴応答がJSON変換後のWebSocket validatorに適合する回帰testを追加した。修正前は同testで失敗し、修正後は成功した。

作業中のicon対応を含むoverlay buildは関連100 testとprotocol/serverの型検査に成功した。生成したoverlayへ実機採取済みの通知35件を再投入し、初期snapshotを除く各通知後の履歴応答34回がすべてvalidatorを通り、親の最終回答と正常終了が保持されることを確認した。今回の修正だけを取り出したpatcherは18 test成功、runtime opt-in testは通常実行で1件skip。今回変更したファイルに対するupstream lintは修正前後とも同じ既存10 errorで、新規errorはない。

ユーザーの許可により起動中の旧`zcode-acp`を終了し、修正版アプリを生成・署名した。実機検証は別途作業中のicon対応を含むアプリで行い、その成果物とのhash一致と元Paseo ASAR不変を確認した。元の会話を修正版アプリで開き、Exploreの結果を含む最終回答が表示され、履歴同期エラーが出ないことを確認した。元の会話へのプロンプト再送は行っていない。


## 配布上の制約

参照した `paseo-acp-patcher` と `zcode-acp` の固定 commit には配布ライセンスの宣言がなかった。権利関係を確認するまで package は公開せず、`private: true` を維持する。Paseo の Apache-2.0 notice と production dependency の license は `NOTICE` と `LICENSES/` に記録している。

また、overlay の build 元である Paseo 0.7.2 の固定 lockfile は `npm ci` 時点で 101 件（low 8、moderate 44、high 42、critical 7）の既知脆弱性を報告する。patcher 自身の production/development dependency は `npm audit` で 0 件である。Paseo の対応 version を変更せずに依存関係だけを差し替えることは、生成物の互換性を壊すため行わない。

## 変更禁止範囲

- Paseo renderer と既存 UI component
- 既存 Paseo provider と ACP 経路
- `zcode-acp` repository の公開 API または build
- 元 Paseo/ZCode install artifact
- Paseo/ZCode user settings と資格情報
- 過去 version 互換 fallback
