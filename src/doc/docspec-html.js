/**
 * HTML → Dokument-Spec (Modultyp „Dokument“). Grundlage ist das HTML, das der
 * .odt-Import (src/core/interchange/odt/odt.ts) und der bisherige Typ
 * „Text / Arbeitsblatt“ liefern: Überschriften h2–h4, Absätze mit
 * Ausrichtung, fett/kursiv/…, Listen, Tabellen mit verbundenen Zellen,
 * Bilder mit Lage-Klassen (ws-float-*, ws-img-center, ws-img-border) und
 * Textrahmen (div.ws-box).
 *
 * Läuft im Browser (DOMParser). Auch die Umwandlung alter Module geschieht
 * hier – der Server hat keinen HTML-Parser.
 *
 * Für den visuellen Editor gibt es den Rückweg specToEditorHtml(): Blöcke,
 * die sich als Text bearbeiten lassen, werden HTML (Überschriften tragen
 * data-ds="section|task|subtask|heading"); Karo, Lösung, Formel, Code usw.
 * werden feste Bausteine (div.ds-widget mit dem Block als data-block).
 * Feste Block-IDs (ids.js) reisen als data-id mit – an ihnen hängen die
 * Striche der Schüler.
 */
import { richText, renderDocSpecHtml, tableColgroup, tableRowAttr } from './docspec.js';
import { isBlockId } from './ids.js';

const MARKUP_CHARS = /[\\*`[\]]/g;

/** Text so schreiben, dass er wörtlich bleibt (keine ungewollte Auszeichnung). */
export function escapeMarkup(text) {
  return String(text)
    .replace(MARKUP_CHARS, '\\$&')
    .replace(/\^\{/g, '\\^{')
    .replace(/~~/g, '\\~\\~')
    .replace(/\+\+/g, '\\+\\+')
    .replace(/_\{/g, '\\_{')
    // `n_S` wäre sonst ein Index – im HTML war es keiner.
    .replace(/(?<![0-9A-Za-zÄÖÜäöüß_\\])([A-Za-zΑ-Ωα-ω])_(?=[A-Za-z0-9ÄÖÜäöü])/g, '$1\\_');
}

/** Auszeichnung um Text legen; Leerraum am Rand bleibt außerhalb der Zeichen. */
function mark(inner, open, close = open) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : inner;
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'DIV', 'FIGURE', 'BLOCKQUOTE', 'PRE', 'HR']);

/** Inline-Inhalt eines Elements → Text mit Auszeichnung. Bilder sammelt `images`. */
function inline(node, images, warnings) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { out += escapeMarkup(c.nodeValue.replace(/\s*\n\s*/g, ' ')); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName;
    if (tag === 'BR') { out += '\\\n'; continue; }
    if (tag === 'IMG') { images.push(c); continue; }
    if (BLOCK_TAGS.has(tag)) { out += inline(c, images, warnings); continue; }
    const inner = inline(c, images, warnings);
    if (tag === 'STRONG' || tag === 'B') {
      const only = c.childNodes.length === 1 && c.firstChild.nodeType === 1 && ['EM', 'I'].includes(c.firstChild.tagName);
      out += only ? mark(inline(c.firstChild, images, warnings), '***') : mark(inner, '**');
    } else if (tag === 'EM' || tag === 'I') out += mark(inner, '*');
    else if (tag === 'U') out += mark(inner, '++');
    else if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') out += mark(inner, '~~');
    else if (tag === 'SUP') out += inner.trim() ? `^{${inner.trim()}}` : '';
    else if (tag === 'SUB') out += inner.trim() ? `_{${inner.trim()}}` : '';
    else if (tag === 'CODE') out += c.textContent ? `\`${c.textContent.replace(/`/g, "'")}\`` : '';
    else if (tag === 'A') {
      const href = c.getAttribute('href') || '';
      out += /^(https?:|mailto:)/i.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner;
    } else out += inner;
  }
  return out;
}

function cleanText(text) {
  return text.replace(/[ \t]+\\\n/g, '\\\n').replace(/(\\\n)+$/g, '').replace(/^\s+|\s+$/g, '')
    // Aneinanderstoßende gleiche Auszeichnung („**Z****uordnung**“ aus einzeln fett gesetzten Buchstaben) zusammenfassen.
    .replace(/(\S)(\*\*|\+\+|~~)\2(?=\S)/g, '$1');
}

