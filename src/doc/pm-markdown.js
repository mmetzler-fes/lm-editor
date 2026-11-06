// ==================== PROSEMIRROR-JSON ⇄ MARKDOWN ====================
//
// Austauschformat nach Pandoc (docs/MARKDOWN.md): fenced divs, Spans, x^2^, CO~2~,
// $…$. Reine Funktionen ohne Tiptap. pmToMarkdown schreibt so schlicht wie möglich
// und prüft jede Zeile, indem es sie wieder liest: Hält die schöne Schreibweise
// nicht, werden Zeichen geschützt, zuletzt ist alles ein Span – so geht nichts
// verloren (scripts/check-doc-pm.mjs gegen alle Dokumente).

import MarkdownIt from '../vendor/markdown-it/markdown-it.mjs';
import { HIGHLIGHTS, INLINE_MATH_SOURCE, TEXT_COLORS } from './docspec.js';
import { MARK_ORDER, PM_NODES } from './pm-schema.js';
import { canonicalLine, pushText } from './pm-convert.js';

// ---------- Attribute: {#id .klasse key=wert key="mit Leerzeichen" key:json="[1,2]"} ----------

const NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const BARE_VALUE = /^[\w.%-]+$/;
const KEY_RE = /^[A-Za-z_][\w:.-]*/;

function readValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return NUMBER_RE.test(raw) ? Number(raw) : raw;
}

/** `{…}` ab `start` lesen. Ergebnis: { end, classes, fields } oder null, wenn es keine Attribute sind. */
export function parseAttrs(src, start = 0) {
  if (src[start] !== '{') return null;
  const classes = [];
  const fields = {};
  let i = start + 1;
  for (;;) {
    while (src[i] === ' ' || src[i] === '\t') i++;
    if (i >= src.length) return null;
    if (src[i] === '}') return { end: i + 1, classes, fields };
    if (src[i] === '#' || src[i] === '.') {
      const m = /^[^\s{}#.="][^\s{}="]*/.exec(src.slice(i + 1, i + 200));
      if (!m) return null;
      if (src[i] === '#') fields.id = m[0];
      else classes.push(m[0]);
      i += 1 + m[0].length;
      continue;
    }
    const k = KEY_RE.exec(src.slice(i, i + 80));
    if (!k || src[i + k[0].length] !== '=') return null;
    i += k[0].length + 1;
    let value;
    if (src[i] === '"') {
      let e = i + 1;
      while (e < src.length && src[e] !== '"') e += src[e] === '\\' ? 2 : 1;
      if (e >= src.length) return null;
      const quoted = src.slice(i, e + 1);
      try { value = JSON.parse(quoted); } catch (_) { value = quoted.slice(1, -1).replace(/\\"/g, '"'); }
      i = e + 1;
    } else {
      const m = /^[^\s{}"]+/.exec(src.slice(i, i + 200));
      if (!m) return null;
      value = readValue(m[0]);
      i += m[0].length;
    }
    if (k[0].endsWith(':json')) {
      try { fields[k[0].slice(0, -5)] = JSON.parse(value); } catch (_) { return null; }
    } else fields[k[0]] = value;
  }
}

function writeField(k, v) {
  if (typeof v === 'number' && Number.isFinite(v)) return `${k}=${v}`;
  if (typeof v === 'boolean') return `${k}=${v}`;
  if (typeof v === 'string') {
    const bare = BARE_VALUE.test(v) && !NUMBER_RE.test(v) && v !== 'true' && v !== 'false';
    return bare ? `${k}=${v}` : `${k}=${JSON.stringify(v)}`;
  }
  return `${k}:json=${JSON.stringify(JSON.stringify(v))}`;
}

/** Klassen und Felder als `{…}`; was keinen brauchbaren Namen hat, steht gesammelt in extra:json. */
function writeAttrs(classes, fields) {
  const parts = classes.map((c) => `.${c}`);
  const { id, ...rest } = fields;
  if (typeof id === 'string' && /^[\w-]+$/.test(id)) parts.push(`#${id}`);
  else if (id !== undefined) rest.id = id;
  const odd = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (KEY_RE.exec(k)?.[0] === k && !k.endsWith(':json')) parts.push(writeField(k, v));
    else odd[k] = v;
  }
  if (Object.keys(odd).length) parts.push(writeField('extra', odd));
  return `{${parts.join(' ')}}`;
}

/** Felder eines Knotens (attrs samt extra) flach; Leeres entfällt. Mit `ids: false` ohne id und joined. */
function flat(n, o, skip = []) {
  const { extra, ...attrs } = n.attrs || {};
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (skip.includes(k) || v === null || v === undefined) continue;
    if (o.ids === false && (k === 'id' || k === 'joined')) continue;
    out[k] = v;
  }
  return { ...out, ...(extra || {}) };
}

/** Flache Felder wieder auf attrs: Was der Knoten nicht kennt, kommt nach extra. */
function toAttrs(type, fields, more = {}) {
  const known = PM_NODES[type]?.attrs || [];
  const attrs = { ...more };
  let extra = null;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'extra' && v && typeof v === 'object') extra = { ...extra, ...v };
    else if (known.includes(k)) attrs[k] = v;
    else extra = { ...extra, [k]: v };
  }
  if (extra) attrs.extra = extra;
  return attrs;
}

const node = (type, attrs, content) => ({
  type,
  ...(attrs && Object.keys(attrs).length ? { attrs } : {}),
  ...(content && content.length ? { content } : {}),
});

