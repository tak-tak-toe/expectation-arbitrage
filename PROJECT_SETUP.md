# Project setup guide

This guide turns the reusable template into a subject-specific Quarto Book with its own Git repository and GitHub Pages site. Replace `my-new-note`, `USER`, and `REPOSITORY` in the examples.

## 1. Understand the repository model

A recommended local workspace looks like this:

```text
NOTES_WORKSPACE/
├── interactive-notes-template/  # independent Git repository
├── my-new-note/                  # independent Git repository
└── another-note/                 # independent Git repository
```

`NOTES_WORKSPACE/` itself is normally not a Git repository. Never copy `interactive-notes-template/.git`; each generated note starts with a fresh history.

Before working in an unfamiliar directory, inspect it without changing anything:

```bash
pwd
git rev-parse --show-toplevel
git status
```

`git rev-parse` prints the repository root when the current directory is inside a repository. An error saying that the directory is not a Git repository is expected at the workspace level.

## 2. Generate a local project

From the template root:

```bash
./scripts/new-note.sh ../my-new-note
cd ../my-new-note
```

You can pass a relative or absolute target path. The generator:

- accepts a missing target or an existing, writable, empty directory;
- refuses a file, symbolic link, or non-empty directory without overwriting it;
- copies the reusable source tree through a temporary staging directory;
- omits `.git/`, `_site/`, `.quarto/`, `_book/`, `_freeze/`, and other generated/cache/editor files;
- initializes Git only in the generated project and starts it on branch `main`; and
- cleans up staging data if copying or Git initialization fails.

Display its short command reference with:

```bash
./scripts/new-note.sh --help
```

Check the result:

```bash
git rev-parse --show-toplevel
git status
```

The first command should print the new project's path, not the template or parent workspace. The second should show the copied source files as untracked until the first commit.

## 3. Customize only the project-specific sources

Open `_quarto.yml` and replace the six values under `book`:

```yaml
book:
  title: "My New Note"
  subtitle: "A concise scope statement"
  author: "Your Name"
  description: "What this book teaches and who it is for"
  repo-url: "https://github.com/USER/REPOSITORY"
  site-url: "https://USER.github.io/REPOSITORY/"
```

These are the canonical locations for the title, subtitle, author, description, repository URL, and public URL. Do not duplicate them in CSS, JavaScript, or the deployment workflow.

Keep `book.repo-branch: main` aligned with the included workflow. If you deliberately publish another branch, update that setting and `.github/workflows/publish.yml` together.

Then replace the generic landing and demonstration prose as appropriate:

- `index.qmd` is the landing page.
- `chapters/00-introduction.qmd` introduces the note.
- `chapters/01-template-demo.qmd` is a feature check; keep it while developing the style, then adapt or remove it from `book.chapters` when it is no longer useful.
- `references.bib` contains bibliography records.

Topic-specific statements naturally belong in chapter content. Reusable layout and behavior stay in `styles/` and `widgets/`.

## 4. Add and order chapters

Create a chapter:

```text
chapters/02-next-topic.qmd
```

Start it with a level-one heading:

```markdown
# Next topic

Write readable Markdown and LaTeX here.
```

Register it in `_quarto.yml`; file order is book order:

```yaml
book:
  chapters:
    - index.qmd
    - chapters/00-introduction.qmd
    - chapters/01-template-demo.qmd
    - chapters/02-next-topic.qmd
```

Useful Quarto source patterns include:

```markdown
$$
f(x) = x^2
$$ {#eq-example}

See @eq-example.

![A descriptive caption](../assets/images/example.svg){#fig-example}

See @fig-example and cite a bibliography key with [@citation-key].
```

Use unique, descriptive labels throughout the book.

## 5. Add an optional widget

Start by writing the mathematical explanation so that it stands alone. Put browser-side behavior in its own module, for example:

```text
widgets/
└── parameter-view/
    ├── widget.js
    └── README.md
```

From a file under `chapters/`, an Observable JS cell can import that module with a relative path such as:

````markdown
```{ojs}
import { renderLineChart } from "../widgets/demo/widget.js"
```
````

Follow `chapters/01-template-demo.qmd` for the working panel markup and reactive slider. `_quarto.yml` already includes `widgets/**` as a rendered resource, so a new module under that directory needs no workflow change.

Use the semantic layout classes for presentation:

```text
concept-layout
├── concept-main
└── interactive-panel
```

On wide screens they form equal content and panel columns; on narrow screens they stack. Quarto's reader-mode button hides the left chapter navigation and right page table of contents together. Test the chapter with JavaScript enabled and confirm that its main explanation still works when the panel is ignored.

## 6. Verify locally

Check the installed Quarto version and render all source files:

```bash
quarto --version
quarto render
```

