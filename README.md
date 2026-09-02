# Expectation Arbitrage

A reusable Quarto Book template for mathematical, theoretical, and AI lecture notes, with optional browser-based interactive panels.

数学・理論・AI 系の講義ノートを、必要に応じてブラウザ上のインタラクティブパネルと組み合わせて作成するための、再利用可能な Quarto Book テンプレートです。

[日本語](#ja) | [English](#en)

---

<a id="ja"></a>

## 日本語

### 概要

このリポジトリは、再利用するテンプレート本体としても、テンプレートから生成した科目別ノートとしても利用できます。読みやすい `.qmd` ファイルを原稿の中心にし、Markdown、LaTeX 数式、相互参照、参考文献、Observable JavaScript を使用します。

通常の文章は1段組で表示され、必要な箇所だけ本文とインタラクティブパネルを横並びの2段組にできます。説明本文はパネルがなくても理解できるようにし、インタラクティブ機能は理解を補助するものとして扱います。

Node.js アプリケーション、バックエンド、データベースは必要ありません。Quarto と Git があれば、ローカルでプレビュー・ビルド・公開できます。

### 前提環境とクイックスタート

必要なもの：

- [Quarto](https://quarto.org/docs/get-started/)
- Git
- 新規ノート生成スクリプトを使う場合は Bash、`rsync`、`mktemp`（通常は macOS/Linux に含まれます。Windows では WSL などを利用してください）

このプロジェクトを直接確認する場合：

```bash
quarto --version
quarto preview
```

プレビューを終了するには `Ctrl+C` を押します。静的サイトを生成する場合は次を実行します。

```bash
quarto render
```

生成結果は `_site/` に出力されます。

### 現在の仕様

| 項目 | 仕様 |
| --- | --- |
| プロジェクト形式 | Quarto Book |
| 原稿 | Markdown と Quarto 記法を使う `.qmd` ファイル |
| 通常レイアウト | 1段組 |
| コンセプトレイアウト | 本文 50%／インタラクティブパネル 50% |
| レスポンシブ表示 | 画面幅 `991.98px` 以下では自動的に1段組へ変更 |
| インタラクティブパネル | デスクトップではスクロールに追従し、狭い画面では本文の下へ移動 |
| 印刷 | 1段組。パネルの追従と内部スクロールは解除 |
| ナビゲーション | 左に章ナビ、右にページ内 ToC、検索、前後ページ移動 |
| Reader Mode | 1つのトグルで左の章ナビと右のページ内 ToC をまとめて折り畳み |
| Quarto グリッド | 本文基準幅 `1000px`、左サイドバー `250px`、右余白 `230px` |
| 数式 | MathJax |
| 相互参照 | 章、数式、図、定義などの番号付き参照 |
| 参考文献 | `references.bib` と citeproc |
| インタラクティブ機能 | Observable JavaScript とローカル ES module |
| 出力先 | `_site/` |
| 公開 | GitHub Actions から GitHub Pages へデプロイ |

50/50 は列間の余白を除いた利用可能幅を左右均等に分ける仕様です。

### ディレクトリ構成

```text
interactive-notes-template/
├── _quarto.yml                 # Book全体の設定
├── index.qmd                   # トップページ
├── chapters/                   # 章の原稿
├── widgets/                    # インタラクティブ部品
├── styles/textbook.scss        # レイアウトと共通スタイル
├── assets/images/              # 章から参照する画像
├── references.bib              # 参考文献データ
├── examples/                   # Bookに含めない実験用ファイル
├── scripts/new-note.sh         # 新しいノートを作るスクリプト
├── .github/workflows/          # GitHub Pages公開ワークフロー
├── PROJECT_SETUP.md            # Git/GitHubを含む詳細セットアップ
└── README.md                   # この仕様書・利用ガイド
```

### 新しいノートを作る

テンプレートのルートで次を実行します。

```bash
./scripts/new-note.sh ../my-new-note
cd ../my-new-note
```

スクリプトは生成物、キャッシュ、環境ファイル、エディタ設定、テンプレート側の `.git/` を除外してファイルをコピーし、生成先を独立した Git リポジトリとして `main` ブランチで初期化します。

安全のため、生成先が通常ファイル、シンボリックリンク、または空でないディレクトリの場合は処理を中止します。既存内容を上書きしません。

```bash
./scripts/new-note.sh --help
```

生成後の最初のコミット例：

```bash
git status
git add .
git commit -m "Initialize interactive notes"
```

より詳しい Git・GitHub の手順は [PROJECT_SETUP.md](PROJECT_SETUP.md) を参照してください。

### GitHubのテンプレートとして使う

ローカルスクリプトの代わりに、GitHub上でテンプレートリポジトリとして利用することもできます。

1. テンプレート側のリポジトリで **Settings** を開く。
2. **Template repository** を有効にする。
3. **Use this template → Create a new repository** を選ぶ。
4. 生成されたリポジトリで `_quarto.yml` と章の内容を変更する。

生成されたリポジトリは fork ではなく、独立した Git 履歴を持ちます。

### プロジェクト情報を変更する

新しいノートを生成したら、`_quarto.yml` の次の値を変更します。

```yaml
book:
  title: "ノートのタイトル"
  subtitle: "対象範囲を示すサブタイトル"
  author: "著者名"
  description: "対象読者と内容の短い説明"
  repo-url: "https://github.com/USER/REPOSITORY"
  site-url: "https://USER.github.io/REPOSITORY/"
```

公開前に `repo-url` と `site-url` のプレースホルダーを必ず変更してください。`USER.github.io` という名前のユーザーサイト用リポジトリでは、通常の `site-url` は `https://USER.github.io/` となり、末尾にリポジトリ名は付きません。

`book.repo-branch` は、付属の公開ワークフローに合わせて `main` のまま使用します。別のブランチを利用する場合は、`.github/workflows/publish.yml` の対象ブランチも同時に変更してください。

### 1段組で書く

通常の Markdown はそのまま1段組になります。特別な囲みは必要ありません。

```markdown
## 1段組の説明

ここには通常の本文、数式、定義、図などを書きます。

$$
f(x)=x^2
$$
```

### 2段組で書く

2段組にする箇所だけを `.concept-layout` で囲みます。左側は `.concept-main`、右側は `.interactive-panel` です。

```markdown
:::: {.concept-layout}
::: {.concept-main}
## 数学的な説明

ここが左半分です。パネルがなくても内容を理解できる説明を書きます。
:::

::: {.interactive-panel aria-labelledby="interactive-heading"}
## パラメータを試す {#interactive-heading}

ここが右半分です。スライダー、グラフ、補助説明などを配置します。
:::
::::
```

外側の `::::` を閉じると、その後は再び1段組になります。同じ章の中で、1段組と2段組を何度でも切り替えられます。

狭い画面ではソースの順番どおり、`.concept-main` の後に `.interactive-panel` が表示されます。

動作する完全な例は [chapters/01-template-demo.qmd](chapters/01-template-demo.qmd) にあります。

### 数式・定義・図・参考文献

数式にラベルを付けて参照する例：

```markdown
$$
f(x)=x^2
$$ {#eq-square}

@eq-square より、関数は原点について対称です。
```

定義を作る例：

```markdown
::: {#def-linear-map name="線形写像"}
線形写像とは、加法とスカラー倍を保存する写像です。
:::

@def-linear-map を使用します。
```

図を追加する例：

```markdown
![図の説明](../assets/images/example.svg){#fig-example}

@fig-example を参照してください。
```

参考文献は `references.bib` に登録し、本文では `[@citation-key]` の形式で引用します。Book 全体でラベルが重複しないよう、内容を表す名前を付けてください。

### 章を追加する

たとえば `chapters/02-next-topic.qmd` を作成します。

```markdown
# 次のトピック

ここから本文を書きます。
```

その後、`_quarto.yml` の `book.chapters` に追加します。配列の順番が Book 内の章順になります。

```yaml
book:
  chapters:
    - index.qmd
    - chapters/00-introduction.qmd
    - chapters/01-template-demo.qmd
    - chapters/02-next-topic.qmd
```

### インタラクティブ機能を追加する

ブラウザ側の描画処理は、小さな ES module として `widgets/<widget-name>/widget.js` に置きます。

```text
widgets/
└── parameter-view/
    ├── widget.js
    └── README.md
```

`chapters/` 内の `.qmd` からは、たとえば次のように読み込みます。

````markdown
```{ojs}
import { renderLineChart } from "../widgets/demo/widget.js"
```
````

`_quarto.yml` の `resources: widgets/**` により、`widgets/` 以下はレンダリング結果へ自動的にコピーされます。

基本方針：

- 数学的・理論的な説明は単独で完結させる。
- パネルは説明の代わりではなく、理解を補助するものにする。
- 描画処理は章の文章から分離する。
- 新しい依存関係を追加した場合は、ウィジェット側の README に記録する。
- デスクトップの50/50表示、狭い画面での縦並び、JavaScript無効時の本文を確認する。

PythonやRなどの実行コードを追加する場合は、ローカル環境だけでなく GitHub Actions 側にも必要な実行環境と依存関係を追加してください。

### Reader Mode

`_quarto.yml` では `book.reader-mode: true` が設定されています。左サイドバー内の Reader Mode ボタンを使うと、左の章ナビと右のページ内 ToC が同時にコンパクトな見出しへ折り畳まれます。

元へ戻すときは、左上のコンパクトな章見出しを開き、Reader Mode ボタンをもう一度押します。

### ローカル確認

変更後は次を実行します。

```bash
quarto render
quarto preview
```

確認項目：

- 章の順番、番号、検索、左右のナビゲーション
- 数式、定義、図、相互参照、参考文献
- 1段組と2段組の切り替え
- デスクトップの50/50表示
- 狭い画面での縦並び
- インタラクティブ操作とグラフ更新
- Reader Mode の折り畳みと復帰
- ブラウザのエラー表示

`_site/`、`.quarto/`、`_book/`、`_freeze/` などの生成物・キャッシュは再生成できるため、Git にはコミットしません。

### GitHub Pagesへ公開する

付属の `.github/workflows/publish.yml` は、`main` への push または手動実行で Book をレンダリングし、`_site/` を GitHub Pages へデプロイします。

新しい GitHub リポジトリごとに次を設定します。

1. プロジェクトを `main` ブランチへ pushする。
2. GitHub の **Settings → Pages** を開く。
3. **Build and deployment** の Source に **GitHub Actions** を選ぶ。
4. **Actions** で **Publish Quarto book to GitHub Pages** の成功を確認する。
5. 公開URLと `_quarto.yml` の `book.site-url` が一致していることを確認する。

Pages を有効にする前に最初のワークフローが動いた場合、設定処理が失敗することがあります。Pages の Source を **GitHub Actions** にした後、ワークフローを再実行してください。

カスタムドメインを使う場合は、`book.site-url` の変更に加えて GitHub の Pages 設定でもドメインを登録してください。公開リポジトリや Pages サイトには、機密情報・秘密鍵・非公開データを含めないでください。リポジトリの可視性と Pages サイトの公開範囲が同じとは限りません。

### よくある問題

| 症状 | 確認すること |
| --- | --- |
| `quarto: command not found` | Quartoをインストールし、ターミナルを開き直す |
| 新しい章が表示されない | `_quarto.yml` の `book.chapters` にファイルを登録したか確認する |
| ウィジェットを読み込めない | `chapters/` から `../widgets/...` への相対パスを確認する |
| 2段組にならない | 外側の `::::` と2つの内側 `:::` が正しく閉じられているか確認する |
| モバイルで表示順が不自然 | `.concept-main` を先、`.interactive-panel` を後に置く |
| Pagesの初回公開が失敗する | **Settings → Pages → GitHub Actions** を選び、再実行する |

---

<a id="en"></a>

## English

### Overview

This repository can serve as the reusable template itself or as a subject-specific note project generated from it. Its source of truth is readable `.qmd` content using Markdown, LaTeX mathematics, cross-references, citations, and optional Observable JavaScript.

Ordinary content uses a single column. Only selected sections use an equal two-column layout containing standalone exposition and an optional interactive panel. The interactive panel should support the explanation rather than replace it.

No Node application, backend, or database is required. Quarto and Git are sufficient for local preview, rendering, and publication.

### Prerequisites and quick start

Requirements:

- [Quarto](https://quarto.org/docs/get-started/)
- Git
- Bash, `rsync`, and `mktemp` when using the project generator; these are normally available on macOS/Linux, while Windows users can use WSL or a comparable environment

Run from the repository root:

```bash
quarto --version
quarto preview
```

Press `Ctrl+C` to stop the preview. Render the complete static site with:

```bash
quarto render
```

The generated site is written to `_site/`.

### Current specification

| Item | Specification |
| --- | --- |
| Project type | Quarto Book |
| Authoring format | `.qmd` files using Markdown and Quarto syntax |
| Default layout | Single column |
| Concept layout | 50% exposition / 50% interactive panel |
| Responsive breakpoint | Automatically becomes one column at `991.98px` and below |
| Interactive panel | Sticky on desktop; moves below the exposition on narrow screens |
| Print layout | Single column with sticky positioning and internal scrolling disabled |
| Navigation | Left chapter navigation, right page ToC, search, and page navigation |
| Reader Mode | One control rolls up both the chapter navigation and page ToC |
| Quarto grid | `1000px` body reference width, `250px` left sidebar, `230px` margin |
| Mathematics | MathJax |
| Cross-references | Numbered chapters, equations, figures, definitions, and related elements |
| Bibliography | `references.bib` with citeproc |
| Interactivity | Observable JavaScript and local ES modules |
| Output | `_site/` |
| Deployment | GitHub Actions to GitHub Pages |

The 50/50 rule divides the available content width equally after accounting for the gap between columns.

### Repository structure

```text
interactive-notes-template/
├── _quarto.yml                 # Book-wide configuration
├── index.qmd                   # Landing page
├── chapters/                   # Ordered chapter sources
├── widgets/                    # Optional interactive modules
├── styles/textbook.scss        # Shared layout and typography
├── assets/images/              # Static chapter images
├── references.bib              # Bibliography data
├── examples/                   # Experiments excluded from the Book
├── scripts/new-note.sh         # Safe project generator
├── .github/workflows/          # GitHub Pages workflow
├── PROJECT_SETUP.md            # Detailed Git and GitHub setup
└── README.md                   # This specification and usage guide
```

### Create a new note

Run the generator from the template root:

```bash
./scripts/new-note.sh ../my-new-note
cd ../my-new-note
```

The generator copies the reusable sources without generated output, caches, environment files, editor state, or the template's `.git/`. It then initializes an independent Git repository on `main`. It refuses files, symbolic links, and non-empty target directories instead of overwriting existing content.

Use `./scripts/new-note.sh --help` for its short command reference.

Create the first commit when ready:

```bash
git status
git add .
git commit -m "Initialize interactive notes"
```

See [PROJECT_SETUP.md](PROJECT_SETUP.md) for the complete Git and GitHub workflow.

### Use it as a GitHub template

As an alternative to the local generator:

1. Open **Settings** in the template repository.
2. Enable **Template repository**.
3. Select **Use this template → Create a new repository**.
4. Update `_quarto.yml` and the chapter content in the generated repository.

The result is an independent repository rather than a fork or a copy of the template's Git history.

### Edit project metadata

After generating a note, update these values in `_quarto.yml`:

```yaml
book:
  title: "Your note title"
  subtitle: "A concise scope statement"
  author: "Your name"
  description: "What the note teaches and who it is for"
  repo-url: "https://github.com/USER/REPOSITORY"
  site-url: "https://USER.github.io/REPOSITORY/"
```

Replace the `repo-url` and `site-url` placeholders before publishing. For a user-site repository named `USER.github.io`, the usual `site-url` is `https://USER.github.io/` without a repository suffix.

Keep `book.repo-branch: main` aligned with the included workflow. If another publishing branch is intentional, update both that setting and `.github/workflows/publish.yml`.

### Write a single-column section

Ordinary Markdown remains single-column and needs no wrapper.

```markdown
## Single-column explanation

Write ordinary prose, mathematics, definitions, and figures here.

$$
f(x)=x^2
$$
```

### Write a two-column section

Wrap only the desired two-column section in `.concept-layout`. Use `.concept-main` for the left side and `.interactive-panel` for the right side.

```markdown
:::: {.concept-layout}
::: {.concept-main}
## Mathematical explanation

This is the left half. Keep it understandable without the panel.
:::

::: {.interactive-panel aria-labelledby="interactive-heading"}
## Explore the parameter {#interactive-heading}

This is the right half. Place controls, plots, and supporting text here.
:::
::::
```

Closing the outer `::::` returns the document to the normal single-column layout. You can switch between one- and two-column sections as many times as needed within a chapter.

On narrow screens, `.concept-main` appears first and `.interactive-panel` follows it. See [chapters/01-template-demo.qmd](chapters/01-template-demo.qmd) for the complete working example.

### Add mathematics, definitions, figures, and citations

Label and reference an equation:

```markdown
$$
f(x)=x^2
$$ {#eq-square}

See @eq-square.
```

Create and reference a definition:

```markdown
::: {#def-linear-map name="Linear map"}
A linear map preserves addition and scalar multiplication.
:::

See @def-linear-map.
```

Add and reference a figure:

```markdown
![A descriptive caption](../assets/images/example.svg){#fig-example}

See @fig-example.
```

Add bibliography entries to `references.bib` and cite them with `[@citation-key]`. Use unique, descriptive labels throughout the Book.

### Add a chapter

Create a file such as `chapters/02-next-topic.qmd` with a level-one heading:

```markdown
# Next topic

Start the chapter here.
```

Register it at the desired position under `book.chapters` in `_quarto.yml`. Array order is Book order.

```yaml
book:
  chapters:
    - index.qmd
    - chapters/00-introduction.qmd
    - chapters/01-template-demo.qmd
    - chapters/02-next-topic.qmd
```

### Add interactive content

Put browser-side rendering behavior in a focused ES module such as `widgets/<widget-name>/widget.js`.

```text
widgets/
└── parameter-view/
    ├── widget.js
    └── README.md
```

From a chapter source, import it with the appropriate relative path:

````markdown
```{ojs}
import { renderLineChart } from "../widgets/demo/widget.js"
```
````

The `resources: widgets/**` setting copies widget files into the rendered site automatically.

Authoring principles:

- Make the mathematical or theoretical explanation complete on its own.
- Use a panel to support the explanation, not replace it.
- Keep rendering behavior separate from chapter prose.
- Document new runtime dependencies next to the widget.
- Test the desktop 50/50 layout, narrow stacked layout, and non-interactive prose.

If Python, R, or another execution environment is added later, install the same runtime and dependencies in the GitHub Actions workflow as well as locally.

### Reader Mode

`book.reader-mode: true` is enabled in `_quarto.yml`. The Reader Mode control in the left sidebar rolls up the left chapter navigation and right page ToC into compact headings. To restore them, expand the compact chapter heading at the upper left and select Reader Mode again.

### Verify locally

After editing, run:

```bash
quarto render
quarto preview
```

Check chapter order, navigation, mathematics, cross-references, citations, one/two-column transitions, desktop and narrow layouts, interactive behavior, Reader Mode, and browser errors.

Do not commit `_site/`, `.quarto/`, `_book/`, `_freeze/`, or other reproducible output and caches already excluded by `.gitignore`.

### Publish to GitHub Pages

The included `.github/workflows/publish.yml` renders and deploys the Book on every push to `main`, and it also supports manual runs.

For each new GitHub repository:

1. Push the project to `main`.
2. Open **Settings → Pages**.
3. Select **GitHub Actions** under **Build and deployment**.
4. Confirm that **Publish Quarto book to GitHub Pages** succeeds under **Actions**.
5. Confirm that the deployed URL matches `book.site-url` in `_quarto.yml`.

If the first workflow runs before Pages is enabled, its configuration step may fail harmlessly. Select **GitHub Actions** as the Pages source and run the workflow again.

For a custom domain, update `book.site-url` and configure the domain in GitHub's Pages settings. Never commit credentials, private keys, confidential data, or other secrets to a repository or Pages site. Repository visibility and Pages-site visibility are not necessarily identical.

### Common issues

| Symptom | Check |
| --- | --- |
| `quarto: command not found` | Install Quarto and restart the terminal |
| A new chapter is missing | Register it under `book.chapters` in `_quarto.yml` |
| A widget import fails | Check the relative path from `chapters/` to `../widgets/...` |
| A section is not two-column | Check that the outer `::::` and both inner `:::` blocks are closed |
| Mobile content order is wrong | Put `.concept-main` before `.interactive-panel` |
| Initial Pages deployment fails | Select **Settings → Pages → GitHub Actions**, then rerun the workflow |
