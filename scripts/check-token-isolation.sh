#!/usr/bin/env bash
# The content script must never touch the token storage key. Fail the build if it does.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY='gtf.token'
if grep -q -- "$KEY" dist/content.js; then
  echo "FAIL: dist/content.js references the token storage key '$KEY'" >&2
  exit 1
fi
echo "OK: content script does not reference '$KEY'"