// ---------- Parser: markdown-it mit eigenen Regeln ----------

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
// Adressen bleiben, wie sie sind; was davon gilt, entscheidet die Spec (nur http, https, mailto).
md.validateLink = () => true;
md.normalizeLink = (s) => s;
md.normalizeLinkText = (s) => s;
// Eingerückter Text ist hier kein Code; Referenzen und HTML gibt es nicht.
md.disable(['code', 'html_block', 'reference', 'html_inline', 'autolink']);

const BLOCK_ALT = { alt: ['paragraph', 'reference', 'blockquote', 'list'] };
const lineOf = (state, l) => state.src.slice(state.bMarks[l] + state.tShift[l], state.eMarks[l]);

// Eine Zeile `::: {…}` oder `::: wort` öffnet, `:::` schließt – der Inhalt wird wie sonst gelesen.
md.block.ruler.before('fence', 'ds_div', (state, startLine, _end, silent) => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const line = lineOf(state, startLine);
  const m = /^:{3,}\s*(.*?)\s*:*\s*$/.exec(line);
  if (!m) return false;
  let info = null;
  if (m[1]) {
    if (/^[\w-]+$/.test(m[1])) info = { classes: [m[1]], fields: {} };
    else {
      info = parseAttrs(m[1]);
      if (!info || info.end !== m[1].length) return false;
    }
  }
  if (silent) return true;
  const t = state.push(info ? 'ds_div_open' : 'ds_div_close', 'div', 0);
  t.meta = info;
  t.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}, BLOCK_ALT);

// $$…$$ als eigener Absatz, auch über mehrere Zeilen; Attribute hinter dem Ende.
md.block.ruler.before('fence', 'ds_formula', (state, startLine, endLine, silent) => {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const first = lineOf(state, startLine);
  if (!first.startsWith('$$')) return false;
  const tail = (text) => {
    const t = text.trim();
    if (!t) return { classes: [], fields: {} };
    const a = parseAttrs(t);
    return a && a.end === t.length ? a : null;
  };
  let latex;
  let attrs;
  let next = startLine + 1;
  const close = first.indexOf('$$', 2);
  if (close > 0) {
    latex = first.slice(2, close);
    attrs = tail(first.slice(close + 2));
    if (!attrs) return false;
  } else {
    const lines = [first.slice(2)];
    for (;; next++) {
      if (next >= endLine) return false;
      const l = lineOf(state, next);
      if (l.startsWith('$$')) {
        attrs = tail(l.slice(2));
        if (!attrs) return false;
        break;
      }
      lines.push(l);
    }
    next++;
    if (!lines[0]) lines.shift();
    latex = lines.join('\n');
  }
  if (silent) return true;
  const t = state.push('ds_formula', 'div', 0);
  t.meta = { latex, attrs };
  t.map = [startLine, next];
  state.line = next;
  return true;
}, BLOCK_ALT);

// Überschrift: `## Titel {.task #id}` – die Attribute stehen am Zeilenende.
md.core.ruler.before('inline', 'ds_heading_attrs', (state) => {
  state.tokens.forEach((t, i) => {
    if (t.type !== 'inline' || state.tokens[i - 1]?.type !== 'heading_open') return;
    const c = t.content;
    if (!c.endsWith('}') || c.endsWith('\\}')) return;
    for (let at = c.indexOf('{'); at >= 0; at = c.indexOf('{', at + 1)) {
      if (c[at - 1] === '\\') continue;
      const a = parseAttrs(c, at);
      if (a && a.end === c.length) {
        state.tokens[i - 1].meta = a;
        t.content = c.slice(0, at).trimEnd();
        return;
      }
    }
  });
});

const MATH_START = new RegExp(`^${INLINE_MATH_SOURCE}`);
md.inline.ruler.before('escape', 'ds_math', (state, silent) => {
  if (state.src[state.pos] !== '$') return false;
  const m = MATH_START.exec(state.src.slice(state.pos));
  if (!m) return false;
  if (!silent) state.push('ds_math', '', 0).content = m.groups.math;
  state.pos += m[0].length;
  return true;
});

/** x^2^ und CO~2~ wie bei Pandoc (ohne Leerzeichen), dazu die alte Schreibweise x^{2}, CO_{2}. */
function scriptRule(marker, type) {
  return (state, silent) => {
    const { src, pos, posMax } = state;
    if (src[pos] !== marker || src[pos + 1] === marker) return false;
    let text = '';
    let i = pos + 1;
    for (; i < posMax && src[i] !== marker; i++) {
      if (/\s/.test(src[i])) return false;
      if (src[i] === '\\' && i + 1 < posMax) i++;
      text += src[i];
    }
    if (i >= posMax || !text) return false;
    if (!silent) state.push(type, '', 0).content = text;
    state.pos = i + 1;
    return true;
  };
}
md.inline.ruler.before('strikethrough', 'ds_sub', scriptRule('~', 'ds_sub'));
md.inline.ruler.before('ds_sub', 'ds_sup', scriptRule('^', 'ds_sup'));
md.inline.ruler.before('ds_sup', 'ds_script_braces', (state, silent) => {
  const m = /^(?:\^\{([^}\n]{1,40})\}|_\{([^}\n]{1,24})\})/.exec(state.src.slice(state.pos, state.pos + 50));
  if (!m) return false;
  if (!silent) state.push(m[1] !== undefined ? 'ds_sup' : 'ds_sub', '', 0).content = m[1] ?? m[2];
  state.pos += m[0].length;
  return true;
});

