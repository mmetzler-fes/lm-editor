// ==================== SPEC ⇄ PROSEMIRROR-JSON ====================
//
// Reine Funktionen ohne Tiptap. Überschriften sind im Modell flach: Eine Aufgabe
// enthält ihre Bausteine nicht, sie folgen ihr (docs/SCHEMA.md). specToPm packt
// verschachtelte Specs deshalb aus; pmToSpec liefert immer die flache Form.
//
// Maßstab für „verlustfrei“: Das Blatt sieht danach gleich aus (test/pm-convert.test.js,
// tools/check-pm.mjs gegen alle Dokumente).

import { INLINE_RE, SUBSCRIPT_RE, parseColorSpec, textLines } from './docspec.js';
import { PM_NODES, MARK_ORDER } from './pm-schema.js';

const isText = (v) => typeof v === 'string' || typeof v === 'number';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Auszeichnung im Text ----------

// ProseMirror verlangt die Auszeichnungen eines Stücks in der Reihenfolge des Schemas.
const sortMarks = (marks) => [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));

function pushText(out, text, rawMarks) {
  if (!text) return;
  const marks = sortMarks(rawMarks);
  const last = out[out.length - 1];
  if (last?.type === 'text' && same(last.marks || [], marks)) { last.text += text; return; }
  out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
}

/** Unausgezeichneter Text: `n_S`, `P_{Schlupf}` → tiefgestellt (wie plainText in docspec.js). */
function plainNodes(out, text, marks) {
  const un = (s) => s.replace(/\\_/g, '_');
  let pos = 0;
  for (const m of text.matchAll(SUBSCRIPT_RE)) {
    pushText(out, un(text.slice(pos, m.index) + m[1]), marks);
    pushText(out, m[2] || m[3], [...marks, { type: 'subscript' }]);
    pos = m.index + m[0].length;
  }
  pushText(out, un(text.slice(pos)), marks);
}

/** Eine Zeile mit Auszeichnung → Inline-Knoten (dieselbe Grammatik wie inlineHtml). */
function lineNodes(line, marks = [], out = []) {
  const text = String(line);
  let buf = '';
  let pos = 0;
  const flush = () => { plainNodes(out, buf, marks); buf = ''; };
  const add = (inner, ...more) => lineNodes(inner, [...marks, ...more.map((type) => ({ type }))], out);
  for (const m of text.matchAll(new RegExp(INLINE_RE.source, 'g'))) {
    buf += text.slice(pos, m.index);
    pos = m.index + m[0].length;
    const g = m.groups;
    if (g.esc !== undefined) { buf += g.esc; continue; }
    flush();
    if (g.code !== undefined) pushText(out, g.code, [...marks, { type: 'code' }]);
    else if (g.math !== undefined) out.push({ type: 'inlineMath', attrs: { latex: g.math }, ...(marks.length ? { marks: sortMarks(marks) } : {}) });
    else if (g.bi !== undefined) add(g.bi, 'bold', 'italic');
    else if (g.b !== undefined) add(g.b, 'bold');
    else if (g.i !== undefined) add(g.i, 'italic');
    else if (g.u !== undefined) add(g.u, 'underline');
    else if (g.s !== undefined) add(g.s, 'strike');
    else if (g.sup !== undefined) pushText(out, g.sup, [...marks, { type: 'superscript' }]);
    else if (g.sub !== undefined) pushText(out, g.sub, [...marks, { type: 'subscript' }]);
    else if (g.href !== undefined) lineNodes(g.atext, [...marks, { type: 'link', attrs: { href: g.href } }], out);
    else if (g.color !== undefined) {
      const { color, hl, size } = parseColorSpec(g.color);
      const more = [];
      if (color || size) more.push({ type: 'textStyle', attrs: { ...(color ? { color } : {}), ...(size ? { fontSize: size } : {}) } });
      if (hl) more.push({ type: 'highlight', attrs: { color: hl } });
      if (more.length) lineNodes(g.ctext, [...marks, ...more], out);
      else plainNodes(out, m[0], marks); // unbekannte Farbe: wörtlich
    }
  }
  buf += text.slice(pos);
  flush();
  return out;
}