function imageBlock(img, warnings) {
  const src = img.getAttribute('src') || '';
  if (!/^(data:image\/(png|jpeg|gif|webp|svg\+xml);base64,|https:\/\/|\/api\/)/i.test(src)) {
    warnings.push('Ein Bild ohne gültige Quelle wurde weggelassen.');
    return null;
  }
  const block = { type: 'image', src };
  const width = Number(img.getAttribute('width'));
  // Aus dem Editor: ursprüngliche Breite (z. B. 9cm), solange sie nicht verändert wurde.
  const orig = img.getAttribute('data-width');
  if (orig && width > 0 && Math.round(cssPx(orig)) === Math.round(width)) block.width = orig;
  else if (width > 0) block.width = `${Math.round(width)}px`;
  else if (orig) block.width = orig;
  const cls = img.getAttribute('class') || '';
  if (/\bws-float-left\b/.test(cls)) block.float = 'left';
  else if (/\bws-float-right\b/.test(cls)) block.float = 'right';
  else if (/\bws-img-center\b/.test(cls)) block.float = 'center';
  if (/\bws-img-border\b/.test(cls)) block.border = true;
  const alt = img.getAttribute('alt');
  if (alt && alt !== 'Zeichnung') block.alt = alt;
  const caption = img.getAttribute('data-caption');
  if (caption) block.caption = caption;
  // Zeichnung mit Quelle (.odg in der Nextcloud, bearbeitbar in LibreOffice Draw).
  const source = img.getAttribute('data-source');
  if (source && /^(https:\/\/|\/api\/)/i.test(source)) block.source = source;
  return block;
}

/**
 * Feste ID eines Elements (data-id), wenn sie noch frei ist. Die zweite von
 * zwei gleichen (Kopie, Absatz mit Enter geteilt) bleibt ohne – sie bekommt
 * im Editor eine neue.
 */
function takeId(el, used) {
  const id = el?.getAttribute?.('data-id');
  if (!used || !isBlockId(id) || used.has(id)) return null;
  used.add(id);
  return id;
}

const withId = (block, id) => {
  if (block && id) block.id = id;
  return block;
};

/** CSS-Länge in Pixel (96 dpi), wie der Browser sie für width nimmt. */
function cssPx(len) {
  const m = /^(\d+(?:\.\d+)?)(cm|mm|px|%)$/.exec(String(len || ''));
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return m[2] === 'cm' ? v * 37.8 : m[2] === 'mm' ? v * 3.78 : m[2] === '%' ? (v / 100) * 624 : v;
}

/**
 * Liste aus <ul>/<ol>. Tabellen und Kästen in einem Punkt (z. B. aus Writer
 * eingefügt) passen nicht in einen Listentext – sie kommen in `lifted` und
 * folgen der Liste, statt als Buchstabensalat im Punkt zu landen.
 */
function listBlock(el, images, warnings, lifted = []) {
  const items = [];
  for (const li of el.children) {
    if (li.tagName !== 'LI') continue;
    const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const clone = li.cloneNode(true);
    for (const n of [...clone.querySelectorAll('ul, ol')]) n.remove();
    for (const n of [...clone.querySelectorAll('table, div.ws-box')]) {
      if (lifted.some((l) => l.contains(n))) continue; // steckt schon in einem herausgehobenen
      lifted.push(n);
      n.remove();
    }
    const text = cleanText(inline(clone, images, warnings));
    const sub = nested.flatMap((n) => listBlock(n, images, warnings, lifted).items);
    items.push(sub.length ? { text, items: sub } : text);
  }
  const block = { type: 'list', items };
  if (el.tagName === 'OL') block.ordered = true;
  return block;
}

