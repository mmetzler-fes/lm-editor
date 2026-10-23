#!/bin/sh
# src/import/odt.js aus odt.ts von LearningModules neu erzeugen (siehe tools/port-odt.py).
set -e
LM="$(cd "${1:-../LearningModules}" && pwd)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
python3 "$HERE/tools/port-odt.py" "$LM/src/core/interchange/odt/odt.ts" "$TMP/odt.ts"
cp "$HERE/tools/port-odt.tsconfig.json" "$TMP/tsconfig.json"
(cd "$TMP" && "$LM/node_modules/.bin/tsc" -p tsconfig.json >/dev/null 2>&1 || true)
{ sed -n '1,7p' "$HERE/src/import/odt.js"; cat "$TMP/out/odt.js"; } > "$TMP/odt.js"
mv "$TMP/odt.js" "$HERE/src/import/odt.js"
rm -rf "$TMP"
echo "src/import/odt.js neu erzeugt."
