// Modultyp „Dokument“: Spec prüfen, als HTML anzeigen, Formeln setzen.
//
// Eine Datei für Browser UND Server (der Server von LearningModules lädt sie
// über src/core/browser-module.ts) – deshalb ohne import, ohne DOM, und
// "export" nur vor class/function/const am Zeilenanfang.
//
// Das Format ist das des Generators (worksheet-renderer/SPEC.md in
// LearningModules); daraus
// entstehen auch .odt und .pdf. Die Web-Ansicht folgt seinen Regeln:
// Gliederungsnummern 1. / 1.1 / 1.1.1, gewollte Zeilenumbrüche im Fließtext,
// `n_S` mit tiefgestelltem S, Lösungen zunächst ausgeblendet.

export const DOC_BLOCK_TYPES = ['section', 'task', 'subtask', 'heading', 'text', 'list', 'code', 'image', 'group', 'table',
  'formula', 'note', 'solution', 'box', 'karo', 'spacer', 'pagebreak', 'quiz', 'columns', 'column'];

const HEADING_TYPES = ['section', 'task', 'subtask'];
const WITH_BLOCKS = ['section', 'task', 'subtask', 'solution', 'box', 'columns', 'column'];
const ALIGNS = ['left', 'center', 'right', 'justify'];
// Absätze: Einzug in cm (1–6), Zeilenabstand; Listen: Zeichen bzw. Nummerierung.
export const LINE_HEIGHTS = [1, 1.15, 1.5, 2];
export const LIST_MARKERS = ['dash', 'arrow', 'square', 'check'];
export const LIST_NUMBERINGS = ['a', 'i'];
const indentOk = (v) => typeof v === 'number' && v > 0 && v <= 6;
const spaceOk = (v) => typeof v === 'number' && v >= 0 && v <= 3;
const firstLineOk = (v) => typeof v === 'number' && v >= -3 && v <= 3 && v !== 0;

/** style-Attribut für Einzug, Abstände und Zeilenabstand eines Absatzes bzw. einer Liste. */
export function paraStyle(block) {
  const parts = [];
  if (indentOk(block?.indent)) parts.push(`margin-left:${block.indent}cm`);
  if (firstLineOk(block?.firstLine)) parts.push(`text-indent:${block.firstLine}cm`);
  if (spaceOk(block?.spaceBefore)) parts.push(`margin-top:${block.spaceBefore}cm`);
  if (spaceOk(block?.spaceAfter)) parts.push(`margin-bottom:${block.spaceAfter}cm`);
  if (LINE_HEIGHTS.includes(block?.lineHeight)) parts.push(`line-height:${Math.round(block.lineHeight * 140) / 100}`);
  return parts.join(';');
}
const FLOATS = ['left', 'right', 'center'];
// Bildquellen, die in der App angezeigt werden dürfen. Verweise per `file:`
// gibt es nur im Kurs-Projekt des Generators.
const IMAGE_SRC_RE = /^(data:image\/(png|jpeg|gif|webp|svg\+xml);base64,|https:\/\/|\/api\/)/i;
const CSS_LENGTH_RE = /^\d+(\.\d+)?(cm|mm|px|%)$/;
// Schreibfeld (Block `karo`): Muster und Breite in cm, wie im Renderer.
export const KARO_PATTERNS = ['karo', 'linien', 'leer', 'frei'];
// Satzbreite A4 quer; im Hochformat (16,5 cm) beschränkt der Druck selbst auf die Satzbreite.
export const KARO_MAX_WIDTH_CM = 25.5;
const KARO_WIDTH_RE = /^(\d+(?:\.\d+)?)\s*cm$/;
// Spaltenbreite bzw. Zeilenhöhe einer Tabelle (`widths`, `heights`); leer = automatisch.
const TABLE_LENGTH_RE = /^\d+(\.\d+)?\s*(cm|mm)$/;
const CELL_ALIGNS = ['left', 'center', 'right'];
// Senkrechte Ausrichtung in Zellen (Tabelle oder einzelne Zelle).
export const CELL_VALIGNS = ['top', 'middle', 'bottom'];
// Linien einer Tabelle: Stärke in pt, Art.
export const TABLE_LINE_STYLES = ['solid', 'dashed', 'dotted'];
const lineWidthOk = (v) => typeof v === 'number' && v >= 0.25 && v <= 6;
// Rahmenfarbe der Tabelle und Hintergrund einer Zelle – feste Paletten.
export const LINE_COLORS = { schwarz: '#1f2937', grau: '#9ca3af', blau: '#1d4ed8', gruen: '#15803d', orange: '#c2410c', lila: '#7e22ce' };
export const CELL_BACKGROUNDS = { grau: '#e5e7eb', gelb: '#fef08a', gruen: '#bbf7d0', blau: '#bfdbfe', rosa: '#fbcfe8' };

// Tabelle als Ganzes: Breite (cm), Lage auf der Seite, Abstand oben/unten, Innenabstand der Zellen.
export const TABLE_POSITIONS = ['left', 'center', 'right'];
// Bis zur Satzbreite von A4 quer; im Hochformat druckt der Renderer höchstens die Satzbreite.
const tableWidthOk = (v) => typeof v === 'number' && v >= 2 && v <= 25.5;
const paddingOk = (v) => typeof v === 'number' && v >= 0 && v <= 1;

/**
 * style-Attribut einer Tabelle: Linien (CSS-Variablen; innere Tabellen setzen
 * eigene), Breite, Lage, Abstand oben/unten und Innenabstand der Zellen.
 */
export function tableLineStyle(block) {
  const css = [];
  const w = lineWidthOk(block?.lineWidth) ? block.lineWidth : null;
  const s = TABLE_LINE_STYLES.includes(block?.lineStyle) ? block.lineStyle : null;
  const c = LINE_COLORS[block?.lineColor] || null;
  if (w || s || c) css.push(`--ds-line-w:${w ?? 0.75}pt`, `--ds-line-s:${s ?? 'solid'}`, `--ds-line-c:${c ?? LINE_COLORS.schwarz}`);
  if (tableWidthOk(block?.width)) css.push(`width:${block.width}cm`, 'max-width:100%');
  if (block?.position === 'center') css.push('margin-left:auto', 'margin-right:auto');
  if (block?.position === 'right') css.push('margin-left:auto');
  if (spaceOk(block?.spaceBefore)) css.push(`margin-top:${block.spaceBefore}cm`);
  if (spaceOk(block?.spaceAfter)) css.push(`margin-bottom:${block.spaceAfter}cm`);
  if (paddingOk(block?.padding)) css.push(`--ds-cell-pad:${block.padding}cm`);
  return css.length ? ` style="${css.join(';')}"` : '';
}
const tableLengthOk = (v) => v === null || v === '' || TABLE_LENGTH_RE.test(String(v).trim());

/** Breite eines Schreibfelds in cm (auf 0,5 cm gerundet, 1–25,5), null = Satzbreite. */
export function karoWidthCm(block) {
  const m = KARO_WIDTH_RE.exec(String(block?.width ?? '').trim());
  if (!m) return null;
  const cm = Math.round(Number(m[1]) * 2) / 2;
  return Math.min(KARO_MAX_WIDTH_CM, Math.max(1, cm));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isText(v) {
  return typeof v === 'string' || typeof v === 'number';
}

// ==================== Prüfen ====================

/**
 * Prüft eine Spec. Liefert die Fehler als lesbare Sätze mit Fundstelle
 * („content[2] (task): title fehlt“). Leere Liste = in Ordnung.
 */
export function validateDocSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['Die Spec muss ein Objekt mit content: [ … ] sein.'];
  }
  if (!Array.isArray(spec.content)) return ['content: Die Liste der Blöcke fehlt.'];
  const errors = [];
  checkBlocks(spec.content, 'content', errors, false);
  return errors;
}

