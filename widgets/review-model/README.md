# 単一タスクのレビュータイミングモデル

第1〜3章で共有する数学ロジックと、章ごとに独立したインタラクティブ widget を収めた ES module 群です。共通締切は $T=25$ です。

## モジュール構成

- `worker-core.js`：基準品質 $\Phi$、限界品質改善 $\Phi'$、状態 $(Q,p)$ の作業伝播、レビュー有効度 $\rho$、レビュー後の生産性回復、一回レビューの最終品質を計算します。
- `evaluation-core.js`：期待品質 $E(t)=E_0+\beta t$、個別レビュー評価 $S_r$、総合評価 $J$、重み付き総合評価 $J_\omega$ を計算します。
- `one-task-optimization.js`：レビュー時評価、最終品質、総合評価の各レビュー時刻を決定論的に計算します。
- `model.js`：数学 API の公開窓口です。
- `widget-utils.js`：入力、指標カード、responsive SVG、凡例、lifecycle の共通部品です。
- `review-score-widget.js`：第1章の品質・期待、限界量、レビュー時評価を同期表示します。
- `review-concepts.js`：第1章の各概念の導入位置に、休憩による二つの時間の違い、品質曲線、期待水準の切片と傾き、品質と期待の差、指数型の立ち上がりの比較を表示します。共有モデルと既存のSVG部品を使用します。
- `quality-widget.js`：第2章専用。`rhoBar: 1` と既定の品質尺度を内部で固定し、レビューによる回復・再減衰、回復前後と回復幅の分解、最終品質と三因子を表示します。最終品質の操作はλ、κの順の2項目で、レビュー材料の成熟速度λだけを初期値に保った比較曲線と時刻差を示します。ρはレビュー有効度として表示します。共有モデルの既定値は変更しません。
- `quality-widget.test.mjs`：第2章の正規化、二因子・三因子分解、レビュー後の減衰と既存モデルとの一致を検証します。
- `evaluation-widget.js`：第3章の $S_1,S_2,J_\omega$ と三つの optimum を表示します。
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
node --test widgets/review-model/model.test.mjs
```
