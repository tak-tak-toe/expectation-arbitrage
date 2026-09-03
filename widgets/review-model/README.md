# レビュータイミングモデルの図

Section 1 の数式をブラウザで確認するための、依存関係のない ES module です。外部データの取得、バックエンド、最適化ソルバーは使用しません。表示されるパラメータは説明用の仮定です。

## 章からの利用

`chapters/` 内の Quarto 原稿から、次のように読み込みます。

````markdown
```{ojs}
//| echo: false
import { renderWorkerModel, renderManagerModel } from "../widgets/review-model/widget.js"
```

```{ojs}
//| echo: false
{
  const panel = renderWorkerModel();
  invalidation.then(() => panel.dispose());
  return panel;
}
```

```{ojs}
//| echo: false
{
  const panel = renderManagerModel();
  invalidation.then(() => panel.dispose());
  return panel;
}
```
````

各関数は独立した DOM ノードを返し、ネイティブ range 入力で自身を更新します。スタイルは `.review-model-widget` 内に限定し、書体は周囲から継承します。`ResizeObserver` で実際の表示幅に合わせて SVG を描画し直します。戻り値の `dispose()` を呼ぶとサイズ監視を解除できます。

## ファイルと変更箇所

- `model.mjs`：品質、レビュー効果、期待品質、評価式の純粋関数。
- `widget.js`：スライダー、既定値、図、凡例、補助説明。
- `model.test.mjs`：連続性・限界改善量・品質の比較・期待値の平行移動などのテスト。

`resources: widgets/**` により、これらのローカルモジュールは公開先へコピーされます。図の数式・仮定は JavaScript を使わなくても読めるよう、章本文にも記載してください。

## テスト

Node.js がある場合、リポジトリのルートから次を実行できます。Quarto のビルドは行いません。

```bash
node --test widgets/review-model/model.test.mjs
```

作業者の横軸は累積実作業、マネージャーの横軸はカレンダー時刻です。前者の総作業25は1タスクの例であり、複数タスクの日程を最適化した結果ではありません。品質は100で切り詰めません。最低品質未達の配分例と、`qbar <= 50` によるモデル全体の有限時間での不可能性は区別して表示します。