function listItemsOk(items, depth) {
  return depth <= 3 && items.every((it) => isText(it)
    || (it && typeof it === 'object' && isText(it.text) && (it.items === undefined || (Array.isArray(it.items) && listItemsOk(it.items, depth + 1)))));
}

/** Bild in einer Tabellenzelle: { src, width?, alt?, source? } (wie ein Bild-Baustein, ohne Lage). */
function cellImageOk(i) {
  return !!i && typeof i === 'object' && isText(i.src) && IMAGE_SRC_RE.test(String(i.src))
    && (i.width === undefined || CSS_LENGTH_RE.test(String(i.width)));
}

/**
 * Zeichenrahmen (`group`, früher „Bildgruppe“): Bilder und Textfenster an fester
 * Stelle zueinander (wie eine Gruppe in Draw). `items`: Bilder { src, alt?, source? }
 * und Textfenster { text, size? (pt), align?, border?, fill?, color? } – jeweils mit x, y, w, h
 * in Prozent des Rahmens (x, w der Breite; y, h der Höhe); `ratio`: Höhe ÷ Breite.
 * Am Rahmen: `align` (ohne: wie der Text der Vorlage), `border`, `caption`.
 */
export const GROUP_MAX_ITEMS = 60;
export const FRAME_FILLS = { weiss: '#ffffff', grau: '#e5e7eb', gelb: '#fef08a', gruen: '#bbf7d0', blau: '#bfdbfe', rosa: '#fbcfe8' };
export const BLOCK_ALIGNS = ['left', 'center', 'right'];
/** Schriftfarben eines Textfensters (ohne: schwarz) – weiß für Beschriftungen auf dunklen Fotos. */
export const FRAME_TEXT_COLORS = { weiss: '#ffffff', blau: '#1d4ed8', gruen: '#15803d', orange: '#c2410c', lila: '#7e22ce', grau: '#6b7280' };
const pct = (v, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= 100;
const placed = (it) => pct(it.x) && pct(it.y) && pct(it.w, 0.5) && pct(it.h, 0.5) && it.x + it.w <= 100.5 && it.y + it.h <= 100.5;
export const isTextItem = (it) => !!it && typeof it === 'object' && typeof it.text === 'string';
export function groupItemOk(it) {
  if (!it || typeof it !== 'object' || !placed(it)) return false;
  if (isTextItem(it)) {
    return (it.size === undefined || (typeof it.size === 'number' && it.size >= 4 && it.size <= 72))
      && (it.align === undefined || BLOCK_ALIGNS.includes(it.align))
      && (it.border === undefined || typeof it.border === 'boolean')
      && (it.fill === undefined || !!FRAME_FILLS[it.fill])
      && (it.color === undefined || !!FRAME_TEXT_COLORS[it.color]);
  }
  return isText(it.src) && IMAGE_SRC_RE.test(String(it.src));
}
export const groupRatioOk = (r) => typeof r === 'number' && Number.isFinite(r) && r >= 0.05 && r <= 20;

function cellOk(c) {
  if (isText(c)) return true;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const span = (v) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= 20);
  const images = c.images === undefined || (Array.isArray(c.images) && c.images.every(cellImageOk));
  return (c.text === undefined || isText(c.text)) && span(c.colspan) && span(c.rowspan) && images
    && (c.beside === undefined || typeof c.beside === 'boolean')
    && (c.align === undefined || CELL_ALIGNS.includes(c.align))
    && (c.background === undefined || !!CELL_BACKGROUNDS[c.background])
    && (c.valign === undefined || CELL_VALIGNS.includes(c.valign))
    && (c.blocks === undefined || Array.isArray(c.blocks));
}

function checkBlocks(blocks, path, errors, inSolution, parent = '') {
  blocks.forEach((block, i) => checkBlock(block, `${path}[${i}]`, errors, inSolution, parent));
}