function tableBlock(el, warnings, used = new Set()) {
  const cell = (td) => {
    // Tabellen und Kästen in der Zelle werden ihre Bausteine (Tabelle in der Tabelle).
    const own = (cellEl) => [...cellEl.querySelectorAll('table, div.ws-box')].filter((n) => n.parentElement.closest('td, th') === cellEl);
    let blocks = null;
    if (own(td).length) {
      const holder = td.ownerDocument.createElement('div');
      td = td.cloneNode(true);
      const clones = own(td);
      const top = clones.filter((n) => !clones.some((m) => m !== n && m.contains(n)));
      holder.append(...top);
      blocks = blocksOf(holder, warnings, used);
    }
    const found = [];
    // Führende Leerzeichen bleiben: Sie richten z. B. Programmausgaben aus.
    const text = cleanText(inline(td, found, warnings)).replace(/^/, (/^ +/.exec(td.textContent) || [''])[0]);
    const cs = Number(td.getAttribute('colspan')) || 1;
    const rs = Number(td.getAttribute('rowspan')) || 1;
    // Bilder bleiben in ihrer Zelle (z. B. Baustein links, Zeitdiagramm rechts).
    const images = found.map((img) => imageBlock(img, warnings)).filter(Boolean)
      .map(({ type: _t, float: _f, caption: _c, border: _b, ...img }) => img);
    if (cs === 1 && rs === 1 && !images.length && !blocks?.length) return text;
    const beside = images.length && td.classList.contains('ws-cell-beside');
    return { text, ...(cs > 1 ? { colspan: Math.min(cs, 20) } : {}), ...(rs > 1 ? { rowspan: Math.min(rs, 20) } : {}), ...(images.length ? { images } : {}), ...(beside ? { beside: true } : {}), ...(blocks?.length ? { blocks } : {}) };
  };
  const rowsOf = (section) => [...(section?.children || [])].filter((r) => r.tagName === 'TR')
    .map((tr) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map(cell));
  const thead = [...el.children].find((c) => c.tagName === 'THEAD');
  const bodies = [...el.children].filter((c) => c.tagName === 'TBODY');
  const rows = bodies.length ? bodies.flatMap(rowsOf) : rowsOf(el);
  const header = thead ? rowsOf(thead)[0] : null;
  const block = { type: 'table', rows: rows.length ? rows : [['']] };
  if (header) block.header = header;
  if (el.getAttribute('data-caption')) block.caption = el.getAttribute('data-caption');
  // Ohne Linien: z. B. Abbildungen nebeneinander mit Unterschrift.
  if (el.classList.contains('ws-table-plain')) block.border = false;
  // Feste Spaltenbreiten (<col style="width">) und Zeilenhöhen (<tr style="height">), in cm.
  const trim = (list) => { while (list.length && !list[list.length - 1]) list.pop(); return list; };
  const cols = [...el.children].filter((c) => c.tagName === 'COLGROUP').flatMap((g) => [...g.children].filter((c) => c.tagName === 'COL'));
  const widths = trim(cols.map((c) => cssCm(c.style?.width)));
  if (widths.length) block.widths = widths;
  const heights = trim([...(thead ? tableRows(thead).slice(0, 1) : []), ...(bodies.length ? bodies.flatMap(tableRows) : tableRows(el).filter((tr) => tr.parentNode === el))]
    .map((tr) => cssCm(tr.style?.height)));
  if (heights.length) block.heights = heights;
  return block;
}

/** CSS-Länge (cm, mm, px) als „3.5cm“ – leer, wenn keine. */
function cssCm(value) {
  const m = /^(\d+(?:\.\d+)?)(cm|mm|px)$/.exec(String(value || '').trim());
  if (!m) return '';
  const cm = Number(m[1]) / (m[2] === 'mm' ? 10 : m[2] === 'px' ? 96 / 2.54 : 1);
  return cm >= 0.2 ? `${Math.round(cm * 10) / 10}cm` : '';
}

const tableRows = (el) => [...el.children].flatMap((c) => (c.tagName === 'TR' ? [c] : ['THEAD', 'TBODY', 'TFOOT'].includes(c.tagName) ? [...c.children].filter((r) => r.tagName === 'TR') : []));
const tableCells = (tr) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');

/**
 * Lösungs-Baustein aus Bausteinen; „Lösung:“ als eigener erster Absatz wird
 * seine Überschrift. null, wenn nichts übrig bleibt.
 */
function solutionOf(blocks) {
  const inner = blocks.filter((b) => !['solution', 'quiz'].includes(b.type));
  const solution = { type: 'solution', blocks: inner };
  const first = inner[0];
  const head = first?.type === 'text' ? first.text.split('\n\n')[0].trim() : '';
  if (/^\**\s*(Lösung|Musterlösung|Lösungsvorschlag)\s*:?\s*\**$/i.test(head)) {
    solution.title = head.replace(/\*/g, '').trim().replace(/:?$/, ':');
    const rest = first.text.split('\n\n').slice(1).join('\n\n');
    if (rest) first.text = rest; else inner.shift();
  }
  return inner.length ? solution : null;
}

