// Tiptap-Extensions aus dem Schema (pm-schema.js): für den Editor (src/editor/pm-editor.js)
// und die Prüfung, dass die Konverter gültiges ProseMirror-JSON liefern. Alle Felder stehen
// beim Kopieren in data-pm-attrs; das Aussehen kommt aus den Stilen der Bearbeitungsfläche.

import { Extension, Node, Mark, getSchema } from '../vendor/tiptap/tiptap.mjs';
import { BASE_FONT_PT, HIGHLIGHTS, TEXT_COLORS, paraStyle } from './docspec.js';
import { PM_NODES, PM_MARKS, NODES_WITH_EXTRA } from './pm-schema.js';

const paragraphStyle = (a) => [a.align && a.align !== 'left' ? `text-align:${a.align}` : '', paraStyle(a)].filter(Boolean).join(';');

// Tag und Merkmale je Knoten; 0 = hier steht der Inhalt.
const VIEW = {
  paragraph: (a) => ['p', { style: paragraphStyle(a) || null }, 0],
  heading: (a) => {
    const role = a.role || 'plain';
    if (role === 'plain') return [`h${Math.min(6, (Number(a.level) || 1) + 1)}`, { 'data-ds': 'heading' }, 0];
    return [{ section: 'h2', task: 'h3', subtask: 'h4' }[role] || 'h2', { 'data-ds': role }, 0];
  },
  note: () => ['p', { 'data-ds': 'note' }, 0],
  bulletList: (a) => ['ul', { 'data-marker': a.marker || null }, 0],
  orderedList: (a) => ['ol', { 'data-numbering': a.numbering || null }, 0],
  listItem: () => ['li', {}, 0],
  codeBlock: () => ['pre', {}, ['code', {}, 0]],
  box: (a) => ['div', { class: 'ws-box', 'data-title': a.title || null }, 0],
  solution: () => ['div', { class: 'ds-pm-solution' }, 0],
  columns: () => ['div', { class: 'ds-pm-columns' }, 0],
  column: (a) => ['div', { class: 'ds-pm-column', style: a.width ? `flex:0 0 ${a.width}` : null }, 0],
  table: () => ['table', {}, ['tbody', {}, 0]],
  tableRow: () => ['tr', {}, 0],
  tableCell: (a) => ['td', { colspan: a.colspan > 1 ? a.colspan : null, rowspan: a.rowspan > 1 ? a.rowspan : null, style: a.background ? `background:${a.background}` : null }, 0],
  tableHeader: (a) => ['th', { colspan: a.colspan > 1 ? a.colspan : null, rowspan: a.rowspan > 1 ? a.rowspan : null, style: a.background ? `background:${a.background}` : null }, 0],
};

const MARK_VIEW = {
  link: (a) => ['a', { href: a.href, rel: 'noopener', target: '_blank' }, 0],
  textStyle: (a) => ['span', {
    class: 'ds-color',
    style: [a.color && TEXT_COLORS[a.color] ? `color:${TEXT_COLORS[a.color]}` : '', a.fontSize ? `font-size:${a.fontSize / BASE_FONT_PT}em` : ''].filter(Boolean).join(';') || null,
  }, 0],
  highlight: (a) => ['span', { class: 'ds-color', style: HIGHLIGHTS[a.color] ? `background:${HIGHLIGHTS[a.color]}` : null }, 0],
  bold: () => ['strong', {}, 0],
  italic: () => ['em', {}, 0],
  underline: () => ['u', {}, 0],
  strike: () => ['s', {}, 0],
  code: () => ['code', {}, 0],
  superscript: () => ['sup', {}, 0],
  subscript: () => ['sub', {}, 0],
};

// Für prosemirror-tables: Rolle im Tabellenaufbau; Zellen sind nach außen abgeschlossen.
const TABLE_ROLES = { table: 'table', tableRow: 'row', tableCell: 'cell', tableHeader: 'header_cell' };
const ISOLATING = ['table', 'tableCell', 'tableHeader', 'box', 'solution', 'column'];

