# レビュータイミングモデルの図

Section 1 に置いた、1人の作業者・1人のマネージャー・1つのタスクからなるモデルをブラウザで確認するための ES module です。標準ブラウザ API で動作し、説明用の品質曲線、期待値曲線、評価軸に加えて、傾き一致の判断則と固定総作業量での最適化を表示します。共通デッドラインは $T=25$ です。

## 章からの利用

`chapters/` 内の Quarto 原稿から、次のように読み込みます。

````markdown
```{ojs}
//| echo: false
import { createReviewScenario, renderWorkerModel, renderManagerModel, renderEvaluationAxes } from "../widgets/review-model/widget.js"
import { renderSlopeMatching, renderFullEvaluation } from "../widgets/review-model/decision-widgets.js"
reviewScenario = createReviewScenario()
```

```{ojs}
//| echo: false
{
  const panel = renderWorkerModel(reviewScenario);
  invalidation.then(() => panel.dispose());
  return panel;
}
```

```{ojs}
//| echo: false
{
  const panel = renderManagerModel(reviewScenario);
  invalidation.then(() => panel.dispose());
  return panel;
}
```

```{ojs}
//| echo: false
{
  const panel = renderSlopeMatching();
  invalidation.then(() => panel.dispose());
  return panel;
}
```

```{ojs}
//| echo: false
{
  const panel = renderFullEvaluation();
  invalidation.then(() => panel.dispose());
  return panel;
}
```

```{ojs}
//| echo: false
{
  const panel = renderEvaluationAxes(reviewScenario);
  invalidation.then(() => panel.dispose());
  return panel;
}
```
````

`renderWorkerModel`、`renderManagerModel`、`renderEvaluationAxes` は共通の `reviewScenario` を購読し、いずれかの range 入力が変わるたびにグラフと評価軸を更新します。`renderSlopeMatching` と `renderFullEvaluation` はそれぞれ独立した状態を持ち、説明用グラフの操作と最適化実験を分離します。各描画関数は `ResizeObserver` で表示幅に合わせて SVG を更新し、戻り値の `dispose()` がサイズ監視、状態購読、入力イベントを解除します。

## ファイルと変更箇所

- `model.js`：品質、レビュー効果、期待品質、三つの評価軸、局所ベンチマーク、固定総作業量での最適化を担う純粋関数。
- `widget.js`：共有シナリオを使う説明用スライダー、品質・期待値の図、評価カード、凡例、補助説明。
- `decision-widgets.js`：独立状態を使う傾き一致ウィジェットと完全モデル最適化ウィジェット。
- `model.test.mjs`：連続性、限界改善量、期待値、評価軸、解析的な局所解、比較静学、品質制約付き最適解のテスト。
- `package.json`：Node.jsのテストで `.js` をES moduleとして扱うための指定。テストにはNode.js標準機能を使用。

QuartoのOJS依存解析に合わせ、ブラウザへ読み込むモジュールの拡張子は `.js` に統一します。

`resources: widgets/**` により、これらのローカルモジュールは公開先へコピーされます。図の数式・仮定は章本文にも記載し、JavaScript と本文の双方から参照できる構成です。

## 表示と計算

説明用の作業者パネルでは総実作業 $W$ を5から25の範囲で動かし、レビュー前作業量 $x$ の上限を $W$ に連動させます。マネージャーパネルでは $a$、$b$、中間レビュー時刻 $\tau$、最終レビュー時刻 $c$ を動かし、横軸を固定締切 $T=25$ まで表示します。初期表示は $W=25$、$x=6$、$a=20$、$b=3$、$\tau=6$、$c=25$ です。

傾き一致ウィジェットは $q_0'(\tau)=b$ の解析解を $[0,25]$ へ収め、内点、最早境界、期限境界を区別します。品質と期待値、限界量、中間レビュー評価の3パネルが共通の $\tau^*_{\mathrm{local}}$ を示します。

固定総作業量ウィジェットの比較用局所解は、完全モデルと同じ候補域 $[0,W]$ に解析解を収めた $\tau^*_{\mathrm{local}}(W)$ です。

完全モデルウィジェットは $W$ を固定して $x\in(0,W)$ を2001点の決定的グリッドで走査し、上位候補と品質最大候補の近傍を段階的に細分化します。正式な解は $Q(x,W-x)\ge100$ の領域から選び、局所ベンチマークと完全モデルの最適点を異なる線種とマーカーで表示します。品質基準到達領域が空の設定では、探索中の最高品質と基準との差を表示します。

## テスト

Node.js がある場合、リポジトリのルートから次を実行できます。このテストはモデルの純粋関数を対象とします。

```bash
node --test widgets/review-model/model.test.mjs
```

評価パネルは共有シナリオから $V$、$Q$、$W$ と、その計算内訳、品質基準との差、カレンダー余裕時間を算出します。品質は100を超える値もとります。
