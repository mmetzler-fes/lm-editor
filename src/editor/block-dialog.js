// ==================== BAUSTEIN BEARBEITEN (LM-EDITOR) ====================
//
// Für den eigenständigen Editor: dieselben Felder wie der Dialog in LearningModules (docspec-editor.js),
// ohne dessen YAML-Ansicht. Zeichenrahmen bearbeitet nur LearningModules, hier lässt er sich nur entfernen.

import { KARO_MAX_WIDTH_CM, latexToMathml } from '../doc/docspec.js';
import { escapeAttr, escapeHtml } from '../util/dom.js';

const TITLES = { karo: 'Schreibfeld', formula: 'Formel', quiz: 'Quiz', group: 'Zeichenrahmen', spacer: 'Platz' };
const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
const PATTERNS = [['karo', '▦ Karo'], ['linien', '☰ Linien'], ['leer', '▢ Leer (Rahmen)'], ['frei', '◌ Unsichtbar (nur Platz)']];

/** Felder aus dem Formular in den Baustein übernehmen – ohne Formular, damit es sich prüfen lässt. */
export function applyBlockFields(block, f) {
  const { width, pattern, align, scale, ...rest } = block;
  if (block.type === 'karo') {
    const next = { ...rest, lines: Math.max(1, Math.min(60, Math.round(Number(f.height) * 2) || 1)) };
    const cm = Math.round(Number(f.width) * 2) / 2;
    if (cm > 0) next.width = `${Math.min(KARO_MAX_WIDTH_CM, cm)}cm`;
    if (f.pattern && f.pattern !== 'karo') next.pattern = f.pattern;
    return next;
  }
  if (block.type === 'formula') {
    const { math: _old, ...keep } = block;
    const { align: _a, ...plain } = keep;
    return { ...plain, latex: f.latex, ...(f.align ? { align: f.align } : {}) };
  }
  if (block.type === 'quiz') {
    return { ...rest, ...(width !== undefined ? { width } : {}), ...(Number(f.scale) !== 1 ? { scale: Number(f.scale) } : {}) };
  }
  return block;
}

const TABLE_MAX = { cols: 20, rows: 100 };
const GRID = { cols: 10, rows: 8 };

/** Tabelle als Baustein: `rows` zählt alle Zeilen, eine Kopfzeile mit; leere Zellen. */
export function tableBlock({ cols, rows, header = false, headerColumn = false }) {
  const row = () => Array.from({ length: cols }, () => '');
  return {
    type: 'table',
    ...(header ? { header: row() } : {}),
    ...(headerColumn ? { headerColumn: true } : {}),
    rows: Array.from({ length: Math.max(1, header ? rows - 1 : rows) }, row),
  };
}

/**
 * Tabelle einfügen: Größe im Raster wählen (Zeiger bzw. Finger, ein Klick fügt
 * ein) oder als Zahl eingeben – bis 20 × 100 –, dazu Kopfzeile und Kopfspalte.
 * Liefert den Baustein oder `null`.
 */
