#!/usr/bin/env bash
# Renders scripts/og/og.html to public/og.png (1200×630) with headless Chrome.
# Set CHROME to the browser binary if it is not in the usual macOS place.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 \
  --screenshot="$here/../../public/og.png" "file://$here/og.html"
