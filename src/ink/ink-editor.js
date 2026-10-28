import {
  A4, CM, strokeOutline, polyline, hitsStroke, bounds, inSelection, moved, ruling,
  pageToRuler, inRuler, nearEdge, projectOnSegment, snapAngle, itemAt, extremesAlong,
  isBox, resizedBox, corners, MM,
} from './ink-geometry.js';
import { rulerSvg, rulerHandles } from './ink-ruler.js';
import { svgEl, itemSvg, fieldSvg, shapeSvg, inkSvgFor, inkSvgBox } from './ink-view.js';
import {
  FILL_COLORS, DASHES, SHAPE_WIDTHS, usesPoints, shapeCorners, rotateHandle, resizedShape, rotatedShape,
  normalizedAngle, toPolygon, shapeFromDrag, shapeCenter, shapeBox, isClosed, SHAPE_TEXT_SIZE,
} from './ink-shapes.js';
import { showContextMenu } from '../util/dom.js';
import { FONT_SIZES } from '../doc/docspec.js';

// ==================== STIFT-EDITOR ====================
//
// Ein Arbeitsblatt mit Stift (iPad), Finger oder Maus bearbeiten – wie auf
// Papier. Unten liegt der Hintergrund (das PDF des Blatts, Karo, Linien,
// leer oder ein eigenes Bild/PDF), darüber eine Ebene zum Beschriften:
// Stift mit Druck, Textmarker, Radierer, Auswahl (verschieben, löschen),
// Textfelder. Bleibt der Stift am Ende eines Strichs kurz stehen, wird der
// Strich zur geraden Linie; Linien haben im Auswahl-Modus zwei Anfasser. In der Ansicht der Lehrkraft lässt sich das Lösungsblatt als
// Hintergrund einblenden. Dazu ein Geodreieck: verschieben, drehen (1°,
// mit Umschalt 5°; zwei Finger; Mausrad), an der Ecke vergrößern – setzt der
// Stift an seiner Kante an, zeichnet er genau an ihr entlang.
//
// Gespeichert wird vorerst nur auf diesem Gerät (IndexedDB) – Abgabe und
// Auswertung kommen später. Koordinaten in PDF-Punkten der Seite, damit die
// Striche bei jedem Zoom an derselben Stelle des Blatts bleiben.
//
// Hintergrund „Dokument“ (`paper`): Statt eines PDFs liegt das Dokument selbst
// darunter – als HTML auf einem A4-Blatt fester Breite, eingebettete Quizze
// bleiben bedienbar (Werkzeug „Bedienen“, oder mit dem Finger). Gespeichert
// werden die Striche je Baustein (docs/FORMAT.md, layers/): Jeder gehört zum
// Baustein, in dem er beginnt, mit y relativ zu dessen Oberkante. Wächst ein
// Karo oder bricht ein Text anders um, rutschen die Striche darunter mit.

const COLORS = ['#1e293b', '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea'];
const MARKERS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];
const WIDTHS = { pen: [1.1, 1.9, 3.2], marker: [9, 14, 20] };
const ERASER = 7;           // Radius des Radierers in Punkten
const TEXT_SIZE = 13;       // Schriftgröße älterer Textfelder ohne Angabe, in Punkten
const NEW_TEXT_SIZE = 12;   // Vorgabe für neue Textfelder – Größen wie im Dokument-Editor (FONT_SIZES)

