#!/usr/bin/env bash

set -euo pipefail

PROGRAM_NAME="${0##*/}"

usage() {
  printf '%s\n' \
    "Usage: ${PROGRAM_NAME} TARGET_DIRECTORY" \
    "" \
    "Create an independent note project from this template." \
    "" \
    "TARGET_DIRECTORY may be an absolute or relative path. It must either" \
    "not exist or be an existing, writable, empty directory. Files, symbolic" \
    "links, and non-empty directories are refused; nothing is overwritten." \
    "" \
    "The copy omits Git metadata, Quarto output and caches, and common" \
    "generated/editor files. A new Git repository is initialized in the target." \
    "" \
    "Example:" \
    "  ./scripts/new-note.sh ../my-new-note"
}

die() {
  printf '%s: error: %s\n' "$PROGRAM_NAME" "$1" >&2
  exit 1
}

warn() {
  printf '%s: warning: %s\n' "$PROGRAM_NAME" "$1" >&2
}

directory_has_entries() (
  shopt -s nullglob dotglob
  entries=("$1"/*)
  [ "${#entries[@]}" -gt 0 ]
)

if [ "$#" -eq 1 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
  usage
  exit 0
fi

if [ "$#" -ne 1 ]; then
  usage >&2
  exit 2
fi

command -v git >/dev/null 2>&1 || die "git is required but was not found."
command -v mktemp >/dev/null 2>&1 || die "mktemp is required but was not found."
command -v rsync >/dev/null 2>&1 || die "rsync is required but was not found."

# Resolve the template from this script rather than from the caller's directory.
script_path=${BASH_SOURCE[0]}
case "$script_path" in
  */*) script_dir_input=${script_path%/*} ;;
  *) script_dir_input=. ;;
esac
[ -n "$script_dir_input" ] || script_dir_input=/

script_dir=$(CDPATH= cd "$script_dir_input" 2>/dev/null && pwd -P) \
  || die "could not resolve the script directory."
template_root=$(CDPATH= cd "$script_dir/.." 2>/dev/null && pwd -P) \
  || die "could not resolve the template directory."
[ -f "$template_root/_quarto.yml" ] \
  || die "could not find _quarto.yml in the template directory: $template_root"

target_input=$1
[ -n "$target_input" ] || die "TARGET_DIRECTORY must not be empty."

# Remove trailing slashes, except for the filesystem root.
while [ "$target_input" != "/" ] && [ "${target_input%/}" != "$target_input" ]; do
  target_input=${target_input%/}
done

case "$target_input" in
  */*)
    target_parent_input=${target_input%/*}
    target_name=${target_input##*/}
    [ -n "$target_parent_input" ] || target_parent_input=/
    ;;
  *)
    target_parent_input=.
    target_name=$target_input
    ;;
esac

case "$target_name" in
  ""|.|..) die "TARGET_DIRECTORY must name a project directory, not '$target_input'." ;;
esac

target_parent=$(CDPATH= cd "$target_parent_input" 2>/dev/null && pwd -P) \
  || die "the target parent directory does not exist or is not accessible: $target_parent_input"
[ -w "$target_parent" ] && [ -x "$target_parent" ] \
  || die "the target parent directory is not writable: $target_parent"

if [ "$target_parent" = "/" ]; then
  target_abs="/$target_name"
else
  target_abs="$target_parent/$target_name"
fi

case "$target_abs/" in
  "$template_root/"*)
    die "the target must not be the template directory or a directory inside it."
    ;;
esac

target_existed=0
target_created=0
target_removed=0
staging_root=
completed=0

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM

  if [ "$completed" -eq 0 ]; then
    if [ "$target_removed" -eq 1 ] && [ "$target_existed" -eq 1 ]; then
      if [ ! -e "$target_abs" ] && [ ! -L "$target_abs" ]; then
        mkdir "$target_abs" \
          || warn "could not restore the original empty target directory: $target_abs"
      fi
    elif [ "$target_created" -eq 1 ] && [ -d "$target_abs" ] && [ ! -L "$target_abs" ]; then
      if directory_has_entries "$target_abs"; then
        warn "the reserved target gained files during generation and was left in place: $target_abs"
      else
        rmdir "$target_abs" \
          || warn "could not remove the empty reserved target directory: $target_abs"
      fi
    fi
  fi

  if [ -n "$staging_root" ] && [ -d "$staging_root" ]; then
    rm -rf "$staging_root" \
      || warn "could not remove temporary staging directory: $staging_root"
  fi

  exit "$status"
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -L "$target_abs" ]; then
  die "the target must not be a symbolic link: $target_abs"