A successful render creates `_site/`. Preview the result:

```bash
quarto preview
```

In a desktop and a narrow browser window, check:

- chapter navigation, numbering, search, and table of contents;
- rendered mathematics and equation references;
- theorem/definition styling;
- figure captions and references;
- citations and the bibliography;
- the interactive panel's controls, chart updates, sticky behavior, and mobile stacking; and
- the reader-mode control hides and restores the left chapter navigation and right page table of contents.

Stop the preview server with `Ctrl+C`. Do not commit `_site/` or `.quarto/`; `.gitignore` excludes them.

## 7. Make the first Git commit

The generator runs `git init` but does not commit on your behalf. These commands create the first snapshot:

```bash
git status
git add .
git status
git commit -m "Initialize interactive notes"
```

What each command does:

- `git status` reports the current branch and separates untracked, changed, and staged files. It is safe and useful before every commit.
- `git add .` stages the current directory's new and changed files for the next commit. It does not publish anything. Review `git status` afterward so secrets or generated files are not accidentally included.
- `git commit -m "…"` records the staged snapshot in the local repository with a short explanation. Unstaged changes are not included.

Inspect the first commit if desired:

```bash
git log --oneline --decorate -n 3
```

## 8. Create and connect a GitHub repository

Create an empty repository on GitHub named `REPOSITORY`. When using the local generator, do not ask GitHub to pre-create a README, license, or `.gitignore`; those files can create an unnecessary unrelated first commit.

Verify the local branch, add the remote, check it, and push:

```bash
git branch --show-current
git remote add origin https://github.com/USER/REPOSITORY.git
git remote -v
git push -u origin main
```

- `git branch --show-current` should print `main`, which is created by the generator and watched by `.github/workflows/publish.yml`.
- `git remote add origin …` records the GitHub repository as the conventional remote named `origin`.
- `git remote -v` lets you verify the destination before sending anything.
- `git push -u origin main` uploads the local commits and links the local `main` branch to `origin/main`. Later, plain `git push` is sufficient.

If authentication is requested, use a GitHub-supported method such as Git Credential Manager, GitHub CLI, or SSH; GitHub account passwords are not accepted for command-line Git operations.

## 9. Enable GitHub Pages

In the new repository on GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open the **Actions** tab.
4. Select **Publish Quarto book to GitHub Pages** and inspect the run triggered by the push. You can also choose **Run workflow**.

The initial push may start before you finish selecting the Pages source. If **Configure GitHub Pages** fails for that reason, enable the source and choose **Re-run all jobs**; no source files were changed.

The workflow performs this sequence:

```text
push to main
  → install Quarto
  → quarto render
  → upload _site as a Pages artifact
  → deploy to the github-pages environment
```

It uses Pages' artifact deployment, so it does not commit generated HTML or create a `gh-pages` branch. The workflow token has `contents: read` plus the `pages: write` and `id-token: write` deployment permissions required by GitHub Pages; it cannot write source commits.

When the job completes, its deployment environment displays the public URL. Confirm that URL and set the same value as `book.site-url` in `_quarto.yml`; commit and push that metadata correction if necessary.

## 10. Continue normal work

For later edits:

```bash
quarto preview
git status
git add .
git commit -m "Add chapter on …"
git push
```

Every push to `main` rebuilds and deploys the book. A failed render prevents deployment, so inspect the Actions log and reproduce the failure locally with `quarto render`.

## Alternative: GitHub Template Repository

To make the source repository reusable from GitHub as well as from the local script:

1. In `interactive-notes-template` on GitHub, open **Settings** and select **Template repository**.
2. Return to the repository page and select **Use this template → Create a new repository**.
3. Choose the owner and repository name and create it.
4. Clone the generated repository, update `_quarto.yml` and its chapter content, and enable Pages with **GitHub Actions**.

The generated repository is independent: it is not a fork and does not inherit the template's Git history. The GitHub route also avoids copying `.git/`, `_site/`, and `.quarto/` from a local checkout.

## Troubleshooting checklist

- **`quarto: command not found`**: install Quarto and reopen the terminal so its executable is on `PATH`.
- **A chapter is missing from navigation**: add its path under `book.chapters` in `_quarto.yml`.
- **A widget module is not found**: check the import path relative to the `.qmd` file and keep the module under `widgets/`.
- **The workflow does not run**: confirm the pushed branch is `main` or use **Run workflow** in GitHub Actions.
- **Deployment is rejected**: confirm **Settings → Pages → Build and deployment → Source** is set to **GitHub Actions**, and inspect any `github-pages` environment protection rule.
- **The public URL is wrong**: update `book.site-url`; for a project site it is normally `https://USER.github.io/REPOSITORY/`.
