markdown-it 15.0.3, einmal gebündelt (ES-Modul), damit zur Laufzeit kein Build-Schritt nötig ist:
  echo "export { default } from 'markdown-it';" > entry.mjs
  npx esbuild entry.mjs --bundle --format=esm --minify --legal-comments=none --outfile=markdown-it.mjs
Lizenzen der enthaltenen Pakete: LICENSE.