elif [ -e "$target_abs" ]; then
  [ -d "$target_abs" ] || die "the target exists and is not a directory: $target_abs"
  [ -r "$target_abs" ] && [ -w "$target_abs" ] && [ -x "$target_abs" ] \
    || die "the existing target directory is not readable and writable: $target_abs"
  if directory_has_entries "$target_abs"; then
    die "the target directory is not empty; no files were changed: $target_abs"
  fi
  target_existed=1
else
  # Reserve the final path so a later accidental copy cannot silently claim it.
  mkdir "$target_abs" || die "could not create target directory: $target_abs"
  target_created=1
fi

staging_root=$(mktemp -d "$target_parent/.new-note.XXXXXX") \
  || die "could not create a staging directory in: $target_parent"
staged_project="$staging_root/project"
mkdir "$staged_project" || die "could not create the staged project directory."

# Patterns without a slash match the named item at any depth. Keep source files,
# including .github and .gitignore; omit only repository metadata and disposable
# output, dependency, cache, editor, and operating-system artifacts.
rsync -a \
  --exclude='.git' \
  --exclude='.quarto' \
  --exclude='_site' \
  --exclude='_book' \
  --exclude='_freeze' \
  --exclude='.cache' \
  --exclude='.sass-cache' \
  --exclude='node_modules' \
  --exclude='.venv' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.py[co]' \
  --exclude='.pytest_cache' \
  --exclude='.mypy_cache' \
  --exclude='.ruff_cache' \
  --exclude='.ipynb_checkpoints' \
  --exclude='*.quarto_ipynb' \
  --exclude='.Rproj.user' \
  --exclude='.Rhistory' \
  --exclude='.RData' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.*.local' \
  --exclude='.idea' \
  --exclude='.vscode' \
  --exclude='*.swp' \
  --exclude='*.swo' \
  --exclude='*~' \
  --exclude='.#*' \
  --exclude='#*#' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  --exclude='Thumbs.db' \
  --exclude='Desktop.ini' \
  --exclude='*.aux' \
  --exclude='*.bbl' \
  --exclude='*.bcf' \
  --exclude='*.blg' \
  --exclude='*.fdb_latexmk' \
  --exclude='*.fls' \
  --exclude='*.log' \
  --exclude='*.run.xml' \
  --exclude='*.synctex.gz' \
  --exclude='*.toc' \
  "$template_root/" "$staged_project/" \
  || die "copy failed; the target was not populated."

(
  cd "$staged_project"
  git init --quiet
  git symbolic-ref HEAD refs/heads/main
) || die "git init failed; the target was not populated."

# Re-check the reservation immediately before the final rename. If another
# process added anything, preserve it and stop instead of overwriting it.
if [ -L "$target_abs" ] || [ ! -d "$target_abs" ]; then
  die "the target changed during generation; no files were overwritten: $target_abs"
fi
if directory_has_entries "$target_abs"; then
  die "the target gained files during generation; no files were overwritten: $target_abs"
fi

target_removed=1
rmdir "$target_abs" || die "could not prepare the empty target for the final copy."
mv "$staged_project" "$target_abs" \
  || die "could not move the completed project into the target."
target_removed=0

rmdir "$staging_root" || die "could not remove the empty staging directory."
staging_root=
completed=1
trap - EXIT HUP INT TERM

printf '%s\n' \
  "Created note project: $target_abs" \
  "Initialized independent Git repository: $target_abs/.git" \
  "" \
  "Next steps:" \
  "  cd \"$target_abs\"" \
  "  edit _quarto.yml" \
  "  quarto preview"