const cellEmpty = (td) => !td.textContent.trim() && !td.querySelector('img, table, div');

/**
 * Tabelle aus lauter leeren Zellen (ab 8 Spalten) – so schreibt der Renderer
 * ein Karo in die .odt (Zellen à 0,5 cm). Wird wieder ein Schreibfeld.
 * Im Lösungsblatt liegt in der ersten Zelle ein Rahmen mit der Lösung
 * darüber – dann Schreibfeld und dahinter die Lösung. Liefert eine Liste.
 */
function karoOfTable(el, warnings, used) {
  const rows = tableRows(el);
  if (!rows.length || rows.length > 60) return null;
  const cols = Math.max(...rows.map((tr) => tableCells(tr).reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0)));
  if (cols < 8) return null;
  const cells = rows.flatMap((tr) => tableCells(tr));
  const [first, ...rest] = cells;
  if (!rest.every(cellEmpty)) return null;
  const overlay = cellEmpty(first) ? null : [...first.children].find((c) => c.tagName === 'DIV' && /\bws-box\b/.test(c.getAttribute('class') || ''));
  if (!cellEmpty(first) && (!overlay || [...first.children].some((c) => c !== overlay && c.textContent.trim()))) return null;
  const block = { type: 'karo', lines: rows.length };
  if (cols < 33) block.width = `${cols * 0.5}cm`;
  const solution = overlay ? solutionOf(blocksOf(overlay, warnings, used)) : null;
  return solution ? [block, solution] : [block];
}

/**
 * Tabelle mit nur einer Zelle, die Absätze, Listen oder Tabellen enthält – so
 * schreibt der Renderer einen Kasten. Wird wieder ein Kasten; ein erster Absatz
 * nur in Fett ist sein Titel.
 */
function boxOfTable(el, warnings, used) {
  const rows = tableRows(el);
  if (rows.length !== 1) return null;
  const cells = tableCells(rows[0]);
  if (cells.length !== 1 || ![...cells[0].children].some((c) => BLOCK_TAGS.has(c.tagName))) return null;
  const td = cells[0];
  const box = { type: 'box' };
  const first = td.firstElementChild;
  if (first?.tagName === 'P' && first.children.length === 1 && /^(STRONG|B)$/.test(first.firstElementChild.tagName)
    && first.textContent.trim() === first.firstElementChild.textContent.trim() && first.textContent.trim()) {
    box.title = first.textContent.trim();
    first.remove();
  }
  box.blocks = blocksOf(td, warnings, used);
  return box;
}

/**
 * Bilder einer großen Tabelle (über 6 Zeilen oder 3 Spalten): Dort hängt ein
 * Bild meist nur an einer Zelle und steht in Wahrheit neben der Tabelle (z. B.
 * der Baustein neben der Deklarationstabelle) – es folgt der Tabelle. In
 * kleinen Tabellen zum Anordnen bleiben Bilder in ihrer Zelle, ebenso wenn
 * mehrere Zellen Bilder haben (z. B. eine Zeile „Schaltung“ mit drei Schaltbildern).
 */
function imagesBesideTable(el, warnings) {
  if (el.classList.contains('ws-table-plain')) return [];
  const rows = tableRows(el);
  const cols = Math.max(0, ...rows.map((tr) => tableCells(tr).length));
  if (rows.length <= 6 && cols <= 3) return [];
  // Nur Bilder dieser Tabelle – nicht die einer Tabelle in einer Zelle.
  const imgs = [...el.querySelectorAll('img')].filter((img) => img.closest('table') === el);
  if (new Set(imgs.map((img) => img.closest('td, th'))).size > 1) return [];
  const blocks = imgs.map((img) => imageBlock(img, warnings)).filter(Boolean);
  imgs.forEach((img) => img.remove());
  return blocks;
}