function checkBlock(block, path, errors, inSolution, parent = '') {
  if (isText(block)) return; // Ein einfacher Text ist ein Textblock.
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    errors.push(`${path}: Block muss ein Objekt mit type sein.`);
    return;
  }
  const type = block.type || 'text';
  const at = `${path} (${type})`;
  const need = (ok, msg) => { if (!ok) errors.push(`${at}: ${msg}`); };
  if (!DOC_BLOCK_TYPES.includes(type)) {
    errors.push(`${path}: Unbekannter Blocktyp „${type}“ – erlaubt: ${DOC_BLOCK_TYPES.join(', ')}.`);
    return;
  }
  switch (type) {
    case 'section':
      need(isText(block.title) || isText(block.text), 'text (Überschrift) fehlt.');
      break;
    case 'task':
    case 'subtask':
      need(isText(block.title) || isText(block.text), 'title fehlt.');
      break;
    case 'heading':
      need(isText(block.text) || isText(block.title), 'text (Überschrift) fehlt.');
      if (block.level !== undefined) need([1, 2, 3].includes(block.level), 'level: 1, 2 oder 3.');
      break;
    case 'text':
      need(isText(block.text), 'text fehlt.');
      if (block.align !== undefined) need(ALIGNS.includes(block.align), `align: ${ALIGNS.join(', ')}.`);
      if (block.indent !== undefined) need(indentOk(block.indent), 'indent: Einzug links in cm, bis 6.');
      if (block.firstLine !== undefined) need(firstLineOk(block.firstLine), 'firstLine: Einzug der ersten Zeile in cm, −3 bis 3 (negativ = hängend).');
      if (block.spaceBefore !== undefined) need(spaceOk(block.spaceBefore), 'spaceBefore: Abstand vor dem Absatz in cm, 0 bis 3.');
      if (block.spaceAfter !== undefined) need(spaceOk(block.spaceAfter), 'spaceAfter: Abstand nach dem Absatz in cm, 0 bis 3.');
      if (block.lineHeight !== undefined) need(LINE_HEIGHTS.includes(block.lineHeight), `lineHeight: ${LINE_HEIGHTS.join(', ')}.`);
      break;
    case 'note':
      need(isText(block.text), 'text fehlt.');
      break;
    case 'list':
      need(Array.isArray(block.items) && block.items.length > 0, 'items: Liste mit mindestens einem Punkt fehlt.');
      if (Array.isArray(block.items)) need(listItemsOk(block.items, 1), 'items: Jeder Punkt ist ein Text oder { text, items } (höchstens 3 Ebenen).');
      if (block.marker !== undefined) need(LIST_MARKERS.includes(block.marker), `marker: ${LIST_MARKERS.join(', ')} (check = Checkliste ☐).`);
      if (block.numbering !== undefined) need(LIST_NUMBERINGS.includes(block.numbering), `numbering: ${LIST_NUMBERINGS.join(', ')} (a = a), b) …, i = i., ii. …).`);
      if (block.lineHeight !== undefined) need(LINE_HEIGHTS.includes(block.lineHeight), `lineHeight: ${LINE_HEIGHTS.join(', ')}.`);
      if (block.spaceBefore !== undefined) need(spaceOk(block.spaceBefore), 'spaceBefore: Abstand vor der Liste in cm, 0 bis 3.');
      if (block.spaceAfter !== undefined) need(spaceOk(block.spaceAfter), 'spaceAfter: Abstand nach der Liste in cm, 0 bis 3.');
      break;
    case 'box':
      need(Array.isArray(block.blocks) || isText(block.text), 'blocks oder text fehlt.');
      break;
    case 'columns':
      // Nebeneinander: 2–4 Spalten (type: column), je mit eigenen Bausteinen.
      need(Array.isArray(block.blocks) && block.blocks.length >= 2 && block.blocks.length <= 4
        && block.blocks.every((c) => c && typeof c === 'object' && c.type === 'column'), 'blocks: 2 bis 4 Spalten {type: column, blocks: [...]}.');
      need(!inSolution, 'Spalten in einer Lösung sind nicht möglich.');
      break;
    case 'column':
      need(parent === 'columns', 'Eine Spalte steht nur in „columns“.');
      need(Array.isArray(block.blocks), 'blocks: Liste der Bausteine der Spalte fehlt.');
      if (block.width !== undefined) need(tableLengthOk(block.width), 'width: Breite in cm, z. B. "9cm" (leer = automatisch).');
      break;
    case 'code':
      need(isText(block.code) || isText(block.file), 'code fehlt.');
      break;
    case 'image':
      need(isText(block.src) || isText(block.file), 'src (Bild) fehlt.');
      if (isText(block.src)) need(IMAGE_SRC_RE.test(String(block.src)), 'src: nur Bilder als data:image/… oder https://.');
      if (block.width !== undefined) need(CSS_LENGTH_RE.test(String(block.width)), 'width: z. B. 9cm.');
      if (block.float !== undefined) need(FLOATS.includes(block.float), `float: ${FLOATS.join(', ')}.`);
      if (block.align !== undefined) need(BLOCK_ALIGNS.includes(block.align), `align: ${BLOCK_ALIGNS.join(', ')} (eigene Zeile).`);
      break;
    case 'group':
      need(Array.isArray(block.items) && block.items.length > 0 && block.items.length <= GROUP_MAX_ITEMS,
        `items: Liste der Bilder (1 bis ${GROUP_MAX_ITEMS}) fehlt.`);
      if (Array.isArray(block.items)) {
        block.items.forEach((it, i) => need(groupItemOk(it),
          `items[${i}]: Bild { src: data:image/… oder https:// } oder Textfenster { text, size (4–72 pt), align, border, fill: ${Object.keys(FRAME_FILLS).join('/')}, color: ${Object.keys(FRAME_TEXT_COLORS).join('/')} } – mit x, y, w, h in Prozent des Rahmens (0–100).`));
      }
      need(groupRatioOk(block.ratio), 'ratio: Höhe ÷ Breite des Rahmens, z. B. 0.6.');
      if (block.width !== undefined) need(CSS_LENGTH_RE.test(String(block.width)), 'width: z. B. 16.5cm.');
      if (block.align !== undefined) need(BLOCK_ALIGNS.includes(block.align), `align: ${BLOCK_ALIGNS.join(', ')}.`);
      if (block.border !== undefined) need(typeof block.border === 'boolean', 'border: true oder false.');
      break;
    case 'table':
      need(Array.isArray(block.rows) && block.rows.length > 0, 'rows: Liste der Zeilen fehlt.');
      if (Array.isArray(block.rows)) need(block.rows.every((r) => Array.isArray(r)), 'rows: Jede Zeile muss eine Liste sein, z. B. ["a", "b"].');
      if (block.header !== undefined) need(Array.isArray(block.header), 'header muss eine Liste sein.');
      if (block.widths !== undefined) need(Array.isArray(block.widths) && block.widths.length <= 40 && block.widths.every(tableLengthOk), 'widths: Liste der Spaltenbreiten, z. B. ["4cm", "", "3cm"] (leer = automatisch).');
      if (block.heights !== undefined) need(Array.isArray(block.heights) && block.heights.length <= 200 && block.heights.every(tableLengthOk), 'heights: Liste der Mindesthöhen je Zeile (Kopfzeile zuerst), z. B. ["", "2cm"].');
      if (block.lineWidth !== undefined) need(lineWidthOk(block.lineWidth), 'lineWidth: Liniendicke in pt von 0.25 bis 6, z. B. 1.5.');
      if (block.lineStyle !== undefined) need(TABLE_LINE_STYLES.includes(block.lineStyle), `lineStyle: ${TABLE_LINE_STYLES.join(', ')}.`);
      if (block.lineColor !== undefined) need(!!LINE_COLORS[block.lineColor], `lineColor: ${Object.keys(LINE_COLORS).join(', ')}.`);
      if (block.width !== undefined) need(tableWidthOk(block.width), 'width: Breite der Tabelle in cm, 2 bis 25.5.');
      if (block.position !== undefined) need(TABLE_POSITIONS.includes(block.position), `position: ${TABLE_POSITIONS.join(', ')} (Lage auf der Seite).`);
      if (block.spaceBefore !== undefined) need(spaceOk(block.spaceBefore), 'spaceBefore: Abstand über der Tabelle in cm, 0 bis 3.');
      if (block.spaceAfter !== undefined) need(spaceOk(block.spaceAfter), 'spaceAfter: Abstand unter der Tabelle in cm, 0 bis 3.');
      if (block.padding !== undefined) need(paddingOk(block.padding), 'padding: Innenabstand der Zellen in cm, 0 bis 1.');
      if (block.align !== undefined) need(CELL_ALIGNS.includes(block.align), `align: ${CELL_ALIGNS.join(', ')} (Ausrichtung aller Zellen).`);
      if (block.valign !== undefined) need(CELL_VALIGNS.includes(block.valign), `valign: ${CELL_VALIGNS.join(', ')} (senkrechte Ausrichtung aller Zellen).`);
      if (block.border !== undefined) need(typeof block.border === 'boolean', 'border: true oder false (false = ohne Linien, z. B. Abbildungen nebeneinander).');
      for (const row of [...(Array.isArray(block.header) ? [block.header] : []), ...(Array.isArray(block.rows) ? block.rows : [])]) {
        if (Array.isArray(row) && !row.every(cellOk)) {
          errors.push(`${at}: Zelle ist ein Text oder { text, colspan, rowspan } mit Zahlen von 1 bis 20.`);
          break;
        }
      }
      // Bausteine in Zellen (z. B. eine Tabelle in der Tabelle) – geprüft wie sonst auch.
      (block.rows || []).forEach((row, r) => (Array.isArray(row) ? row : []).forEach((c, k) => {
        if (c && typeof c === 'object' && Array.isArray(c.blocks)) checkBlocks(c.blocks, `${path}.rows[${r}][${k}].blocks`, errors, inSolution, 'cell');
      }));
      break;
    case 'formula':
      need(isText(block.math) && String(block.math).trim() !== '', 'math (Formel) fehlt.');
      if (isText(block.math)) {
        try { starmathToMathml(String(block.math)); } catch (e) { errors.push(`${at}: Formel – ${e.message}`); }
      }
      break;
    case 'solution':
      need(!inSolution, 'Lösung in einer Lösung ist nicht möglich.');
      need(Array.isArray(block.blocks) || isText(block.text), 'blocks oder text fehlt.');
      break;
    case 'quiz':
      // Ein Modul aus demselben Lernthema: im Durchlauf direkt im Blatt, im Druck QR-Code und Adresse.
      need(isText(block.module) && String(block.module).trim() !== '', 'module (Modul des Lernthemas) fehlt.');
      need(!inSolution, 'Ein Quiz in einer Lösung ist nicht möglich.');
      if (block.title !== undefined) need(isText(block.title), 'title muss ein Text sein.');
      if (block.scale !== undefined) need(typeof block.scale === 'number' && block.scale >= 0.5 && block.scale <= 1.5, 'scale: Größe von 0.5 bis 1.5, z. B. 0.8 für 80 %.');
      break;
    case 'karo':
      if (block.width !== undefined) need(KARO_WIDTH_RE.test(String(block.width).trim()), 'width: Breite in cm, z. B. "8cm".');
      if (block.pattern !== undefined) need(KARO_PATTERNS.includes(block.pattern), `pattern: ${KARO_PATTERNS.join(', ')}.`);
    // fall through
    case 'spacer':
      if (block.lines !== undefined) {
        need(Number.isInteger(block.lines) && block.lines >= 1 && block.lines <= 60, 'lines: ganze Zahl von 1 bis 60.');
      }
      break;
    default:
      break;
  }
  if (block.blocks !== undefined) {
    if (!WITH_BLOCKS.includes(type)) errors.push(`${at}: blocks gibt es nur bei ${WITH_BLOCKS.join(', ')}.`);
    else if (!Array.isArray(block.blocks)) errors.push(`${at}: blocks muss eine Liste sein.`);
    else checkBlocks(block.blocks, `${path}.blocks`, errors, inSolution || type === 'solution', type);
  }
}

