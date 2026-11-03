// Tiptap-Extensions aus dem Schema (pm-schema.js). Für den Editor (Phase 9.4) und
// die Prüfung, dass die Konverter gültiges ProseMirror-JSON liefern.

import { Node, Mark, getSchema } from '../vendor/tiptap/tiptap.mjs';
import { PM_NODES, PM_MARKS, NODES_WITH_EXTRA } from './pm-schema.js';

const attrSpec = (names) => () => Object.fromEntries(names.map((n) => [n, { default: null }]));

export function pmExtensions() {
  const nodes = Object.entries(PM_NODES).map(([name, def]) => Node.create({
    name,
    ...(def.top ? { topNode: true } : {}),
    ...(def.group ? { group: def.group } : {}),
    ...(def.content ? { content: def.content } : {}),
    ...(def.inline ? { inline: true } : {}),
    ...(def.atom ? { atom: true } : {}),
    ...(def.marks !== undefined ? { marks: def.marks } : {}),
    ...(def.code ? { code: true } : {}),
    addAttributes: attrSpec([...(def.attrs || []), ...(NODES_WITH_EXTRA.includes(name) ? ['extra'] : [])]),
  }));
  const marks = Object.entries(PM_MARKS).map(([name, def]) => Mark.create({ name, addAttributes: attrSpec(def.attrs || []) }));
  return [...nodes, ...marks];
}

export const pmSchema = () => getSchema(pmExtensions());