/** Blöcke aus den Kindern eines Elements. */
function blocksOf(parent, warnings, used = new Set()) {
  const out = [];
  const pushText = (text, align, el = null) => {
    if (!text) return;
    const prev = out[out.length - 1];
    const mergeable = !align && prev && prev.type === 'text' && !prev.align && !prev._closed;
    // Aufeinanderfolgende einfache Absätze werden ein Textblock (Leerzeile trennt) –
    // außer der Absatz gehört zu einem anderen Block (eigene data-id). Mit Enter
    // geteilte Absätze tragen dieselbe ID wie ihr Block.
    const raw = el?.getAttribute?.('data-id');
    if (mergeable && (!raw || raw === prev.id)) { prev.text += `\n\n${text}`; return; }
    out.push(withId(align ? { type: 'text', align, text } : { type: 'text', text }, takeId(el, used)));
  };
  const close = () => { const prev = out[out.length - 1]; if (prev) prev._closed = true; };
  const spacer = () => {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'spacer') prev.lines += 1;
    else out.push({ type: 'spacer', lines: 1 });
  };

  for (const el of parent.children) {
    const tag = el.tagName;
    const ds = el.getAttribute('data-ds');
    if (tag === 'DIV' && el.hasAttribute('data-solution')) {
      // Ausgeblendeter Text aus der .odt (Lösung im Arbeitsblatt): bleibt verborgen.
      const solution = solutionOf(blocksOf(el, warnings, used));
      if (solution) { close(); out.push(solution); close(); }
    } else if (tag === 'DIV' && el.hasAttribute('data-block')) {
      try {
        const block = JSON.parse(decodeURIComponent(el.getAttribute('data-block')));
        // Kopierter Baustein: dieselbe ID gilt nur einmal.
        if (block && typeof block === 'object' && block.id !== undefined) {
          if (isBlockId(block.id) && !used.has(block.id)) used.add(block.id); else delete block.id;
        }
        out.push(block);
      } catch (_) {
        warnings.push('Ein Baustein ließ sich nicht lesen und fehlt.');
      }
    } else if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(3, Math.max(1, Number(tag[1]) - 1));
      const text = cleanText(inline(el, [], warnings));
      const id = text ? takeId(el, used) : null;
      if (!text) { /* leere Überschrift */ } else if (ds === 'section') out.push(withId({ type: 'section', text }, id));
      else if (ds === 'task' || ds === 'subtask') out.push(withId({ type: ds, title: text }, id));
      else out.push(withId({ type: 'heading', level, text }, id));
    } else if (tag === 'P' && ds === 'note') {
      const text = cleanText(inline(el, [], warnings)).replace(/^\*([\s\S]*)\*$/, '$1');
      if (text) out.push(withId({ type: 'note', text }, takeId(el, used)));
    } else if (tag === 'P' || tag === 'FIGURE' || tag === 'BLOCKQUOTE') {
      const images = [];
      const text = cleanText(inline(el, images, warnings));
      const align = /text-align:\s*(center|right|justify)/.exec(el.getAttribute('style') || '')?.[1];
      for (const img of images) {
        const b = imageBlock(img, warnings);
        if (b) { close(); out.push(withId(b, takeId(img, used))); }
      }
      if (text) {
        if (images.length) close();
        pushText(text, align, el);
      } else if (!images.length) spacer();
    } else if (tag === 'UL' || tag === 'OL') {
      const images = [];
      const lifted = [];
      const list = listBlock(el, images, warnings, lifted);
      if (list.items.some((it) => (typeof it === 'string' ? it : it.text || it.items?.length))) out.push(withId(list, takeId(el, used)));
      if (lifted.length) {
        const holder = el.ownerDocument.createElement('div');
        holder.append(...lifted);
        close();
        out.push(...blocksOf(holder, warnings, used));
      }
      if (images.length) warnings.push(`${images.length} Bild${images.length === 1 ? '' : 'er'} in Listen weggelassen.`);
    } else if (tag === 'TABLE' && el.classList.contains('ws-columns')) {
      // Spalten: je Zelle der ersten Zeile eine Spalte mit eigenen Bausteinen.
      const id = takeId(el, used);
      const cols = [...el.children].filter((c) => c.tagName === 'COLGROUP').flatMap((g) => [...g.children]);
      const columns = tableCells(tableRows(el)[0] || el).map((td, i) => {
        const width = cssCm(cols[i]?.style?.width);
        return withId({ type: 'column', ...(width ? { width } : {}), blocks: blocksOf(td, warnings, used) }, takeId(td, used));
      });
      close();
      if (columns.length >= 2) out.push(withId({ type: 'columns', blocks: columns.slice(0, 4) }, id));
      else out.push(...(columns[0]?.blocks || []));
      close();
    } else if (tag === 'TABLE') {
      const karo = karoOfTable(el, warnings, used);
      if (karo) { close(); out.push(...karo); close(); } else {
        const beside = imagesBesideTable(el, warnings);
        const id = takeId(el, used);
        out.push(withId(boxOfTable(el, warnings, used) || tableBlock(el, warnings, used), id), ...beside);
      }
    }
    else if (tag === 'DIV' && /\bws-box\b/.test(el.getAttribute('class') || '')) {
      const id = takeId(el, used);
      const inner = blocksOf(el, warnings, used);
      const box = { type: 'box' };
      if (el.getAttribute('data-title')) box.title = el.getAttribute('data-title');
      if (el.getAttribute('data-shaded') === '1') box.shaded = true;
      if (inner.length || box.title) out.push(withId({ ...box, blocks: inner }, id));
    } else if (tag === 'IMG') {
      const b = imageBlock(el, warnings);
      if (b) out.push(withId(b, takeId(el, used)));
    } else if (tag === 'PRE') out.push({ type: 'code', code: el.textContent.replace(/\n$/, '') });
    else if (tag === 'HR') out.push({ type: 'spacer', lines: 1 });
    else if (el.children.length) out.push(...blocksOf(el, warnings, used));
    else pushText(cleanText(inline(el, [], warnings)));
    if (out.length && out[out.length - 1].type !== 'text') close();
  }
  // Leerraum am Anfang und Ende ist im Dokument bedeutungslos.
  while (out[0]?.type === 'spacer') out.shift();
  while (out[out.length - 1]?.type === 'spacer') out.pop();
  for (const b of out) delete b._closed;
  return out;
}

