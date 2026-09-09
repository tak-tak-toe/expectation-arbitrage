# 2タスク最適化widget

2つのタスクについて、レビュータイミングと4 phaseの作業順序を同時に計算するブラウザ用ES moduleです。標準ブラウザAPIとローカルmoduleで構成し、共通締切 $T=25$ と最低品質 $Q_{\min}=100$ を用います。

## 章からの利用

`chapters/` 内のQuarto原稿から次の形で読み込みます。

````markdown
```{ojs}
//| echo: false
import { renderTwoTaskOptimizer } from "../widgets/two-task-optimizer/widget.js"
```

```{ojs}
//| echo: false
{
  const panel = renderTwoTaskOptimizer();
  invalidation.then(() => panel.dispose());
  return panel;
}
```
````

## 構成

- `model.js`：品質、期待値、レビュー評価、スケジュール評価、カレンダー時刻上の品質を計算します。
- `optimizer.js`：precedenceを満たす6つのphase orderを列挙し、決定的な近似探索で連続作業量を計算します。
- `widget.js`：7つのslider、計算状態、評価サマリ、timeline、Task A/Bのグラフ、結果表を表示します。

単独作業の品質関数と期待値関数は1タスク版の純粋関数を共有します。`_quarto.yml` の `resources: widgets/**` により、module一式が公開成果物へ含まれます。

## 操作パラメータ

| 区分 | パラメータ | 範囲 | 初期値 |
| --- | --- | --- | --- |
| 作業者 | $\bar q$ | 55–100 | 80 |
| 作業者 | $k$ | 0.10–0.80 | 0.25 |
| 作業者 | $h$ | 0.50–8.00 | 4.00 |
| Manager A | $a_A$ | 0–80 | 20 |
| Manager A | $b_A$ | 0–15 | 5.0 |
| Manager B | $a_B$ | 0–80 | 25 |
| Manager B | $b_B$ | 0–15 | 2.5 |

入力後100msでsolverを起動します。同じパラメータには同じ決定的乱数系列が対応し、同じ近似解を返します。

## 表示

- サマリは平均評価、作業終了時刻、期限までの余白、最適phase orderを示します。
- timelineはA1、A2、B1、B2、末尾のidle、中間レビュー、最終レビューを時刻0–25に配置します。
- Task A/Bのグラフは、各タスクの担当phaseで品質を上昇させ、もう一方のphaseとidleで同じ水準を保ちます。期待値はカレンダー時刻に沿って上昇します。
- 数値表は $x_i,y_i,\tau_i,c_i,q_i^R,Q_i,V_i$ を示します。
- 実行可能領域外では `infeasible` と制約差を表示し、結果欄には `—` を配置します。

widgetは表示幅に応じてSVGを再描画します。狭幅ではグラフが縦に並び、数値表がTask別カードへ変わります。dark表示では高明度のaccent色を用います。`dispose()` はinput listener、debounce timer、サイズ監視を解放します。

表示値は、6つの作業順序を対象とする決定的な近似探索の候補解です。対象は2タスクで、各タスクの中間レビューは1回です。
