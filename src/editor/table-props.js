// ==================== TABELLENEIGENSCHAFTEN ====================
//
// Dialog (Tabelle, Umrandung, Zellen) und was er braucht, gemeinsam für LearningModules (table-tools.js)
// und den lm-editor. Alles ändert nur das HTML der Tabelle; docspec-html.js liest es zurück.

import { CELL_BACKGROUNDS, LINE_COLORS } from '../doc/docspec.js';

export const LINE_COLOR_NAMES = [['', 'schwarz'], ['grau', 'grau'], ['blau', 'blau'], ['gruen', 'grün'], ['orange', 'orange'], ['lila', 'lila']];
export const BG_NAMES = [['', 'keine'], ['grau', '⬜ grau'], ['gelb', '🟨 gelb'], ['gruen', '🟩 grün'], ['blau', '🟦 blau'], ['rosa', '🩷 rosa']];
// Linien der Tabelle (lineWidth in pt, lineStyle) – „0“ heißt ohne Linien (border: false).
export const LINE_WIDTHS = [['0', 'ohne'], ['0.5', '0,5 pt'], ['', 'normal'], ['1', '1 pt'], ['1.5', '1,5 pt'], ['2.25', '2,25 pt']];
export const LINE_STYLES = [['', '━ durchgezogen'], ['dashed', '┅ gestrichelt'], ['dotted', '┈ gepunktet']];

export const rowsOf = (table) => [...table.children].flatMap((c) => (c.tagName === 'TR' ? [c]
  : ['THEAD', 'TBODY', 'TFOOT'].includes(c.tagName) ? [...c.children].filter((r) => r.tagName === 'TR') : []));
export const cellsOf = (tr) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
export const spanOf = (td, name) => Math.max(1, Number(td.getAttribute(name)) || 1);

/** Raster: map[r][c] = Zelle, die diese Stelle belegt; start = Zeile/Spalte jeder Zelle. */
export function grid(table) {
  const rows = rowsOf(table);
  const map = rows.map(() => []);
  const start = new Map();
  rows.forEach((tr, r) => {
    let c = 0;
    for (const td of cellsOf(tr)) {
      while (map[r][c]) c++;
      start.set(td, { r, c });
      for (let dr = 0; dr < spanOf(td, 'rowspan'); dr++) {
        for (let dc = 0; dc < spanOf(td, 'colspan'); dc++) {
          if (!map[r + dr]) map[r + dr] = [];
          map[r + dr][c + dc] = td;
        }
      }
      c += spanOf(td, 'colspan');
    }
  });
  const cols = Math.max(1, ...map.map((r) => r.length));
  return { rows, map, start, cols };
}

/** Linien einer Tabelle im Editor setzen (wie docspec-html.js sie liest). */
export function setLines(table, { width, style, color }) {
  if (width !== undefined) {
    table.classList.toggle('ws-table-plain', width === '0');
    if (width && width !== '0') table.dataset.lineWidth = width; else delete table.dataset.lineWidth;
  }
  if (style !== undefined) {
    if (style) table.dataset.lineStyle = style; else delete table.dataset.lineStyle;
  }
  if (color !== undefined) {
    if (LINE_COLORS[color]) table.dataset.lineColor = color; else delete table.dataset.lineColor;
  }
  const w = table.dataset.lineWidth;
  const st = table.dataset.lineStyle;
  const c = table.dataset.lineColor;
  if (w || st || c) {
    table.style.setProperty('--ds-line-w', `${w || 0.75}pt`);
    table.style.setProperty('--ds-line-s', st || 'solid');
    table.style.setProperty('--ds-line-c', LINE_COLORS[c] || LINE_COLORS.schwarz);
  } else ['--ds-line-w', '--ds-line-s', '--ds-line-c'].forEach((v) => table.style.removeProperty(v));
  if (!table.getAttribute('style')) table.removeAttribute('style');
  if (!table.getAttribute('class')) table.removeAttribute('class');
}

/** Hintergrund einer Zelle setzen oder entfernen. */
export function setCellBackground(c, name) {
  if (CELL_BACKGROUNDS[name]) { c.dataset.bg = name; c.style.backgroundColor = CELL_BACKGROUNDS[name]; } else {
    delete c.dataset.bg;
    c.style.removeProperty('background-color');
  }
  if (!c.getAttribute('style')) c.removeAttribute('style');
}

// ---------- Kopfzeile ----------

function retag(cell, tag) {
  const el = document.createElement(tag);
  for (const a of cell.attributes) el.setAttribute(a.name, a.value);
  while (cell.firstChild) el.appendChild(cell.firstChild);
  cell.replaceWith(el);
}

export function toggleHeader(table) {
  const head = [...table.children].find((c) => c.tagName === 'THEAD');
  let body = [...table.children].find((c) => c.tagName === 'TBODY');
  if (head) {
    if (!body) { body = document.createElement('tbody'); table.appendChild(body); }
    for (const tr of [...head.children].reverse()) {
      cellsOf(tr).forEach((c) => retag(c, 'td'));
      body.insertBefore(tr, body.firstChild);
    }
    head.remove();
    return;
  }
  const first = rowsOf(table)[0];
  if (!first) return;
  const thead = document.createElement('thead');
  const group = [...table.children].find((c) => c.tagName === 'COLGROUP');
  table.insertBefore(thead, group ? group.nextSibling : table.firstChild);
  thead.appendChild(first);
  cellsOf(first).forEach((c) => retag(c, 'th'));
}