/** HTML-Text → { spec, warnings } */
export function htmlToDocSpec(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const warnings = [];
  const content = blocksOf(doc.body, warnings);
  return { spec: { content }, warnings: [...new Set(warnings)] };
}

// ==================== Spec → Editor ====================

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Baustein, der im Editor nicht als Text bearbeitet wird (Doppelklick öffnet ihn). */
export function widgetHtml(block) {
  const preview = renderDocSpecHtml({ content: [block] }, { showSolutions: true, showPageBreaks: true });
  const field = { linien: 'Linien', leer: 'Feld', frei: 'Platz (unsichtbar)' }[block?.pattern];
  const label = { karo: field || 'Karo', solution: 'Lösung', formula: 'Formel', code: 'Code', spacer: 'Platz', pagebreak: 'Seitenumbruch', quiz: 'Quiz' }[block?.type] || block?.type || 'Baustein';
  return `<div class="ds-widget" contenteditable="false" data-block="${encodeURIComponent(JSON.stringify(block))}" title="${esc(label)} – Doppelklick zum Bearbeiten"><span class="ds-widget-label">${esc(label)}</span>${preview}</div>`;
}

/** data-id für die feste ID eines Blocks (ids.js). */
const idAttr = (b) => (isBlockId(b?.id) ? ` data-id="${b.id}"` : '');

/** Absätze eines Textblocks; alle tragen seine ID – so bleibt er beim Rückweg ein Block. */
function paragraphsHtml(text, align, id = '') {
  const style = align && align !== 'left' ? ` style="text-align:${align}"` : '';
  return String(text).split('\n\n').map((p) => `<p${id}${style}>${richText(p.trim()) || '<br>'}</p>`).join('');
}