// [Text]{.blau size=14pt}; `[]{…}` am Anfang gehört dem Absatz.
md.inline.ruler.before('link', 'ds_span', (state, silent) => {
  if (state.src[state.pos] !== '[') return false;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, false);
  if (labelEnd < 0) return false;
  const attrs = parseAttrs(state.src.slice(0, state.posMax), labelEnd + 1);
  if (!attrs) return false;
  if (!silent) {
    const { pos, posMax } = state;
    state.pos = pos + 1;
    state.posMax = labelEnd;
    state.push('ds_span_open', 'span', 1).meta = attrs;
    state.md.inline.tokenize(state);
    state.push('ds_span_close', 'span', -1);
    state.pos = pos;
    state.posMax = posMax;
  }
  state.pos = attrs.end;
  return true;
});

// ![Beschriftung](bild.png){width=8cm}
md.inline.ruler.before('escape', 'ds_image_attrs', (state, silent) => {
  if (state.src[state.pos] !== '{') return false;
  const prev = state.tokens[state.tokens.length - 1];
  if (prev?.type !== 'image' || state.pending) return false;
  const attrs = parseAttrs(state.src.slice(0, state.posMax), state.pos);
  if (!attrs) return false;
  if (!silent) prev.meta = attrs;
  state.pos = attrs.end;
  return true;
});

// ---------- Markdown → Knoten ----------

const COLOR_NAMES = new Set(Object.keys(TEXT_COLORS));

/** Klassen und Felder eines Spans → Auszeichnungen. */
function spanMarks({ classes, fields }) {
  const marks = [];
  const style = {};
  for (const c of classes) {
    if (COLOR_NAMES.has(c)) style.color = c;
    else if (c.startsWith('hl-') && HIGHLIGHTS[c.slice(3)]) marks.push({ type: 'highlight', attrs: { color: c.slice(3) } });
    else if (c === 'mark') marks.push({ type: 'highlight', attrs: { color: 'gelb' } });
    else if (MARK_ORDER.includes(c)) marks.push({ type: c });
  }
  const pt = /^(\d{1,2})(?:pt)?$/.exec(String(fields.size ?? ''));
  if (pt) style.fontSize = Number(pt[1]);
  if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style });
  if (typeof fields.href === 'string') marks.push({ type: 'link', attrs: { href: fields.href } });
  return marks;
}

const SIMPLE_MARKS = { em: 'italic', strong: 'bold', s: 'strike' };

/** Inline-Tokens → { nodes, fields (aus `[]{…}` am Anfang), images }. */
function readInline(children, opts = {}) {
  const nodes = [];
  const images = [];
  let fields = null;
  let marks = [];
  const spans = [];
  (children || []).forEach((t, i) => {
    const simple = /^(em|strong|s)_(open|close)$/.exec(t.type);
    if (t.type === 'text') pushText(nodes, t.content, marks);
    else if (simple) {
      const type = SIMPLE_MARKS[simple[1]];
      if (simple[2] === 'open') marks = [...marks, { type }];
      else marks = marks.filter((m) => m.type !== type);
    } else if (t.type === 'softbreak') {
      if (opts.breaks) nodes.push({ type: 'hardBreak' });
      else pushText(nodes, ' ', marks);
    } else if (t.type === 'hardbreak') nodes.push({ type: 'hardBreak' });
    else if (t.type === 'code_inline') pushText(nodes, t.content, [...marks, { type: 'code' }]);
    else if (t.type === 'ds_sup') pushText(nodes, t.content, [...marks, { type: 'superscript' }]);
    else if (t.type === 'ds_sub') pushText(nodes, t.content, [...marks, { type: 'subscript' }]);
    else if (t.type === 'ds_math') nodes.push({ type: 'inlineMath', attrs: { latex: t.content }, ...(marks.length ? { marks: sorted(marks) } : {}) });
    else if (t.type === 'link_open') marks = [...marks, { type: 'link', attrs: { href: t.attrGet('href') } }];
    else if (t.type === 'link_close') marks = marks.filter((m) => m.type !== 'link');
    else if (t.type === 'image') images.push(imageNode(t));
    else if (t.type === 'ds_span_open') {
      const empty = children[i + 1]?.type === 'ds_span_close';
      if (empty && t.meta.classes.includes('br')) nodes.push({ type: 'hardBreak' });
      else if (empty && !nodes.length && !fields) fields = t.meta.fields;
      spans.push(marks);
      marks = [...marks, ...spanMarks(t.meta)];
    } else if (t.type === 'ds_span_close') marks = spans.pop() || [];
  });
  return { nodes, fields, images };
}

const sorted = (marks) => [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));

/** Eine Zeile Markdown → Inline-Knoten (zum Prüfen der eigenen Ausgabe). */
const parseLine = (s) => readInline(md.parseInline(s, {})[0]?.children).nodes;

function imageNode(t) {
  const { classes: _c, fields = {} } = t.meta || {};
  const src = t.attrGet('src');
  const caption = t.content;
  return node('image', toAttrs('image', { ...(src ? { src } : {}), ...(caption ? { caption } : {}), ...fields }));
}

function paragraphNodes(inlineToken, opts) {
  const { nodes, fields, images } = readInline(inlineToken.children, opts);
  // Bilder sind im Modell Bausteine: Text davor bleibt ein Absatz, das Bild folgt.
  if (images.length && !nodes.length && !fields) return images;
  return [node('paragraph', fields ? toAttrs('paragraph', fields) : null, nodes), ...images];
}

