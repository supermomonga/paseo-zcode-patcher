# Implementation status

最終更新: 2026-09-05

## 現在の状態

設計文書とADRだけが存在し、実装は開始していない。現在のrepositoryにある`mise.toml`、`paseo.json`、ADR設定以外に、patcher source、test、overlay、artifact、package manifestはまだ存在しない。

| Area | Status | 完了条件 |
| --- | --- | --- |
| Architecture/ADR | complete | ADR 0002–0010がAcceptedで文書と整合 |
| Product/provider/protocol specs | complete | 実装判断、error boundary、UX、testが明記済み |
| Patcher CLI | not implemented | `patch`、preflight、cleanup、diagnosticのtestが成功 |
| ASAR patcher | not implemented | deterministic fixture testとmanifest検証が成功 |
| Paseo source patch | not implemented | fixed commitへ適用しprotocol/server buildが成功 |
| ZCode runtime discovery | not implemented | current artifactのstrict compatibility testが成功 |
| Host bridge | not implemented | allowlist、schema、lifecycle testが成功 |
| Provider/session mapper | not implemented | catalog、stream、permission、question、plan、todo testが成功 |
| Overlay/manifest | not generated | 全entryとASAR hashが具体値で固定 |
| macOS app/signing | not generated | strict署名とcold startが成功 |
| Runtime evidence | not executed | Testing documentの実機必須項目が完了 |

## 実装順序

1. Node.js 22/TypeScriptのpatcher package、test runner、format/typecheck/buildを用意する。
2. `paseo-acp-patcher`からASAR、bundle verification、process check、atomic copy、signingの設計を移植し、固有名・出力・manifest schemaをZCode版へ変更する。
3. fixed Paseo source commit用patchを作り、built-in `zcode` provider definition/factory/contractを追加する。
4. `zcode-acp`参照commitからdiscovery、artifact/protocol descriptors、host bridge、schemasをNode互換で移植する。
5. `AgentClient` / `AgentSession`とstateful mapperを実装する。
6. permission、question、plan、todoのUI contractをfocused testで固定する。
7. source patchからoverlay/manifestを決定的に生成する。
8. patched app生成、署名、実機agent/plan UXを検証する。
9. 生成hash、実測結果、license情報を文書へ反映して状態を「実装済み」にする。

## 実装時に生成して確定する値

次は設計上の未決定事項ではなく、実装成果物からだけ得られる検証値である。

- overlay SHA-256
- 生成後`app.asar` SHA-256
- 追加・置換entryのhash
- package versionとdependency lock
- patched appの署名検証結果
- cold-start/runtime probeの実測結果

これらを推測値やplaceholderのままreleaseしてはならない。

## 変更禁止範囲

初版実装中も次は変更しない。

- Paseo rendererと既存UI component
- 既存Paseo providerとACP経路
- `zcode-acp` repositoryの公開APIまたはbuild
- 元Paseo/ZCode install artifact
- Paseo/ZCode user settingsとcredential
- 過去version互換fallback