/** Text eines Bausteins → Inline-Knoten: gewollte Umbrüche werden hardBreak. */
export function textToInline(text) {
  const out = [];
  textLines(text).forEach((line, i) => {
    if (i) out.push({ type: 'hardBreak' });
    lineNodes(line, [], out);
  });
  return out;
}

const SPECIAL = /[\\*`[\]^~+{}$]/g;
const escapeAll = (s) => s.replace(SPECIAL, '\\$&').replace(/_/g, '\\_');

function sameMark(a, b) {
  return a.type === b.type && same(a.attrs || {}, b.attrs || {});
}

/** Knoten einer Zeile → Text. `plain` schreibt Textstücke, wie sie sind, oder geschützt. */
function nodesToLine(nodes, plain) {
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
    // Äußerste Auszeichnung: die erste der festen Reihenfolge; so weit sie reicht, gehört alles hinein.
    const outer = MARK_ORDER.map((t) => marks.find((m) => m.type === t)).find(Boolean);
    let end = i + 1;
    while (end < nodes.length && (nodes[end].marks || []).some((m) => sameMark(m, outer))) end++;
    const inner = nodes.slice(i, end).map((x) => {
      const rest = (x.marks || []).filter((m) => !sameMark(m, outer));
      const { marks: _drop, ...node } = x;
      return rest.length ? { ...node, marks: rest } : node;
    });
    i = end;
    if (outer.type === 'code') out += `\`${inner.map((x) => x.text).join('')}\``;
    else if (outer.type === 'superscript') out += `^{${inner.map((x) => x.text).join('')}}`;
    else if (outer.type === 'subscript') out += `_{${inner.map((x) => x.text).join('')}}`;
    else if (outer.type === 'link') out += `[${nodesToLine(inner, plain)}](${outer.attrs.href})`;
    else if (outer.type === 'bold') out += `**${nodesToLine(inner, plain)}**`;
    else if (outer.type === 'italic') out += `*${nodesToLine(inner, plain)}*`;
    else if (outer.type === 'underline') out += `++${nodesToLine(inner, plain)}++`;
    else if (outer.type === 'strike') out += `~~${nodesToLine(inner, plain)}~~`;
    else out += colored(inner, outer, plain);
  }
  return out;
}

/** [Text]{blau,hl-gelb,14pt}: Farbe, Hervorhebung und Größe stehen in einer Angabe. */
function colored(nodes, outer, plain) {
  const partnerType = outer.type === 'textStyle' ? 'highlight' : 'textStyle';
  const candidate = nodes[0]?.marks?.find((m) => m.type === partnerType);
  const partner = candidate && nodes.every((n) => (n.marks || []).some((m) => sameMark(m, candidate))) ? candidate : null;
  const inner = partner ? nodes.map((n) => {
    const rest = n.marks.filter((m) => !sameMark(m, partner));
    const { marks: _drop, ...node } = n;
    return rest.length ? { ...node, marks: rest } : node;
  }) : nodes;
  const [style, hl] = outer.type === 'textStyle' ? [outer, partner] : [partner, outer];
  const parts = [style?.attrs?.color, hl && `hl-${hl.attrs.color}`, style?.attrs?.fontSize && `${style.attrs.fontSize}pt`].filter(Boolean);
  return `[${nodesToLine(inner, plain)}]{${parts.join(',')}}`;
}

/** Vergleichsform einer Zeile: unabhängig von der Reihenfolge der Schlüssel und Auszeichnungen. */
function canonicalLine(nodes) {
  const mark = (m) => JSON.stringify([m.type, Object.entries(m.attrs || {}).filter(([, v]) => v !== null).sort()]);
  return JSON.stringify(nodes.map((n) => [n.type, n.text ?? n.attrs?.latex, (n.marks || []).map(mark).sort()]));
}

/** Eine Zeile zurück in die Schreibweise der Spec; Zeichen nur schützen, wo sie sonst wirken würden („8*7“ bleibt). */
function lineToText(nodes) {
  if (!nodes.length) return '';
  const raw = nodesToLine(nodes, (s) => s);
  if (canonicalLine(lineNodes(raw)) === canonicalLine(nodes)) return raw;
  return nodesToLine(nodes, escapeAll);
}

