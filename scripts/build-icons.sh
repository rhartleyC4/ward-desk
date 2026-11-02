#!/usr/bin/env bash
# Rebuild the PNG app icons in public/ from the SVGs in scripts/icons/.
# Uses macOS `sips`. Run after changing an icon SVG and commit the PNGs.
set -euo pipefail
cd "$(dirname "$0")/.."

png() { sips -s format png -z "$2" "$2" "scripts/icons/$1" --out "public/$3" >/dev/null; }

png icon.svg 180 apple-touch-icon.png
png icon.svg 192 pwa-192.png
png icon.svg 512 pwa-512.png
png icon-maskable.svg 512 pwa-maskable-512.png
echo "Icons written to public/"