// Felder werden nicht einzeln in HTML geschrieben, sondern gesammelt (data-pm-attrs).
const attrSpec = (name, names) => () => Object.fromEntries(names.map((n) => [n, {
  // prosemirror-tables rechnet mit Zahlen; pm-convert lässt die 1 beim Zurückwandeln weg.
  default: (n === 'colspan' || n === 'rowspan') ? 1 : null,
  rendered: false,
  parseHTML: () => null,
}]));

function hasAttrs(attrs) {
  return Object.entries(attrs || {}).some(([k, v]) => v !== null && v !== undefined && !((k === 'colspan' || k === 'rowspan') && v === 1));
}

/** Merkmale des äußeren Tags um die gesammelten Felder ergänzen. */
function dom(view, name, attrs) {
  const [tag, htmlAttrs, ...rest] = view(attrs);
  const clean = Object.fromEntries(Object.entries(htmlAttrs).filter(([, v]) => v !== null));
  return [tag, { ...clean, 'data-pm': name, ...(hasAttrs(attrs) ? { 'data-pm-attrs': JSON.stringify(attrs) } : {}) }, ...rest];
}

const readAttrs = (el) => {
  try { return JSON.parse(el.dataset.pmAttrs || '{}'); } catch (_) { return {}; }
};

const TableRoles = Extension.create({
  name: 'tableRoles',
  extendNodeSchema(ext) {
    return TABLE_ROLES[ext.name] ? { tableRole: TABLE_ROLES[ext.name] } : {};
  },
});

/** `nodeViews`: { knoten: ({ node, getPos, editor }) => NodeView } – nur im Editor. */
export function pmExtensions({ nodeViews = {}, inputRules = {}, inlineAtomText = {} } = {}) {
  const nodes = Object.entries(PM_NODES).map(([name, def]) => Node.create({
    name,
    ...(def.top ? { topNode: true } : {}),
    ...(def.group ? { group: def.group } : {}),
    ...(def.content ? { content: def.content } : {}),
    ...(def.inline ? { inline: true } : {}),
    ...(def.atom ? { atom: true, selectable: true, draggable: !def.inline } : {}),
    ...(def.marks !== undefined ? { marks: def.marks } : {}),
    ...(def.code ? { code: true, defining: true } : {}),
    ...(ISOLATING.includes(name) ? { isolating: true } : {}),
    ...(name === 'heading' ? { defining: true } : {}),
    addAttributes: attrSpec(name, [...(def.attrs || []), ...(NODES_WITH_EXTRA.includes(name) ? ['extra'] : [])]),
    ...(name === 'text' || def.top ? {} : {
      parseHTML: () => [{ tag: `[data-pm="${name}"]`, getAttrs: readAttrs, ...(def.code ? { preserveWhitespace: 'full' } : {}) }],
      renderHTML: ({ node }) => {
        if (name === 'hardBreak') return ['br', { 'data-pm': name }];
        if (VIEW[name]) return dom(VIEW[name], name, node.attrs);
        // Baustein am Stück: ohne NodeView (Kopieren) reicht die Hülle mit den Feldern.
        return dom(() => [def.inline ? 'span' : 'div', {}], name, node.attrs);
      },
    }),
    ...(inlineAtomText[name] ? { renderText: inlineAtomText[name] } : {}),
    ...(nodeViews[name] ? { addNodeView: () => nodeViews[name] } : {}),
    ...(inputRules[name] ? { addInputRules() { return inputRules[name](this.type); } } : {}),
  }));
  const marks = Object.entries(PM_MARKS).map(([name, def]) => Mark.create({
    name,
    ...(name === 'link' ? { inclusive: false } : {}),
    addAttributes: attrSpec(name, def.attrs || []),
    parseHTML: () => [{ tag: `[data-pm="${name}"]`, getAttrs: readAttrs }],
    renderHTML: ({ mark }) => dom(MARK_VIEW[name], name, mark.attrs),
  }));
  return [TableRoles, ...nodes, ...marks];
}

export const pmSchema = () => getSchema(pmExtensions());