// ==================== Fließtext ====================

// Wie im Generator (make_worksheet.py): Ein einfacher Umbruch der Quelle ist
// meist nur Satzspiegel – außer bei Aufzählungen, Rechenzeilen, Lücken und
// kurzen Zeilen.
const HARD_BREAK_BELOW = 70;
const LIST_START_RE = /^\s*(?:\(?[a-z]\)|\d+[.)]|[–•-])\s/;
const GAP_RE = /\S {2,}\S/;
const ASSIGN_START_RE = /^\s*[^\s=:]+(?: \([^)]*\))? ?:?= /;
// `n_S`, `P_{Schlupf}` → tiefgestellt; Bezeichner wie `to_line` bleiben.
const SUBSCRIPT_RE = /(?<![0-9A-Za-zÄÖÜäöüß_\\])([A-Za-zΑ-Ωα-ω])_(?:\{([^}]{1,24})\}|([A-Za-z0-9ÄÖÜäöü]{1,8}))/g;

/** Zeilen, die einzeln stehen sollen (text_lines im Generator). */
export function textLines(text) {
  const lines = String(text).split('\n');
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    // Ein Backslash am Zeilenende erzwingt den Umbruch (und verschwindet).
    if (prev.trimEnd().endsWith('\\')) {
      out[out.length - 1] = out[out.length - 1].trimEnd().slice(0, -1).trimEnd();
      out.push(line);
      continue;
    }
    const hard = LIST_START_RE.test(line)
      || (ASSIGN_START_RE.test(prev) && ASSIGN_START_RE.test(line))
      || (prev.trimEnd().endsWith(':') && line.startsWith(' '))
      || GAP_RE.test(prev) || GAP_RE.test(line)
      || prev.trimEnd().length < HARD_BREAK_BELOW;
    if (hard) out.push(line);
    else out[out.length - 1] = `${out[out.length - 1].trimEnd()} ${line.trimStart()}`;
  }
  return out;
}

// Auszeichnung wie im Generator (INLINE_RE in make_worksheet.py): **fett**,
// *kursiv*, ++unterstrichen++, ~~durchgestrichen~~, `code`, ^{hoch}, _{tief},
// [Text](https://…). Die Zeichen wirken nur am Wortrand – „8*7“ bleibt eine
// Rechnung. Ein Backslash davor schreibt das Zeichen selbst.
/**
 * Farben im Text: `[Text]{blau}` (Schrift), `[Text]{hl-gelb}` (Hervorhebung),
 * beides: `[Text]{blau,hl-gelb}`. Kein Rot – rote Schrift heißt „Lösung“.
 */
export const TEXT_COLORS = { blau: '#1d4ed8', gruen: '#15803d', orange: '#c2410c', lila: '#7e22ce', grau: '#6b7280' };
export const HIGHLIGHTS = { gelb: '#fef08a', gruen: '#bbf7d0', blau: '#bfdbfe', rosa: '#fbcfe8' };

/** `blau,hl-gelb` → { color, hl } (nur bekannte Namen). */
export function parseColorSpec(spec) {
  const out = {};
  for (const part of String(spec || '').split(',')) {
    if (part.startsWith('hl-') && HIGHLIGHTS[part.slice(3)]) out.hl = part.slice(3);
    else if (TEXT_COLORS[part]) out.color = part;
  }
  return out;
}

const INLINE_RE = new RegExp([
  '\\\\(?<esc>[\\\\*`\\[\\]^~+{}])',
  '`(?<code>[^`\\n]+)`',
  '(?<![\\w*])\\*\\*\\*(?<bi>\\S(?:.*?\\S)?)\\*\\*\\*(?![\\w*])',
  '(?<![\\w*])\\*\\*(?<b>\\S(?:.*?\\S)?)\\*\\*(?![\\w*])',
  '(?<![\\w*])\\*(?<i>[^\\s*](?:.*?[^\\s*])?)\\*(?![\\w*])',
  '(?<![\\w+])\\+\\+(?<u>\\S(?:.*?\\S)?)\\+\\+(?![\\w+])',
  '(?<![\\w~])~~(?<s>\\S(?:.*?\\S)?)~~(?![\\w~])',
  '\\^\\{(?<sup>[^}]{1,40})\\}',
  '_\\{(?<sub>[^}]{1,24})\\}',
  '\\[(?<atext>[^\\]\\n]+)\\]\\((?<href>(?:https?://|mailto:)[^)\\s]+)\\)',
  '\\[(?<ctext>[^\\]\\n]+)\\]\\{(?<color>[a-z-]+(?:,[a-z-]+)?)\\}',
].join('|'), 'g');

/** Unbeschriebener Text: `n_S`-Indizes wie bisher. */
function plainText(text) {
  let html = '';
  let pos = 0;
  for (const m of text.matchAll(SUBSCRIPT_RE)) {
    html += esc((text.slice(pos, m.index) + m[1]).replace(/\\_/g, '_'));
    html += `<sub>${esc(m[2] || m[3])}</sub>`;
    pos = m.index + m[0].length;
  }
  return html + esc(text.slice(pos).replace(/\\_/g, '_'));
}

/** Eine Zeile mit Auszeichnung → HTML. */
export function inlineHtml(line) {
  let html = '';
  let buf = '';
  let pos = 0;
  const flush = () => { html += plainText(buf); buf = ''; };
  for (const m of String(line).matchAll(new RegExp(INLINE_RE.source, 'g'))) {
    buf += line.slice(pos, m.index);
    pos = m.index + m[0].length;
    const g = m.groups;
    if (g.esc !== undefined) { buf += g.esc; continue; }
    flush();
    if (g.code !== undefined) html += `<code>${esc(g.code)}</code>`;
    else if (g.bi !== undefined) html += `<strong><em>${inlineHtml(g.bi)}</em></strong>`;
    else if (g.b !== undefined) html += `<strong>${inlineHtml(g.b)}</strong>`;
    else if (g.i !== undefined) html += `<em>${inlineHtml(g.i)}</em>`;
    else if (g.u !== undefined) html += `<u>${inlineHtml(g.u)}</u>`;
    else if (g.s !== undefined) html += `<s>${inlineHtml(g.s)}</s>`;
    else if (g.sup !== undefined) html += `<sup>${esc(g.sup)}</sup>`;
    else if (g.sub !== undefined) html += `<sub>${esc(g.sub)}</sub>`;
    else if (g.href !== undefined) html += `<a href="${esc(g.href)}" target="_blank" rel="noopener noreferrer">${inlineHtml(g.atext)}</a>`;
    else if (g.color !== undefined) {
      const { color, hl } = parseColorSpec(g.color);
      const style = [color ? `color:${TEXT_COLORS[color]}` : '', hl ? `background:${HIGHLIGHTS[hl]}` : ''].filter(Boolean).join(';');
      html += style
        ? `<span class="ds-color"${color ? ` data-color="${color}"` : ''}${hl ? ` data-hl="${hl}"` : ''} style="${style}">${inlineHtml(g.ctext)}</span>`
        : plainText(m[0]); // unbekannte Farbe: wörtlich
    }
  }
  buf += String(line).slice(pos);
  flush();
  return html;
}