/** Inline-Knoten → Text eines Bausteins; hardBreak als „\“ am Zeilenende. */
export function inlineToText(nodes) {
  const lines = [[]];
  for (const n of nodes || []) {
    if (n.type === 'hardBreak') lines.push([]);
    else lines[lines.length - 1].push(n);
  }
  return lines.map(lineToText).join('\\\n');
}

// ---------- Bausteine → Knoten ----------

/** Felder des Bausteins auf attrs verteilen; Unbekanntes kommt nach extra. */
function attrsOf(nodeType, block, skip = []) {
  const known = PM_NODES[nodeType].attrs || [];
  const attrs = {};
  const extra = {};
  for (const [k, v] of Object.entries(block)) {
    if (k === 'type' || skip.includes(k) || v === undefined) continue;
    if (known.includes(k)) attrs[k] = v;
    else extra[k] = v;
  }
  if (Object.keys(extra).length) attrs.extra = extra;
  return attrs;
}

const node = (type, attrs, content) => ({
  type,
  ...(attrs && Object.keys(attrs).length ? { attrs } : {}),
  ...(content && content.length ? { content } : {}),
});

function paragraphNodes(text, attrs = {}) {
  return String(text).split('\n\n').map((p, i) => node('paragraph', i ? { ...attrs, joined: true } : attrs, textToInline(p.trim())));
}

function listNode(items, block, attrs) {
  const type = block.ordered ? 'orderedList' : 'bulletList';
  return node(type, attrs, (items || []).map((it) => {
    const obj = it && typeof it === 'object';
    const kids = [node('paragraph', null, textToInline(obj ? it.text ?? '' : it ?? ''))];
    if (obj && Array.isArray(it.items)) kids.push(listNode(it.items, block, null));
    return node('listItem', null, kids);
  }));
}

function cellNode(type, c) {
  if (isText(c) || c === null || c === undefined) return node(type, null, [node('paragraph', null, textToInline(c ?? ''))]);
  const attrs = attrsOf(type, c, ['text', 'blocks']);
  return node(type, attrs, [node('paragraph', null, textToInline(c.text ?? '')), ...blocksToPm(c.blocks)]);
}

function tableNode(b) {
  const rows = [];
  if (Array.isArray(b.header)) rows.push(node('tableRow', { header: true }, b.header.map((c) => cellNode('tableHeader', c))));
  for (const r of (b.rows || []).filter(Array.isArray)) rows.push(node('tableRow', null, r.map((c) => cellNode('tableCell', c))));
  return node('table', attrsOf('table', b, ['header', 'rows']), rows);
}

const ATOMS = ['image', 'group', 'formula', 'karo', 'spacer', 'pagebreak', 'quiz'];

function blockToPm(b) {
  if (isText(b)) return paragraphNodes(b);
  if (!b || typeof b !== 'object') return [];
  const type = b.type || 'text';
  switch (type) {
    case 'section':
    case 'task':
    case 'subtask': {
      const title = b.title !== undefined ? b.title : b.text;
      const attrs = { ...attrsOf('heading', b, ['title', 'text', 'blocks']), role: type };
      const out = [node('heading', attrs, textToInline(title ?? ''))];
      if (b.title !== undefined && isText(b.text)) out.push(...paragraphNodes(b.text));
      return [...out, ...blocksToPm(b.blocks)];
    }
    case 'heading':
      return [node('heading', { ...attrsOf('heading', b, ['title', 'text']), role: 'plain' }, textToInline(b.text ?? b.title ?? ''))];
    case 'text':
      return isText(b.text) ? paragraphNodes(b.text, attrsOf('paragraph', b, ['text'])) : [node('rawBlock', { block: b })];
    case 'note':
      return isText(b.text) ? [node('note', attrsOf('note', b, ['text']), textToInline(b.text))] : [node('rawBlock', { block: b })];
    case 'list':
      return [listNode(b.items, b, attrsOf(b.ordered ? 'orderedList' : 'bulletList', b, ['items', 'ordered']))];
    case 'code': {
      const attrs = attrsOf('codeBlock', b, ['code']);
      return [node('codeBlock', attrs, b.code ? [{ type: 'text', text: String(b.code) }] : null)];
    }
    case 'box':
    case 'solution':
      return [node(type, attrsOf(type, b, ['text', 'blocks']), [...(isText(b.text) ? paragraphNodes(b.text) : []), ...blocksToPm(b.blocks)])];
    case 'columns':
      return [node('columns', attrsOf('columns', b, ['blocks']), (b.blocks || []).map((c) => node('column', attrsOf('column', c, ['blocks']), blocksToPm(c.blocks))))];
    case 'table':
      return [tableNode(b)];
    default:
      return ATOMS.includes(type) ? [node(type, attrsOf(type, b))] : [node('rawBlock', { block: b })];
  }
}

