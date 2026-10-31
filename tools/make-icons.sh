#!/bin/sh
# Erzeugt die App-Symbole (icons/*.png) aus icons/icon.svg. Braucht Inkscape und ImageMagick.
set -e
cd "$(dirname "$0")/../icons"
svg() { inkscape icon.svg --export-type=png --export-filename="$2" -w "$1" -h "$1" >/dev/null 2>&1; }
svg 512 app-512.png
svg 192 app-192.png
svg 32 favicon-32.png
# Maskierbar und Apple: heller Grund, Symbol mit Rand (sicherer Bereich ~80 %).
svg 340 /tmp/lm-icon-340.png
convert -size 512x512 xc:'#EEF2FF' /tmp/lm-icon-340.png -gravity center -composite -alpha off app-maskable-512.png
svg 136 /tmp/lm-icon-136.png
convert -size 180x180 xc:'#EEF2FF' /tmp/lm-icon-136.png -gravity center -composite -alpha off apple-touch-icon.png
rm -f /tmp/lm-icon-340.png /tmp/lm-icon-136.png