/** Text → HTML: gewollte Umbrüche als <br>, Auszeichnung und Indizes. */
export function richText(text) {
  return textLines(text).map(inlineHtml).join('<br>');
}

// ==================== Verweise auf andere Blätter ====================

// {{blatt:06_verzweigungen}} → „1.6“, {{blatt:a..b}} → „2.1–2.6“,
// {{titel:06_verzweigungen}} → „Verzweigungen“. Die Nummern kommen vom
// Server (src/worksheets/numbering.ts) und ändern sich beim Umsortieren.
const SLUG = '[A-Za-z0-9_\\-ÄÖÜäöüß]+';
const REF_RE = new RegExp(`\\{\\{\\s*(blatt|titel)\\s*:\\s*(${SLUG})(?:\\s*\\.\\.\\s*(${SLUG}))?\\s*\\}\\}`, 'g');
// Felder, in denen {{…}} wörtlich gemeint ist.
const NO_REF_KEYS = ['code', 'math', 'src', 'file'];

/**
 * Verweise in einem Text auflösen. refs = { slug: { pfad, titel } }; ohne
 * refs (keine Nummern bekannt) bleibt ein lesbarer Platzhalter stehen.
 */
export function resolveRefText(text, refs) {
  return String(text).replace(REF_RE, (m, kind, a, b) => {
    if (!refs) return kind === 'titel' ? a : `[${b ? `${a}–${b}` : a}]`;
    const ra = refs[a];
    const rb = b ? refs[b] : null;
    if (!ra || (b && !rb)) return `⚠ Blatt fehlt: ${!ra ? a : b}`;
    if (kind === 'titel') return ra.titel;
    const num = (r) => r.pfad || r.titel;
    return b ? `${num(ra)}–${num(rb)}` : num(ra);
  });
}

/** Alle Verweise einer Spec auflösen (liefert eine Kopie). */
export function resolveDocRefs(value, refs, key = '') {
  if (typeof value === 'string') return NO_REF_KEYS.includes(key) ? value : resolveRefText(value, refs);
  if (Array.isArray(value)) return value.map((v) => resolveDocRefs(v, refs, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDocRefs(v, refs, k);
    return out;
  }
  return value;
}

/** Slugs, auf die eine Spec verweist – für den Hinweis „Blatt fehlt“. */
export function docRefSlugs(value, key = '', out = []) {
  if (typeof value === 'string' && !NO_REF_KEYS.includes(key)) {
    for (const m of value.matchAll(REF_RE)) out.push(m[2], ...(m[3] ? [m[3]] : []));
  } else if (Array.isArray(value)) value.forEach((v) => docRefSlugs(v, key, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) docRefSlugs(v, k, out);
  return [...new Set(out)];
}

// ==================== Formeln (StarMath → MathML) ====================

export class StarMathError extends Error {}

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};
const RELATIONS = { '=': '=', '<>': '≠', '<': '<', '>': '>', '<=': '≤', '>=': '≥', '->': '→',
  approx: '≈', ne: '≠', le: '≤', ge: '≥', leslant: '⩽', geslant: '⩾', sim: '∼', simeq: '≃',
  equiv: '≡', prop: '∝', toward: '→', def: '≝' };
const PRODUCTS = { cdot: '·', times: '×', div: '÷', '/': '/', '*': '∗' };
const SUMS = { '+': '+', '-': '−', '+-': '±', '-+': '∓', plusminus: '±', minusplus: '∓' };
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'min', 'max']);
const SYMBOLS = { infinity: '∞', infty: '∞', partial: '∂', nabla: '∇', dlarrow: '⇐', drarrow: '⇒',
  dlrarrow: '⇔', degree: '°', dotsaxis: '⋯', dotslow: '…', percent: '%' };
const BRACKETS = { '(': '(', ')': ')', '[': '[', ']': ']', lbrace: '{', rbrace: '}', langle: '⟨',
  rangle: '⟩', lline: '|', rline: '|', ldline: '‖', rdline: '‖', lfloor: '⌊', rfloor: '⌋',
  lceil: '⌈', rceil: '⌉', none: '' };
const STOP = new Set(['}', ')', ']', 'right']);
const COLOR_RE = /^(black|blue|green|red|cyan|magenta|yellow|gray|grey|white|lime|maroon|navy|olive|purple|silver|teal|orange)$/;

function tokenize(src) {
  const tokens = [];
  const re = /\s+|"([^"]*)"|%([A-Za-z]+)|(\d+(?:[.,]\d+)?)|([A-Za-zÄÖÜäöüß][A-Za-z0-9ÄÖÜäöüß]*)|(<=|>=|<>|->|\+-|-\+|[{}()[\]^_~`=<>+\-*/,;:!'|.])/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new StarMathError(`unbekanntes Zeichen „${src[pos]}“ an Stelle ${pos + 1}`);
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ kind: 'text', value: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: 'greek', value: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: 'num', value: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: 'id', value: m[4] });
    else if (m[5] !== undefined) tokens.push({ kind: 'op', value: m[5] });
  }
  return tokens;
}

class StarMathParser {
  constructor(src) {
    this.tokens = tokenize(src);
    this.i = 0;
  }

  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  is(value) { const t = this.peek(); return !!t && (t.kind === 'op' || t.kind === 'id') && t.value === value; }

  expect(value) {
    if (!this.is(value)) throw new StarMathError(`„${value}“ erwartet${this.peek() ? `, gefunden „${this.peek().value}“` : ' am Ende'}`);
    this.next();
  }

  atStop() {
    const t = this.peek();
    return !t || ((t.kind === 'op' || t.kind === 'id') && STOP.has(t.value));
  }

  parse() {
    const out = this.expression();
    if (this.peek()) throw new StarMathError(`„${this.peek().value}“ ohne passende öffnende Klammer`);
    return out;
  }

  /** Relationen: a = b approx c */
  expression() {
    let out = this.sum();
    for (;;) {
      const t = this.peek();
      if (t && (t.kind === 'op' || t.kind === 'id') && Object.prototype.hasOwnProperty.call(RELATIONS, t.value)) {
        this.next();
        out += `<mo>${RELATIONS[t.value]}</mo>` + this.sum();
      } else return out;
    }
  }

  sum() {
    let out = '';
    const sign = this.peek();
    if (sign && sign.kind === 'op' && SUMS[sign.value]) { this.next(); out += `<mo form="prefix">${SUMS[sign.value]}</mo>`; }
    if (this.atStop()) return out;
    out += this.product();
    for (;;) {
      const t = this.peek();
      if (t && (t.kind === 'op' || t.kind === 'id') && SUMS[t.value]) {
        this.next();
        out += `<mo>${SUMS[t.value]}</mo>` + this.product();
      } else return out;
    }
  }

  /** Produkt, Bruch (`over`) und Nebeneinanderstellen (`2 x`, `"Text" ~ x`). */
  product() {
    let out = this.power();
    for (;;) {
      const t = this.peek();
      if (!t || this.atStop()) return out;
      if (t.kind === 'id' && t.value === 'over') {
        this.next();
        out = `<mfrac><mrow>${out}</mrow><mrow>${this.power()}</mrow></mfrac>`;
      } else if ((t.kind === 'op' || t.kind === 'id') && PRODUCTS[t.value]) {
        this.next();
        out += `<mo>${PRODUCTS[t.value]}</mo>` + this.power();
      } else if (this.startsTerm(t)) {
        out += this.power();
      } else return out;
    }
  }

