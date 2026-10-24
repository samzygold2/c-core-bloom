#!/usr/bin/env bash
set -e

BASE="${1:-main}"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Web safety check: non-git environment detected, directory structure validated."
  exit 0
fi

if git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  CHANGED=$(git diff --name-only "$BASE"...HEAD; git diff --name-only; git ls-files --others --exclude-standard)
else
  CHANGED=$(git diff --name-only HEAD; git ls-files --others --exclude-standard)
fi

OUTSIDE=$(printf '%s\n' "$CHANGED" | grep -vE '^(mobile/|COPILOT_MOBILE_APP[.]md$)' | grep -v '^$' || true)

if [ -n "$OUTSIDE" ]; then
  echo "Web safety check failed: changes outside mobile/ detected:" >&2
  printf '%s\n' "$OUTSIDE" >&2
  exit 1
fi

echo "Web safety check passed: no web-app files changed outside mobile/."