---
number: 12
title: 新規セッションのPlan直前の選択をZCodeへ引き継ぐ
status: accepted
date: 2026-09-05
links:
- target: 2
  kind: amends
- target: 7
  kind: amends
- target: 11
  kind: amends
---

# 新規セッションのPlan直前の選択をZCodeへ引き継ぐ

## Context and Problem Statement

ZCode 3.11.2のGUIは新規入力画面でセッションを事前作成し、モード選択をそのセッションへ送る。ランタイムはPlanへ入る直前のmodeを`prePlanMode`に保持し、承認後に復元する。Paseoは最初の送信時にセッションを作成し、最終選択の`plan`しか渡さないため、送信前に選んだ`edit`や`yolo`を復元できなかった。

GUIの永続化対象は最後のdraft modeだけで、前のmodeをセッション間で持ち越す独立した設定はない。事前作成の完了前やPlan選択済みの画面を開いた場合は、選択UIの過去の値が必ず復元される契約ではない。

## Decision Drivers

* 新規作成画面で実際に行ったモード変更を承認後の動作に反映する
* モードの記憶・復元と承認は公式ZCodeランタイムに任せる
* 既存provider、承認UI、公開通信schemaの変更を避ける
* 別ホスト・providerや無関係な新規draftへ復帰先を持ち越さない

## Considered Options

* draft内のPlan直前の選択を既存`providerOptions`で渡し、セッション作成時に順序どおり適用する
* ZCode GUIと同じ事前セッション作成・破棄のライフサイクルをPaseoへ追加する
* providerが承認応答時に復帰先を決めて`setMode`する

## Decision Outcome

採用: **draft内のPlan直前の選択を既存`providerOptions`で渡し、セッション作成時に順序どおり適用する**。

ZCode選択時だけ、フォーム内で非PlanからPlanへ移った際の`build` / `edit` / `yolo`を保持する。Plan再指定は保持し、非Plan・別ホスト・別providerへ移れば消去する。最初からPlanの場合に復帰先を推測しない。新規workspaceへの遷移とdraft submissionを通じて引き継ぐが、グローバル設定へ復帰先を保存しない。

既存の`providerOptions.planReturnMode`へ渡し、ZCode専用schemaで検証する。新規セッションに対してmodelとThinkingを設定した後、記憶したmode、その後`plan`を適用し、公式ランタイムに変更前のmodeを記憶させる。再開時には適用し直さない。承認後はnative eventに追従する。

事前作成の成否や通信遅延によるGUIの競合状態は再現対象にしない。新規作成時まで選択情報を保持することで、同じユーザー操作に対して安定した結果を得る。最初からPlanのdraftは追加のmodeを送らず、native sessionの初期状態に従う。

ADR 0002・0007・0011のrenderer変更制限を、このフォーム状態と作成時の受け渡しに限って拡張する。PlanCardや承認の選択肢は変更しない。renderer配布は既存のmain bundle置換を使用する。

### Consequences

* Good, because 送信前に選んだmodeをZCode自身が承認後に復元する。
* Good, because 事前セッションの作成・中断・破棄機構や承認後の追加promptが不要になる。
* Bad, because フォーム・draft保存・providerの複数箇所で選択情報を引き継ぐ必要がある。
* Bad, because ZCode GUIの事前作成タイミングに依存する競合状態とは完全に同一ではない。

### Confirmation

フォームで3種の非Planからの遷移、Plan再指定、別mode/host/providerへの変更、初期Planをテストする。新規作成時のnative呼び出し順、resume時の非再適用、不正optionの拒否を検証する。固定sourceのbuild・artifact hash・署名を確認し、更新済みアプリの新規作成画面からPlanを選び、承認後のmode表示と同じturnでの実装完了を確認する。

## More Information

GUIの根拠は`out/renderer/assets/styles-DyAcaLKy.js`の`GEe`、`QEe`、`gr`、`sx`、`zEe`と、`zcode.cjs`の`exitPlanMode`。詳細は[private protocol](../zcode-private-protocol.md)と[実装状況](../implementation-status.md)に記録する。ZCode version更新時には事前作成とmodeの記憶方法を再調査する。
