# レビュータイミングモデルの図

Section 1 に置いた、1人の作業者・1人のマネージャー・1つのタスクからなるモデルをブラウザで確認するための ES module です。標準ブラウザ API で動作し、表示されるパラメータには説明用の仮定を使用します。

## 章からの利用

`chapters/` 内の Quarto 原稿から、次のように読み込みます。

````markdown
```{ojs}
//| echo: false
import { createReviewScenario, renderWorkerModel, renderManagerModel, renderEvaluationAxes } from "../widgets/review-model/widget.js"
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
  const panel = renderEvaluationAxes(reviewScenario);
  invalidation.then(() => panel.dispose());
  return panel;
}
```
````

三つの描画関数は共通の `reviewScenario` を購読し、いずれかの range 入力が変わるたびにグラフと評価軸を更新します。スタイルは `.review-model-widget` 内に限定し、書体は周囲から継承します。`ResizeObserver` で実際の表示幅に合わせて SVG を描画し直します。戻り値の `dispose()` はサイズ監視と状態購読を解除します。

## ファイルと変更箇所

- `model.js`：品質、レビュー効果、期待品質、三つの評価軸の純粋関数。
- `widget.js`：共有シナリオ、スライダー、図、評価カード、凡例、補助説明。
- `model.test.mjs`：連続性、限界改善量、レビューの品質効果、期待値、評価軸、時間制約のテスト。
- `package.json`：Node.jsのテストで `.js` をES moduleとして扱うための指定。テストにはNode.js標準機能を使用。

QuartoのOJS依存解析に合わせ、ブラウザへ読み込むモジュールの拡張子は `.js` に統一します。

`resources: widgets/**` により、これらのローカルモジュールは公開先へコピーされます。図の数式・仮定は章本文にも記載し、JavaScript と本文の双方から参照できる構成にしてください。

## テスト

Node.js がある場合、リポジトリのルートから次を実行できます。このテストはモデルの純粋関数を対象とします。

```bash
node --test widgets/review-model/model.test.mjs
```

作業者の横軸は1つのタスクに投入した累積実作業、マネージャーの横軸はカレンダー時刻です。作業者モデルでは総実作業 `W` を5から50の範囲で変更でき、レビューまでの実作業量 `x` は常に `0 < x < W` となるよう上限が連動します。マネージャーモデルではカレンダー期限 `T` を同じ範囲で変更でき、中間レビュー時刻 `τ` と最終レビュー時刻 `c` は `0 < τ < c <= T` の範囲で連動します。`W` と `T` は異なる量です。

初期表示には `W = 25`、`T = 25`、`x = 6`、`τ = 6`、`c = 25` を用います。評価パネルは `V`、`Q`、`W` と、その計算内訳、品質基準との差、カレンダー余裕時間を示します。品質は100を超える値もとります。
