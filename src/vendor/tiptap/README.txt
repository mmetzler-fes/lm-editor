@tiptap/core und @tiptap/pm 3.22.0 (MIT), einmal gebündelt (ES-Modul), damit zur Laufzeit kein Build-Schritt nötig ist:
  npm i @tiptap/core@3.22.0 @tiptap/pm@3.22.0 esbuild
  entry.mjs: export { Editor, Extension, Node, Mark, getSchema, mergeAttributes, InputRule } from '@tiptap/core';
             export { Node as PmNode, Fragment, Slice, DOMSerializer } from '@tiptap/pm/model';
             export { TextSelection, NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
             export { history, undo, redo } from '@tiptap/pm/history';
             export { gapCursor } from '@tiptap/pm/gapcursor';
             export { dropCursor } from '@tiptap/pm/dropcursor';
             export { tableEditing, columnResizing, addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell, goToNextCell, isInTable, CellSelection } from '@tiptap/pm/tables';
  npx esbuild entry.mjs --bundle --format=esm --minify --legal-comments=none --outfile=tiptap.mjs
Enthält ProseMirror und seine Abhängigkeiten (MIT). Lizenzen: LICENSE.
Tiptap Cloud und Pro werden nicht verwendet.