function listItemsHtml(items, ordered, id = '') {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}${id}>${(items || []).map((it) => (typeof it === 'object' && it
    ? `<li>${richText(it.text ?? '')}${Array.isArray(it.items) ? listItemsHtml(it.items, ordered) : ''}</li>`
    : `<li>${richText(it)}</li>`)).join('')}</${tag}>`;
}

function cellsHtml(tag, row, blocksHtml = () => '') {
  return row.map((c) => {
    if (c && typeof c === 'object') {
      const span = (n, v) => (Number.isInteger(v) && v > 1 ? ` ${n}="${v}"` : '');
      const images = (Array.isArray(c.images) ? c.images : []).map((b) => {
        const px = cssPx(b.width);
        return `<img src="${esc(b.src)}"${px ? ` width="${Math.round(px)}" data-width="${esc(b.width)}"` : ''}${b.alt ? ` alt="${esc(b.alt)}"` : ''}${b.source ? ` data-source="${esc(b.source)}"` : ''}>`;
      }).join('');
      const inner = Array.isArray(c.blocks) ? blocksHtml(c.blocks) : '';
      // Leere Zelle mit <br>: Sonst nimmt sie keine Schreibmarke an (der Klick landete daneben).
      return `<${tag}${span('colspan', c.colspan)}${span('rowspan', c.rowspan)}${c.beside ? ' class="ws-cell-beside"' : ''}>${richText(c.text ?? '')}${images}${inner}${!c.text && !images && !inner ? '<br>' : ''}</${tag}>`;
    }
    return `<${tag}>${richText(c ?? '') || '<br>'}</${tag}>`;
  }).join('');
}

/** Spec → HTML für den visuellen Editor (Rückweg: htmlToDocSpec). */
export function specToEditorHtml(spec) {
  const blocks = (list) => (list || []).map((b) => {
    if (typeof b === 'string' || typeof b === 'number') return paragraphsHtml(b);
    if (!b || typeof b !== 'object') return '';
    switch (b.type || 'text') {
      case 'section':
        return `<h2 data-ds="section"${idAttr(b)}>${richText(b.title ?? b.text ?? '')}</h2>${b.title !== undefined && b.text ? paragraphsHtml(b.text) : ''}${blocks(b.blocks)}`;
      case 'task':
      case 'subtask': {
        const tag = b.type === 'task' ? 'h3' : 'h4';
        return `<${tag} data-ds="${b.type}"${idAttr(b)}>${richText(b.title ?? b.text ?? '')}</${tag}>${b.title !== undefined && b.text ? paragraphsHtml(b.text) : ''}${blocks(b.blocks)}`;
      }
      case 'heading': {
        const level = [1, 2, 3].includes(b.level) ? b.level + 1 : 2;
        return `<h${level} data-ds="heading"${idAttr(b)}>${richText(b.text ?? b.title ?? '')}</h${level}>`;
      }
      case 'text':
        return paragraphsHtml(b.text ?? '', b.align, idAttr(b));
      case 'note':
        return `<p data-ds="note"${idAttr(b)}><em>${richText(b.text ?? '')}</em></p>`;
      case 'list':
        return listItemsHtml(b.items, b.ordered, idAttr(b));
      case 'table': {
        const off = Array.isArray(b.header) ? 1 : 0;
        return `<table${idAttr(b)}${b.border === false ? ' class="ws-table-plain"' : ''}${b.caption ? ` data-caption="${esc(b.caption)}"` : ''}>${tableColgroup(b)}${off ? `<thead><tr${tableRowAttr(b, 0)}>${cellsHtml('th', b.header, blocks)}</tr></thead>` : ''}<tbody>${(b.rows || []).filter(Array.isArray).map((r, i) => `<tr${tableRowAttr(b, i + off)}>${cellsHtml('td', r, blocks)}</tr>`).join('')}</tbody></table>`;
      }
      case 'image': {
        if (typeof b.src !== 'string') return widgetHtml(b);
        const cls = [b.float === 'left' ? 'ws-float-left' : b.float === 'right' ? 'ws-float-right' : b.float === 'center' ? 'ws-img-center' : '', b.border ? 'ws-img-border' : ''].filter(Boolean).join(' ');
        const px = cssPx(b.width);
        return `<p><img${idAttr(b)} src="${esc(b.src)}"${cls ? ` class="${cls}"` : ''}${px ? ` width="${Math.round(px)}" data-width="${esc(b.width)}"` : ''}${b.alt ? ` alt="${esc(b.alt)}"` : ''}${b.caption ? ` data-caption="${esc(b.caption)}"` : ''}${b.source ? ` data-source="${esc(b.source)}"` : ''}></p>`;
      }
      case 'columns': {
        const cols = (b.blocks || []).filter((c) => c && typeof c === 'object');
        const widths = cols.map((c) => c.width || '');
        return `<table class="ws-columns"${idAttr(b)}>${tableColgroup({ widths })}<tbody><tr>${cols.map((c) => `<td${idAttr(c)}>${blocks(c.blocks) || '<p><br></p>'}</td>`).join('')}</tr></tbody></table>`;
      }
      case 'box':
        return `<div class="ws-box"${idAttr(b)}${b.title ? ` data-title="${esc(b.title)}"` : ''}${b.shaded ? ' data-shaded="1"' : ''}>${b.text ? paragraphsHtml(b.text) : ''}${blocks(b.blocks) || '<p><br></p>'}</div>`;
      default:
        return widgetHtml(b);
    }
  }).join('');
  return blocks(spec?.content) || '<p><br></p>';
}
