@tiptap/core und @tiptap/pm 3.22.0 (MIT), einmal gebündelt (ES-Modul), damit zur Laufzeit kein Build-Schritt nötig ist:
  npm i @tiptap/core@3.22.0 @tiptap/pm@3.22.0 esbuild
  entry.mjs: export { Editor, Extension, Node, Mark, getSchema, mergeAttributes } from '@tiptap/core';
             export { Node as PmNode } from '@tiptap/pm/model';
  npx esbuild entry.mjs --bundle --format=esm --minify --legal-comments=none --outfile=tiptap.mjs
Enthält ProseMirror und seine Abhängigkeiten (MIT). Lizenzen: LICENSE.
Tiptap Cloud und Pro werden nicht verwendet. Tabellen und weitere Extensions kommen in Phase 9.4 dazu.