/** Tabelle als Ganzes setzen (Breite, Lage, Abstand oben/unten, Innenabstand) – wie docspec.js es zeigt. */
function setTableProps(table, { width, position, sb, sa, pad }) {
  const st = table.style;
  const put = (key, value, css) => {
    if (value === '' || value === null || value === undefined) { delete table.dataset[key]; css.forEach(([p]) => st.removeProperty(p)); } else {
      table.dataset[key] = String(value);
      css.forEach(([p, v]) => st.setProperty(p, v));
    }
  };
  put('width', width, [['width', `${width}cm`]]);
  st.removeProperty('margin-left');
  st.removeProperty('margin-right');
  if (position === 'center' || position === 'right') {
    table.dataset.position = position;
    st.setProperty('margin-left', 'auto');
    if (position === 'center') st.setProperty('margin-right', 'auto');
  } else delete table.dataset.position;
  put('sb', sb, [['margin-top', `${sb}cm`]]);
  put('sa', sa, [['margin-bottom', `${sa}cm`]]);
  put('pad', pad, [['--ds-cell-pad', `${pad}cm`]]);
  if (!table.getAttribute('style')) table.removeAttribute('style');
}

/** Dialog „Tabelleneigenschaften“: Reiter Tabelle, Umrandung, Zellen – wirkt mit OK. `onDone`: danach. */
export function openTableProps(td, { onDone = null } = {}) {
  const table = td?.closest('table');
  if (!table) return;
  const d = table.dataset;
  const num = (v) => (v === undefined || v === '' ? '' : String(v).replace('.', ','));
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
  const plain = table.classList.contains('ws-table-plain');
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<form class="import-modules-card ds-tprops" role="dialog" aria-modal="true">
      <h3>▤ Tabelleneigenschaften</h3>
      <div class="admin-tabs ds-tprops-tabs">
        <button type="button" class="admin-tab active" data-tab="t">Tabelle</button>
        <button type="button" class="admin-tab" data-tab="u">Umrandung</button>
        <button type="button" class="admin-tab" data-tab="z">Zellen</button>
      </div>
      <div class="ds-para-grid" data-pane="t">
        <label>Breite<span class="ds-para-in"><input name="width" inputmode="decimal" value="${num(d.width)}" placeholder="volle"> cm</span></label>
        <label>Lage auf der Seite<select name="position">${opt([['', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']], d.position || '')}</select></label>
        <label>Abstand oben<span class="ds-para-in"><input name="sb" inputmode="decimal" value="${num(d.sb)}" placeholder="0,2"> cm</span></label>
        <label>Abstand unten<span class="ds-para-in"><input name="sa" inputmode="decimal" value="${num(d.sa)}" placeholder="0,2"> cm</span></label>
        <label class="ds-tprops-check"><input type="checkbox" name="head" ${[...table.children].some((c) => c.tagName === 'THEAD') ? 'checked' : ''}> Erste Zeile ist Kopfzeile</label>
      </div>
      <div class="ds-para-grid" data-pane="u" hidden>
        <label>Stärke<select name="lw">${opt(LINE_WIDTHS, plain ? '0' : d.lineWidth || '')}</select></label>
        <label>Art<select name="ls">${opt(LINE_STYLES, d.lineStyle || '')}</select></label>
        <label>Farbe<select name="lc">${opt(LINE_COLOR_NAMES, d.lineColor || '')}</select></label>
      </div>
      <div class="ds-para-grid" data-pane="z" hidden>
        <label>Gilt für<select name="scope"><option value="cell">diese Zelle</option><option value="all">alle Zellen</option></select></label>
        <label>Hintergrund<select name="bg">${opt([['-', '– unverändert –'], ...BG_NAMES], '-')}</select></label>
        <label>Waagerecht<select name="ha">${opt([['-', '– unverändert –'], ['left', 'Links'], ['center', 'Zentriert'], ['right', 'Rechts']], '-')}</select></label>
        <label>Senkrecht<select name="va">${opt([['-', '– unverändert –'], ['top', 'Oben'], ['middle', 'Mitte'], ['bottom', 'Unten']], '-')}</select></label>
        <label>Innenabstand (alle)<span class="ds-para-in"><input name="pad" inputmode="decimal" value="${num(d.pad)}" placeholder="0,1"> cm</span></label>
      </div>
      <p class="hint ds-para-error" hidden>Bitte Zahlen in cm: Breite 2–25,5 (A4 quer), Abstände 0–3, Innenabstand 0–1.</p>
      <div class="confirm-actions"><button type="button" class="btn btn-secondary" data-x>Abbrechen</button><button type="submit" class="btn btn-primary">OK</button></div>
    </form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-x]').addEventListener('click', close);
  overlay.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    overlay.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    overlay.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const cm = (t, lo, hi) => {
      const v = String(t).trim().replace(',', '.');
      if (!v) return '';
      const n = Number(v);
      return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null;
    };
    const v = { width: cm(f.width.value, 2, 25.5), sb: cm(f.sb.value, 0, 3), sa: cm(f.sa.value, 0, 3), pad: cm(f.pad.value, 0, 1) };
    if (Object.values(v).some((x) => x === null)) { overlay.querySelector('.ds-para-error').hidden = false; return; }
    setTableProps(table, { ...v, position: f.position.value });
    setLines(table, { width: f.lw.value, style: f.ls.value, color: f.lc.value });
    if (f.head.checked !== [...table.children].some((c) => c.tagName === 'THEAD')) toggleHeader(table);
    const cells = f.scope.value === 'all' ? grid(table).rows.flatMap(cellsOf) : [td];
    for (const c of cells) {
      if (!c.isConnected) continue;
      if (f.bg.value !== '-') setCellBackground(c, f.bg.value);
      if (f.ha.value !== '-') c.style.textAlign = f.ha.value;
      if (f.va.value !== '-') c.style.verticalAlign = f.va.value;
    }
    close();
    onDone?.();
  });
}