/** Tokens der Reihe nach lesen; Behälter (`:::`) und alles Geschachtelte rekursiv. */
class Reader {
  constructor(tokens, opts) {
    this.tokens = tokens;
    this.i = 0;
    this.opts = opts;
  }

  warn(text) { this.opts.warnings?.push(text); }

  /** Bausteine bis zum Ende des Behälters: `inDiv` bis `:::`, sonst bis zum schließenden Token der Umgebung. */
  blocks(inDiv = false) {
    const out = [];
    while (this.i < this.tokens.length) {
      const t = this.tokens[this.i];
      if (t.type === 'ds_div_close') {
        this.i++;
        if (inDiv) return out;
        this.warn('Ein ::: schließt nichts, es ist überflüssig.');
        continue;
      }
      if (/_close$/.test(t.type)) return out; // Ende der Umgebung; auch ein offener Behälter endet hier
      this.i++;
      out.push(...this.block(t));
    }
    if (inDiv) this.warn('Ein ::: wurde nicht geschlossen.');
    return out;
  }

  block(t) {
    switch (t.type) {
      case 'paragraph_open': {
        const nodes = paragraphNodes(this.tokens[this.i], this.opts);
        this.i += 2;
        return nodes;
      }
      case 'heading_open': return this.heading(t);
      case 'bullet_list_open': return this.list('bulletList', 'bullet_list_close');
      case 'ordered_list_open': return this.list('orderedList', 'ordered_list_close');
      case 'blockquote_open': {
        const kids = this.blocks();
        this.i++;
        return [node('box', null, kids)];
      }
      case 'fence': return [this.code(t)];
      case 'table_open': return [this.table()];
      case 'ds_formula': return [node('formula', toAttrs('formula', { latex: t.meta.latex, ...t.meta.attrs.fields }))];
      case 'ds_div_open': return this.div(t.meta);
      default: return []; // Trennlinie
    }
  }

  heading(open) {
    const inline = this.tokens[this.i];
    this.i += 2;
    const { classes = [], fields = {} } = open.meta || {};
    const depth = Number(open.tag.slice(1));
    const named = ['section', 'task', 'subtask', 'plain'].find((c) => classes.includes(c));
    const role = named || ['section', 'task', 'subtask'][depth - 1] || 'plain';
    const level = role !== 'plain' || fields.level !== undefined ? {} : { level: named ? depth : depth - 3 };
    // Eine Überschrift hat keine Bilder: bleibt der Beschreibungstext.
    const { nodes, images } = readInline(inline.children, this.opts);
    for (const img of images) pushText(nodes, img.attrs?.caption || '', []);
    return [node('heading', toAttrs('heading', { ...fields, ...level }, { role }), nodes)];
  }

  list(type, closeType, fields = {}) {
    const items = [];
    const hoisted = [];
    while (this.tokens[this.i]?.type === 'list_item_open') {
      this.i++;
      const kids = this.blocks();
      this.i++; // list_item_close
      const inline = [];
      let sub = null;
      for (const k of kids) {
        if (k.type === 'paragraph') {
          if (inline.length) inline.push({ type: 'hardBreak' });
          inline.push(...(k.content || []));
        } else if (k.type === 'bulletList' || k.type === 'orderedList') {
          if (sub) sub.content.push(...(k.content || []));
          else sub = { ...k };
        } else hoisted.push(k); // Das Modell kennt im Listenpunkt nur Text und Unterliste.
      }
      items.push(node('listItem', null, [node('paragraph', null, inline), ...(sub ? [sub] : [])]));
    }
    if (this.tokens[this.i]?.type === closeType) this.i++;
    return [node(type, toAttrs(type, fields), items), ...hoisted];
  }

  code(t) {
    const info = t.info.trim();
    const a = info.startsWith('{') ? parseAttrs(info) : null;
    const text = t.content.replace(/\n$/, '');
    return node('codeBlock', toAttrs('codeBlock', a?.fields || {}), text ? [{ type: 'text', text }] : null);
  }

  table() {
    const rows = [];
    let inHead = false;
    let row = null;
    for (; this.i < this.tokens.length; this.i++) {
      const t = this.tokens[this.i];
      if (t.type === 'table_close') { this.i++; break; }
      if (t.type === 'thead_open') inHead = true;
      else if (t.type === 'tbody_open') inHead = false;
      else if (t.type === 'tr_open') row = [];
      else if (t.type === 'tr_close') rows.push(node('tableRow', inHead ? { header: true } : null, row));
      else if (t.type === 'th_open' || t.type === 'td_open') {
        const { nodes } = readInline(this.tokens[this.i + 1].children, this.opts);
        const align = /text-align:(\w+)/.exec(t.attrGet('style') || '')?.[1];
        row.push(node(t.type === 'th_open' ? 'tableHeader' : 'tableCell', align ? { align } : null, [node('paragraph', null, nodes)]));
        this.i += 2;
      }
    }
    // Eine Kopfzeile ohne Inhalt heißt: Die Tabelle hat keine (wie bei Pandoc).
    const headEmpty = rows[0]?.attrs?.header && rows[0].content.every((c) => !c.content[0].content);
    return node('table', null, headEmpty ? rows.slice(1) : rows);
  }