export function askTable() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const cells = [];
    for (let r = 1; r <= GRID.rows; r++) for (let c = 1; c <= GRID.cols; c++) cells.push(`<button type="button" class="ds-tgrid-cell" data-c="${c}" data-r="${r}" tabindex="-1" aria-label="${c} × ${r}"></button>`);
    overlay.innerHTML = `<form class="import-modules-card ds-widget-dialog ds-table-ask" role="dialog" aria-modal="true" aria-label="Tabelle einfügen">
      <h3>▤ Tabelle einfügen</h3>
      <div class="ds-tgrid" style="grid-template-columns:repeat(${GRID.cols}, 1fr)">${cells.join('')}</div>
      <p class="ds-tgrid-size" aria-live="polite">3 Spalten × 4 Zeilen</p>
      <div class="ds-field-form">
        <label>Spalten <input type="number" name="cols" inputmode="numeric" min="1" max="${TABLE_MAX.cols}" value="3" required></label>
        <label>Zeilen <input type="number" name="rows" inputmode="numeric" min="1" max="${TABLE_MAX.rows}" value="4" required></label>
      </div>
      <div class="ds-field-form">
        <label><input type="checkbox" name="header" checked> Kopfzeile</label>
        <label><input type="checkbox" name="headerColumn"> Kopfspalte</label>
      </div>
      <div class="confirm-actions">
        <button type="submit" class="btn btn-primary">Einfügen</button>
        <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
      </div></form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const f = form.elements;
    const size = overlay.querySelector('.ds-tgrid-size');
    const clamp = (v, max) => Math.min(max, Math.max(1, Math.round(Number(v)) || 1));
    const paint = (cols, rows) => {
      for (const b of overlay.querySelectorAll('.ds-tgrid-cell')) b.classList.toggle('on', Number(b.dataset.c) <= cols && Number(b.dataset.r) <= rows);
      size.textContent = `${cols} Spalte${cols === 1 ? '' : 'n'} × ${rows} Zeile${rows === 1 ? '' : 'n'}`;
    };
    const fromFields = () => paint(clamp(f.cols.value, TABLE_MAX.cols), clamp(f.rows.value, TABLE_MAX.rows));
    const done = (value) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    const block = () => tableBlock({ cols: clamp(f.cols.value, TABLE_MAX.cols), rows: clamp(f.rows.value, TABLE_MAX.rows), header: f.header.checked, headerColumn: f.headerColumn.checked });
    const grid = overlay.querySelector('.ds-tgrid');
    grid.addEventListener('pointerover', (e) => {
      const b = e.target.closest('.ds-tgrid-cell');
      if (b) paint(Number(b.dataset.c), Number(b.dataset.r));
    });
    grid.addEventListener('pointerleave', fromFields);
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.ds-tgrid-cell');
      if (!b) return;
      f.cols.value = b.dataset.c;
      f.rows.value = b.dataset.r;
      done(block());
    });
    form.addEventListener('input', fromFields);
    overlay.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    form.addEventListener('submit', (e) => { e.preventDefault(); done(block()); });
    fromFields();
    f.cols.select();
  });
}

export function openBlockDialog(start, { apply, remove }) {
  // Alter „Platz“: wird zum unsichtbaren Schreibfeld (eine Zeile ≈ 0,5 cm), wie in LearningModules.
  const block = start.type === 'spacer'
    ? { ...(start.id ? { id: start.id } : {}), type: 'karo', lines: Number.isInteger(start.lines) ? start.lines : 3, pattern: 'frei' }
    : start;
  const formula = block.type === 'formula' && typeof block.latex === 'string';
  const fields = block.type === 'karo' ? `<div class="ds-field-form">
      <label>Höhe <input type="number" name="height" min="0.5" max="30" step="0.5" value="${(Number.isInteger(block.lines) ? block.lines : 4) / 2}"> cm</label>
      <label>Breite <input type="number" name="width" min="1" max="${KARO_MAX_WIDTH_CM}" step="0.5" placeholder="ganz" value="${escapeAttr(parseFloat(block.width) || '')}"> cm</label>
      <label>Muster <select name="pattern">${PATTERNS.map(([v, l]) => `<option value="${v}" ${v === (block.pattern || 'karo') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>` : formula ? `<div class="ds-field-form ds-formula-form">
      <label class="ds-fx-label">Formel (LaTeX) <textarea name="latex" class="ds-fx-tex" rows="3" spellcheck="false" placeholder="z. B. I = \\frac{U}{R}">${escapeHtml(block.latex)}</textarea></label>
      <div class="ds-fx-preview docspec" aria-live="polite"></div>
      <label>Lage <select name="align"><option value="">mittig</option><option value="left" ${block.align === 'left' ? 'selected' : ''}>links</option></select></label>
    </div>` : block.type === 'quiz' ? `<div class="ds-field-form">
      <label>Größe im Blatt <select name="scale">${SCALES.map((v) => `<option value="${v}" ${v === (typeof block.scale === 'number' ? block.scale : 1) ? 'selected' : ''}>${Math.round(v * 100)} %</option>`).join('')}</select></label>
    </div>` : '<p class="hint">Diesen Baustein bearbeitet LearningModules. Hier lässt er sich verschieben oder entfernen.</p>';
  const canEdit = block.type === 'karo' || formula || block.type === 'quiz';
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<form class="import-modules-card ds-widget-dialog">
      <h3>${TITLES[block.type] || 'Baustein'} bearbeiten</h3>
      ${fields}
      <div class="confirm-actions">
        ${canEdit ? '<button type="submit" class="btn btn-primary">Übernehmen</button>' : ''}
        <button type="button" class="btn btn-danger" data-del>Entfernen</button>
        <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
      </div></form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const form = overlay.querySelector('form');
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-del]').addEventListener('click', () => { remove(); close(); });
  if (formula) {
    const tex = form.elements.latex;
    const preview = overlay.querySelector('.ds-fx-preview');
    const show = () => {
      try { preview.innerHTML = `<div class="ds-formula">${latexToMathml(tex.value)}</div>`; }
      catch (err) { preview.innerHTML = `<p class="ds-error">${escapeHtml(err.message)}</p>`; }
    };
    tex.addEventListener('input', show);
    show();
  }
  form.querySelector('input, textarea, select')?.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    apply(applyBlockFields(block, values));
    close();
  });
}