// Symbole der Werkzeugleiste (selbst gezeichnet, 24 × 24, Linienstil).
const ICON_PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  select: 'M4 7V5a1 1 0 011-1h2M11 4h2M17 4h2a1 1 0 011 1v2M20 11v2M20 17v2a1 1 0 01-1 1h-2M13 20h-2M7 20H5a1 1 0 01-1-1v-2M4 13v-2',
  pen: 'M4 20l1.2-4.4L15.6 5.2a2.1 2.1 0 013 3L8.2 18.6 4 20zM13.8 7l3.2 3.2',
  marker: 'M4 21h8M7.5 17.5l-2-2L15 5l4 4-9.5 9.5zM6.5 16.5L4 19',
  eraser: 'M8 20h12M5.6 14.4l8.3-8.3a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18H8.6zM9.6 10.4l4 4',
  text: 'M4 4h16v16H4zM8.5 8.5h7M12 8.5v8',
  ruler: 'M3.5 19.5L19.5 3.5v16zM7.5 19.5v-2M11.5 19.5v-3M15.5 19.5v-2M19.5 8.5h-2M19.5 12.5h-3',
  undo: 'M9 13L4 8l5-5M4 8h10a6 6 0 010 12h-4',
  redo: 'M15 13l5-5-5-5M20 8H10a6 6 0 000 12h4',
  finger: 'M9 12V5.5a1.5 1.5 0 013 0V11M12 10.5V4.5a1.5 1.5 0 013 0V11M15 10.5V7a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-.5a6 6 0 01-5-2.8L3.2 13a1.5 1.5 0 012.5-1.6L9 15',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8V16h7.2v-2.2A6 6 0 0012 3z',
  page: 'M6 3h8l4 4v14H6zM12 10v6M9 13h6',
  zoomIn: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6',
  fit: 'M4 12h16M7.5 8.5L4 12l3.5 3.5M16.5 8.5L20 12l-3.5 3.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pointer: 'M6 3l13 8-6 1.5L9.5 19z',
  field: 'M4 5h16v14H4zM4 9.7h16M4 14.3h16M9.3 5v14M14.7 5v14',
  shape: 'M3.5 3.5h9v9h-9zM16.5 11a4.5 4.5 0 110 9 4.5 4.5 0 010-9z',
  laser: 'M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  head: 'M4 3h16v6H4zM7 6h4M4 13h16M4 17h12M4 21h14',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
};
// Feld (Abdeckung): Raster wie im Dokument – Karo 5 mm, Linien 10 mm.
const FIELD_PATTERNS = { karo: '▦ Karo', linien: '☰ Linien', leer: '▢ Leer (weiß)' };
// Formen (ink-shapes.js): Art, Strichart.
const SHAPE_KIND_LABELS = { rect: ['▭', 'Rechteck'], ellipse: ['◯', 'Ellipse'], polygon: ['⬠', 'Vieleck – Punkte setzen, Doppelklick oder Klick auf den ersten Punkt schließt'], line: ['╱', 'Linie'], arrow: ['➝', 'Pfeil'] };
const DASH_LABELS = { solid: ['—', 'durchgezogen'], dash: ['┄', 'gestrichelt'], dot: ['⋯', 'gepunktet'] };
const ROT_GAP = 22;         // Abstand des Dreh-Anfassers über der Form, Bildschirm-Pixel
const LASER_FADE = 1500;    // so lange (ms) leuchtet die Spur des Leuchtstifts nach
const icon = (name) => `<svg class="ink-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
const MAX_PIXELS = 12e6;    // Obergrenze je Hintergrund-Leinwand (iPad Safari: ~16 Mio.)
const RULER_REACH = 12;     // So nah (Bildschirmpunkte) muss der Stift an die Kante des Geodreiecks
const RULER_MIN = 6 * CM;
const HOLD_MS = 550;        // So lange still halten, dann wird der Strich zur Linie
const HOLD_SLACK = 4;       // … und so wenig (Bildschirmpunkte) darf er sich dabei bewegen
const HANDLE = 9;           // Anfasser einer Linie (Bildschirmpunkte, Radius)
const RULER_MAX = 32 * CM;
// Kopierte Elemente – bleiben beim Wechsel in ein anderes Dokument erhalten.
let clipboard = null;         // { items, pasted }
const PRESS_MS = 550;         // so lange drücken (Finger/Stift), dann das Menü der Auswahl
const PX_PT = 0.75;         // 1 CSS-Pixel = 0,75 pt (96 dpi gegen 72 dpi)
const KARO_MAX = 60;        // Zeilen à 0,5 cm, wie in docspec

// ---------- Speicher auf diesem Gerät ----------

const DB = 'lm-ink';
const STORE = 'docs';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function dbPut(key, value) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (_) { return false; }
}

/** Auf diesem Gerät gespeicherter Stand zu `key` (wie openInkEditor) – oder null. */
export function savedInk(key) {
  return dbGet(`ink:${key}`);
}

// ---------- pdf.js (erst bei Bedarf) ----------

let pdfjs = null;
async function pdfLib() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

async function openPdf(data) {
  const lib = await pdfLib();
  return lib.getDocument({ data: new Uint8Array(data) }).promise;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Editor öffnen (Vollbild).
 * - `key`: unter diesem Namen speichert das Gerät die Beschriftung.
 * - `loadPdf(variant)`: 'blatt' | 'loesung' → ArrayBuffer des PDFs; ohne gibt es kein PDF als Hintergrund.
 * - `solutions`: Lösungsblatt einblenden erlaubt (nur Lehrkräfte).
 * - `paper`: das Dokument als Hintergrund –
 *   { mount(el, { solutions }), landscape?, karoResize? (Vorgabe: ja), capture?, restore? }.
 *   `mount` schreibt das Dokument mit Block-Hüllen (data-bid) in `el`.
 *   `capture(el)` → Eingaben im Blatt (z. B. eingebettete Quizze), gespeichert
 *   als `forms` im Stand; `restore(el, forms)` setzt sie nach dem Aufbau wieder.
 *   Einfügen (⊕ am Rand zwischen den Bausteinen): ohne weitere Angaben landen
 *   neue Schreibfelder in der Ebene (nur für diese Person). Mit
 *   `insertBlock(afterBid | null, block)` (Lehrkraft) fügt der Gastgeber den
 *   Baustein ins Dokument ein und speichert es; mit `setField(bid, { lines,
 *   width, pattern })` gehen Größe und Muster eines Schreibfelds ins Dokument
 *   statt in die Ebene. `insertItems()` → weitere Einträge im Menü:
 *   [{ label, run(afterBid) }] (z. B. Quiz, PDF).
 * - `store`: woanders speichern als auf diesem Gerät – { load() → Stand | null,
 *   save(stand) → true/false, label }; der Stand ist { v, bg, pages, layer, ruler }.
 * - `actions`: weitere Knöpfe in der Leiste – [{ label, title, onClick({ close }) }]; vorher wird gespeichert.
 * - `onClose`: nach dem Schließen (der Stand ist dann gespeichert).
 * - `laser`: Leuchtstift zum Zeigen am Beamer (Spur verblasst, wird nicht gespeichert) – Vorgabe: wie `solutions` (Lehrkräfte).
 */
export async function openInkEditor({ title = 'Arbeitsblatt', key, loadPdf = null, solutions = false, paper = null, store = null, actions = [], onClose = null, laser = solutions }) {
  const storeKey = `ink:${key}`;
  const saved = store ? await store.load() : await dbGet(storeKey);
  const doc = saved?.v === 1 ? saved : { v: 1, bg: paper ? 'paper' : loadPdf ? 'pdf' : 'karo', pages: [{ items: [] }] };
  if (!loadPdf && doc.bg === 'pdf') doc.bg = paper ? 'paper' : 'karo';
  if (!paper && doc.bg === 'paper') doc.bg = loadPdf ? 'pdf' : 'karo';
  let fileBg = doc.bg === 'file' ? await dbGet(`${storeKey}:file`) : null; // { type, data }
  if (doc.bg === 'file' && !fileBg) doc.bg = loadPdf ? 'pdf' : 'karo';
  // Seiten des Blatts (PDF, Karo, …) und die Ebene des Dokuments werden
  // getrennt gespeichert; doc.pages ist immer, was gerade zu sehen ist.
  let sheetPages = doc.pages || [{ items: [] }];
  let layer = doc.layer || { blocks: {} };
  // Selbst eingefügte Schreibfelder (nur für diese Person): [{ id, after, pattern }].
  let inserts = Array.isArray(layer.inserts) ? layer.inserts : [];
  delete doc.layer;
  if (doc.bg === 'paper') doc.pages = [{ items: [] }];

  const state = {
    tool: 'pen', color: COLORS[0], marker: MARKERS[0], widthIdx: 1, textSize: NEW_TEXT_SIZE, fieldPattern: 'karo',
    shapeKind: 'rect', shapeDash: 'solid', shapeFill: null, shapeOpacity: 1,
    zoom: 1, fingerDraws: false, variant: 'blatt',
    selection: null,          // { page, ids: Set }
    undo: [], redo: [],
  };
  let paperView = null;       // { el, host, blocks: [{ bid, top, bottom, depth, el }], observer }
  const pdfs = {};            // variant → PDFDocumentProxy | Promise
  let pages = [];             // [{ w, h, el, svg, canvas, texts }]
  let saveTimer = null;

  // ---------- Gerüst ----------
  const overlay = document.createElement('div');
  overlay.className = 'ink-overlay ink-finger-off';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', `Bearbeiten: ${title}`);
  const tool = (name, ico, label) => `<button type="button" class="ink-btn" data-tool="${name}" title="${label}" aria-label="${label}">${icon(ico)}</button>`;
  const btn = (cls, ico, label, extra = '') => `<button type="button" class="ink-btn ${cls}" title="${label}" aria-label="${label}"${extra}>${icon(ico)}</button>`;
  // Oben die Werkzeuge (wie in GoodNotes), darunter schwebend die Einstellungen des gewählten Werkzeugs.
  overlay.innerHTML = `
    <div class="ink-toolbar" role="toolbar">
      ${btn('ink-close', 'close', store ? 'Schließen' : 'Schließen – die Beschriftung bleibt auf diesem Gerät gespeichert')}
      ${btn('ink-save', 'save', 'Speichern – geschieht auch automatisch kurz nach jeder Änderung')}
      <span class="ink-title">${esc(title)}</span>
      ${actions.map((a, i) => `<button type="button" class="ink-btn ink-labeled ink-action" data-action="${i}" title="${esc(a.title || a.label)}">${esc(a.label)}</button>`).join('')}
      <span class="ink-group ink-tools">
        ${paper ? tool('interact', 'pointer', 'Bedienen: Quizze im Blatt ausfüllen – beim Auswählen springt es auf einem Quiz von selbst hierher; der Finger bedient Quizze immer') : ''}
        ${tool('select', 'select', 'Auswählen: Strich antippen oder Rechteck aufziehen')}
        ${tool('pen', 'pen', 'Stift – am Ende kurz halten: gerade Linie')}
        ${tool('marker', 'marker', 'Textmarker')}
        ${tool('eraser', 'eraser', 'Radierer – löscht ganze Striche')}
        ${tool('text', 'text', 'Textfeld: auf die Seite tippen und schreiben')}
        ${tool('field', 'field', 'Feld: ein Rechteck aufziehen – deckt ab, was darunter liegt, mit Karo, Linien oder weiß')}
        ${tool('shape', 'shape', 'Formen: Rechteck, Ellipse, Vieleck, Linie, Pfeil – mit Füllung und Deckkraft, drehbar')}
        ${laser ? tool('laser', 'laser', 'Leuchtstift: zum Zeigen am Beamer – die Spur leuchtet kurz und verblasst, nichts wird gespeichert') : ''}
        <span class="ink-sep"></span>
        ${btn('ink-ruler-toggle', 'ruler', 'Geodreieck ein- und ausblenden – drehen am ⟳ (Umschalt: 5°), mit zwei Fingern oder dem Mausrad; vergrößern am ⤢')}
      </span>
      <span class="ink-group">
        ${btn('ink-undo', 'undo', 'Rückgängig')}
        ${btn('ink-redo', 'redo', 'Wiederholen')}
      </span>
      <span class="ink-group">
        ${btn('ink-finger', 'finger', 'Mit dem Finger zeichnen (sonst scrollt der Finger, gezeichnet wird mit Stift oder Maus)')}
        <select class="ink-bg-select" title="Hintergrund" aria-label="Hintergrund">
          ${paper ? '<option value="paper">🧾 Dokument</option>' : ''}
          ${loadPdf ? `<option value="pdf">📄 ${paper ? 'PDF' : 'Arbeitsblatt'}</option>` : ''}
          <option value="karo">▦ Karo</option>
          <option value="linien">☰ Linien</option>
          <option value="leer">▢ Leer</option>
          <option value="file">🖼 Bild oder PDF …</option>
        </select>
        ${solutions && (loadPdf || paper) ? btn('ink-solution', 'bulb', 'Lösungen ein- und ausblenden') : ''}
        ${btn('ink-add-page', 'page', 'Seite anfügen')}
        ${paper?.headerPdf ? btn('ink-head', 'head', 'Kopfzeile der Vorlage zeigen (Logo, Titel – wie im Druck)') : ''}
        ${paper ? btn('ink-print', 'print', 'Drucken oder als PDF speichern – Arbeitsblatt oder Lösungsblatt, mit oder ohne Beschriftung') : ''}
      </span>
      <span class="ink-group ink-zoom">
        ${btn('ink-zoom-out', 'zoomOut', 'Verkleinern')}
        ${btn('ink-zoom-fit', 'fit', 'Auf Breite')}
        ${btn('ink-zoom-in', 'zoomIn', 'Vergrößern')}
      </span>
      <span class="ink-status" aria-live="polite"></span>
    </div>
    <div class="ink-stage">
      <div class="ink-subbar" role="toolbar" aria-label="Einstellungen des Werkzeugs">
        <span class="ink-group ink-widths">
          ${[0, 1, 2].map((i) => `<button type="button" class="ink-btn ink-width" data-width="${i}" title="${['dünn', 'mittel', 'dick'][i]}" aria-label="${['dünn', 'mittel', 'dick'][i]}"><i style="--h:${[1.5, 3, 5][i]}px"></i></button>`).join('')}
        </span>
        <span class="ink-group ink-sizes">
          <select class="ink-tsize" title="Schriftgröße (wie im Dokument-Editor)" aria-label="Schriftgröße">${FONT_SIZES.map((pt) => `<option value="${pt}">${pt} pt</option>`).join('')}</select>
        </span>
        <span class="ink-group ink-shape-kinds">
          ${Object.entries(SHAPE_KIND_LABELS).map(([k, [ico, label]]) => `<button type="button" class="ink-btn ink-shape-kind" data-kind="${k}" title="${label}" aria-label="${label}">${ico}</button>`).join('')}
        </span>
        <span class="ink-group ink-shape-style">
          ${Object.entries(DASH_LABELS).map(([k, [ico, label]]) => `<button type="button" class="ink-btn ink-dash" data-dash="${k}" title="Linie ${label}" aria-label="Linie ${label}">${ico}</button>`).join('')}
          <span class="ink-sep"></span>
          <button type="button" class="ink-btn ink-fill ink-fill-none" data-fill="" title="Keine Füllung" aria-label="Keine Füllung"></button>
          ${FILL_COLORS.map((c) => `<button type="button" class="ink-btn ink-fill" data-fill="${c}" style="--c:${c}" title="Füllung" aria-label="Füllung ${c}"></button>`).join('')}
          <label class="ink-opacity" title="Deckkraft der Füllung">Deckkraft
            <input type="range" class="ink-op-range" min="0" max="100" step="1" aria-label="Deckkraft">
            <input type="number" class="ink-op-num" min="0" max="100" step="1" aria-label="Deckkraft in Prozent">%</label>
        </span>
        <span class="ink-group ink-patterns">
          ${Object.entries(FIELD_PATTERNS).map(([p, label]) => `<button type="button" class="ink-btn ink-pattern" data-pattern="${p}" title="${label.slice(2)}" aria-label="${label.slice(2)}">${label.slice(0, 1)}</button>`).join('')}
        </span>
        <span class="ink-sep ink-sub-sep"></span>
        <span class="ink-group ink-colors"></span>
        <span class="ink-subhint"></span>
        <button type="button" class="ink-btn ink-more" title="Mehr: Kopieren, Einfügen, Gruppieren … (auch Rechtsklick oder lange drücken)" aria-label="Mehr" hidden>⋯</button>
        <button type="button" class="ink-btn ink-delete ink-labeled" title="Auswahl löschen (Entf)" hidden>${icon('trash')}<span>Löschen</span></button>
      </div>
      <div class="ink-scroll"><div class="ink-pages"></div></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('ink-open');
  const $ = (sel) => overlay.querySelector(sel);
  const scroller = $('.ink-scroll');
  const pagesEl = $('.ink-pages');
  const status = (text) => { $('.ink-status').textContent = text; };

  // ---------- Werkzeugleiste ----------
  const paintToolbar = () => {
    overlay.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
    if (state.tool !== 'laser') laserDot(-1, null);
    // Ein begonnenes Vieleck endet, sobald ein anderes Werkzeug (oder eine andere Form) gewählt ist.
    if (state.poly && (state.tool !== 'shape' || state.shapeKind !== 'polygon')) finishPolygon();
    const shapes = state.tool === 'select' ? selectedItems().filter((it) => it.type === 'shape') : [];
    const shaping = state.tool === 'shape' || shapes.length > 0;
    const list = state.tool === 'marker' ? MARKERS : COLORS;
    const current = state.tool === 'marker' ? state.marker : shapes.length ? shapes[0].color : state.color;
    // Nur bei anderer Palette neu bauen: Ersetzte Knöpfe verschlucken sonst einen Klick,
    // wenn zwischen Drücken und Loslassen gespeichert wird (z. B. Textfeld verliert den Fokus).
    if ($('.ink-colors').dataset.list !== list.join()) {
      $('.ink-colors').dataset.list = list.join();
      $('.ink-colors').innerHTML = list.map((c) => `<button type="button" class="ink-btn ink-color" data-color="${c}" style="--c:${c}" title="Farbe"></button>`).join('');
    }
    $('.ink-colors').querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === current));
    const drawing = ['pen', 'marker'].includes(state.tool);
    $('.ink-colors').hidden = !drawing && state.tool !== 'text' && !shaping;
    $('.ink-widths').hidden = !drawing && !shaping;
    // Formen: Art (nur beim Zeichnen), Strichart, Füllung, Deckkraft – für neue oder die gewählten.
    $('.ink-shape-kinds').hidden = state.tool !== 'shape';
    overlay.querySelectorAll('.ink-shape-kind').forEach((b) => b.classList.toggle('active', b.dataset.kind === state.shapeKind));
    $('.ink-shape-style').hidden = !shaping;
    const look = shapes[0] ? { dash: shapes[0].dash || 'solid', fill: shapes[0].fill || null, opacity: shapes[0].opacity ?? 1 }
      : { dash: state.shapeDash, fill: state.shapeFill, opacity: state.shapeOpacity };
    overlay.querySelectorAll('.ink-dash').forEach((b) => b.classList.toggle('active', b.dataset.dash === look.dash));
    overlay.querySelectorAll('.ink-fill').forEach((b) => b.classList.toggle('active', (b.dataset.fill || null) === look.fill));
    const pct = String(Math.round(look.opacity * 100));
    if (document.activeElement !== $('.ink-op-num')) $('.ink-op-num').value = pct;
    if (document.activeElement !== $('.ink-op-range')) $('.ink-op-range').value = pct;
    $('.ink-opacity').classList.toggle('ink-muted', !look.fill);
    const texts = state.tool === 'select' ? selectedItems().filter((it) => it.type === 'text') : [];
    const boxed = shapes.filter(isClosed);
    $('.ink-sizes').hidden = state.tool !== 'text' && !texts.length && !boxed.length;
    const shown = texts.length && texts.every((t) => (t.size || TEXT_SIZE) === (texts[0].size || TEXT_SIZE)) ? texts[0].size || TEXT_SIZE
      : !texts.length && boxed.length ? boxed[0].textSize || SHAPE_TEXT_SIZE : state.textSize;
    const tsize = $('.ink-tsize');
    if (![...tsize.options].some((o) => Number(o.value) === shown)) tsize.add(new Option(`${shown} pt`, String(shown))); // ältere Größe (13 pt)
    tsize.value = String(shown);
    $('.ink-sub-sep').hidden = $('.ink-colors').hidden;
    // Muster: fürs neue Feld – oder, beim Auswählen, für die gewählten Felder.
    const fields = selectedItems().filter((it) => it.type === 'field');
    $('.ink-patterns').hidden = state.tool !== 'field' && !(state.tool === 'select' && fields.length);
    const pattern = state.tool === 'select' && fields.length ? (fields.every((f) => f.pattern === fields[0].pattern) ? fields[0].pattern : null) : state.fieldPattern;
    overlay.querySelectorAll('.ink-pattern').forEach((b) => b.classList.toggle('active', b.dataset.pattern === pattern));
    overlay.querySelectorAll('.ink-width').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.width) === state.widthIdx);
      b.querySelector('i').style.background = state.tool === 'marker' ? state.marker : state.color;
    });
    $('.ink-subhint').textContent = {
      interact: 'Quizze im Blatt ausfüllen – neben einem Quiz wird wieder ausgewählt; zum Schreiben den Stift wählen.',
      field: 'Rechteck aufziehen – das Feld deckt ab, was darunter liegt.',
      eraser: 'Über einen Strich oder eine Form wischen – sie wird ganz gelöscht.',
      laser: 'Zeigen: gedrückt ziehen hinterlässt eine Leuchtspur, die von selbst verblasst – nichts wird gespeichert.',
      shape: state.shapeKind === 'polygon'
        ? (state.poly ? 'Weitere Punkte setzen – Doppelklick, Enter oder Klick auf den ersten Punkt schließt, Esc bricht ab' : 'Ersten Punkt setzen')
        : 'Aufziehen – mit Umschalt Quadrat bzw. Kreis, Linien in 15°-Schritten',
      select: state.selection?.ids.size
        ? `${state.selection.ids.size} gewählt${groupOfSelection() ? ' (Gruppe)' : ''} – ziehen zum Verschieben`
        : 'Strich antippen oder Rechteck aufziehen',
    }[state.tool] || '';
    $('.ink-undo').disabled = !state.undo.length;
    $('.ink-redo').disabled = !state.redo.length;
    $('.ink-delete').hidden = !state.selection?.ids.size;
    $('.ink-more').hidden = !state.selection?.ids.size && !(state.tool === 'select' && clipboard);
    $('.ink-finger').classList.toggle('active', state.fingerDraws);
    overlay.classList.toggle('ink-finger-off', !state.fingerDraws);
    overlay.classList.toggle('ink-tool-text', state.tool === 'text');
    overlay.classList.toggle('ink-tool-interact', state.tool === 'interact');
    overlay.classList.toggle('ink-tool-select', state.tool === 'select');
    overlay.classList.toggle('ink-tool-laser', state.tool === 'laser');
    overlay.classList.toggle('ink-paper-mode', doc.bg === 'paper');
    const interact = overlay.querySelector('[data-tool="interact"]');
    if (interact) interact.hidden = doc.bg !== 'paper';
    $('.ink-bg-select').value = doc.bg;
    $('.ink-solution')?.classList.toggle('active', state.variant === 'loesung');
    if ($('.ink-solution')) $('.ink-solution').hidden = !(doc.bg === 'pdf' && loadPdf) && doc.bg !== 'paper';
    $('.ink-add-page').hidden = !['karo', 'linien', 'leer'].includes(doc.bg);
    if ($('.ink-print')) $('.ink-print').hidden = doc.bg !== 'paper';
    $('.ink-ruler-toggle').classList.toggle('active', !!doc.ruler?.visible);
  };

  overlay.querySelector('.ink-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    state.tool = b.dataset.tool;
    if (state.tool !== 'select') clearSelection();
    paintToolbar();
  });
  // Das Textfeld, in dem gerade geschrieben wird, behält den Fokus und bekommt die Farbe gleich mit.
  $('.ink-colors').addEventListener('mousedown', (e) => e.preventDefault());
  $('.ink-colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    if (state.tool === 'marker') state.marker = b.dataset.color; else state.color = b.dataset.color;
    if (applyToShapes({ color: b.dataset.color })) { paintToolbar(); return; }
    const box = document.activeElement?.closest?.('.ink-text');
    if (box && overlay.contains(box)) {
      box.style.color = b.dataset.color;
      for (const pg of doc.pages) {
        const it = (pg.items || []).find((x) => x.id === box.dataset.id);
        if (it) { it.color = b.dataset.color; changed(); }
      }
    }
    paintToolbar();
  });
  $('.ink-patterns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pattern]');
    if (!b) return;
    const fields = state.tool === 'select' ? selectedItems().filter((it) => it.type === 'field') : [];
    if (fields.length) {
      snapshot();
      const ids = new Set(fields.map((f) => f.id));
      const sel = state.selection;
      doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => (ids.has(it.id) ? { ...it, pattern: b.dataset.pattern } : it));
      changed();
      drawItems(sel.page);
    } else state.fieldPattern = b.dataset.pattern;
    paintToolbar();
  });
  $('.ink-widths').addEventListener('click', (e) => {
    const b = e.target.closest('[data-width]');
    if (!b) return;
    state.widthIdx = Number(b.dataset.width);
    applyToShapes({ width: SHAPE_WIDTHS[state.widthIdx] });
    paintToolbar();
  });
  // Formen: Art, Strichart, Füllung, Deckkraft.
  $('.ink-shape-kinds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    state.shapeKind = b.dataset.kind;
    paintToolbar();
  });
  $('.ink-shape-style').addEventListener('click', (e) => {
    const dash = e.target.closest('[data-dash]');
    const fill = e.target.closest('[data-fill]');
    if (dash) {
      state.shapeDash = dash.dataset.dash;
      applyToShapes({ dash: dash.dataset.dash === 'solid' ? undefined : dash.dataset.dash });
    } else if (fill) {
      state.shapeFill = fill.dataset.fill || null;
      applyToShapes({ fill: fill.dataset.fill || undefined });
    } else return;
    paintToolbar();
  });
  // Deckkraft: Schieberegler und Prozentfeld – ein Zug am Regler ist ein Schritt zum Rückgängigmachen.
  let opacityEdit = false;
  const setOpacity = (value, final) => {
    const v = Math.max(0, Math.min(100, Math.round(Number(String(value).replace(',', '.')) || 0))) / 100;
    state.shapeOpacity = v;
    applyToShapes({ opacity: v === 1 ? undefined : v }, { undoStep: !opacityEdit });
    opacityEdit = !final;
    $('.ink-op-range').value = String(Math.round(v * 100));
    $('.ink-op-num').value = String(Math.round(v * 100));
    if (final) paintToolbar();
  };
  $('.ink-op-range').addEventListener('input', (e) => setOpacity(e.target.value, false));
  $('.ink-op-range').addEventListener('change', (e) => setOpacity(e.target.value, true));
  $('.ink-op-num').addEventListener('change', (e) => setOpacity(e.target.value, true));
  // Schriftgröße: für neue Texte – und für gewählte Textfelder sofort.
  $('.ink-tsize').addEventListener('change', (e) => {
    const size = Number(e.target.value);
    const texts = state.tool === 'select' ? selectedItems().filter((it) => it.type === 'text') : [];
    if (!texts.length && applyToShapes({ textSize: size === SHAPE_TEXT_SIZE ? undefined : size })) { paintToolbar(); return; }
    if (texts.length) {
      snapshot();
      const ids = new Set(texts.map((t) => t.id));
      const sel = state.selection;
      doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => (ids.has(it.id) ? { ...it, size, h: Math.max(it.h || 0, size * 1.4) } : it));
      changed();
      drawItems(sel.page);
    } else state.textSize = size;
    paintToolbar();
  });
  $('.ink-undo').addEventListener('click', () => history(state.undo, state.redo));
  $('.ink-redo').addEventListener('click', () => history(state.redo, state.undo));
  $('.ink-delete').addEventListener('click', () => deleteSelection());
  $('.ink-more').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    selectionMenu(r.left, r.bottom + 4);
  });
  $('.ink-finger').addEventListener('click', () => { state.fingerDraws = !state.fingerDraws; paintToolbar(); });
  // Apple Pencil: Safari scrollt mit dem Stift wie mit dem Finger. Berührungen
  // des Stifts (touchType 'stylus') deshalb anhalten, bevor Safari scrollt –
  // der Finger scrollt weiter (mit „Mit dem Finger zeichnen“ nur mit zwei Fingern).
  const holdStylus = (e) => {
    if (e.target.closest?.('.ink-text')) return; // ins Textfeld tippen bleibt möglich
    if (state.tool === 'interact') return; // Stift bedient Quizze
    if ([...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault();
  };
  scroller.addEventListener('touchstart', holdStylus, { passive: false });
  scroller.addEventListener('touchmove', holdStylus, { passive: false });
  $('.ink-zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.25));
  $('.ink-zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.25));
  $('.ink-zoom-fit').addEventListener('click', () => setZoom(fitZoom()));
  $('.ink-add-page').addEventListener('click', () => {
    snapshot();
    doc.pages.push({ items: [] });
    changed();
    void layout().then(() => pages[pages.length - 1]?.el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  $('.ink-solution')?.addEventListener('click', () => {
    state.variant = state.variant === 'blatt' ? 'loesung' : 'blatt';
    paintToolbar();
    void layout();
  });
  $('.ink-bg-select').addEventListener('change', async (e) => {
    const value = e.target.value;
    if (value === 'file') {
      const file = await pickFile();
      if (!file) { paintToolbar(); return; }
      fileBg = { type: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/*'), data: await file.arrayBuffer() };
      delete pdfs.file;
      if (!(await dbPut(`${storeKey}:file`, fileBg))) status('⚠️ Bild zu groß zum Speichern – es gilt nur bis zum Schließen.');
    }
    if (doc.bg === 'paper' && value !== 'paper') { layer = toLayer(); doc.pages = sheetPages; leavePaper(); }
    else if (doc.bg !== 'paper' && value === 'paper') { sheetPages = doc.pages; doc.pages = [{ items: [] }]; }
    if (doc.ruler) doc.ruler.visible = false;
    doc.bg = value;
    state.undo = []; state.redo = [];
    clearSelection();
    changed();
    paintToolbar();
    void layout();
  });
  $('.ink-close').addEventListener('click', () => close());
  $('.ink-save').addEventListener('click', async () => {
    const b = $('.ink-save');
    b.disabled = true;
    try { await persist(); } finally { b.disabled = false; }
    b.classList.add('ink-saved');
    setTimeout(() => b.classList.remove('ink-saved'), 1200);
  });
  // iPad: Wechsel zu einer anderen App oder Tab zu – Ungespeichertes gleich sichern.
  const onHide = () => { if (document.visibilityState === 'hidden' && saveTimer) void persist(); };
  document.addEventListener('visibilitychange', onHide);
  $('.ink-head')?.addEventListener('click', async () => {
    headOn = !headOn;
    if (paper.head) void paper.head.set(headOn);
    else try { localStorage.setItem('lm_ink_head', headOn ? '1' : '0'); } catch (_) { /* egal */ }
    $('.ink-head').classList.toggle('active', headOn);
    if (doc.bg === 'paper') await layoutPaper();
  });
  $('.ink-print')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sheets = [{ solutions: false, name: 'Arbeitsblatt' }, ...(solutions ? [{ solutions: true, name: 'Lösungsblatt' }] : [])];
    const entries = [];
    // Mit Gastgeber (Lehrkraft): als PDF über den Renderer – mit Vorlage (Logo, Kopfzeile, Ränder).
    if (paperView && paper?.printPdf) {
      for (const { solutions: sol, name } of sheets) {
        entries.push({ label: `📄 ${name} mit Beschriftung – PDF mit Vorlage`, onClick: () => printViaRenderer({ solutions: sol, ink: true }) });
        entries.push({ label: `📄 ${name} – PDF mit Vorlage`, onClick: () => printViaRenderer({ solutions: sol, ink: false }) });
      }
    }
    for (const { solutions: sol, name } of sheets) {
      const view = entries.length ? 'Ansicht drucken: ' : '🖨 ';
      entries.push({ label: `${view}${name} mit Beschriftung`, onClick: () => printPaper({ solutions: sol, ink: true }) });
      entries.push({ label: `${view}${name}`, onClick: () => printPaper({ solutions: sol, ink: false }) });
    }
    showContextMenu(r.left, r.bottom + 4, entries);
  });
  $('.ink-ruler-toggle').addEventListener('click', () => {
    if (doc.ruler?.visible) doc.ruler.visible = false;
    else {
      // Auf die Seite, die gerade zu sehen ist, waagrecht in die Mitte.
      const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
      const page = pages.find((pg) => pg.el.getBoundingClientRect().bottom > mid) || pages[0];
      const r = page.el.getBoundingClientRect();
      const L = doc.ruler?.L || 16 * CM;
      const cy = Math.min(page.h - 0.5 * CM, Math.max(L / 2 + 0.5 * CM, (mid - r.top) / state.zoom + L / 4));
      doc.ruler = { visible: true, page: page.i, cx: page.w / 2, cy, angle: 0, L };
    }
    renderRuler();
    changed();
  });

  const pickFile = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,application/pdf';
    input.onchange = () => resolve(input.files[0] || null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });

  // ---------- Verlauf und Speichern ----------
  // Im Dokument zählt die Ebene je Baustein (mit den Karos) – so passt ein
  // Schritt zurück auch, wenn sich die Lage der Bausteine inzwischen geändert hat.
  // `page`/`items`: diese Seite mit anderen Strichen (Stand vor einer Geste).
  function stateJson(page = -1, items = null) {
    const list = page < 0 ? doc.pages : doc.pages.map((pg, i) => (i === page ? { ...pg, items } : pg));
    return JSON.stringify(doc.bg === 'paper' ? toLayer(list[0]?.items || []) : list);
  }
  function snapshot() {
    state.undo.push(stateJson());
    if (state.undo.length > 100) state.undo.shift();
    state.redo = [];
  }
  function history(from, to) {
    if (!from.length) return;
    to.push(stateJson());
    const saved = JSON.parse(from.pop());
    clearSelection();
    if (doc.bg === 'paper') {
      if (!paperView) return;
      layer = saved;
      karoMap = karoOf(layer);
      applyKaro();
      measurePaper();
      doc.pages = [{ items: fromLayer() }];
      sizePage(pages[0]);
      drawItems(0);
      changed();
      return;
    }
    const count = doc.pages.length;
    doc.pages = saved;
    changed();
    // Nur die Beschriftung neu zeichnen – Seiten und Hintergrund bleiben (kein Flackern).
    if (doc.pages.length === count) pages.forEach((p) => drawItems(p.i));
    else void layout();
  }
  function changed() {
    paintToolbar();
    status('…');
    $('.ink-save').classList.add('ink-dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 700);
  }
  function captureForms() {
    if (!paperView || !paper?.capture) return;
    try { doc.forms = paper.capture(paperView.el); } catch (_) { /* Stand ohne Eingaben */ }
  }
  async function persist() {
    clearTimeout(saveTimer);
    saveTimer = null;
    doc.updatedAt = new Date().toISOString();
    captureForms();
    const paperNow = doc.bg === 'paper';
    if (!paperNow) sheetPages = doc.pages;
    else layer = toLayer();
    const record = { ...doc, pages: sheetPages, layer };
    const ok = store ? await store.save(record) : await dbPut(storeKey, record);
    // Erst „sauber“, wenn seither nichts Neues dazukam (sonst läuft schon der nächste Timer).
    if (ok && !saveTimer) $('.ink-save').classList.remove('ink-dirty');
    const where = store?.label || 'auf diesem Gerät';
    status(ok ? `💾 ${where[0].toUpperCase()}${where.slice(1)} gespeichert` : `⚠️ Speichern ${where} nicht möglich`);
  }

  // ---------- Seiten ----------
  async function background() {
    if (doc.bg === 'pdf') {
      const variant = state.variant;
      if (!pdfs[variant]) {
        pdfs[variant] = (async () => openPdf(await loadPdf(variant)))();
        pdfs[variant].catch(() => { delete pdfs[variant]; });
      }
      return { pdf: await pdfs[variant] };
    }
    if (doc.bg === 'file' && fileBg) {
      if (/pdf/.test(fileBg.type)) {
        pdfs.file = pdfs.file || openPdf(fileBg.data);
        return { pdf: await pdfs.file };
      }
      const url = URL.createObjectURL(new Blob([fileBg.data], { type: fileBg.type }));
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      return { img };
    }
    return { ruling: doc.bg };
  }

  async function layout() {
    if (doc.bg === 'paper' && paper) return layoutPaper();
    let bg;
    status('Wird geladen …');
    try { bg = await background(); } catch (err) {
      status(`⚠️ Hintergrund nicht verfügbar: ${err.message || err}`);
      bg = { ruling: 'karo' };
    }
    const sizes = [];
    if (bg.pdf) {
      for (let i = 1; i <= bg.pdf.numPages; i++) {
        const vp = (await bg.pdf.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
    } else if (bg.img) {
      sizes.push({ w: A4.w, h: A4.w * (bg.img.naturalHeight / bg.img.naturalWidth) });
    } else {
      for (let i = 0; i < Math.max(1, doc.pages.length); i++) sizes.push({ ...A4 });
    }
    while (doc.pages.length < sizes.length) doc.pages.push({ items: [] });
    // Mehr beschriftete Seiten als der Hintergrund hat: auf Karo weiterführen.
    while (sizes.length < doc.pages.length) sizes.push({ ...sizes[sizes.length - 1] || A4 });
    if (!state.zoomSet) { state.zoom = fitZoom(sizes[0].w); state.zoomSet = true; }

    pagesEl.innerHTML = '';
    pages = sizes.map((s, i) => buildPage(i, s));
    for (const p of pages) { drawItems(p.i); }
    renderRuler();
    for (const p of pages) await drawBackground(p, bg);
    status('');
    paintToolbar();
  }

  function buildPage(i, { w, h }) {
    const el = document.createElement('div');
    el.className = 'ink-page';
    el.dataset.i = i;
    el.innerHTML = `<canvas class="ink-bg"></canvas>
      <svg class="ink-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <g class="ink-fields"></g><g class="ink-shapes"></g><g class="ink-marker"></g><g class="ink-pen"></g><g class="ink-live"></g><g class="ink-laser"></g>
        <rect class="ink-sel-rect" display="none"></rect><rect class="ink-sel-box" display="none"></rect>
      </svg>
      <div class="ink-texts"></div>
      <svg class="ink-top" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><g class="ink-handles"></g></svg>`;
    pagesEl.appendChild(el);
    const page = { i, w, h, el, svg: el.querySelector('svg'), canvas: el.querySelector('canvas'), texts: el.querySelector('.ink-texts') };
    sizePage(page);
    bindInput(page);
    return page;
  }

  function sizePage(p) {
    p.el.style.width = `${p.w * state.zoom}px`;
    p.el.style.height = `${p.h * state.zoom}px`;
    p.el.style.setProperty('--z', state.zoom);
    // Das Blatt hat seine natürliche Größe in CSS-Pixeln; 1 pt der Seite = zoom Bildschirmpixel.
    if (p.paper && paperView) paperView.host.style.zoom = String(PX_PT * state.zoom);
  }

  // ---------- Dokument als Hintergrund ----------
  // bid → { lines, width, pattern }, wo ein Schreibfeld anders ist als im Dokument
  // (in der Ebene: karoLines, karoWidth in cm, karoPattern).
  let karoMap = {};

  const karoOf = (l) => Object.fromEntries(Object.entries(l?.blocks || {})
    .filter(([, e]) => e.karoLines || e.karoWidth || e.karoPattern)
    .map(([bid, e]) => [bid, { lines: e.karoLines, width: e.karoWidth, pattern: e.karoPattern }]));
  const anchorY = (it) => (isBox(it) ? it.y : it.points[0][1]);

  function leavePaper() {
    paperView?.observer?.disconnect();
    paperView = null;
  }

  async function layoutPaper() {
    if (paperView) { layer = toLayer(); captureForms(); }
    leavePaper();
    status('Wird geladen …');
    pagesEl.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'ink-page ink-paper-page';
    el.dataset.i = 0;
    el.innerHTML = `<div class="ink-paper-host"><div class="lm-paper${paper.landscape ? ' lm-landscape' : ''}"></div></div>
      <svg class="ink-svg" xmlns="http://www.w3.org/2000/svg">
        <g class="ink-fields"></g><g class="ink-shapes"></g><g class="ink-marker"></g><g class="ink-pen"></g><g class="ink-live"></g><g class="ink-laser"></g>
        <rect class="ink-sel-rect" display="none"></rect><rect class="ink-sel-box" display="none"></rect>
      </svg>
      <div class="ink-texts"></div>
      <svg class="ink-top" xmlns="http://www.w3.org/2000/svg"><g class="ink-handles"></g></svg>`;
    pagesEl.appendChild(el);
    const host = el.querySelector('.ink-paper-host');
    const sheet = host.firstElementChild;
    try { await paper.mount(sheet, { solutions: state.variant === 'loesung' }); } catch (err) {
      sheet.innerHTML = `<p>⚠️ Das Dokument lässt sich nicht anzeigen: ${esc(err.message || err)}</p>`;
    }
    // Eingaben im Blatt (Quizze) gehören zum Stand: wiederherstellen, Änderungen speichern.
    if (paper.capture) {
      try { paper.restore?.(sheet, doc.forms || null); } catch (_) { /* dann eben leer */ }
      sheet.addEventListener('input', changed);
      sheet.addEventListener('change', changed);
    }
    if (headOn && paper.headerPdf) {
      try { placeHead(sheet, await headStrip()); } catch (err) { status(`Kopfzeile: ${err.message}`); }
    }
    // Erst mit den richtigen Schriften stimmen die Zeilenumbrüche.
    try { await document.fonts?.ready; } catch (_) { /* ohne */ }
    paperView = { el: sheet, host, blocks: [], pending: false };
    placeInserts(sheet);
    karoMap = karoOf(layer);
    applyKaro();
    const page = { i: 0, w: 0, h: 0, el, svg: el.querySelector('.ink-svg'), top: el.querySelector('.ink-top'), texts: el.querySelector('.ink-texts'), paper: true };
    pages = [page];
    measurePaper();
    if (!state.zoomSet) { state.zoom = fitZoom(page.w); state.zoomSet = true; }
    sizePage(page);
    doc.pages = [{ items: fromLayer() }];
    bindInput(page);
    addKaroHandles();
    addInsertMarks();
    drawItems(0);
    renderRuler();
    // Bilder laden nach, Quizze klappen auf: Lage neu messen, Striche wandern mit.
    let raf = 0;
    paperView.observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => reflowPaper());
    });
    paperView.observer.observe(sheet);
    status('');
    paintToolbar();
  }

  /** Größe des Blatts und Lage der Bausteine in Punkten (y ab Oberkante des Blatts). */
  function measurePaper() {
    const page = pages[0];
    const v = paperView;
    page.w = v.el.offsetWidth * PX_PT;
    page.h = v.el.offsetHeight * PX_PT;
    for (const svg of [page.svg, page.top]) svg.setAttribute('viewBox', `0 0 ${page.w} ${page.h}`);
    const r = v.el.getBoundingClientRect();
    const k = r.width ? page.w / r.width : 1;
    // Ausgeblendete Bausteine (z. B. Lösungen) haben keine Lage – an ihnen hängt nichts.
    v.blocks = [...v.el.querySelectorAll('[data-bid]')].filter((el) => el.getClientRects().length).map((el) => {
      const b = el.getBoundingClientRect();
      let depth = 0;
      for (let n = el.parentElement; n && n !== v.el; n = n.parentElement) if (n.dataset?.bid) depth++;
      return { bid: el.dataset.bid, path: el.dataset.bpath, el, top: (b.top - r.top) * k, bottom: (b.bottom - r.top) * k, left: (b.left - r.left) * k, depth };
    });
  }

  /** Lage neu messen, die Striche wandern mit ihren Bausteinen (nicht mitten in einer Geste). */
  function reflowPaper() {
    if (!paperView) return;
    if (pages[0]?.busy) { paperView.pending = true; return; }
    paperView.pending = false;
    const keep = toLayer();
    measurePaper();
    doc.pages = [{ items: fromLayer(keep) }];
    sizePage(pages[0]);
    drawItems(0);
    positionInsertMarks();
  }

  /** Baustein an der Höhe y: der innerste, der sie überdeckt – sonst der letzte darüber. */
  function blockAt(y) {
    const list = paperView?.blocks || [];
    let best = null;
    for (const b of list) if (y >= b.top && y <= b.bottom && (!best || b.depth >= best.depth)) best = b;
    if (best) return best;
    let above = null;
    for (const b of list) if (b.top <= y) above = b;
    return above || list[0] || null;
  }

  /** Baustein zu einem Schlüssel der Ebene; „p:…“ findet ihn auch, wenn er inzwischen eine feste ID hat. */
  function findBlock(bid) {
    const list = paperView?.blocks || [];
    if (!bid.startsWith('p:')) return list.find((b) => b.bid === bid) || null;
    // Am Pfad gespeichert: Hat der Baustein inzwischen seine alte Position als ID
    // (pos3, nach dem Einfügen davor), zählt die – sonst der Pfad.
    const path = bid.slice(2);
    const fixed = `pos${path.replace(/\./g, 'x')}`;
    return list.find((b) => b.bid === bid || b.bid === fixed) || list.find((b) => b.path === path && !b.bid.startsWith('pos')) || null;
  }

  /** Striche des Blatts → Ebene (je Baustein, y relativ zu seiner Oberkante). */
  function toLayer(items = doc.pages[0]?.items || []) {
    if (!paperView) return layer;
    const blocks = {};
    const slot = (bid, at) => (blocks[bid] = blocks[bid] || { items: [], at });
    // Eine Gruppe hängt als Ganzes am Baustein ihres ersten Elements – sie fällt nicht auseinander.
    const groupY = new Map();
    for (const it of items) if (it.group && !groupY.has(it.group)) groupY.set(it.group, anchorY(it));
    for (const it of items) {
      const b = blockAt(it.group ? groupY.get(it.group) : anchorY(it));
      if (b) slot(b.bid, b.top).items.push(moved(it, 0, -b.top));
      else slot('_', 0).items.push(it);
    }
    for (const [bid, k] of Object.entries(karoMap)) {
      const b = findBlock(bid);
      const entry = slot(b ? b.bid : bid, b ? b.top : 0);
      if (k.lines) entry.karoLines = k.lines;
      if (k.width) entry.karoWidth = k.width;
      if (k.pattern) entry.karoPattern = k.pattern;
    }
    return inserts.length ? { blocks, inserts } : { blocks };
  }

  /** Ebene → Striche des Blatts. Fehlt ein Baustein, bleiben seine Striche, wo sie zuletzt waren. */
  function fromLayer(src = layer) {
    const out = [];
    for (const [bid, entry] of Object.entries(src?.blocks || {})) {
      const top = bid === '_' ? 0 : findBlock(bid)?.top ?? entry.at ?? 0;
      for (const it of entry.items || []) out.push(moved(it, 0, top));
    }
    return out;
  }

  const BLOCK_PATTERNS = { karo: '▦ Karo', linien: '☰ Linien', leer: '▢ Leer', frei: '◌ Unsichtbar' };
  const FIELD_MIN_CM = 2;
  const FIELD_MAX_CM = 16.5;

  /** Maße eines Schreibfelds im Dokument (beim ersten Mal am Element abgelegt). */
  function fieldBase(karo) {
    if (!karo.dataset.base) {
      karo.dataset.base = String(Math.round(parseFloat(karo.style.height) / 0.5) || 4);
      karo.dataset.baseWidth = String(parseFloat(karo.style.width) || '');
      karo.dataset.basePattern = ['linien', 'leer', 'frei'].find((p) => karo.classList.contains(`ds-karo-${p}`)) || 'karo';
    }
    return { lines: Number(karo.dataset.base), width: Number(karo.dataset.baseWidth) || null, pattern: karo.dataset.basePattern };
  }

  const fieldOf = (el) => karoMap[el.dataset.bid] || karoMap[`p:${el.dataset.bpath}`] || {};

  /** Ein Schreibfeld zeichnen: Höhe mindestens wie im Dokument, Breite und Muster wie gewählt. */
  function paintField(karo, { lines, width, pattern }) {
    karo.style.height = `${lines * 0.5}cm`;
    if (width && width < FIELD_MAX_CM) karo.style.width = `${width}cm`; else karo.style.removeProperty('width');
    karo.classList.toggle('ds-karo-linien', pattern === 'linien');
    karo.classList.toggle('ds-karo-leer', pattern === 'leer');
    karo.classList.toggle('ds-karo-frei', pattern === 'frei');
    karo.querySelectorAll('.ink-karo-tools [data-pattern]').forEach((b) => b.classList.toggle('active', b.dataset.pattern === pattern));
  }

  /** Aktuelle Maße: Dokument, überschrieben von der Ebene. */
  function fieldNow(el, karo) {
    const base = fieldBase(karo);
    const own = fieldOf(el);
    const min = el.dataset.inserted ? 1 : base.lines;
    return {
      lines: Math.max(min, Math.min(KARO_MAX, own.lines || base.lines)),
      width: own.width || base.width,
      pattern: own.pattern || base.pattern,
    };
  }

  function applyKaro() {
    for (const el of paperView.el.querySelectorAll('[data-btype="karo"]')) {
      const karo = el.querySelector('.ds-karo');
      if (karo) paintField(karo, fieldNow(el, karo));
    }
  }

  /** Änderung eines Felds übernehmen – nur, was vom Dokument abweicht, steht in der Ebene. */
  function setField(el, karo, next, before) {
    // Lehrkraft: Größe und Muster gehören ins Dokument (der Gastgeber speichert es).
    if (paper.setField && !el.dataset.inserted) {
      const bid = el.dataset.bid;
      status('…');
      Promise.resolve(paper.setField(bid, { lines: next.lines, width: next.width && next.width < FIELD_MAX_CM ? next.width : null, pattern: next.pattern }))
        .then(() => { delete karoMap[bid]; delete karoMap[`p:${el.dataset.bpath}`]; return layoutPaper(); })
        .then(() => status('💾 Im Dokument gespeichert'))
        .catch((err) => status(`⚠️ ${err?.message || err}`));
      return;
    }
    const base = fieldBase(karo);
    const entry = {};
    if (next.lines !== base.lines) entry.lines = next.lines;
    // Breite: null = Satzbreite; 16,5 in der Ebene heißt „volle Breite“ (bei schmalerem Feld im Dokument).
    const norm = (w) => (w && w < FIELD_MAX_CM ? w : null);
    if (norm(next.width) !== norm(base.width)) entry.width = norm(next.width) || FIELD_MAX_CM;
    if (next.pattern !== base.pattern) entry.pattern = next.pattern;
    const old = JSON.stringify(fieldOf(el));
    if (old === JSON.stringify(entry)) return;
    state.undo.push(before);
    state.redo = [];
    delete karoMap[`p:${el.dataset.bpath}`];
    if (Object.keys(entry).length) karoMap[el.dataset.bid] = entry; else delete karoMap[el.dataset.bid];
    paintField(karo, fieldNow(el, karo));
    reflowPaper();
    changed();
  }

  /**
   * Anfasser am Schreibfeld: unten die Höhe (immer – auch beim Schreiben),
   * mit „Auswählen“ dazu rechts die Breite, an der Ecke beides, oben das Muster.
   */
  function addKaroHandles() {
    if (paper.karoResize === false) return;
    for (const el of paperView.el.querySelectorAll('[data-btype="karo"]')) {
      const karo = el.querySelector('.ds-karo');
      if (!karo || karo.querySelector('.ink-karo-handle')) continue;
      const handle = (cls, title) => {
        const h = document.createElement('div');
        h.className = `ink-karo-handle ${cls}`;
        h.title = title;
        h.innerHTML = '<span></span>';
        karo.appendChild(h);
        return h;
      };
      const drag = (h, { x, y }) => h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        h.setPointerCapture?.(e.pointerId);
        const before = stateJson();
        const base = fieldBase(karo);
        // Ins Dokument (Lehrkraft) bzw. selbst eingefügt: bis auf eine Zeile verkleinerbar.
        const minLines = paper.setField || el.dataset.inserted ? 1 : base.lines;
        const start = fieldNow(el, karo);
        const r0 = karo.getBoundingClientRect();
        const pxPerCm = r0.height / (start.lines * 0.5); // Bildschirmpixel je cm
        const next = { ...start };
        const move = (ev) => {
          if (y) next.lines = Math.max(minLines, Math.min(KARO_MAX, Math.round((ev.clientY - r0.top) / (pxPerCm / 2))));
          if (x) next.width = Math.max(FIELD_MIN_CM, Math.min(FIELD_MAX_CM, Math.round(((ev.clientX - r0.left) / pxPerCm) * 2) / 2));
          paintField(karo, next);
        };
        const up = () => {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          setField(el, karo, next, before);
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      });
      drag(handle('ink-karo-h', 'Feld länger oder kürzer ziehen'), { y: true });
      drag(handle('ink-karo-w', 'Feld breiter oder schmaler ziehen'), { x: true });
      drag(handle('ink-karo-c', 'Feld größer oder kleiner ziehen'), { x: true, y: true });
      const tools = document.createElement('div');
      tools.className = 'ink-karo-tools';
      tools.innerHTML = Object.entries(BLOCK_PATTERNS).map(([p, label]) => `<button type="button" data-pattern="${p}" title="${label.slice(2)}">${label.slice(0, 1)}</button>`).join('')
        + (el.dataset.inserted ? '<button type="button" data-remove="1" title="Eingefügtes Feld entfernen">✕</button>' : '');
      tools.addEventListener('pointerdown', (e) => e.stopPropagation());
      tools.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove]')) { removeInsert(el.dataset.bid); return; }
        const b = e.target.closest('[data-pattern]');
        if (b) setField(el, karo, { ...fieldNow(el, karo), pattern: b.dataset.pattern }, stateJson());
      });
      karo.appendChild(tools);
      paintField(karo, fieldNow(el, karo));
    }
  }

  // ---------- Einfügen zwischen Bausteinen (⊕ am Rand) ----------

  /** Selbst eingefügte Schreibfelder ins Blatt setzen – hinter ihren Baustein, sonst ans Ende. */
  function placeInserts(sheet) {
    const root = sheet.querySelector('.docspec') || sheet;
    for (const ins of inserts) {
      const box = document.createElement('div');
      box.className = 'ds-b';
      box.dataset.bid = ins.id;
      box.dataset.btype = 'karo';
      box.dataset.inserted = '1';
      const pattern = ['linien', 'leer', 'frei'].includes(ins.pattern) ? ` ds-karo-${ins.pattern}` : '';
      box.innerHTML = `<div class="ds-karo${pattern}" style="height:0.5cm" aria-hidden="true"></div>`;
      const after = ins.after ? sheet.querySelector(`[data-bid="${CSS.escape(ins.after)}"]`) : null;
      if (after) after.after(box);
      else if (ins.after === null) root.prepend(box);
      else root.appendChild(box);
    }
  }

  /** Bausteine der obersten Ebene (nicht in einem Kasten oder einer Lösung), von oben nach unten. */
  const topBlocks = () => (paperView?.blocks || []).filter((b) => b.depth === 0).sort((a, b) => a.top - b.top);

  /** Kleine ⊕ am linken Rand: vor dem ersten Baustein und hinter jedem. */
  function addInsertMarks() {
    if (paper.insert === false) return;
    paperView.el.querySelectorAll('.ink-insert-mark').forEach((m) => m.remove());
    const make = (after) => {
      const m = document.createElement('button');
      m.type = 'button';
      m.className = 'ink-insert-mark';
      m.title = 'Hier einfügen: Schreibfeld' + (paper.insertItems ? ', Quiz, PDF …' : '');
      m.setAttribute('aria-label', 'Hier einfügen');
      m.dataset.after = after ?? '';
      m.innerHTML = '<span>+</span>';
      m.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = m.getBoundingClientRect();
        showContextMenu(r.right + 4, r.top, insertEntries(after));
      });
      paperView.el.appendChild(m);
      return m;
    };
    make(null);
    for (const b of topBlocks()) make(b.bid);
    positionInsertMarks();
  }

  /** Lage der ⊕ zwischen den Bausteinen (CSS-Pixel des Blatts). */
  function positionInsertMarks() {
    if (!paperView) return;
    const blocks = topBlocks();
    const byBid = new Map(blocks.map((b, i) => [b.bid, i]));
    paperView.el.querySelectorAll('.ink-insert-mark').forEach((m) => {
      const after = m.dataset.after;
      let y;
      if (!after) y = blocks.length ? blocks[0].top - 4 : 40;
      else {
        const i = byBid.get(after);
        if (i === undefined) { m.hidden = true; return; }
        const next = blocks[i + 1];
        y = next ? (blocks[i].bottom + next.top) / 2 : blocks[i].bottom + 6;
      }
      m.hidden = false;
      m.style.top = `${y / PX_PT}px`;
    });
  }

  /** Einträge zum Einfügen hinter dem Baustein `after` (⊕ am Rand, Kontextmenü). */
  function insertEntries(after) {
    const field = (pattern, label) => ({ label, onClick: () => insertField(after, pattern) });
    const entries = [
      field('frei', '◌ Schreibfeld (unsichtbar, eine Zeile – ziehbar)'),
      field('karo', '▦ Karo'),
      field('linien', '☰ Linien'),
    ];
    for (const item of paper.insertItems?.() || []) {
      entries.push({ label: item.label, onClick: () => runInsert(() => item.run(after)) });
    }
    return entries;
  }

  async function runInsert(fn) {
    try {
      status('Wird eingefügt …');
      const done = await fn();
      if (done === false) { status(''); return; }
      await layoutPaper();
      status(paper.insertBlock ? '💾 Im Dokument gespeichert' : '');
    } catch (err) {
      status(`⚠️ ${err?.message || err}`);
    }
  }

  /** Schreibfeld einfügen: Lehrkraft ins Dokument (Gastgeber), sonst nur in die eigene Ebene. */
  function insertField(after, pattern) {
    if (paper.insertBlock) {
      runInsert(() => paper.insertBlock(after, { type: 'karo', lines: 1, ...(pattern !== 'karo' ? { pattern } : {}) }));
      return;
    }
    inserts = [...inserts, { id: `ins${uid()}`, after, pattern }];
    runInsert(async () => { changed(); });
  }

  function removeInsert(bid) {
    inserts = inserts.filter((i) => i.id !== bid);
    delete karoMap[bid];
    runInsert(async () => { changed(); });
  }

  async function drawBackground(p, bg) {
    const dpr = window.devicePixelRatio || 1;
    let scale = state.zoom * dpr;
    if (p.w * p.h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (p.w * p.h));
    const c = p.canvas;
    c.width = Math.round(p.w * scale);
    c.height = Math.round(p.h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (bg.pdf && p.i < bg.pdf.numPages) {
      const page = await bg.pdf.getPage(p.i + 1);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
      return;
    }
    if (bg.img && p.i === 0) { ctx.drawImage(bg.img, 0, 0, c.width, c.height); return; }
    const kind = bg.ruling || 'karo';
    ctx.strokeStyle = kind === 'karo' ? '#c7d2e0' : '#94a3b8';
    ctx.lineWidth = Math.max(1, 0.5 * scale);
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of ruling(kind, p.w, p.h)) { ctx.moveTo(x0 * scale, y0 * scale); ctx.lineTo(x1 * scale, y1 * scale); }
    ctx.stroke();
  }

  function fitZoom(pageW = pages[0]?.w || A4.w) {
    const room = scroller.clientWidth - 24;
    return Math.max(0.3, Math.min(2.5, room / pageW));
  }

  function setZoom(z) {
    const keep = scroller.scrollTop / (scroller.scrollHeight || 1);
    state.zoom = Math.max(0.3, Math.min(4, z));
    state.zoomSet = true;
    // Das Dokument nur vergrößern, nicht neu aufbauen – Eingaben in Quizzen bleiben.
    if (pages[0]?.paper) {
      sizePage(pages[0]);
      drawItems(0);
      placeRuler(true);
      scroller.scrollTop = keep * scroller.scrollHeight;
      return;
    }
    void layout().then(() => { scroller.scrollTop = keep * scroller.scrollHeight; });
  }

  // ---------- Geodreieck ----------
  const angleText = (r) => `${(360 - r.angle) % 360}°`;

  function renderRuler() {
    overlay.querySelectorAll('.ink-ruler').forEach((el) => el.remove());
    const r = doc.ruler;
    const p = r?.visible ? pages[r.page] : null;
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'ink-ruler';
    p.el.appendChild(el);
    // Mausrad dreht (1°, mit Umschalt 5°).
    el.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return; // Strg+Mausrad zoomt das Blatt
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      r.angle = snapAngle(r.angle + (e.deltaY > 0 ? step : -step), step);
      placeRuler();
      changed();
    }, { passive: false });
    placeRuler(true);
  }

  function placeRuler(redraw = false) {
    const r = doc.ruler;
    const el = overlay.querySelector('.ink-ruler');
    if (!r || !el) return;
    const z = state.zoom;
    if (redraw || Number(el.dataset.L) !== r.L) {
      el.innerHTML = rulerSvg(r.L, z, angleText(r));
      el.dataset.L = r.L;
    } else {
      const t = el.querySelector('.ir-angle');
      if (t) t.textContent = angleText(r);
    }
    Object.assign(el.style, {
      left: `${(r.cx - r.L / 2) * z}px`, top: `${(r.cy - r.L / 2) * z}px`,
      width: `${r.L * z}px`, height: `${(r.L / 2) * z}px`, transform: `rotate(${r.angle}deg)`,
    });
  }

  /** Griff unter dem Punkt (in Seitenkoordinaten), sonst null. */
  function rulerHandleAt(r, x, y) {
    const [lx, ly] = pageToRuler(r, x, y);
    const g = rulerHandles(r.L, state.zoom);
    for (const [name, h] of Object.entries(g)) if (Math.hypot(lx - h.x, ly - h.y) <= h.r * 1.4) return name;
    return null;
  }

  // Verschieben, Drehen, Vergrößern – mit einem oder zwei Fingern, Stift oder Maus.
  let rulerDrag = null; // { pointers: Map(id → [x, y]), mode, start }
  function rulerStart(e, x, y, handle) {
    const r = doc.ruler;
    if (!rulerDrag) rulerDrag = { pointers: new Map() };
    rulerDrag.pointers.set(e.pointerId, [x, y]);
    if (rulerDrag.pointers.size === 2) {
      const [a, b] = [...rulerDrag.pointers.values()];
      rulerDrag.mode = 'twist';
      rulerDrag.start = { a, b, angle: r.angle, cx: r.cx, cy: r.cy };
    } else {
      rulerDrag.mode = handle || 'move';
      rulerDrag.start = { x, y, cx: r.cx, cy: r.cy };
    }
  }
  function rulerMove(e, x, y) {
    const r = doc.ruler;
    rulerDrag.pointers.set(e.pointerId, [x, y]);
    const s = rulerDrag.start;
    if (rulerDrag.mode === 'move') {
      r.cx = s.cx + x - s.x;
      r.cy = s.cy + y - s.y;
    } else if (rulerDrag.mode === 'rotate') {
      // Der Griff liegt senkrecht über der Mitte: Winkel zur Mitte + 90°.
      const step = e.shiftKey ? 5 : 1;
      r.angle = snapAngle((Math.atan2(y - r.cy, x - r.cx) * 180) / Math.PI + 90, step);
    } else if (rulerDrag.mode === 'resize') {
      const [lx] = pageToRuler(r, x, y);
      const L = Math.round((2 * (lx + 1.35 * CM)) / CM) * CM; // ganze Zentimeter
      r.L = Math.max(RULER_MIN, Math.min(RULER_MAX, L));
    } else if (rulerDrag.mode === 'twist') {
      const [a, b] = [...rulerDrag.pointers.values()];
      const turn = (p, q) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
      r.angle = snapAngle(s.angle + turn(a, b) - turn(s.a, s.b), 1);
      r.cx = s.cx + (a[0] + b[0]) / 2 - (s.a[0] + s.b[0]) / 2;
      r.cy = s.cy + (a[1] + b[1]) / 2 - (s.a[1] + s.b[1]) / 2;
    }
    placeRuler();
  }
  function rulerEnd(e) {
    rulerDrag.pointers.delete(e.pointerId);
    if (!rulerDrag.pointers.size) { rulerDrag = null; changed(); return; }
    // Ein Finger bleibt liegen: mit ihm weiter verschieben.
    const [[, pos]] = [...rulerDrag.pointers.entries()];
    rulerDrag.mode = 'move';
    rulerDrag.start = { x: pos[0], y: pos[1], cx: doc.ruler.cx, cy: doc.ruler.cy };
  }

  // ---------- Zeichnen der Beschriftung ----------
  // SVG-Elemente kennen „hidden“ nicht zuverlässig – deshalb display.
  const showSvg = (el, on) => { if (on) el.removeAttribute('display'); else el.setAttribute('display', 'none'); };
  function drawItems(i) {
    const p = pages[i];
    if (!p) return;
    const items = doc.pages[i]?.items || [];
    const fields = p.svg.querySelector('.ink-fields');
    const shapeLayer = p.svg.querySelector('.ink-shapes');
    const marker = p.svg.querySelector('.ink-marker');
    const pen = p.svg.querySelector('.ink-pen');
    fields.innerHTML = '';
    shapeLayer.innerHTML = '';
    marker.innerHTML = '';
    pen.innerHTML = '';
    p.texts.innerHTML = '';
    for (const item of items) {
      if (item.type === 'stroke') (item.tool === 'marker' ? marker : pen).appendChild(itemSvg(item));
      else if (item.type === 'text') p.texts.appendChild(textBox(p, item));
      else if (item.type === 'field') fields.appendChild(fieldSvg(item));
      else if (item.type === 'shape') shapeLayer.appendChild(shapeSvg(item));
    }
    paintSelection();
  }

  function textBox(p, item) {
    const box = document.createElement('div');
    box.className = 'ink-text';
    box.dataset.id = item.id;
    // Bearbeitbar nur mit dem Text-Werkzeug (sonst pointer-events: none im CSS).
    box.contentEditable = 'true';
    box.spellcheck = false;
    box.style.left = `${(item.x / p.w) * 100}%`;
    box.style.top = `${(item.y / p.h) * 100}%`;
    box.style.color = item.color;
    box.style.fontSize = `calc(${item.size || TEXT_SIZE}px * var(--z))`;
    box.textContent = item.text || '';
    // Erster Klick auf ein Feld markiert seinen Text, weitere setzen die Schreibmarke.
    let fresh = false;
    box.addEventListener('pointerdown', (e) => {
      if (state.tool !== 'text') return;
      e.stopPropagation();
      fresh = document.activeElement !== box;
    });
    box.addEventListener('click', () => {
      if (!fresh || state.tool !== 'text' || !window.getSelection().isCollapsed) return; // gezogene Markierung bleibt
      fresh = false;
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    box.addEventListener('blur', () => {
      const text = box.innerText.replace(/\s+$/, '');
      const list = doc.pages[p.i].items;
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx < 0) return;
      if (text === (list[idx].text || '') && text) return;
      snapshot();
      if (!text) list.splice(idx, 1);
      else list[idx] = { ...list[idx], text, w: box.offsetWidth / state.zoom, h: box.offsetHeight / state.zoom };
      changed();
      drawItems(p.i);
    });
    return box;
  }

  // ---------- Auswahl ----------
  function clearSelection() {
    if (!state.selection) return;
    state.selection = null;
    paintSelection();
    paintToolbar();
  }

  function selectionBounds() {
    const sel = state.selection;
    if (!sel?.ids.size) return null;
    const items = doc.pages[sel.page].items.filter((x) => sel.ids.has(x.id));
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const it of items) { const b = bounds(it); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 };
  }

  function paintSelection() {
    for (const p of pages) {
      const box = p.svg.querySelector('.ink-sel-box');
      const b = state.selection?.page === p.i ? selectionBounds() : null;
      showSvg(box, !!b);
      if (b) for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h })) box.setAttribute(k, v);
      p.svg.querySelectorAll('[data-id]').forEach((el) => el.classList.toggle('ink-selected', !!state.selection?.ids.has(el.dataset.id) && state.selection.page === p.i));
      p.texts.querySelectorAll('[data-id]').forEach((el) => el.classList.toggle('ink-selected', !!state.selection?.ids.has(el.dataset.id) && state.selection.page === p.i));
      // Anfasser an beiden Enden gewählter Linien.
      const handles = p.el.querySelector('.ink-top .ink-handles');
      handles.innerHTML = '';
      for (const it of selectedLines(p.i)) {
        for (const [x, y] of it.points) handles.appendChild(svgEl('circle', { cx: x, cy: y, r: HANDLE / state.zoom, class: 'ink-handle' }));
      }
      const f = selectedField(p.i);
      if (f) for (const [x, y] of corners(f)) handles.appendChild(svgEl('circle', { cx: x, cy: y, r: HANDLE / state.zoom, class: 'ink-handle' }));
      // Form: Ecken (Größe), Dreh-Anfasser, bei Vieleck und Linie die Punkte einzeln.
      const s = selectedShape(p.i);
      if (s) {
        const r = HANDLE / state.zoom;
        const twoPoints = s.kind === 'line' || s.kind === 'arrow';
        if (!twoPoints) for (const [x, y] of shapeCorners(s)) handles.appendChild(svgEl('circle', { cx: x, cy: y, r, class: 'ink-handle' }));
        if (usesPoints(s)) for (const [x, y] of s.points) handles.appendChild(svgEl('rect', { x: x - r * 0.8, y: y - r * 0.8, width: r * 1.6, height: r * 1.6, class: 'ink-handle ink-vertex' }));
        const [rx, ry] = rotateHandle(s, ROT_GAP / state.zoom);
        const [cx, cy] = shapeCenter(s);
        const top = twoPoints ? [cx, cy] : rotateHandle(s, 0);
        handles.appendChild(svgEl('line', { x1: top[0], y1: top[1], x2: rx, y2: ry, class: 'ink-rot-line' }));
        handles.appendChild(svgEl('circle', { cx: rx, cy: ry, r, class: 'ink-handle ink-rot-handle' }));
      }
    }
  }

  // ---------- Leuchtstift: Spuren, die verblassen (nur Anzeige, nie im Stand) ----------
  const laserTrails = []; // { page, points: [[x, y, t]], el, done }
  let laserRaf = 0;
  function laserTick() {
    const now = performance.now();
    for (let i = laserTrails.length - 1; i >= 0; i--) {
      const tr = laserTrails[i];
      // Die Spur verblasst von ihrem Anfang her: alte Punkte fallen weg.
      while (tr.points.length > 1 && now - tr.points[0][2] > LASER_FADE) tr.points.shift();
      const gone = tr.done && (tr.points.length < 2 ? now - (tr.points[0]?.[2] ?? 0) > LASER_FADE : false);
      if (gone) { tr.el.remove(); laserTrails.splice(i, 1); continue; }
      const d = tr.points.length > 1 ? polyline(tr.points) : '';
      tr.el.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
    }
    laserRaf = laserTrails.length ? requestAnimationFrame(laserTick) : 0;
  }
  function laserStart(page, x, y) {
    const p = pages[page];
    const el = svgEl('g', { class: 'ink-laser-trail' });
    el.appendChild(svgEl('path', { class: 'ink-laser-glow', d: '' }));
    el.appendChild(svgEl('path', { class: 'ink-laser-core', d: '' }));
    p.svg.querySelector('.ink-laser').appendChild(el);
    const tr = { page, points: [[x, y, performance.now()]], el, done: false };
    laserTrails.push(tr);
    if (!laserRaf) laserRaf = requestAnimationFrame(laserTick);
    return tr;
  }
  /** Leuchtender Punkt unter dem Zeiger (auch ohne zu drücken). */
  function laserDot(page, at) {
    for (const p of pages) {
      let dot = p.svg.querySelector('.ink-laser-dot');
      if (p.i !== page || !at) { dot?.remove(); continue; }
      if (!dot) {
        dot = svgEl('circle', { class: 'ink-laser-dot', r: 6 });
        p.svg.querySelector('.ink-laser').appendChild(dot);
      }
      dot.setAttribute('cx', at[0]);
      dot.setAttribute('cy', at[1]);
      dot.setAttribute('r', String(6 / Math.max(0.5, state.zoom)));
    }
  }

  /** Die Form, wenn genau eine Form gewählt ist (dann mit Anfassern). */
  function selectedShape(page) {
    const sel = state.selection;
    if (!sel || sel.page !== page || sel.ids.size !== 1) return null;
    const it = (doc.pages[page]?.items || []).find((x) => sel.ids.has(x.id));
    return it?.type === 'shape' ? it : null;
  }

  /** Eigenschaften auf die gewählten Formen anwenden (ein Schritt zum Rückgängigmachen); true, wenn es welche gab. */
  function applyToShapes(patch, { undoStep = true } = {}) {
    const shapes = state.tool === 'select' ? selectedItems().filter((it) => it.type === 'shape') : [];
    if (!shapes.length) return false;
    if (undoStep) snapshot();
    const ids = new Set(shapes.map((it) => it.id));
    const sel = state.selection;
    doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => {
      if (!ids.has(it.id)) return it;
      const next = { ...it, ...patch };
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
      if ((next.kind === 'line' || next.kind === 'arrow')) delete next.fill;
      return next;
    });
    changed();
    drawItems(sel.page);
    return true;
  }

  /** Stil für eine neue Form aus den Einstellungen der Leiste. */
  function newShapeStyle(kind) {
    const style = { color: state.color, width: SHAPE_WIDTHS[state.widthIdx] };
    if (state.shapeDash !== 'solid') style.dash = state.shapeDash;
    if (state.shapeFill && kind !== 'line' && kind !== 'arrow') {
      style.fill = state.shapeFill;
      if (state.shapeOpacity !== 1) style.opacity = state.shapeOpacity;
    }
    if (kind === 'arrow') style.heads = 'end';
    return style;
  }

  /** Fertige Form ablegen und gleich wählen (Anfasser zum Nachziehen und Drehen). */
  function addShape(page, geom) {
    const item = { id: uid(), type: 'shape', ...geom, ...newShapeStyle(geom.kind) };
    snapshot();
    doc.pages[page].items.push(item);
    state.tool = 'select';
    state.selection = { page, ids: new Set([item.id]) };
    changed();
    drawItems(page);
    paintToolbar();
  }

  // Vieleck: Punkte nacheinander setzen (state.poly = { page, points, el }).
  function polygonPreview(pointer) {
    const poly = state.poly;
    const p = poly && pages[poly.page];
    if (!p) return;
    poly.el?.remove();
    const pts = pointer ? [...poly.points, pointer] : poly.points;
    poly.el = shapeSvg({ id: 'live', kind: pts.length > 2 ? 'polygon' : 'line', points: pts, ...newShapeStyle('polygon') });
    poly.el.classList.add('ink-shape-live');
    p.svg.querySelector('.ink-live').appendChild(poly.el);
  }
  function finishPolygon() {
    const poly = state.poly;
    if (!poly) return;
    state.poly = null;
    poly.el?.remove();
    if (poly.points.length >= 3) addShape(poly.page, { kind: 'polygon', points: poly.points });
  }
  function cancelPolygon() {
    state.poly?.el?.remove();
    state.poly = null;
    paintToolbar();
  }
  function polygonClick(page, x, y) {
    if (state.poly && state.poly.page !== page) finishPolygon();
    const reach = 8 / state.zoom;
    const now = Date.now();
    if (!state.poly) {
      state.poly = { page, points: [[x, y]], last: now };
      state.tool = 'shape';
    } else {
      const pts = state.poly.points;
      const [fx, fy] = pts[0];
      const [lx, ly] = pts[pts.length - 1];
      if (pts.length >= 3 && Math.hypot(x - fx, y - fy) <= reach) { finishPolygon(); return; }
      if (now - state.poly.last < 400 && Math.hypot(x - lx, y - ly) <= reach) { finishPolygon(); return; } // Doppelklick
      pts.push([x, y]);
      state.poly.last = now;
    }
    polygonPreview(null);
    paintToolbar();
  }

  /** Gewählte Elemente ganz nach vorn bzw. hinten (Reihenfolge der Seite). */
  function restack(front) {
    const sel = state.selection;
    if (!sel?.ids.size) return;
    snapshot();
    const items = doc.pages[sel.page].items;
    const chosen = items.filter((it) => sel.ids.has(it.id));
    const rest = items.filter((it) => !sel.ids.has(it.id));
    doc.pages[sel.page].items = front ? [...rest, ...chosen] : [...chosen, ...rest];
    changed();
    drawItems(sel.page);
  }

  /**
   * Text in einer Form schreiben: ein Eingabefeld über der Form (ungedreht, mittig);
   * beim Verlassen, mit Strg+Enter oder Esc übernommen. Leer heißt: kein Text.
   */
  function editShapeText(id) {
    const page = doc.pages.findIndex((pg) => (pg.items || []).some((it) => it.id === id));
    const p = pages[page];
    const s = page >= 0 ? doc.pages[page].items.find((it) => it.id === id) : null;
    if (!p || !s) return;
    state.tool = 'select';
    state.selection = { page, ids: new Set([id]) };
    paintSelection();
    paintToolbar();
    const svgRect = p.svg.getBoundingClientRect();
    const hostRect = p.el.getBoundingClientRect();
    const scale = svgRect.width / p.w;
    const b = shapeBox(s);
    const w = Math.max(b.w, 60);
    const h = Math.max(b.h, (s.textSize || SHAPE_TEXT_SIZE) * 2);
    const [cx, cy] = shapeCenter(s);
    const ta = document.createElement('textarea');
    ta.className = 'ink-shape-text-edit';
    ta.value = s.text || '';
    ta.placeholder = 'Text';
    Object.assign(ta.style, {
      left: `${svgRect.left - hostRect.left + (cx - w / 2) * scale}px`,
      top: `${svgRect.top - hostRect.top + (cy - h / 2) * scale}px`,
      width: `${w * scale}px`,
      height: `${h * scale}px`,
      fontSize: `${(s.textSize || SHAPE_TEXT_SIZE) * scale}px`,
      color: s.textColor || s.color || '#1e293b',
    });
    p.el.appendChild(ta);
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      const text = ta.value.replace(/\s+$/, '');
      ta.remove();
      if (!keep || text === (s.text || '')) return;
      snapshot();
      doc.pages[page].items = doc.pages[page].items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, text };
        if (!text) { delete next.text; delete next.textRot; }
        return next;
      });
      changed();
      drawItems(page);
      paintToolbar();
    };
    ta.addEventListener('blur', () => commit(true));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(true); }
    });
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    setTimeout(() => { ta.focus(); ta.select(); }, 0);
  }

  /** Die gewählte Form durch `fn(form)` ersetzen (ein Schritt zum Rückgängigmachen). */
  function replaceShape(fn) {
    const sel = state.selection;
    const s = sel && selectedShape(sel.page);
    if (!s) return;
    snapshot();
    doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => (it.id === s.id ? fn(it) : it));
    changed();
    drawItems(sel.page);
    paintToolbar();
  }

  /** Gewählte gerade Linien auf der Seite. */
  function selectedLines(page) {
    const sel = state.selection;
    if (!sel || sel.page !== page) return [];
    return (doc.pages[page]?.items || []).filter((it) => it.line && sel.ids.has(it.id));
  }

  /** Das Feld, wenn genau ein Feld gewählt ist (dann mit Anfassern an den Ecken). */
  function selectedField(page) {
    const sel = state.selection;
    if (!sel || sel.page !== page || sel.ids.size !== 1) return null;
    const it = (doc.pages[page]?.items || []).find((x) => sel.ids.has(x.id));
    return it?.type === 'field' ? it : null;
  }

  /** Anfasser unter dem Punkt: { id, idx } (Linie) bzw. { id, corner } (Feld) oder null. */
  function handleAt(page, x, y) {
    const reach = (HANDLE * 1.6) / state.zoom;
    const s = selectedShape(page);
    if (s) {
      const [rx, ry] = rotateHandle(s, ROT_GAP / state.zoom);
      if (Math.hypot(x - rx, y - ry) <= reach) return { id: s.id, rotate: true };
      if (usesPoints(s)) {
        const idx = s.points.findIndex(([px, py]) => Math.hypot(x - px, y - py) <= reach);
        if (idx >= 0) return { id: s.id, idx };
      }
      if (s.kind !== 'line' && s.kind !== 'arrow') {
        const corner = shapeCorners(s).findIndex(([cx, cy]) => Math.hypot(x - cx, y - cy) <= reach);
        if (corner >= 0) return { id: s.id, corner };
      }
    }
    const f = selectedField(page);
    if (f) {
      const corner = corners(f).findIndex(([cx, cy]) => Math.hypot(x - cx, y - cy) <= reach);
      if (corner >= 0) return { id: f.id, corner };
    }
    for (const it of selectedLines(page)) {
      for (let idx = 0; idx < it.points.length; idx++) {
        if (Math.hypot(x - it.points[idx][0], y - it.points[idx][1]) <= reach) return { id: it.id, idx };
      }
    }
    return null;
  }

  /** Strich zur geraden Linie: vom ersten bis zum letzten Punkt, mit mittlerem Druck. */
  function straighten(g) {
    const pts = g.item.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 8) return false; // ein Punkt bleibt ein Punkt
    const p = pts.reduce((a, q) => a + (q[2] ?? 0.5), 0) / pts.length;
    g.item.points = [[first[0], first[1], p], [last[0], last[1], p]];
    g.line = true;
    g.el?.setAttribute('d', g.item.tool === 'marker' ? polyline(g.item.points) : strokeOutline(g.item.points, g.item.width));
    return true;
  }

  function deleteSelection() {
    const sel = state.selection;
    if (!sel?.ids.size) return;
    snapshot();
    doc.pages[sel.page].items = doc.pages[sel.page].items.filter((x) => !sel.ids.has(x.id));
    state.selection = null;
    changed();
    drawItems(sel.page);
  }

  /**
   * Gewählte Striche und Textfelder als Bild (PNG, durchsichtig) in einen
   * Baustein des Dokuments: hinter den Baustein an ihrer Stelle, als Lösung
   * oder als Bild. Aus der Beschriftung verschwinden sie (Strg+Z holt sie zurück).
   */
  async function selectionToDocument(asSolution) {
    const items = selectedItems();
    const b = selectionBounds();
    if (!items.length || !b) return;
    const after = blockAt(b.y + 4)?.bid ?? null;
    const svg = inkSvgFor(items.map((it) => moved(it, -b.x, -b.y)), 0, b.w);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', String(b.w));
    svg.setAttribute('height', String(b.h));
    svg.removeAttribute('style');
    svg.querySelector('.ink-print-marker')?.setAttribute('opacity', '0.55'); // sonst aus dem CSS
    let png;
    try {
      png = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = 3; // scharf im Druck
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(b.w * scale));
          canvas.height = Math.max(1, Math.round(b.h * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Bild ließ sich nicht erzeugen.'));
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      });
    } catch (err) {
      status(`⚠️ ${err.message}`);
      return;
    }
    const image = { type: 'image', src: png, width: `${(b.w / CM).toFixed(2)}cm` };
    deleteSelection();
    runInsert(() => paper.insertBlock(after, asSolution ? { type: 'solution', blocks: [image] } : image));
  }

  // ---------- Kopieren, Einfügen, Gruppieren ----------
  function selectedItems() {
    const sel = state.selection;
    return sel?.ids.size ? (doc.pages[sel.page]?.items || []).filter((x) => sel.ids.has(x.id)) : [];
  }

  /** Dazu alle Elemente der Gruppen, zu denen die gewählten gehören. */
  function withGroups(page, ids) {
    const items = doc.pages[page]?.items || [];
    const groups = new Set(items.filter((it) => ids.has(it.id) && it.group).map((it) => it.group));
    return groups.size ? new Set(items.filter((it) => ids.has(it.id) || groups.has(it.group)).map((it) => it.id)) : ids;
  }

  /** Die Gruppe, wenn die Auswahl genau eine ganze Gruppe ist. */
  function groupOfSelection() {
    const items = selectedItems();
    const g = items[0]?.group;
    return g && items.every((it) => it.group === g) ? g : null;
  }

  function boundsOfItems(items) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const it of items) { const b = bounds(it); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Seite fürs Einfügen: die der Auswahl, sonst die, die gerade zu sehen ist. */
  function targetPage() {
    if (state.selection && pages[state.selection.page]) return state.selection.page;
    const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    return (pages.find((pg) => pg.el.getBoundingClientRect().bottom > mid) || pages[0])?.i ?? 0;
  }

  /** Sichtbarer Teil einer Seite in ihren Koordinaten. */
  function visibleRect(page) {
    const p = pages[page];
    const r = p.el.getBoundingClientRect();
    const v = scroller.getBoundingClientRect();
    const k = p.w / r.width;
    const x0 = Math.max(r.left, v.left); const y0 = Math.max(r.top, v.top);
    const x1 = Math.min(r.right, v.right); const y1 = Math.min(r.bottom, v.bottom);
    return { x: (x0 - r.left) * k, y: (y0 - r.top) * k, w: Math.max(0, x1 - x0) * k, h: Math.max(0, y1 - y0) * k };
  }

  function copySelection() {
    const items = selectedItems();
    if (!items.length) return false;
    clipboard = { items: structuredClone(items), pasted: 0 };
    status(`📋 ${items.length} kopiert`);
    paintToolbar();
    return true;
  }

  function cutSelection() {
    if (copySelection()) deleteSelection();
  }

  /**
   * Einfügen, leicht versetzt (bei jedem weiteren Mal ein Stück mehr) – oder
   * mitten ins Sichtfeld, wenn das Original gerade nicht zu sehen ist.
   * Gruppen bleiben Gruppen, mit neuer Kennung.
   */
  function paste(source = clipboard) {
    if (!source?.items.length || !pages.length) return;
    const page = targetPage();
    source.pasted = (source.pasted || 0) + 1;
    const b = boundsOfItems(source.items);
    const view = visibleRect(page);
    let dx = 14 * source.pasted;
    let dy = 14 * source.pasted;
    const visible = b.x + dx < view.x + view.w && b.x + b.w + dx > view.x && b.y + dy < view.y + view.h && b.y + b.h + dy > view.y;
    if (!visible) {
      dx = view.x + view.w / 2 - (b.x + b.w / 2);
      dy = view.y + view.h / 2 - (b.y + b.h / 2);
    }
    const groups = new Map();
    const fresh = source.items.map((it) => {
      const c = moved(structuredClone(it), dx, dy);
      c.id = uid();
      if (it.group) {
        if (!groups.has(it.group)) groups.set(it.group, uid());
        c.group = groups.get(it.group);
      }
      return c;
    });
    snapshot();
    doc.pages[page].items.push(...fresh);
    state.tool = 'select';
    state.selection = { page, ids: new Set(fresh.map((x) => x.id)) };
    changed();
    drawItems(page);
  }

  function duplicateSelection() {
    const items = selectedItems();
    if (items.length) paste({ items: structuredClone(items), pasted: 0 });
  }

  function groupSelection() {
    const sel = state.selection;
    if (selectedItems().length < 2 || groupOfSelection()) return;
    snapshot();
    const g = uid();
    doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => (sel.ids.has(it.id) ? { ...it, group: g } : it));
    changed();
    drawItems(sel.page);
    status('🔗 Gruppiert');
  }

  function ungroupSelection() {
    const sel = state.selection;
    if (!selectedItems().some((it) => it.group)) return;
    snapshot();
    doc.pages[sel.page].items = doc.pages[sel.page].items.map((it) => {
      if (!sel.ids.has(it.id) || !it.group) return it;
      const { group, ...rest } = it;
      return rest;
    });
    changed();
    drawItems(sel.page);
    status('Gruppe aufgehoben');
  }

  /** Textfeld zum Schreiben öffnen: Text-Werkzeug, Schreibmarke ans Ende. */
  function editText(id) {
    state.tool = 'text';
    clearSelection();
    paintToolbar();
    const box = overlay.querySelector(`.ink-text[data-id="${CSS.escape(id)}"]`);
    if (!box) return;
    box.focus();
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Menü der Auswahl – nur, was gerade geht. */
  function selectionMenu(x, y) {
    const items = selectedItems();
    const key = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg+';
    const entries = [];
    const texts = items.filter((it) => it.type === 'text');
    if (texts.length === 1) entries.push({ label: '✏️ Text bearbeiten', onClick: () => editText(texts[0].id) });
    if (items.length) {
      entries.push({ label: `Kopieren (${key}C)`, onClick: () => copySelection() });
      entries.push({ label: `Ausschneiden (${key}X)`, onClick: () => cutSelection() });
    }
    if (clipboard) entries.push({ label: `Einfügen (${key}V)`, onClick: () => paste() });
    // Lehrkraft am eigenen Dokument: Beschriftung als Baustein ins Dokument (z. B. aus .xopp übernommene Lösungen).
    if (items.length && paper?.insertBlock && doc.bg === 'paper') {
      entries.push({ label: '💡 Als Lösung ins Dokument', onClick: () => selectionToDocument(true) });
      entries.push({ label: '🖼 Als Bild ins Dokument', onClick: () => selectionToDocument(false) });
    }
    const shape = items.length === 1 && items[0].type === 'shape' ? items[0] : null;
    if (shape && isClosed(shape)) entries.push({ label: shape.text ? '✏️ Text in der Form bearbeiten' : '✏️ Text in die Form', onClick: () => editShapeText(shape.id) });
    if (shape && !usesPoints(shape)) entries.push({ label: '⬠ In Vieleck umwandeln (Punkte einzeln ziehen)', onClick: () => replaceShape(toPolygon) });
    if (shape && shape.rot) entries.push({ label: '↻ Drehung zurücksetzen', onClick: () => replaceShape((it) => ({ ...it, rot: 0 })) });
    if (shape?.kind === 'arrow') {
      entries.push(shape.heads === 'both'
        ? { label: '➝ Pfeilspitze nur am Ende', onClick: () => replaceShape((it) => ({ ...it, heads: 'end' })) }
        : { label: '⟷ Pfeilspitzen an beiden Enden', onClick: () => replaceShape((it) => ({ ...it, heads: 'both' })) });
    }
    if (items.length) {
      entries.push({ label: '⬆ Ganz nach vorn', onClick: () => restack(true) });
      entries.push({ label: '⬇ Ganz nach hinten', onClick: () => restack(false) });
    }
    if (items.length) {
      entries.push({ label: `Duplizieren (${key}D)`, onClick: () => duplicateSelection() });
      if (items.length > 1 && !groupOfSelection()) entries.push({ label: `Gruppieren (${key}G)`, onClick: () => groupSelection() });
      if (items.some((it) => it.group)) entries.push({ label: `Gruppierung aufheben (${key}⇧G)`, onClick: () => ungroupSelection() });
      entries.push({ label: 'Löschen (Entf)', danger: true, onClick: () => deleteSelection() });
    }
    if (entries.length) showContextMenu(x, y, entries);
  }

  // ---------- Eingabe ----------
  let penDown = false;

  function bindInput(p) {
    const toPage = (e) => {
      const r = p.svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * p.w, ((e.clientY - r.top) / r.height) * p.h];
    };
    let gesture = null;
    // Zeichnet der Finger, scrollen zwei Finger das Blatt (der begonnene Strich entfällt).
    const touches = new Map(); // pointerId → [clientX, clientY]
    let pan = null;            // { mid: [x, y] }
    const midOf = () => {
      const pts = [...touches.values()];
      return [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    };
    // Finger oder Stift ruht auf der Auswahl: ihr Menü (iPad kennt keinen Rechtsklick).
    const pressForMenu = (e) => {
      if (e.pointerType === 'mouse') return;
      const g = gesture;
      g.press = setTimeout(() => {
        if (gesture !== g || g.moved) return;
        gesture = null;
        p.busy = false;
        selectionMenu(e.clientX, e.clientY);
      }, PRESS_MS);
    };

    p.el.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('.ink-shape-text-edit')) return; // Schreiben in einer Form
      // Handballen: Solange der Stift schreibt, zählt kein Finger.
      if (e.pointerType === 'touch' && penDown) return;
      const onQuiz = p.paper && !!e.target.closest?.('.ds-quiz-live');
      // Ein Finger auf einem Quiz bedient es immer – zeichnen geht dort mit Stift oder Maus.
      if (onQuiz && e.pointerType === 'touch' && !touches.size) return;
      // Auswählen und Bedienen wechseln von selbst: Auf einem Quiz wird ausgefüllt,
      // daneben (oder auf einem Strich/Textfeld darüber) ausgewählt.
      if (p.paper && (state.tool === 'select' || state.tool === 'interact')) {
        const [qx, qy] = toPage(e);
        const inkHere = handleAt(p.i, qx, qy) || itemAt(doc.pages[p.i].items, qx, qy, 6 / state.zoom);
        const want = onQuiz && !inkHere ? 'interact' : 'select';
        if (state.tool !== want) {
          state.tool = want;
          if (want === 'interact') clearSelection();
          paintToolbar();
        }
      }
      // Im Dokument: Karo-Anfasser, „Bedienen“ und Textfelder (mit dem Text-
      // Werkzeug) gehen an das Blatt; alles andere fängt der Editor vorher ab.
      if (p.paper && (e.target.closest?.('.ink-karo-handle, .ink-karo-tools, .ink-insert-mark') || state.tool === 'interact'
        || (state.tool === 'text' && e.target.closest?.('.ink-text')))) return;
      if (e.pointerType === 'pen') penDown = true;
      // Rechte Taste, Stift-Seitentaste, Ctrl+Klick (Mac): Kontextmenü, nicht zeichnen.
      if ((e.button > 0 && e.button !== 5) || (e.buttons & 2) || (e.ctrlKey && e.pointerType === 'mouse')) return;
      if (e.pointerType === 'touch' && state.fingerDraws && !rulerDrag) {
        touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (pan) return;
        if (touches.size === 2) {
          if (gesture?.kind === 'stroke') { clearTimeout(gesture.hold); gesture.el.remove(); }
          if (gesture) clearTimeout(gesture.press);
          if (gesture?.kind === 'rect') showSvg(p.svg.querySelector('.ink-sel-rect'), false);
          gesture = null;
          p.busy = false;
          pan = { mid: midOf() };
          e.preventDefault();
          p.el.setPointerCapture?.(e.pointerId);
          return;
        }
      }
      const [x, y] = toPage(e);
      // Stift mit Radierer-Ende (Windows Ink / Wacom): radiert.
      const tool = e.button === 5 || (e.buttons & 32) ? 'eraser' : state.tool;
      const draws = e.pointerType !== 'touch' || state.fingerDraws;

      // Geodreieck: Griffe drehen/vergrößern; setzt der Stift an einer Kante
      // an, läuft der Strich genau an ihr entlang; sonst wird es verschoben.
      const ruler = doc.ruler?.visible && doc.ruler.page === p.i ? doc.ruler : null;
      let snap = null;
      // Im Auswahl-Modus gehen Anfasser und Striche vor – auch unter dem Geodreieck
      // (sonst käme man an Linien entlang seiner Kante nicht heran).
      const selectsHere = tool === 'select' && (handleAt(p.i, x, y) || itemAt(doc.pages[p.i].items, x, y, 6 / state.zoom));
      if (ruler && !selectsHere) {
        const inside = inRuler(ruler, x, y);
        const handle = inside ? rulerHandleAt(ruler, x, y) : null;
        if (!handle && draws && (tool === 'pen' || tool === 'marker')) snap = nearEdge(ruler, x, y, RULER_REACH / state.zoom);
        if (handle || (inside && !snap) || (rulerDrag && e.pointerType === 'touch' && inside)) {
          e.preventDefault();
          if (p.paper) e.stopPropagation();
          p.el.setPointerCapture?.(e.pointerId);
          rulerStart(e, x, y, handle);
          return;
        }
      }

      // Ohne „Mit Finger zeichnen“ scrollt der Finger (touch-action im CSS).
      if (!draws) return;
      e.preventDefault();
      // Im Dokument erreicht der Strich kein Quiz darunter (auch nicht dessen Ziehen).
      if (p.paper) e.stopPropagation();
      p.el.setPointerCapture?.(e.pointerId);

      if (tool === 'laser') {
        gesture = { kind: 'laser', id: e.pointerId, trail: laserStart(p.i, x, y) };
        laserDot(p.i, [x, y]);
      } else if (tool === 'pen' || tool === 'marker') {
        const marker = tool === 'marker';
        gesture = {
          kind: 'stroke', id: e.pointerId,
          item: { id: uid(), type: 'stroke', tool, color: marker ? state.marker : state.color, width: WIDTHS[tool][state.widthIdx], points: [] },
          snap,
        };
        const [sx, sy] = snap ? projectOnSegment(x, y, snap[0], snap[1]) : [x, y];
        gesture.item.points.push([sx, sy, pressureOf(e)]);
        gesture.el = itemSvg(gesture.item);
        p.svg.querySelector(marker ? '.ink-marker' : '.ink-live').appendChild(gesture.el);
        gesture.anchor = [e.clientX, e.clientY];
        holdTimer(gesture);
      } else if (tool === 'eraser') {
        gesture = { kind: 'erase', id: e.pointerId, removed: false };
        erase(p.i, x, y, gesture);
      } else if (tool === 'select') {
        const base = () => doc.pages[p.i].items.map((it) => ({ ...it }));
        const handle = handleAt(p.i, x, y);
        const b = state.selection?.page === p.i ? selectionBounds() : null;
        const hit = itemAt(doc.pages[p.i].items, x, y, 6 / state.zoom);
        if (handle) {
          gesture = { kind: 'handle', id: e.pointerId, item: handle.id, idx: handle.idx, corner: handle.corner, rotate: handle.rotate, base: base() };
          if (handle.rotate) {
            const s = doc.pages[p.i].items.find((it) => it.id === handle.id);
            const c = shapeCenter(s);
            gesture.center = c;
            gesture.a0 = Math.atan2(y - c[1], x - c[0]);
          }
        } else if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          gesture = { kind: 'move', id: e.pointerId, from: [x, y], base: base() };
          pressForMenu(e);
        } else if (hit) {
          // Antippen wählt das Element (eine Linie zeigt ihre Anfasser) – gleich weiterziehen verschiebt es.
          state.selection = { page: p.i, ids: withGroups(p.i, new Set([hit.id])) };
          paintSelection();
          paintToolbar();
          gesture = { kind: 'move', id: e.pointerId, from: [x, y], base: base() };
          pressForMenu(e);
        } else {
          clearSelection();
          gesture = { kind: 'rect', id: e.pointerId, from: [x, y] };
        }
      } else if (tool === 'field') {
        clearSelection();
        gesture = { kind: 'rect', id: e.pointerId, from: [x, y], field: true };
      } else if (tool === 'shape') {
        clearSelection();
        if (state.shapeKind === 'polygon') polygonClick(p.i, x, y);
        else gesture = { kind: 'shape', id: e.pointerId, from: [x, y] };
      } else if (tool === 'text') {
        snapshot();
        const size = state.textSize;
        const item = { id: uid(), type: 'text', x, y: y - size * 0.7, w: 160, h: size * 1.4, text: '', color: state.color, size };
        doc.pages[p.i].items.push(item);
        const box = textBox(p, item);
        p.texts.appendChild(box);
        setTimeout(() => box.focus(), 0);
        state.undo.pop(); // erst beim Schreiben zählt es (blur)
      }
      p.busy = !!gesture;
    }, { capture: !!p.paper });

    // Begonnene Geste verwerfen (etwa wenn mitten im Strich die rechte Taste dazukommt).
    const cancelGesture = () => {
      if (!gesture) return;
      clearTimeout(gesture.press);
      clearTimeout(gesture.hold);
      if (gesture.kind === 'stroke' || gesture.kind === 'shape') gesture.el?.remove();
      if (gesture.kind === 'laser') gesture.trail.done = true;
      if (gesture.kind === 'rect') showSvg(p.svg.querySelector('.ink-sel-rect'), false);
      gesture = null;
      p.busy = false;
    };

    const move = (e) => {
      if (gesture?.kind === 'stroke' && (e.buttons & 2)) { cancelGesture(); return; }
      if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (pan) {
        if (touches.size >= 2) {
          const mid = midOf();
          scroller.scrollBy(pan.mid[0] - mid[0], pan.mid[1] - mid[1]);
          pan.mid = mid;
        }
        return;
      }
      if (rulerDrag?.pointers.has(e.pointerId)) { const [x, y] = toPage(e); rulerMove(e, x, y); return; }
      if (!gesture && state.poly?.page === p.i) { polygonPreview(toPage(e)); return; }
      if (!gesture && state.tool === 'laser') { laserDot(p.i, toPage(e)); return; }
      if (!gesture || e.pointerId !== gesture.id) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (gesture.kind === 'stroke') {
        // Bewegt sich der Stift, beginnt das Warten aufs Stillhalten neu.
        if (Math.hypot(e.clientX - gesture.anchor[0], e.clientY - gesture.anchor[1]) > HOLD_SLACK) {
          gesture.anchor = [e.clientX, e.clientY];
          holdTimer(gesture);
        }
        if (gesture.line) {
          // Schon eine Linie: das Ende folgt dem Stift (am Geodreieck auf der Kante).
          let [x, y] = toPage(e);
          if (gesture.snap) [x, y] = projectOnSegment(x, y, gesture.snap[0], gesture.snap[1]);
          gesture.item.points[1] = [x, y, gesture.item.points[0][2]];
          gesture.el.setAttribute('d', gesture.item.tool === 'marker' ? polyline(gesture.item.points) : strokeOutline(gesture.item.points, gesture.item.width));
          return;
        }
        for (const ev of events.length ? events : [e]) {
          let [x, y] = toPage(ev);
          // Am Geodreieck: genau auf der Kante bleiben.
          if (gesture.snap) [x, y] = projectOnSegment(x, y, gesture.snap[0], gesture.snap[1]);
          const last = gesture.item.points[gesture.item.points.length - 1];
          if (Math.hypot(x - last[0], y - last[1]) < 0.4) continue;
          gesture.item.points.push([x, y, pressureOf(ev)]);
        }
        if (!gesture.raf) {
          gesture.raf = requestAnimationFrame(() => {
            gesture && gesture.el && gesture.el.setAttribute('d', gesture.item.tool === 'marker' ? polyline(gesture.item.points) : strokeOutline(gesture.item.points, gesture.item.width));
            if (gesture) gesture.raf = 0;
          });
        }
      } else if (gesture.kind === 'erase') {
        const [x, y] = toPage(e);
        erase(p.i, x, y, gesture);
      } else if (gesture.kind === 'rect') {
        const [x, y] = toPage(e);
        const r = p.svg.querySelector('.ink-sel-rect');
        showSvg(r, true);
        const [fx, fy] = gesture.from;
        for (const [k, v] of Object.entries({ x: Math.min(fx, x), y: Math.min(fy, y), width: Math.abs(x - fx), height: Math.abs(y - fy) })) r.setAttribute(k, v);
        gesture.to = [x, y];
      } else if (gesture.kind === 'laser') {
        const now = performance.now();
        for (const ev of events.length ? events : [e]) {
          const [x, y] = toPage(ev);
          gesture.trail.points.push([x, y, now]);
        }
        laserDot(p.i, toPage(e));
      } else if (gesture.kind === 'shape') {
        const geom = shapeFromDrag(state.shapeKind, gesture.from, toPage(e), e.shiftKey);
        gesture.geom = geom;
        gesture.el?.remove();
        gesture.el = shapeSvg({ id: 'live', ...geom, ...newShapeStyle(geom.kind) });
        gesture.el.classList.add('ink-shape-live');
        p.svg.querySelector('.ink-live').appendChild(gesture.el);
      } else if (gesture.kind === 'handle' && gesture.rotate) {
        const [x, y] = toPage(e);
        const [cx, cy] = gesture.center;
        const delta = ((Math.atan2(y - cy, x - cx) - gesture.a0) * 180) / Math.PI;
        doc.pages[p.i].items = gesture.base.map((it) => {
          if (it.id !== gesture.item) return it;
          if (usesPoints(it)) return rotatedShape(it, normalizedAngle(delta, 3));
          return { ...it, rot: normalizedAngle((it.rot || 0) + delta, 3) }; // nahe 0°, 15°, 30° … rastet es ein
        });
        gesture.moved = true;
        drawItems(p.i);
      } else if (gesture.kind === 'handle') {
        let [x, y] = toPage(e);
        // Am Geodreieck rastet das Ende auf der Kante ein.
        const ruler = doc.ruler?.visible && doc.ruler.page === p.i ? doc.ruler : null;
        const edge = ruler ? nearEdge(ruler, x, y, RULER_REACH / state.zoom) : null;
        if (edge) [x, y] = projectOnSegment(x, y, edge[0], edge[1]);
        doc.pages[p.i].items = gesture.base.map((it) => {
          if (it.id !== gesture.item) return it;
          if (it.type === 'shape' && gesture.corner !== undefined) return resizedShape(it, gesture.corner, x, y, 4 / state.zoom);
          if (gesture.corner !== undefined) return resizedBox(it, gesture.corner, x, y);
          const points = it.points.map((q) => q.slice());
          points[gesture.idx] = [x, y, points[gesture.idx][2]];
          return { ...it, points };
        });
        gesture.moved = true;
        drawItems(p.i);
      } else if (gesture.kind === 'move') {
        const [x, y] = toPage(e);
        const dx = x - gesture.from[0];
        const dy = y - gesture.from[1];
        if (Math.hypot(dx, dy) * state.zoom > HOLD_SLACK) clearTimeout(gesture.press);
        doc.pages[p.i].items = gesture.base.map((it) => (state.selection.ids.has(it.id) ? moved(it, dx, dy) : it));
        gesture.moved = true;
        drawItems(p.i);
      }
    };

    const up = (e) => {
      if (e.pointerType === 'pen') penDown = false;
      touches.delete(e.pointerId);
      if (pan) {
        if (touches.size < 2) pan.mid = touches.size ? [...touches.values()][0] : pan.mid;
        if (!touches.size) pan = null;
        return;
      }
      if (rulerDrag?.pointers.has(e.pointerId)) { rulerEnd(e); return; }
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      p.busy = false;
      clearTimeout(g.press);
      if (g.raf) cancelAnimationFrame(g.raf);
      // Den Klick, den der Browser nach dem Strich schickt, bekommt kein Quiz.
      if (p.paper) swallowClick(p.el);
      if (g.kind === 'stroke') {
        clearTimeout(g.hold);
        g.el.remove();
        // Am Geodreieck gezogen: eine Linie zwischen den äußersten Punkten.
        if (g.snap && !g.line && g.item.points.length > 1) {
          const [lo, hi] = extremesAlong(g.item.points, g.snap[0], g.snap[1]);
          if (Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) >= 2) { g.item.points = [lo, hi]; g.line = true; }
        }
        if (g.line) g.item.line = true;
        snapshot();
        doc.pages[p.i].items.push(g.item);
        changed();
        drawItems(p.i);
      } else if (g.kind === 'laser') {
        g.trail.done = true; // verblasst von selbst (laserTick)
      } else if (g.kind === 'shape') {
        g.el?.remove();
        const geom = g.geom;
        const big = geom && (geom.points
          ? Math.hypot(geom.points[1][0] - geom.points[0][0], geom.points[1][1] - geom.points[0][1]) >= 4
          : geom.w >= 4 && geom.h >= 4);
        if (big) addShape(p.i, geom);
      } else if (g.kind === 'erase') {
        if (g.removed) changed();
      } else if (g.kind === 'rect' && g.field) {
        showSvg(p.svg.querySelector('.ink-sel-rect'), false);
        const [fx, fy] = g.from;
        const [tx, ty] = g.to || g.from;
        if (Math.abs(tx - fx) >= 6 && Math.abs(ty - fy) >= 6) {
          const item = { id: uid(), type: 'field', x: Math.min(fx, tx), y: Math.min(fy, ty), w: Math.abs(tx - fx), h: Math.abs(ty - fy), pattern: state.fieldPattern };
          snapshot();
          doc.pages[p.i].items.push(item);
          // Gleich gewählt: Ecken zum Nachziehen, Muster änderbar.
          state.tool = 'select';
          state.selection = { page: p.i, ids: new Set([item.id]) };
          changed();
          drawItems(p.i);
        }
      } else if (g.kind === 'rect') {
        showSvg(p.svg.querySelector('.ink-sel-rect'), false);
        if (g.to) {
          const rect = { x: g.from[0], y: g.from[1], w: g.to[0] - g.from[0], h: g.to[1] - g.from[1] };
          const ids = withGroups(p.i, new Set(doc.pages[p.i].items.filter((it) => inSelection(it, rect)).map((it) => it.id)));
          state.selection = ids.size ? { page: p.i, ids } : null;
          paintSelection();
          paintToolbar();
        }
      } else if ((g.kind === 'move' || g.kind === 'handle') && g.moved) {
        state.undo.push(stateJson(p.i, g.base));
        state.redo = [];
        changed();
      }
      if (paperView?.pending) reflowPaper();
    };
    p.el.addEventListener('pointermove', move);
    p.el.addEventListener('pointerup', up);
    p.el.addEventListener('pointercancel', up);
    p.el.addEventListener('pointerleave', () => { if (state.tool === 'laser') laserDot(-1, null); });
    // Doppelklick auf ein Textfeld beim Auswählen: gleich weiterschreiben.
    p.el.addEventListener('dblclick', (e) => {
      if (state.tool !== 'select') return;
      const [x, y] = toPage(e);
      const hit = itemAt(doc.pages[p.i].items, x, y, 6 / state.zoom);
      if (hit?.type === 'text') { e.preventDefault(); editText(hit.id); }
      else if (hit?.type === 'shape' && isClosed(hit)) { e.preventDefault(); editShapeText(hit.id); }
    });
    // Rechtsklick (auch Ctrl+Klick am Mac) – in jedem Werkzeug ein Menü, nie ein Strich:
    // auf einem Strich oder Textfeld das Menü der Auswahl, sonst Werkzeuge, Rückgängig, Einfügen.
    p.el.addEventListener('contextmenu', (e) => {
      // In einem Quiz oder Textfeld bleibt das Menü des Browsers (Kopieren, Rechtschreibung).
      if (e.target.closest?.('.ds-quiz-live input, .ds-quiz-live textarea, .ink-text[contenteditable="true"]:focus')) return;
      e.preventDefault();
      cancelGesture();
      const [x, y] = toPage(e);
      const hit = itemAt(doc.pages[p.i].items, x, y, 6 / state.zoom);
      const selected = state.selection?.page === p.i && state.selection.ids.size;
      if (hit || (selected && state.tool === 'select')) {
        if (hit && !(state.selection?.page === p.i && state.selection.ids.has(hit.id))) {
          state.selection = { page: p.i, ids: withGroups(p.i, new Set([hit.id])) };
        }
        state.tool = 'select';
        paintSelection();
        paintToolbar();
        selectionMenu(e.clientX, e.clientY);
        return;
      }
      const tool = (name, label) => ({ label: `${state.tool === name ? '✓ ' : ''}${label}`, onClick: () => { state.tool = name; clearSelection(); paintToolbar(); } });
      const key = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg+';
      const entries = [
        tool('pen', '✏️ Stift'), tool('marker', '🖍 Textmarker'), tool('eraser', '🧽 Radierer'),
        tool('text', 'T Textfeld'), tool('select', '⬚ Auswählen'),
      ];
      if (state.undo.length) entries.push({ label: `↶ Rückgängig (${key}Z)`, onClick: () => history(state.undo, state.redo) });
      if (state.redo.length) entries.push({ label: '↷ Wiederholen', onClick: () => history(state.redo, state.undo) });
      if (clipboard) entries.push({ label: `Einfügen (${key}V)`, onClick: () => paste() });
      // Im Dokument: hinter dem Baustein an dieser Stelle einfügen (wie das ⊕ am Rand).
      if (p.paper && paper.insert !== false) {
        const above = [...topBlocks()].reverse().find((b) => b.top <= y);
        for (const it of insertEntries(above ? above.bid : null)) entries.push({ ...it, label: `➕ ${it.label}` });
      }
      showContextMenu(e.clientX, e.clientY, entries);
    });
  }

  // ---------- Kopfzeile der Vorlage (Vorschau) ----------
  //
  // Der Renderer setzt ein Blatt ohne Inhalt mit der Vorlage dieses Dokuments
  // (paper.headerPdf); von Seite 1 bleibt der Streifen bis zum Ende der
  // Kopfzeile. Er steht oben auf dem Blatt wie im Druck – nur zur Ansicht.
  // Die Striche hängen an den Bausteinen und rücken mit.

  // Ein/aus: Einstellung des Gastgebers (Konto der Lehrkraft), sonst dieses Gerät.
  let headOn = false;
  if (paper?.head) headOn = !!paper.head.get();
  else try { headOn = localStorage.getItem('lm_ink_head') === '1'; } catch (_) { /* aus */ }
  let headCache = null;
  $('.ink-head')?.classList.toggle('active', headOn);

  /** Streifen der Kopfzeile: { src, cm } – Höhe in cm ab der Blattkante. */
  async function headStrip() {
    if (headCache) return headCache;
    const pdf = await openPdf(await paper.headerPdf());
    const page = await pdf.getPage(1);
    const scale = 2;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // Von oben: erste Zeile mit Inhalt, dann bis zur ersten Lücke von 1 cm (danach käme nur noch die Fußzeile).
    const pxPerCm = canvas.height / (vp.height / scale / 72 * 2.54);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const inked = (y) => {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) return true;
      }
      return false;
    };
    let y = 0;
    while (y < canvas.height && !inked(y)) y++;
    let last = y;
    for (; y < canvas.height && y - last < pxPerCm; y++) if (inked(y)) last = y;
    if (last <= 0) throw new Error('Die Vorlage hat keine Kopfzeile.');
    const cut = Math.min(canvas.height, last + Math.round(pxPerCm * 0.3));
    const strip = document.createElement('canvas');
    strip.width = canvas.width;
    strip.height = cut;
    strip.getContext('2d').drawImage(canvas, 0, 0);
    headCache = { src: strip.toDataURL('image/png'), cm: cut / pxPerCm };
    return headCache;
  }

  /** Streifen oben ins Blatt setzen – über den oberen Rand, so breit wie das Papier. */
  function placeHead(sheet, strip) {
    const css = getComputedStyle(sheet);
    const box = document.createElement('div');
    box.className = 'ink-template-head';
    box.style.margin = `-${css.paddingTop} -${css.paddingRight} 0 -${css.paddingLeft}`;
    box.innerHTML = `<img src="${strip.src}" alt="Kopfzeile der Vorlage" style="display:block;width:100%;height:${strip.cm}cm">`;
    sheet.prepend(box);
  }

  // ---------- Drucken über den Renderer (PDF mit Vorlage) ----------
  //
  // Der Gastgeber (paper.printPdf) baut daraus mit ink-print.js das Dokument
  // für den Renderer: Felder aus der Ebene, eingefügte Felder, und je Baustein
  // die Beschriftung als SVG (x ab dem Satzspiegel, y ab dem Baustein).

  /** Was der Renderer vom Stand des Blatts wissen muss (siehe ink-print.js). */
  function printData(withInk) {
    const layerNow = toLayer();
    measurePaper();
    const padLeft = parseFloat(getComputedStyle(paperView.el).paddingLeft) * PX_PT;
    const insertIds = new Set(inserts.map((i) => i.id));
    const pathOf = (bid) => findBlock(bid)?.path ?? (bid.startsWith('p:') ? bid.slice(2) : null);
    const overlays = [];
    let loose = 0;
    if (withInk) {
      for (const [bid, entry] of Object.entries(layerNow.blocks || {})) {
        const box = inkSvgBox(entry.items || []);
        if (!box) continue;
        const o = { svg: box.svg, x: box.x - padLeft, y: box.y, w: box.w, h: box.h };
        if (insertIds.has(bid)) o.insert = bid;
        else if (bid !== '_' && pathOf(bid) != null) o.path = pathOf(bid);
        else { loose += (entry.items || []).length; continue; }
        overlays.push(o);
      }
    }
    const karo = Object.entries(karoMap).filter(([bid]) => !insertIds.has(bid))
      .map(([bid, k]) => ({ path: pathOf(bid), ...k })).filter((k) => k.path != null);
    const ins = inserts.map((i) => ({
      id: i.id, pattern: i.pattern, ...karoMap[i.id],
      after: i.after == null ? null : pathOf(i.after) ?? 'end',
    }));
    return { data: { overlays, karo, inserts: ins }, loose };
  }

  async function printViaRenderer({ solutions: withSolutions, ink }) {
    // Fenster sofort öffnen – nach dem await ließe der Popup-Blocker es nicht mehr zu.
    const win = window.open('', '_blank');
    status('PDF wird erzeugt …');
    try {
      await persist();
      const { data, loose } = printData(ink);
      const warnings = (await paper.printPdf(data, { solutions: withSolutions, win })) || [];
      if (loose) warnings.push(`${loose} Strich${loose === 1 ? '' : 'e'} außerhalb der Bausteine fehlen im PDF.`);
      status(warnings.length ? `PDF erzeugt – ${warnings.join(' · ')}` : 'PDF erzeugt');
    } catch (err) {
      win?.close();
      status(`PDF nicht erzeugt: ${err.message}`);
    }
  }

  // ---------- Drucken (PDF über den Druckdialog des Browsers) ----------
  //
  // Gedruckt wird eine Kopie des Blatts: Seitenränder wie die Schulvorlage
  // auf jeder Seite (@page), die Beschriftung je Baustein als eigene
  // Vektorgrafik in ihm – so wandert sie beim Seitenumbruch mit ihm.

  /**
   * Beschriftung eines Bausteins als SVG (Ursprung: linker Blattrand, Oberkante
   * des Bausteins), bis zur rechten Papierkante. Der rechte Rand ist im Druck
   * Innenabstand des Blatts, nicht Seitenrand (@page) – sonst verkleinerte der
   * Browser die ganze Seite, sobald etwas in den Rand reicht.
   */
  async function printPaper({ solutions: withSolutions, ink }) {
    if (!paperView) return;
    // Eine Kopie vom letzten Mal (falls der Browser kein afterprint meldete) zuerst weg.
    document.querySelectorAll('.ink-print-sheet, style[data-ink-print]').forEach((el) => el.remove());
    await persist();
    const layerNow = toLayer();
    measurePaper();
    const page = pages[0];
    const css = getComputedStyle(paperView.el);
    const padLeft = parseFloat(css.paddingLeft) * PX_PT;
    const copy = paperView.el.cloneNode(true);
    copy.querySelectorAll('.ink-karo-handle, .ink-karo-tools, .ink-insert-mark').forEach((el) => el.remove());
    copy.querySelector('.docspec')?.classList.toggle('ds-hide-solutions', !withSolutions);
    if (ink) {
      for (const [bid, entry] of Object.entries(layerNow.blocks || {})) {
        const items = entry.items || [];
        if (!items.length) continue;
        const geo = bid === '_' ? null : findBlock(bid);
        const host = geo ? copy.querySelector(`[data-bid="${CSS.escape(geo.bid)}"]`) : null;
        if (host) host.appendChild(inkSvgFor(items, geo.left, page.w));
        else {
          // Ohne Baustein: am Blatt selbst, wo die Striche zuletzt waren.
          const at = bid === '_' ? 0 : entry.at || 0;
          const svg = inkSvgFor(items.map((it) => moved(it, 0, at)), padLeft, page.w);
          svg.classList.add('ink-print-free');
          copy.prepend(svg);
        }
      }
    }
    const box = document.createElement('div');
    box.className = 'ink-print-sheet';
    box.appendChild(copy);
    // Seitenformat und Ränder wie das Blatt (paper.css); quer bei landscape.
    const style = document.createElement('style');
    style.dataset.inkPrint = '1';
    style.textContent = `@page { size: A4 ${paper.landscape ? 'landscape' : 'portrait'}; margin: 1.27cm 0 1cm 2.5cm; }`;
    document.head.appendChild(style);
    document.body.appendChild(box);
    document.body.classList.add('ink-printing');
    const done = () => {
      window.removeEventListener('afterprint', done);
      box.remove();
      style.remove();
      document.body.classList.remove('ink-printing');
    };
    window.addEventListener('afterprint', done);
    // Bilder und Schriften fertig, dann drucken (der Dialog blockiert bis zum Schließen).
    await Promise.all([...box.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    try { await document.fonts?.ready; } catch (_) { /* ohne */ }
    window.print();
  }

  /** Höchstens ein Klick auf dem Blatt, gleich nach dem Strich – nie einer auf die Leiste. */
  function swallowClick(el) {
    const done = () => {
      el.removeEventListener('click', stop, true);
      el.removeEventListener('pointerdown', done, true);
    };
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); done(); };
    el.addEventListener('click', stop, true);
    el.addEventListener('pointerdown', done, true);
    setTimeout(done, 400);
  }

  /** Nach HOLD_MS ohne Bewegung wird der Strich zur Linie (nicht am Geodreieck – da ist er schon gerade). */
  function holdTimer(g) {
    clearTimeout(g.hold);
    if (g.line || g.snap) return;
    g.hold = setTimeout(() => straighten(g), HOLD_MS);
  }

  function pressureOf(e) {
    // Maus und manche Finger melden 0 oder 0,5 – dann gleichmäßig mittel.
    return e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
  }

  /** Striche unter dem Radierer löschen – ein Wisch ist ein Schritt fürs Rückgängigmachen. */
  function erase(page, x, y, g) {
    const list = doc.pages[page]?.items || [];
    // Auf dem Bildschirm gleich groß, egal wie weit hineingezoomt ist.
    const radius = ERASER / Math.max(0.6, state.zoom);
    const keep = list.filter((it) => !((it.type === 'stroke' && hitsStroke(it, x, y, radius)) || (it.type === 'shape' && itemAt([it], x, y, radius))));
    if (keep.length === list.length) return;
    if (!g.removed) snapshot();
    g.removed = true;
    doc.pages[page].items = keep;
    drawItems(page);
  }

  // ---------- Tastatur und Schließen ----------
  const onKey = (e) => {
    // Tippen in Textfeldern und Quizzen (Dokument) bleibt Tippen.
    const t = e.target;
    if (t.closest?.('.ink-text') || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const sel = !!state.selection?.ids.size;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSelection(); }
    else if (e.key === 'Escape' && state.poly) cancelPolygon();
    else if (e.key === 'Enter' && state.poly) { e.preventDefault(); finishPolygon(); }
    else if (e.key === 'Escape') clearSelection();
    else if (mod && k === 'z') { e.preventDefault(); history(e.shiftKey ? state.redo : state.undo, e.shiftKey ? state.undo : state.redo); }
    else if (mod && k === 'c' && sel) { e.preventDefault(); copySelection(); }
    else if (mod && k === 'x' && sel) { e.preventDefault(); cutSelection(); }
    else if (mod && k === 'v' && clipboard) { e.preventDefault(); paste(); }
    else if (mod && k === 'd' && sel) { e.preventDefault(); duplicateSelection(); }
    else if (mod && k === 'g' && sel) { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); }
  };
  document.addEventListener('keydown', onKey);
  // Die Leiste bleibt oben: Der Browser darf die Seite nicht zoomen (iPad:
  // Zwei-Finger-Geste in Safari; Trackpad bzw. Strg+Mausrad am Rechner).
  // Strg+Mausrad zoomt stattdessen das Blatt.
  const noZoom = (e) => e.preventDefault();
  document.addEventListener('gesturestart', noZoom, { passive: false });
  document.addEventListener('gesturechange', noZoom, { passive: false });
  let wheelZoom = 1;
  let wheelTimer = null;
  const onWheel = (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    wheelZoom *= Math.exp(-e.deltaY / 300);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { const f = wheelZoom; wheelZoom = 1; setZoom(state.zoom * f); }, 120);
  };
  overlay.addEventListener('wheel', onWheel, { passive: false });

  async function close() {
    if (document.activeElement?.classList?.contains('ink-text')) document.activeElement.blur();
    await persist();
    leavePaper();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('gesturestart', noZoom);
    document.removeEventListener('gesturechange', noZoom);
    for (const v of Object.values(pdfs)) Promise.resolve(v).then((d) => d?.destroy?.()).catch(() => {});
    overlay.remove();
    document.body.classList.remove('ink-open');
    onClose?.();
  }

  // Knöpfe des Gastgebers: erst speichern; `close` schließt den Editor (z. B. Weiter im Durchlauf).
  overlay.querySelectorAll('.ink-action').forEach((b) => b.addEventListener('click', async () => {
    await persist();
    await actions[Number(b.dataset.action)].onClick({ close });
  }));
  paintToolbar();
  await layout();
  return { close, persist };
}
