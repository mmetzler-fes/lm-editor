// ==================== DOKUMENTMODELL: SCHEMA ====================
//
// Knoten und Auszeichnungen des ProseMirror-JSON (Beschreibung: docs/SCHEMA.md).
// Reine Daten ohne Tiptap: Konverter, Server und Renderer brauchen den Editor
// nicht. pm-tiptap.js baut daraus die Tiptap-Extensions, tools/gen-pm-schema.mjs
// das JSON Schema.
//
// `attrs`: bekannte Felder des Bausteins. Was die Spec sonst noch mitbringt,
// wandert unverändert nach `attrs.extra` – so geht nichts verloren.

const PARA = ['align', 'indent', 'firstLine', 'spaceBefore', 'spaceAfter', 'lineHeight'];
const LIST = ['marker', 'numbering', 'lineHeight', 'spaceBefore', 'spaceAfter'];

export const PM_NODES = {
  doc: { content: 'block*', attrs: ['meta'], top: true },
  text: { group: 'inline' },
  hardBreak: { group: 'inline', inline: true, atom: true },
  inlineMath: { group: 'inline', inline: true, atom: true, attrs: ['latex'] },

  // `joined`: weiterer Absatz desselben Text-Bausteins (gleiche ID, „\n\n“ in der Spec).
  paragraph: { group: 'block', content: 'inline*', attrs: ['id', 'joined', ...PARA] },
  // role: section | task | subtask | plain; `level` nur bei plain.
  heading: { group: 'block', content: 'inline*', attrs: ['id', 'role', 'level'] },
  note: { group: 'block', content: 'inline*', attrs: ['id'] },
  bulletList: { group: 'block', content: 'listItem+', attrs: ['id', ...LIST] },
  orderedList: { group: 'block', content: 'listItem+', attrs: ['id', ...LIST] },
  listItem: { content: 'paragraph (bulletList | orderedList)?' },
  codeBlock: { group: 'block', content: 'text*', marks: '', code: true, attrs: ['id', 'caption', 'size', 'file'] },

  // Behälter: nur, was sichtbar einen Rand hat.
  box: { group: 'block', content: 'block*', attrs: ['id', 'title', 'shaded'] },
  solution: { group: 'block', content: 'block*', attrs: ['id', 'title'] },
  columns: { group: 'block', content: 'column+', attrs: ['id'] },
  column: { content: 'block*', attrs: ['id', 'width'] },

  table: {
    group: 'block', content: 'tableRow+',
    attrs: ['id', 'caption', 'widths', 'heights', 'lineWidth', 'lineStyle', 'lineColor', 'width', 'position', 'spaceBefore', 'spaceAfter', 'padding', 'align', 'valign', 'border', 'headerColumn'],
  },
  tableRow: { content: '(tableCell | tableHeader)*', attrs: ['header'] },
  tableCell: { content: 'paragraph block*', attrs: ['colspan', 'rowspan', 'align', 'valign', 'background', 'images', 'beside'] },
  tableHeader: { content: 'paragraph block*', attrs: ['colspan', 'rowspan', 'align', 'valign', 'background', 'images', 'beside'] },

  // Bausteine am Stück
  image: { group: 'block', atom: true, attrs: ['id', 'src', 'file', 'alt', 'caption', 'width', 'float', 'align', 'border'] },
  group: { group: 'block', atom: true, attrs: ['id', 'items', 'ratio', 'width', 'align', 'border', 'caption'] },
  formula: { group: 'block', atom: true, attrs: ['id', 'latex', 'math', 'align'] },
  karo: { group: 'block', atom: true, attrs: ['id', 'lines', 'width', 'pattern'] },
  spacer: { group: 'block', atom: true, attrs: ['id', 'lines'] },
  pagebreak: { group: 'block', atom: true, attrs: ['id'] },
  quiz: { group: 'block', atom: true, attrs: ['id', 'module', 'title', 'scale'] },
  // Unbekannter Baustein (neuere Datei): bleibt unberührt erhalten.
  rawBlock: { group: 'block', atom: true, attrs: ['block'] },
};

/** Knoten, die Felder ihres Bausteins unverändert aufbewahren können. */
export const NODES_WITH_EXTRA = Object.keys(PM_NODES).filter((n) => PM_NODES[n].attrs && !['doc', 'inlineMath', 'tableRow', 'rawBlock'].includes(n));

// Reihenfolge = Schachtelung beim Zurückschreiben (außen zuerst).
export const PM_MARKS = {
  link: { attrs: ['href'] },
  textStyle: { attrs: ['color', 'fontSize'] }, // Name aus TEXT_COLORS, Größe in pt
  highlight: { attrs: ['color'] }, // Name aus HIGHLIGHTS
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  code: {},
  superscript: {},
  subscript: {},
};
export const MARK_ORDER = Object.keys(PM_MARKS);
