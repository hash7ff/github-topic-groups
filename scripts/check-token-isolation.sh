#!/usr/bin/env bash
# The content script must never touch the token or chrome.storage. Fail the build if it does.
set -euo pipefail
cd "$(dirname "$0")/.."
for pattern in 'gtf.token' 'chrome.storage' 'Authorization'; do
  if grep -q -- "$pattern" dist/content.js; then
    echo "FAIL: dist/content.js references '$pattern'" >&2
    exit 1
  fi
done
echo "OK: content script references neither the token, chrome.storage nor Authorization headers"