  startsTerm(t) {
    if (t.kind !== 'op' && t.kind !== 'id') return true;
    if (t.kind === 'id') {
      return !['over', 'sub', 'sup', 'right'].includes(t.value)
        && !Object.prototype.hasOwnProperty.call(RELATIONS, t.value)
        && !PRODUCTS[t.value] && !SUMS[t.value];
    }
    return ['{', '(', '[', '~', '`', ',', ';', ':', '!', "'", '|', '.'].includes(t.value);
  }

  /** Hoch- und Tiefstellung: X_C^2 */
  power() {
    const base = this.term();
    let sub = null;
    let sup = null;
    for (;;) {
      if (this.is('_') || this.is('sub')) { this.next(); sub = this.term(); }
      else if (this.is('^') || this.is('sup')) { this.next(); sup = this.term(); }
      else break;
    }
    if (sub !== null && sup !== null) return `<msubsup><mrow>${base}</mrow><mrow>${sub}</mrow><mrow>${sup}</mrow></msubsup>`;
    if (sub !== null) return `<msub><mrow>${base}</mrow><mrow>${sub}</mrow></msub>`;
    if (sup !== null) return `<msup><mrow>${base}</mrow><mrow>${sup}</mrow></msup>`;
    return base;
  }

  group(close) {
    const inner = this.expression();
    this.expect(close);
    return inner;
  }

  bracket() {
    const t = this.next();
    if (!t || !Object.prototype.hasOwnProperty.call(BRACKETS, t.value)) {
      throw new StarMathError(`Klammer nach left/right erwartet${t ? `, gefunden „${t.value}“` : ''}`);
    }
    return BRACKETS[t.value];
  }

  term() {
    const t = this.next();
    if (!t) throw new StarMathError('Formel endet unerwartet');
    if (t.kind === 'num') return `<mn>${esc(t.value)}</mn>`;
    if (t.kind === 'text') return `<mtext>${esc(t.value)}</mtext>`;
    if (t.kind === 'greek') {
      // %pi steil, %ipi kursiv (wie im Formeleditor); %iota ist ein Buchstabe.
      let name = t.value;
      const italic = !GREEK[name.toLowerCase()] && name[0] === 'i' && !!GREEK[name.slice(1).toLowerCase()];
      if (italic) name = name.slice(1);
      const lower = name.toLowerCase();
      if (!GREEK[lower]) throw new StarMathError(`unbekanntes Symbol %${t.value}`);
      const ch = name[0] === name[0].toUpperCase() ? GREEK[lower].toUpperCase() : GREEK[lower];
      return italic ? `<mi>${ch}</mi>` : `<mi mathvariant="normal">${ch}</mi>`;
    }
    if (t.kind === 'op') {
      switch (t.value) {
        case '{': return `<mrow>${this.group('}')}</mrow>`;
        case '(': return `<mrow><mo>(</mo>${this.group(')')}<mo>)</mo></mrow>`;
        case '[': return `<mrow><mo>[</mo>${this.group(']')}<mo>]</mo></mrow>`;
        case '~': return '<mspace width="0.5em"></mspace>';
        case '`': return '<mspace width="0.17em"></mspace>';
        default:
          if (STOP.has(t.value) || t.value === '^' || t.value === '_') throw new StarMathError(`„${t.value}“ an unerwarteter Stelle`);
          return `<mo>${esc(t.value)}</mo>`;
      }
    }
    // Wörter
    switch (t.value) {
      case 'sqrt': return `<msqrt>${this.power()}</msqrt>`;
      case 'nroot': {
        const n = this.term();
        return `<mroot><mrow>${this.power()}</mrow><mrow>${n}</mrow></mroot>`;
      }
      case 'abs': return `<mrow><mo>|</mo>${this.power()}<mo>|</mo></mrow>`;
      case 'left': {
        const open = this.bracket();
        const inner = this.expression();
        this.expect('right');
        const close = this.bracket();
        return `<mrow><mo stretchy="true">${esc(open)}</mo>${inner}<mo stretchy="true">${esc(close)}</mo></mrow>`;
      }
      case 'func': {
        const name = this.next();
        if (!name || name.kind !== 'id') throw new StarMathError('Name nach func erwartet');
        return `<mi mathvariant="normal">${esc(name.value)}</mi>`;
      }
      case 'color': {
        const c = this.next();
        if (!c || !COLOR_RE.test(c.value)) throw new StarMathError('Farbe nach color erwartet');
        return `<mstyle mathcolor="${c.value}">${this.power()}</mstyle>`;
      }
      case 'bold': return `<mstyle mathvariant="bold">${this.power()}</mstyle>`;
      case 'ital': case 'nitalic': case 'nbold': case 'italic': return this.power();
      default: break;
    }
    if (FUNCTIONS.has(t.value)) return `<mi>${t.value}</mi>`;
    if (SYMBOLS[t.value]) return `<mi mathvariant="normal">${SYMBOLS[t.value]}</mi>`;
    if (['over', 'sub', 'sup', 'right'].includes(t.value)) throw new StarMathError(`„${t.value}“ an unerwarteter Stelle`);
    // Variablen kursiv wie im Formeleditor – auch mehrbuchstabige.
    return t.value.length === 1 ? `<mi>${esc(t.value)}</mi>` : `<mi style="font-style:italic">${esc(t.value)}</mi>`;
  }
}

/** StarMath (Formeleditor von LibreOffice) → MathML. Wirft StarMathError. */
export function starmathToMathml(src) {
  const body = new StarMathParser(String(src)).parse();
  return `<math display="block"><mrow>${body}</mrow></math>`;
}

// ==================== HTML ====================

/**
 * Spec → HTML für die Anzeige in der App. Lösungen stehen im HTML, sind aber
 * ausgeblendet, solange der Container die Klasse `ds-hide-solutions` trägt
 * (options.showSolutions = true lässt sie weg).
 * options.showPageBreaks zeigt Seitenumbrüche als Linie (Editor-Vorschau),
 * options.refs löst Verweise auf andere Blätter auf (resolveRefText).
 */
export function renderDocSpecHtml(spec, options = {}) {
  spec = resolveDocRefs(spec, options.refs || null);
  const ctx = { counters: [0, 0, 0], options, path: [] };
  const body = Array.isArray(spec?.content) ? renderBlocksHtml(spec.content, ctx) : '';
  return `<div class="docspec${options.showSolutions ? '' : ' ds-hide-solutions'}">${body}</div>`;
}

// `first`: Index des ersten Bausteins in der übergeordneten Liste (für den Pfad).
function renderBlocksHtml(blocks, ctx, first = 0) {
  const list = blocks || [];
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    // Bild mit float: left/right und die folgenden Texte stehen nebeneinander (wie im Druck).
    if (b && typeof b === 'object' && b.type === 'image' && (b.float === 'left' || b.float === 'right')) {
      const start = i;
      const texts = [];
      while (i + 1 < list.length && (isText(list[i + 1]) || (list[i + 1] && ['text', 'list', 'note'].includes(list[i + 1].type || 'text')))) texts.push(list[++i]);
      if (texts.length) {
        html += `<div class="ds-float ds-float-${b.float}">${blockHtml({ ...b, float: undefined }, ctx, first + start)}<div class="ds-float-text">${renderBlocksHtml(texts, ctx, first + start + 1)}</div></div>`;
        continue;
      }
    }
    html += blockHtml(b, ctx, first + i);
  }
  return html;
}