  div({ classes, fields }) {
    const type = classes.map((c) => DIV_TYPES[c]).find(Boolean);
    const kids = this.blocks(true);
    switch (type) {
      case 'box':
      case 'solution':
        return [node(type, toAttrs(type, fields), kids)];
      case 'note': {
        const inline = [];
        for (const k of kids) {
          if (inline.length) inline.push({ type: 'hardBreak' });
          inline.push(...(k.content || []));
        }
        return [node('note', toAttrs('note', fields), inline)];
      }
      case 'columns':
        return [node('columns', toAttrs('columns', fields), kids.filter((k) => k.type === 'column'))];
      case 'column':
        return [node('column', toAttrs('column', fields), kids)];
      case 'list': {
        const list = kids.find((k) => k.type === 'bulletList' || k.type === 'orderedList');
        const { ordered, ...rest } = fields;
        const listType = list?.type || (ordered ? 'orderedList' : 'bulletList');
        return [node(listType, toAttrs(listType, rest), list?.content), ...kids.filter((k) => k !== list)];
      }
      case 'table': {
        const pipe = kids.find((k) => k.type === 'table');
        const rows = pipe ? pipe.content : kids.filter((k) => k.type === 'tableRow');
        return [node('table', toAttrs('table', fields), rows)];
      }
      case 'tableRow': {
        const head = fields.header === true;
        const cells = kids.filter((k) => k.type === 'tableCell' || k.type === 'tableHeader')
          .map((c) => (head || c.type === 'tableHeader' ? { ...c, type: 'tableHeader' } : c));
        return [node('tableRow', head ? { header: true } : null, cells)];
      }
      case 'tableCell':
      case 'tableHeader': {
        // Eine Zelle beginnt immer mit ihrem Text; fehlt er, ist er leer.
        const plainFirst = kids[0]?.type === 'paragraph' && !kids[0].attrs;
        return [node(type, toAttrs(type, fields), plainFirst ? kids : [node('paragraph'), ...kids])];
      }
      case 'group': {
        const json = kids.find((k) => k.type === 'codeBlock');
        const items = json ? this.json(json) : undefined;
        return [node('group', toAttrs('group', { ...fields, ...(items !== undefined ? { items } : {}) }))];
      }
      case 'rawBlock': {
        const json = kids.find((k) => k.type === 'codeBlock');
        const block = json ? this.json(json) : undefined;
        return block === undefined ? [] : [node('rawBlock', { block })];
      }
      case 'image':
      case 'formula':
      case 'karo':
      case 'spacer':
      case 'pagebreak':
      case 'quiz':
        return [node(type, toAttrs(type, fields)), ...kids];
      default:
        // Unbekannte Klasse: Der Inhalt bleibt, wie bei Pandoc ist der Behälter nur eine Hülle.
        if (classes.length) this.warn(`Unbekannter Behälter ::: ${classes[0]} – nur sein Inhalt wurde übernommen.`);
        return kids;
    }
  }

  json(codeNode) {
    try { return JSON.parse(codeNode.content?.[0]?.text ?? ''); } catch (e) {
      this.warn(`JSON in einem Behälter ist nicht lesbar: ${e.message}`);
      return undefined;
    }
  }
}

// Klassen der Behälter: deutsch geschrieben, die Namen des Modells gelten auch.
const DIV_CLASS = {
  box: 'box', solution: 'loesung', note: 'hinweis', columns: 'spalten', column: 'spalte', list: 'liste',
  table: 'tabelle', tableRow: 'zeile', tableCell: 'zelle', tableHeader: 'kopfzelle',
  image: 'bild', group: 'zeichenrahmen', formula: 'formel', karo: 'karo', spacer: 'abstand',
  pagebreak: 'seitenumbruch', quiz: 'quiz', rawBlock: 'roh',
};
const DIV_TYPES = Object.fromEntries(Object.entries(DIV_CLASS).flatMap(([type, cls]) => [[type, type], [cls, type]]));

/** Kopf der Datei: `key: Wert` je Zeile (Teilmenge von YAML); Werte als JSON oder schlicht. */
function readFrontMatter(text) {
  const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { meta: null, body: text };
  const meta = {};
  let last = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^("(?:[^"\\]|\\.)*"|[\w.-]+):\s*(.*)$/.exec(line);
    if (kv) {
      last = kv[1][0] === '"' ? JSON.parse(kv[1]) : kv[1];
      let value;
      try { value = JSON.parse(kv[2]); } catch (_) { value = kv[2].trim().replace(/^'(.*)'$/, '$1'); }
      meta[last] = value;
    } else if (last && /^\s/.test(line) && typeof meta[last] === 'string') {
      meta[last] = `${meta[last]} ${line.trim()}`.trim(); // eingerückte Fortsetzung
    } else return { meta: null, body: text }; // keine Kopfdaten, nur zwei Trennlinien
  }
  return { meta, body: text.slice(m[0].length) };
}

/**
 * Markdown → ProseMirror-Dokument. Optionen: `breaks` (einfacher Zeilenumbruch
 * bleibt einer, sonst wird er wie bei Pandoc zum Leerzeichen), `warnings` (Array,
 * sammelt Hinweise).
 */
