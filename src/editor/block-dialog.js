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

/** Tabelle einfügen: Spalten, Zeilen, Kopfzeile. Liefert den Baustein oder `null`. */
export function askTable() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<form class="import-modules-card ds-widget-dialog">
      <h3>▤ Tabelle einfügen</h3>
      <div class="ds-field-form">
        <label>Spalten <input type="number" name="cols" min="1" max="20" value="3"></label>
        <label>Zeilen <input type="number" name="rows" min="1" max="100" value="3"></label>
        <label><input type="checkbox" name="header"> Kopfzeile</label>
      </div>
      <div class="confirm-actions">
        <button type="submit" class="btn btn-primary">Einfügen</button>
        <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
      </div></form>`;
    document.body.appendChild(overlay);
    const done = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const cols = Math.max(1, Math.min(20, Number(f.cols.value) || 1));
      const rows = Math.max(1, Math.min(100, Number(f.rows.value) || 1));
      const row = () => Array.from({ length: cols }, () => '');
      done({ type: 'table', ...(f.header.checked ? { header: row() } : {}), rows: Array.from({ length: Math.max(1, f.header.checked ? rows - 1 : rows) }, row) });
    });
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