/**
 * Ein Baustein; mit `options.blockIds` in einer Hülle mit seiner ID
 * (data-bid) – daran hängt der Stift-Editor seine Striche. Ohne feste `id`
 * zählt der Pfad („p:2.0“ = content[2].blocks[0]).
 */
function blockHtml(block, ctx, index) {
  ctx.path.push(index);
  const html = renderBlockHtml(block, ctx);
  const path = ctx.path.join('.');
  ctx.path.pop();
  if (!ctx.options.blockIds || !html) return html;
  const id = block && typeof block === 'object' && typeof block.id === 'string' && block.id ? block.id : `p:${path}`;
  const type = isText(block) ? 'text' : block?.type || 'text';
  return `<div class="ds-b" data-bid="${esc(id)}" data-bpath="${path}" data-btype="${esc(type)}">${html}</div>`;
}

function listHtml(items, ordered) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} class="ds-list">${(items || []).map((it) => (isText(it)
    ? `<li>${richText(it)}</li>`
    : `<li>${richText(it?.text ?? '')}${Array.isArray(it?.items) ? listHtml(it.items, ordered) : ''}</li>`)).join('')}</${tag}>`;
}

/** Spaltenbreite bzw. Zeilenhöhe als CSS-Länge – leer, wenn automatisch. */
export function tableLength(v) {
  const t = String(v ?? '').trim().replace(/\s+/g, '');
  return TABLE_LENGTH_RE.test(t) ? t : '';
}

/** <colgroup> mit den festen Spaltenbreiten (`widths`) – leer ohne. */
export function tableColgroup(block) {
  const w = Array.isArray(block?.widths) ? block.widths.map(tableLength) : [];
  return w.some(Boolean) ? `<colgroup>${w.map((x) => `<col${x ? ` style="width:${x}"` : ''}>`).join('')}</colgroup>` : '';
}

/** style-Attribut der Zeile r (Kopfzeile zählt mit) mit ihrer Mindesthöhe (`heights`). */
export function tableRowAttr(block, r) {
  const h = tableLength(Array.isArray(block?.heights) ? block.heights[r] : '');
  return h ? ` style="height:${h}"` : '';
}

function cellHtml(tag, c, ctx = null) {
  if (isText(c)) return `<${tag}>${richText(c)}</${tag}>`;
  const cellCss = [CELL_ALIGNS.includes(c?.align) ? `text-align:${c.align}` : '', CELL_VALIGNS.includes(c?.valign) ? `vertical-align:${c.valign}` : '', CELL_BACKGROUNDS[c?.background] ? `background:${CELL_BACKGROUNDS[c.background]}` : ''].filter(Boolean).join(';');
  const alignAttr = cellCss ? ` style="${cellCss}"` : '';
  const span = (name, v) => (Number.isInteger(v) && v > 1 && v <= 20 ? ` ${name}="${v}"` : '');
  const images = (Array.isArray(c?.images) ? c.images : []).filter(cellImageOk).map((i) => {
    const width = CSS_LENGTH_RE.test(String(i.width ?? '')) ? ` style="width:${i.width}"` : '';
    return `<img class="ds-cell-image" src="${esc(i.src)}" alt="${esc(i.alt ?? '')}"${width}>`;
  }).join('');
  // Bausteine in der Zelle (Tabelle in der Tabelle …) – ohne eigene Block-IDs:
  // Beschriftung hängt an der äußeren Tabelle.
  const inner = Array.isArray(c?.blocks) && ctx
    ? renderBlocksHtml(c.blocks, { ...ctx, options: { ...ctx.options, blockIds: false }, path: [] }) : '';
  // beside: Bilder neben dem Text (z. B. „Schließer“ und sein Schaltzeichen), sonst darunter.
  if (c?.beside && images) {
    return `<${tag}${span('colspan', c?.colspan)}${span('rowspan', c?.rowspan)}${alignAttr}><div class="ds-cell-beside"><div>${richText(c?.text ?? '')}</div>${images}</div>${inner}</${tag}>`;
  }
  return `<${tag}${span('colspan', c?.colspan)}${span('rowspan', c?.rowspan)}${alignAttr}>${richText(c?.text ?? '')}${images}${inner}</${tag}>`;
}

function headingNumber(type, c) {
  if (type === 'section') { c[0]++; c[1] = 0; c[2] = 0; return `${c[0]}.`; }
  if (type === 'task') { c[1]++; c[2] = 0; return `${c[0]}.${c[1]}`; }
  c[2]++;
  return `${c[0]}.${c[1]}.${c[2]}`;
}

function paragraphs(text, cls = 'ds-text') {
  return String(text).split('\n\n').map((p) => `<p class="${cls}">${richText(p.trim())}</p>`).join('');
}

function renderBlockHtml(block, ctx) {
  if (isText(block)) block = { type: 'text', text: block };
  if (!block || typeof block !== 'object') return '';
  const type = block.type || 'text';
  switch (type) {
    case 'section':
    case 'task':
    case 'subtask': {
      const level = HEADING_TYPES.indexOf(type) + 2; // h2 … h4 (h1 ist der Modultitel)
      const title = block.title !== undefined ? block.title : block.text;
      let html = `<h${level} class="ds-heading ds-${type}"><span class="ds-num">${headingNumber(type, ctx.counters)}</span> ${richText(title ?? '')}</h${level}>`;
      if (block.title !== undefined && isText(block.text)) html += paragraphs(block.text);
      return html + renderBlocksHtml(block.blocks, ctx);
    }
    case 'heading': {
      const level = [1, 2, 3].includes(block.level) ? block.level + 1 : 2;
      return `<h${level} class="ds-heading ds-plain">${richText(block.text ?? block.title ?? '')}</h${level}>`;
    }
    case 'text': {
      if (!isText(block.text)) return '';
      const html = paragraphs(block.text);
      const style = [ALIGNS.includes(block.align) && block.align !== 'left' ? `text-align:${block.align}` : '', paraStyle(block)].filter(Boolean).join(';');
      return style ? html.replace(/<p class="ds-text">/g, `<p class="ds-text" style="${style}">`) : html;
    }
    case 'columns':
      // Spalten direkt (ohne Hülle je Spalte) – sonst stünden sie nicht nebeneinander.
      // Der Pfad zählt sie trotzdem mit (wie ids.js): content[2].blocks[1].blocks[0] = 2.1.0.
      return `<div class="ds-columns">${(Array.isArray(block.blocks) ? block.blocks : []).map((col, i) => {
        ctx.path.push(i);
        const inner = renderBlocksHtml(col?.blocks, ctx);
        ctx.path.pop();
        const w = tableLength(col?.width);
        return `<div class="ds-column"${w ? ` style="flex:0 0 ${w}"` : ''}>${inner}</div>`;
      }).join('')}</div>`;
    case 'column':
      return renderBlocksHtml(block.blocks, ctx);
    case 'box': {
      const title = isText(block.title) ? `<p class="ds-box-title"><strong>${richText(block.title)}</strong></p>` : '';
      return `<div class="ds-box${block.shaded ? ' ds-box-shaded' : ''}">${title}${isText(block.text) ? paragraphs(block.text) : ''}${renderBlocksHtml(block.blocks, ctx)}</div>`;
    }
    case 'note':
      return isText(block.text) ? `<p class="ds-note"><em>${richText(block.text)}</em></p>` : '';
    case 'list': {
      const html = listHtml(block.items, !!block.ordered);
      const cls = [LIST_MARKERS.includes(block.marker) && !block.ordered ? `ds-list-${block.marker}` : '', LIST_NUMBERINGS.includes(block.numbering) && block.ordered ? `ds-list-num-${block.numbering}` : ''].filter(Boolean).join(' ');
      const style = paraStyle(block);
      return cls || style ? html.replace(/^<(ol|ul) class="ds-list">/, `<$1 class="ds-list${cls ? ` ${cls}` : ''}"${style ? ` style="${style}"` : ''}>`) : html;
    }
    case 'code': {
      const caption = isText(block.caption) ? `<p class="ds-caption"><em>${esc(block.caption)}</em></p>` : '';
      const code = isText(block.code)
        ? esc(block.code)
        : `<span class="ds-missing">Code aus Datei ${esc(block.file ?? '')}</span>`;
      return `${caption}<pre class="ds-code"><code>${code}</code></pre>`;
    }
    case 'image': {
      const width = CSS_LENGTH_RE.test(String(block.width ?? '')) ? ` style="width:${block.width}"` : '';
      const img = isText(block.src) && IMAGE_SRC_RE.test(String(block.src))
        ? `<img src="${esc(block.src)}" alt="${esc(block.alt ?? block.caption ?? '')}"${width}>`
        : `<span class="ds-missing">Bild ${esc(block.file ?? '')}</span>`;
      const caption = isText(block.caption) ? `<figcaption>${richText(block.caption)}</figcaption>` : '';
      const align = block.float === undefined && BLOCK_ALIGNS.includes(block.align) && block.align !== 'left' ? ` ds-align-${block.align}` : '';
      const cls = `ds-image${block.border ? ' ds-image-border' : ''}${FLOATS.includes(block.float) ? ` ds-image-${block.float}` : ''}${align}`;
      return `<figure class="${cls}">${img}${caption}</figure>`;
    }
    case 'group': {
      const width = CSS_LENGTH_RE.test(String(block.width ?? '')) ? `width:${block.width};` : '';
      const ratio = groupRatioOk(block.ratio) ? block.ratio : 0.6;
      const r = (v) => Math.round(Number(v) * 1000) / 1000;
      // Schrift und Innenabstand der Textfenster wachsen mit dem Rahmen (cqw: Prozent seiner Breite).
      const widthCm = /^(\d+(?:\.\d+)?)cm$/.test(String(block.width ?? '')) ? parseFloat(block.width) : 16.5;
      const cqw = (pt) => `${r((pt / ((widthCm / 2.54) * 72)) * 100)}cqw`;
      const pos = (it) => `left:${r(it.x)}%;top:${r(it.y)}%;width:${r(it.w)}%;height:${r(it.h)}%`;
      const items = (Array.isArray(block.items) ? block.items : []).filter(groupItemOk).map((it) => {
        if (!isTextItem(it)) return `<img src="${esc(it.src)}" alt="${esc(it.alt ?? '')}" style="${pos(it)}">`;
        const look = [`font-size:${cqw(it.size ?? 11)}`, `padding:${cqw(2)} ${cqw(4)}`,
          it.align && it.align !== 'left' ? `text-align:${it.align}` : '',
          it.fill ? `background:${FRAME_FILLS[it.fill]}` : '', it.color || it.fill ? `color:${it.color ? FRAME_TEXT_COLORS[it.color] : '#000'}` : '', it.border ? 'border:1px solid #000' : ''].filter(Boolean).join(';');
        return `<div class="ds-group-text" style="${pos(it)};${look}">${String(it.text).split('\n').map((l) => richText(l) || '&nbsp;').join('<br>')}</div>`;
      }).join('');
      const caption = isText(block.caption) ? `<figcaption>${richText(block.caption)}</figcaption>` : '';
      const cls = `ds-group${BLOCK_ALIGNS.includes(block.align) && block.align !== 'left' ? ` ds-align-${block.align}` : ''}${block.border ? ' ds-group-border' : ''}`;
      return `<figure class="${cls}"><div class="ds-group-box" style="${width}aspect-ratio:1 / ${r(ratio)}">${items}</div>${caption}</figure>`;
    }
    case 'table': {
      const caption = isText(block.caption) ? `<p class="ds-caption"><em>${esc(block.caption)}</em></p>` : '';
      const off = Array.isArray(block.header) ? 1 : 0;
      const head = off
        ? `<thead><tr${tableRowAttr(block, 0)}>${block.header.map((c) => cellHtml('th', c ?? '', ctx)).join('')}</tr></thead>` : '';
      const rows = (block.rows || []).filter(Array.isArray)
        .map((r, i) => `<tr${tableRowAttr(block, i + off)}>${r.map((c) => cellHtml('td', c ?? '', ctx)).join('')}</tr>`).join('');
      return `${caption}<div class="ds-table-wrap"><table class="ds-table${block.border === false ? ' ds-table-plain' : ''}${CELL_ALIGNS.includes(block.align) ? ` ds-align-${block.align}` : ''}${CELL_VALIGNS.includes(block.valign) ? ` ds-valign-${block.valign}` : ''}"${tableLineStyle(block)}>${tableColgroup(block)}${head}<tbody>${rows}</tbody></table></div>`;
    }
    case 'formula': {
      const align = block.align === 'left' ? ' ds-formula-left' : '';
      let math;
      try { math = starmathToMathml(block.math ?? ''); } catch (e) { math = `<code class="ds-missing">${esc(block.math ?? '')}</code>`; }
      return `<div class="ds-formula${align}">${math}</div>`;
    }
    case 'solution': {
      const label = isText(block.title) ? block.title : 'Lösung:';
      return `<div class="ds-solution"><p class="ds-solution-label">${esc(label)}</p>` +
        (isText(block.text) ? paragraphs(block.text) : '') + renderBlocksHtml(block.blocks, ctx) + '</div>';
    }
    case 'karo': {
      const lines = Number.isInteger(block.lines) ? block.lines : 4;
      const width = karoWidthCm(block);
      // Klassen ds-karo-linien, ds-karo-leer, ds-karo-frei (ausgeschrieben, damit tools/extract-css.mjs sie findet)
      const pattern = KARO_PATTERNS.includes(block.pattern) && block.pattern !== 'karo' ? ` ds-karo-${block.pattern}` : '';
      // Mit Breite auch über 16,5 cm (Querformat) – aber nie breiter als das Blatt, auf dem es steht.
      return `<div class="ds-karo${pattern}" style="height:${lines * 0.5}cm${width ? `;width:${width}cm;max-width:100%` : ''}" aria-hidden="true"></div>`;
    }
    case 'spacer': {
      const lines = Number.isInteger(block.lines) ? block.lines : 3;
      return `<div class="ds-spacer" style="height:${lines * 1.4}em"></div>`;
    }
    case 'pagebreak':
      // Mit blockIds (Blatt im Stift-Editor) eine unsichtbare Marke – der Druck bricht dort um.
      return ctx.options.showPageBreaks ? '<div class="ds-pagebreak"><span>Seitenumbruch</span></div>'
        : ctx.options.blockIds ? '<div class="ds-pagebreak-mark" aria-hidden="true"></div>' : '';
    case 'quiz':
      // Platzhalter; im Durchlauf hängt h5p-renderer.js das Modul hinein.
      return `<div class="ds-quiz" data-module="${esc(block.module ?? '')}"${typeof block.scale === 'number' ? ` data-scale="${block.scale}"` : ''}><p class="ds-quiz-title">🧩 ${richText(isText(block.title) ? block.title : 'Quiz')}</p>`
        + '<p class="ds-quiz-hint">Beim Bearbeiten des Lernthemas läuft das Quiz hier im Blatt, im Druck stehen QR-Code und Adresse.</p></div>';
    default:
      return '';
  }
}
