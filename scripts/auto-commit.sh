#!/bin/bash
# Auto-commit hook: runs at the end of each Claude prompt (Stop event).
# Skips if nothing changed. Blocks (exit 1) if typecheck or build fails
# so Claude is forced to fix the issue before the session ends.

set -euo pipefail

# Avoid re-running when Claude is already continuing due to this hook
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

# Nothing to commit?
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

# Typecheck + build (block the stop if either fails)
echo "--- auto-commit: typechecking ---"
npx tsc --noEmit
echo "--- auto-commit: building ---"
npm run build --silent

# Stage everything except gitignored files
git add -A

# Safety: if nothing staged after all, exit
if [ -z "$(git diff --cached --name-only)" ]; then
  exit 0
fi

# Build a commit message from staged file names
FILES=$(git diff --cached --name-only | paste -sd ', ')

git commit -m "auto: $FILES

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo "--- auto-commit: committed ---"