export function markdownToPm(text, opts = {}) {
  const { meta, body } = readFrontMatter(String(text ?? '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, ''));
  const reader = new Reader(md.parse(body, {}), opts);
  const content = fillEmptyHeadings(reader.blocks());
  return node('doc', meta && Object.keys(meta).length ? { meta } : null, content);
}

// Längster Absatz, der als Titel in die Zeile einer leeren Überschrift rückt.
const RUN_IN_MAX = 300;

/**
 * `##` ohne Titel, darunter die Aufgabenstellung (so schreiben es KIs gern, weil
 * Nummern im Titel verboten sind): Der Absatz wird zum Titel – „1.1 Welche …“
 * steht dann in einer Zeile, statt „1.1“ allein. Nur für nummerierte
 * Überschriften (Abschnitt, Aufgabe, Teilaufgabe) und kurze Absätze ohne
 * Zeilenumbruch; auch in Kästen und Lösungen.
 */
export function fillEmptyHeadings(list) {
  const out = [];
  const textOf = (n) => (n.content || []).map((x) => (x.type === 'text' ? x.text : x.type === 'inlineMath' ? 'x' : '')).join('');
  for (let i = 0; i < (list || []).length; i++) {
    const n = list[i];
    const next = list[i + 1];
    if (n?.type === 'heading' && ['section', 'task', 'subtask'].includes(n.attrs?.role) && !(n.content || []).length
      && next?.type === 'paragraph' && (next.content || []).length && !(next.content || []).some((x) => x.type === 'hardBreak')
      && textOf(next).length <= RUN_IN_MAX) {
      out.push({ ...n, content: next.content });
      i++;
      continue;
    }
    out.push(['box', 'solution', 'column', 'columns'].includes(n?.type) && Array.isArray(n.content) ? { ...n, content: fillEmptyHeadings(n.content) } : n);
  }
  return out;
}

// ---------- Knoten → Markdown: Auszeichnung ----------

const SPECIAL = /[\\*_`[\]^~$&<]/g;
const NEWLINE = /[\r\n]/g;
const entity = (c) => `&#${c.codePointAt(0)};`;
const escapeAll = (s) => s.replace(SPECIAL, '\\$&').replace(NEWLINE, entity);
// Für uns ist `<div>` Text, Pandoc läse es als HTML.
const keepTags = (s) => s.replace(/<(?=[A-Za-z/!?])/g, '\\<');

function codeSpan(text) {
  const runs = text.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = /^`|`$/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const withoutMark = (nodes, mark) => nodes.map((x) => {
  const rest = (x.marks || []).filter((m) => !sameMark(m, mark));
  const { marks: _drop, ...n } = x;
  return rest.length ? { ...n, marks: rest } : n;
});
const sameMark = (a, b) => a.type === b.type && JSON.stringify(a.attrs || {}) === JSON.stringify(b.attrs || {});

/** Auszeichnungen als Attribute eines Spans. */
function spanAttrs(marks) {
  const classes = [];
  const fields = {};
  for (const m of marks) {
    if (m.type === 'highlight') classes.push(`hl-${m.attrs.color}`);
    else if (m.type === 'textStyle') {
      if (m.attrs?.color) classes.push(m.attrs.color);
      if (m.attrs?.fontSize) fields.size = `${m.attrs.fontSize}pt`;
    } else if (m.type === 'link') fields.href = m.attrs.href;
    else classes.push(m.type);
  }
  return writeAttrs(classes, fields);
}

/** Übliche Schreibweise: **fett**, [Text]{.blau}, x^2^ … `plain` bestimmt, was mit dem Text geschieht. */
function naturalLine(nodes, plain) {
  let out = '';
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    const marks = n.marks || [];
    if (!marks.length) {
      out += n.type === 'inlineMath' ? `$${n.attrs.latex}$` : plain(n.text);
      i++;
      continue;
    }
    const outer = MARK_ORDER.map((t) => marks.find((m) => m.type === t)).find(Boolean);
    let end = i + 1;
    while (end < nodes.length && (nodes[end].marks || []).some((m) => sameMark(m, outer))) end++;
    const inner = withoutMark(nodes.slice(i, end), outer);
    i = end;
    const flatText = () => inner.map((x) => x.text ?? '').join('');
    switch (outer.type) {
      case 'link': out += `[${naturalLine(inner, plain)}](${outer.attrs.href})`; break;
      case 'bold': out += `**${naturalLine(inner, plain)}**`; break;
      case 'italic': out += `*${naturalLine(inner, plain)}*`; break;
      case 'strike': out += `~~${naturalLine(inner, plain)}~~`; break;
      case 'code': out += codeSpan(flatText()); break;
      case 'superscript': out += `^${escapeAll(flatText())}^`; break;
      case 'subscript': out += `~${escapeAll(flatText())}~`; break;
      default: out += `[${naturalLine(inner, plain)}]${spanAttrs([outer])}`; // Farbe, Größe, Unterstrichen
    }
  }
  return out;
}

/** Sichere Schreibweise: jedes Stück ein eigener Span mit allen Auszeichnungen. */
function spanLine(nodes) {
  return nodes.map((n) => {
    const piece = n.type === 'inlineMath' ? `$${n.attrs.latex}$` : escapeAll(n.text);
    return n.marks?.length ? `[${piece}]${spanAttrs(n.marks)}` : piece;
  }).join('');
}

/** Leerraum am Rand und ein Backslash am Ende wirken sonst auf den Absatz. */
function guardEdges(s) {
  const edge = (m) => [...m].map(entity).join('');
  const body = s.replace(/^\s+/, edge).replace(/\s+$/, edge);
  return /(?:^|[^\\])(?:\\\\)*\\$/.test(body) ? `${body}\\` : body;
}

function mergeAdjacent(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') pushText(out, n.text, n.marks || []);
    else out.push(n);
  }
  return out;
}

// Schreibweisen von schlicht bis sicher.
const STAGES = [(nodes) => naturalLine(nodes, keepTags), (nodes) => naturalLine(nodes, escapeAll), spanLine];

/** Eine Zeile schreiben: die erste Schreibweise ab `stage`, die beim Wiederlesen dasselbe ergibt. */
function lineToMarkdown(rawNodes, stage = 0) {
  if (!rawNodes.length) return '';
  const nodes = mergeAdjacent(rawNodes);
  const want = canonicalLine(nodes);
  let s = '';
  for (let k = stage; k < STAGES.length; k++) {
    s = guardEdges(STAGES[k](nodes));
    if (canonicalLine(parseLine(s)) === want) return s;
  }
  return s;
}

function splitLines(inline) {
  const lines = [[]];
  for (const n of inline || []) {
    if (n.type === 'hardBreak') lines.push([]);
    else lines[lines.length - 1].push(n);
  }
  return lines;
}

/** Was am Zeilenanfang als Block gelesen würde, bekommt einen Backslash. */
function guardLineStart(line) {
  if (/^(?:#{1,6}(?:\s|$)|>|[-+*](?:\s|$)|`{3}|~{3}|:{3}|\$\$|[-:|\s]+$|[-*_=\s]+$)/.test(line) && /^[!-/:-@[-`{-~]/.test(line)) return `\\${line}`;
  const num = /^(\d{1,9})([.)])(\s.*|)$/.exec(line);
  return num ? `${num[1]}\\${num[2]}${num[3]}` : line;
}

const plainBreaks = (inline) => mergeAdjacent((inline || []).map((n) => (n.type === 'hardBreak' ? { type: 'hardBreak' } : n)));

/** Zeilen einzeln schreiben, dann das Ganze prüfen: Ein `*` kann sonst mit einem in der nächsten Zeile ein Paar bilden. */
function joinChecked(inline, join) {
  const lines = splitLines(inline);
  const want = canonicalLine(plainBreaks(inline));
  let s = '';
  for (let stage = 0; stage < STAGES.length; stage++) {
    s = join(lines.map((l) => lineToMarkdown(l, stage)));
    if (canonicalLine(parseLine(s)) === want) return s;
  }
  return s;
}

/** Mehrzeiliger Inhalt (Absatz, Listenpunkt). Der Umbruch ist `\` am Zeilenende. */
function inlineBlock(inline) {
  return joinChecked(inline, (raw) => {
    const lines = raw.map(guardLineStart);
    // Am Absatzende wäre `\` ein Zeichen, nicht der Umbruch.
    if (lines.length > 1 && !lines[lines.length - 1]) {
      lines.pop();
      return `${lines.join('\\\n')}[]{.br}`;
    }
    return lines.join('\\\n');
  });
}

/** Inhalt in einer Zeile (Überschrift, Tabellenzelle): Der Umbruch ist `[]{.br}`. */
const inlineOneLine = (inline) => joinChecked(inline, (lines) => lines.join('[]{.br}'));

// ---------- Knoten → Markdown: Bausteine ----------

function div(cls, fields, body = '') {
  const keys = Object.keys(fields);
  const open = keys.length ? `::: ${writeAttrs(cls ? [cls] : [], fields)}` : `::: ${cls}`;
  return body ? `${open}\n${body}\n:::` : `${open}\n:::`;
}

function jsonFence(value) {
  return `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
}

function paragraphMd(n, o) {
  const fields = flat(n, o);
  const head = Object.keys(fields).length ? `[]${writeAttrs([], fields)}` : '';
  const body = inlineBlock(n.content);
  return head || body ? head + body : '[]{}';
}

function headingMd(n, o) {
  const role = n.attrs?.role || 'plain';
  const fields = flat(n, o, ['role']);
  let depth = { section: 1, task: 2, subtask: 3 }[role] || 1;
  const classes = role === 'plain' || !['section', 'task', 'subtask'].includes(role) ? [role] : [];
  if (role === 'plain' && Number.isInteger(fields.level) && fields.level >= 1 && fields.level <= 6) {
    depth = fields.level;
    delete fields.level;
  }
  // Am Ende wäre `#` die schließende Raute; ein `}` am Ende bekommt leere Attribute dahinter.
  const title = inlineOneLine(n.content).replace(/#$/, '\\#');
  const attrs = classes.length || Object.keys(fields).length || title.endsWith('}') ? writeAttrs(classes, fields) : '';
  return ['#'.repeat(depth), title, attrs].filter(Boolean).join(' ');
}

function listBody(n) {
  const ordered = n.type === 'orderedList';
  return (n.content || []).map((item, i) => {
    const prefix = ordered ? `${i + 1}. ` : '- ';
    const pad = ' '.repeat(prefix.length);
    const [para, sub] = item.content || [];
    const text = inlineBlock(para?.content) || '[]{}';
    const lines = text.split('\n');
    if (sub) lines.push(...listBody(sub).split('\n'));
    return prefix + lines.map((l, k) => (k ? pad + l : l)).join('\n');
  }).join('\n');
}

const isList = (n) => n?.type === 'bulletList' || n?.type === 'orderedList';

function listMd(n, prev, o) {
  const fields = flat(n, o);
  const body = listBody(n);
  // Zwei Listen hintereinander wären beim Lesen eine; eine ohne Punkte hat keine Markdown-Form.
  if (Object.keys(fields).length || isList(prev) || !body) {
    return div('liste', { ...fields, ...(n.type === 'orderedList' && !body ? { ordered: true } : {}) }, body);
  }
  return body;
}

function codeMd(n, o) {
  const code = n.content?.[0]?.text ?? '';
  const fields = flat(n, o);
  const info = Object.keys(fields).length ? writeAttrs([], fields) : '';
  const runs = code.match(/^\s*(`{3,}|~{3,})/gm) || [];
  const char = info.includes('`') ? '~' : '`';
  const fence = char.repeat(Math.max(2, ...runs.map((r) => r.trim().length)) + 1);
  return code ? `${fence}${info}\n${code}\n${fence}` : `${fence}${info}\n${fence}`;
}

const hasOnlyText = (cell) => !cell.attrs && (cell.content || []).length === 1 && cell.content[0].type === 'paragraph' && !cell.content[0].attrs;
const cellLine = (cell) => inlineOneLine(cell.content[0].content).replace(/\|/g, '\\|');
const pipeRow = (cells) => `| ${cells.join(' | ')} |`;

/** Einfache Tabelle als Pipe-Tabelle; null, wenn sie mehr kann, als die Form ausdrücken kann. */
function pipeTable(n) {
  const rows = n.content || [];
  if (!rows.length) return null;
  const hasHead = !!rows[0].attrs?.header;
  const width = rows[0].content?.length || 0;
  if (!width || rows.some((r, i) => (r.attrs?.header && i > 0) || (r.content || []).length !== width || !r.content.every(hasOnlyText))) return null;
  const head = hasHead ? rows[0].content : Array(width).fill(null);
  if (hasHead && head.every((c) => !c.content[0].content)) return null; // leere Kopfzeile hieße „keine“
  const lines = [pipeRow(head.map((c) => (c ? cellLine(c) : ''))), pipeRow(Array(width).fill('---'))];
  for (const r of rows.slice(hasHead ? 1 : 0)) lines.push(pipeRow(r.content.map(cellLine)));
  return lines.join('\n');
}

function cellMd(c, o) {
  const [first, ...rest] = c.content || [];
  const firstEmpty = !first?.content?.length;
  const keepFirst = !firstEmpty || rest[0]?.type === 'paragraph';
  const body = blocksToMd([...(keepFirst && first ? [first] : []), ...rest], o);
  return div(DIV_CLASS[c.type], flat(c, o), body);
}

function tableMd(n, o) {
  const fields = flat(n, o);
  const pipe = pipeTable(n);
  if (pipe) return Object.keys(fields).length ? div('tabelle', fields, pipe) : pipe;
  const rows = (n.content || []).map((r) => {
    const cells = (r.content || []).map((c) => cellMd(c, o)).join('\n');
    return div('zeile', r.attrs?.header ? { header: true } : {}, cells);
  });
  return div('tabelle', fields, rows.join('\n'));
}

function imageMd(n, o) {
  const fields = flat(n, o);
  const { src, caption, ...rest } = fields;
  const niceSrc = typeof src === 'string' && /^[^\s()<>\\]+$/.test(src);
  const niceCaption = caption === undefined || (typeof caption === 'string' && caption && !/[\\[\]\n\r]/.test(caption) && caption.trim() === caption);
  if (!niceSrc || !niceCaption) return div('bild', fields);
  const attrs = Object.keys(rest).length ? writeAttrs([], rest) : '';
  return `![${caption ?? ''}](${src})${attrs}`;
}

function formulaMd(n, o) {
  const { latex, ...rest } = flat(n, o);
  const nice = typeof latex === 'string' && latex.trim() === latex && latex && !latex.includes('$$') && rest.math === undefined;
  if (!nice) return div('formel', flat(n, o));
  const attrs = Object.keys(rest).length ? ` ${writeAttrs([], rest)}` : '';
  return latex.includes('\n') ? `$$\n${latex}\n$$${attrs}` : `$$${latex}$$${attrs}`;
}

function blockToMd(n, prev, o) {
  switch (n.type) {
    case 'paragraph': return paragraphMd(n, o);
    case 'heading': return headingMd(n, o);
    case 'bulletList':
    case 'orderedList': return listMd(n, prev, o);
    case 'codeBlock': return codeMd(n, o);
    case 'table': return tableMd(n, o);
    case 'image': return imageMd(n, o);
    case 'formula': return formulaMd(n, o);
    case 'note': return div('hinweis', flat(n, o), inlineBlock(n.content));
    case 'columns': return div('spalten', flat(n, o), (n.content || []).map((c) => div('spalte', flat(c, o), blocksToMd(c.content, o))).join('\n'));
    case 'group': {
      const { items, ...rest } = flat(n, o);
      return div('zeichenrahmen', rest, items === undefined ? '' : jsonFence(items));
    }
    case 'rawBlock': return div('roh', {}, jsonFence(n.attrs.block));
    default: return div(DIV_CLASS[n.type] || n.type, flat(n, o), blocksToMd(n.content, o));
  }
}

function blocksToMd(nodes, o) {
  return (nodes || []).map((n, i) => blockToMd(n, nodes[i - 1], o)).join('\n\n');
}

function frontMatter(meta) {
  const keys = Object.keys(meta || {});
  if (!keys.length) return '';
  const key = (k) => (/^[\w.-]+$/.test(k) ? k : JSON.stringify(k));
  return `---\n${keys.map((k) => `${key(k)}: ${JSON.stringify(meta[k])}`).join('\n')}\n---\n\n`;
}

/**
 * ProseMirror-Dokument → Markdown. Mit `{ ids: false }` ohne Block-IDs – kürzer und
 * lesbarer (KI-Prompt), aber Stift-Striche fänden ihren Baustein nicht mehr.
 */
export function pmToMarkdown(doc, opts = {}) {
  const body = blocksToMd(doc?.content, opts);
  return `${frontMatter(doc?.attrs?.meta)}${body}${body ? '\n' : ''}`;
}
