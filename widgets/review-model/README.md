# 単一タスクのレビュータイミングモデル

第1〜3章で共有する数学ロジックと、章ごとに独立したインタラクティブ widget を収めた ES module 群です。共通締切は $T=25$ です。

## モジュール構成

- `worker-core.js`：基準品質 $\Phi$、限界品質改善 $\Phi'$、状態 $(Q,p)$ の作業伝播、レビュー有効度 $\rho$、レビュー後の生産性回復、一回レビューの最終品質を計算します。
- `evaluation-core.js`：期待水準 $E(t)=E_0+\beta t$、個別レビュー評価、二回の評価の和・平均を計算します。
- `one-task-optimization.js`：レビュー時評価、最終品質、総合評価の各レビュー時刻を決定論的に計算します。
- `model.js`：数学 API の公開窓口です。
- `widget-utils.js`：入力、指標カード、responsive SVG、凡例、lifecycle の共通部品です。
- `review-score-widget.js`：第1章の品質・期待、限界量、レビュー時評価を同期表示します。
- `review-concepts.js`：第1章の各概念の導入位置に、休憩による二つの時間の違い、品質曲線、期待水準の切片と傾き、品質と期待の差、指数型の立ち上がりの比較を表示します。共有モデルと既存のSVG部品を使用します。
- `quality-widget.js`：第2章専用。`rhoBar: 1` と既定の品質尺度を内部で固定し、レビューによる回復・再減衰、回復前後と回復幅の分解、最終品質と三因子を表示します。最終品質の操作はλ、κの順の2項目で、レビュー材料の成熟速度λだけを初期値に保った比較曲線と時刻差を示します。ρはレビュー有効度として表示します。共有モデルの既定値は変更しません。
- `quality-widget.test.mjs`：第2章の正規化、二因子・三因子分解、レビュー後の減衰と既存モデルとの一致を検証します。
- `evaluation-widget.js`：第3章の作業時間概念図と、$(t_1,t_2)$ の三角形領域における平均評価 $J$、条件付き最適化曲線、数値最適候補を表示します。表示格子は最適化に使用しません。
- `two-review.test.mjs`：条件付き解析解、二時刻の決定論的最適化、旧モデルとの境界一致、評価切片の不変性、UI操作を検証します。
- `model.test.mjs`：解析解、状態遷移、比較静学、目的関数の整合性を検証します。

## 数学 API

レビュー介入前の品質生産関数は

$$
\Phi(w)=Q_\infty(1-e^{-\kappa w})
$$

です。実現品質と限界生産性は、実作業区間 $\Delta w$ ごとに

$$
p^- = p^+_{\mathrm{prev}}e^{-\kappa\Delta w},
\qquad
Q^- = Q^+_{\mathrm{prev}}+Q_\infty p^+_{\mathrm{prev}}(1-e^{-\kappa\Delta w})
$$

と進みます。レビュー有効度とレビュー後状態は

$$
\rho=\bar\rho(1-e^{-\lambda\Delta w}),
\qquad
p^+=(1-\rho)p^-+\rho,
\qquad
Q^+=Q^-
$$

です。`simulateReviewIntervals()` は同じ recurrence を任意の固定レビュー列へ適用でき、将来の複数レビュー章でも共有できます。

## 章からの利用

第3章は `twoReviewObjectives()`、`optimalFinalizationTimeGivenIntermediate()`、`optimalTwoReviewTimes()` を使用します。条件付き最終化時刻は解析解、中間レビュー時刻は平均評価のプロファイルを決定論的に探索します。全体問題には大域最適性の証明を付けません。

旧 `oneTaskObjectives()`、`optimalAggregateReviewTime()`、`weightedTwoReviewScore()` は `model.test.mjs` の互換性・回帰検証用に残しています。旧API内だけで `omega` を扱い、現行第3章の計算・表示では利用しません。

各 renderer は DOM 要素を返し、`dispose()` が input listener と `ResizeObserver` を解放します。

````markdown
```{ojs}
//| echo: false
import { renderReviewScoreWidget } from "../widgets/review-model/review-score-widget.js"
import { renderQualityReviewWidget } from "../widgets/review-model/quality-widget.js"
import { renderOverallEvaluationWidget } from "../widgets/review-model/evaluation-widget.js"
```

```{ojs}
//| echo: false
{
  const panel = renderReviewScoreWidget();
  invalidation.then(() => panel.dispose());
  return panel;
}
```
````

三つの widget はそれぞれ独立した state を持ち、章ごとの問いと操作を分離します。SVG は container 幅へ追随し、色は既存 textbook theme の light / dark 表示へ追随します。

## テスト

リポジトリのルートから次を実行します。

```bash
node --test widgets/review-model/*.test.mjs widgets/two-task-optimizer/*.test.mjs
```