function blocksToPm(blocks) {
  return (Array.isArray(blocks) ? blocks : []).flatMap(blockToPm);
}

/** Spec → ProseMirror-Dokument. Felder neben `content` (titel, meta …) bleiben in attrs.meta. */
export function specToPm(spec) {
  const { content, ...meta } = spec || {};
  return node('doc', Object.keys(meta).length ? { meta } : null, blocksToPm(content));
}

// ---------- Knoten → Bausteine ----------

/** attrs zurück auf den Baustein: Leeres entfällt, `extra` wird aufgelöst. */
function fieldsOf(n, skip = []) {
  const { extra, ...attrs } = n.attrs || {};
  const out = {};
  for (const [k, v] of Object.entries(attrs)) if (!skip.includes(k) && v !== null && v !== undefined) out[k] = v;
  return { ...out, ...(extra || {}) };
}

function listItems(list) {
  return (list.content || []).map((item) => {
    const [para, sub] = item.content || [];
    const text = inlineToText(para?.content);
    return sub ? { text, items: listItems(sub) } : text;
  });
}

function pmCell(n) {
  const [first, ...rest] = n.content || [];
  const text = inlineToText(first?.content);
  const fields = fieldsOf(n);
  if (!rest.length && !Object.keys(fields).length) return text;
  return { ...(text ? { text } : {}), ...fields, ...(rest.length ? { blocks: pmToBlocks(rest) } : {}) };
}

function pmBlock(n) {
  const text = () => inlineToText(n.content);
  switch (n.type) {
    case 'heading': {
      const role = n.attrs?.role || 'plain';
      const fields = fieldsOf(n, ['role']);
      if (role === 'plain') return { type: 'heading', level: 1, ...fields, text: text() };
      return { type: role, ...fields, [role === 'section' ? 'text' : 'title']: text() };
    }
    case 'paragraph':
      return { type: 'text', ...fieldsOf(n, ['joined']), text: text() };
    case 'note':
      return { type: 'note', ...fieldsOf(n), text: text() };
    case 'bulletList':
      return { type: 'list', ...fieldsOf(n), items: listItems(n) };
    case 'orderedList':
      return { type: 'list', ordered: true, ...fieldsOf(n), items: listItems(n) };
    case 'codeBlock':
      return { type: 'code', ...fieldsOf(n), ...(n.attrs?.file && !n.content ? {} : { code: n.content?.[0]?.text ?? '' }) };
    case 'box':
    case 'solution':
      return { type: n.type, ...fieldsOf(n), blocks: pmToBlocks(n.content) };
    case 'columns':
      return { type: 'columns', ...fieldsOf(n), blocks: (n.content || []).map((c) => ({ type: 'column', ...fieldsOf(c), blocks: pmToBlocks(c.content) })) };
    case 'table': {
      const rows = n.content || [];
      const head = rows[0]?.attrs?.header ? rows[0] : null;
      return {
        type: 'table',
        ...fieldsOf(n),
        ...(head ? { header: (head.content || []).map(pmCell) } : {}),
        rows: rows.slice(head ? 1 : 0).map((r) => (r.content || []).map(pmCell)),
      };
    }
    case 'rawBlock':
      return n.attrs.block;
    default:
      return { type: n.type, ...fieldsOf(n) };
  }
}

function pmToBlocks(nodes) {
  const out = [];
  for (const n of nodes || []) {
    const prev = out[out.length - 1];
    // Weiterer Absatz desselben Text-Bausteins
    if (n.type === 'paragraph' && n.attrs?.joined && prev?.type === 'text') prev.text += `\n\n${inlineToText(n.content)}`;
    else out.push(pmBlock(n));
  }
  return out;
}

/** ProseMirror-Dokument → Spec (flach). */
export function pmToSpec(doc) {
  return { ...(doc?.attrs?.meta || {}), content: pmToBlocks(doc?.content) };
}
