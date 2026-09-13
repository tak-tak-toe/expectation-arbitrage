# 2タスクの順序説明と制約付き最適化

第4章の機会費用説明と、第5章の2タスク制約付き NLP を担う ES module 群です。共通締切は $T=25$、各タスクの完成品質基準は $Q_{\min}=100$ です。

## モジュール構成

- `schedule.js`：$A_1\prec A_2$ と $B_1\prec B_2$ を満たす6順序、レビュー・完了時刻、期待上昇による delay coefficient を計算します。
- `model.js`：単一タスク core を使い、各タスクの $Q_i,S_{i,1},S_{i,2},J_i$、全体の $J_{\mathrm{all}}$、制約値、解析的勾配を計算します。
- `nlp.js`：projected augmented-Lagrangian と BFGS による決定論的な局所制約付き探索、および KKT 診断を実装します。
- `optimizer.js`：6順序を完全列挙し、各順序へ structured multi-start を適用して候補を比較します。
- `explanation-widget.js`：順序、イベント時刻、delay coefficient を操作できる第4章用 widget です。
- `widget.js`：解、スケジュール、タスク別評価、6順序、制約残差、KKT残差、shadow price を表示する第5章用 widget です。
- `optimizer.test.mjs`：順序列挙、時刻、係数、勾配、決定性、実行可能性、KKT 診断を検証します。

## 問題の分解

離散変数 $\pi$ は6通りの phase order、連続変数は

$$
z=(x_A,y_A,x_B,y_B)
$$

です。各固定順序について

$$
\max_z\;J_A+J_B
$$

を、完成品質、締切、phase 下限の制約付きで解きます。順序列挙は exact、連続探索は deterministic local NLP です。候補には `globalCertificate: false` を付与し、UI は局所 KKT 候補として表示します。

数値探索と候補順位には $E_{0,i}$ に由来する定数項を分離した centered objective を使い、返り値とUIには元の $J_{\mathrm{all}}$ を表示します。両者の最大点は一致し、要求水準の平行移動に対するスケジュールの不変性を保ちます。

KKT 診断は primal feasibility、stationarity、dual feasibility、complementarity の scaled residual と、品質A・品質B・締切・phase下限の multiplier を返します。締切 multiplier $\mu$ は追加作業可能時間の shadow price に対応します。

## 章からの利用

````markdown
```{ojs}
//| echo: false
import { renderScheduleOpportunityCost } from "../widgets/two-task-optimizer/explanation-widget.js"
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

両 renderer は DOM 要素を返し、`dispose()` が input listener、debounce timer、`ResizeObserver` を解放します。UI は既存 container と textbook theme を再利用します。

## テスト

リポジトリのルートから次を実行します。

```bash
node --test widgets/two-task-optimizer/optimizer.test.mjs
```
