// ==================== BODE-DIAGRAMM UND ORTSKURVE (Bedienung) ====================
//
// Beide haben Parameter (R = 1k, C = 100n – mit Schieber ×0,1 … ×10) und Kurven (Formeln in f, w = ω,
// s = jω). Bode: Maus/Finger übers Diagramm zeigt die Werte bei dieser Frequenz. Ortskurve: Schieber
// für den Laufparameter zeigt den Zeiger vom Ursprung zum Kurvenpunkt.

import {
  bodeSvg, bodeAt, bodeEval, BODE_GEOM, ortskurveSvg, ortskurveEval, evalExpr, fmtCx, fmtNum, siFmt, LAB_COLORS,
} from './lab-core.js';
import { h, svgPoint, field } from './labs.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;

/** Parameter- und Kurvenliste; `redraw()` nur das Bild, `refresh()` alles, `changed()` speichert. */
function listPanels(st, { teacher, say, redraw, refresh, changed, curveHint, newCurve }) {
  const editable = (x) => teacher || !x.locked;
  const lockBtn = (x) => (teacher
    ? h('button', { type: 'button', class: `lab-mini${x.locked ? ' lab-on' : ''}`, title: x.locked ? 'Für Schüler fest – zum Freigeben klicken' : 'Für Schüler festlegen', onclick: () => { x.locked = !x.locked; if (!x.locked) delete x.locked; changed(); refresh(); } }, x.locked ? '🔒' : '🔓')
    : (x.locked ? h('span', { title: 'vorgegeben', text: '🔒' }) : null));
  const params = (st.params ||= []);
  const curves = (st.curves ||= []);
  const paramRows = params.map((p) => {
    const can = editable(p);
    let base = null;
    try { const v = evalExpr(String(p.value ?? '')); if (Math.abs(v[1]) < 1e-12 && v[0] > 0) base = v[0]; } catch (_) { /* kein Schieber */ }
    const valueField = field(p.value ?? '', (v) => { p.value = v.trim(); changed(); refresh(); }, { size: 7, disabled: !can, title: 'Wert, z. B. 4,7k oder 100n' });
    const slider = base && can ? h('input', {
      type: 'range', min: '-1', max: '1', step: '0.01', value: '0', class: 'lab-slider', title: 'Wert verändern (×0,1 … ×10)',
      oninput: (e) => { p.value = siFmt(base * 10 ** Number(e.target.value), '', 3); valueField.value = p.value; valueField.dataset.was = p.value; redraw(); },
      onchange: () => { changed(); },
    }) : null;
    return h('div', { class: 'lab-row lab-param' },
      field(p.name ?? '', (v) => { p.name = v.trim(); changed(); refresh(); }, { size: 3, disabled: !can, class: 'lab-name', title: 'Name' }),
      ' = ', valueField, slider, lockBtn(p),
      can ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Löschen', onclick: () => { st.params = params.filter((x) => x !== p); changed(); refresh(); } }, '✕') : null);
  });
  const curveRows = curves.map((c, i) => {
    const can = editable(c);
    return h('div', { class: `lab-row lab-curve${c.show === false ? ' lab-hidden' : ''}` },
      h('input', { type: 'color', value: c.color || LAB_COLORS[i % LAB_COLORS.length], disabled: !can, title: 'Farbe', oninput: (e) => { c.color = e.target.value; redraw(); }, onchange: () => changed() }),
      field(c.name ?? '', (v) => { c.name = v.trim(); changed(); refresh(); }, { size: 3, disabled: !can, class: 'lab-name', title: 'Name' }),
      ' = ', field(c.expr ?? '', (v) => { c.expr = v.trim(); changed(); refresh(); }, { class: 'lab-expr', disabled: !can, title: curveHint }),
      h('button', { type: 'button', class: 'lab-mini', title: c.show === false ? 'Zeigen' : 'Ausblenden', onclick: () => { c.show = c.show === false; if (c.show) delete c.show; changed(); refresh(); } }, c.show === false ? '🙈' : '👁'),
      lockBtn(c),
      can ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Löschen', onclick: () => { st.curves = curves.filter((x) => x !== c); changed(); refresh(); } }, '✕') : null);
  });
  return [
    h('div', { class: 'lab-group' }, h('div', { class: 'lab-group-head' }, h('strong', { text: 'Bauteile / Parameter' }),
      h('button', { type: 'button', class: 'lab-btn', onclick: () => { params.push({ name: `P${params.length + 1}`, value: '1' }); changed(); refresh(); } }, '+ Parameter')), ...paramRows),
    h('div', { class: 'lab-group' }, h('div', { class: 'lab-group-head' }, h('strong', { text: 'Kurven' }),
      h('button', { type: 'button', class: 'lab-btn', onclick: () => {
        curves.push(newCurve(curves));
        changed();
        refresh();
      } }, '+ Kurve')), ...curveRows),
  ];
}

function errorsOf(data) {
  const out = [];
  for (const [n, e] of Object.entries(data.paramErrors || {})) out.push(`${n}: ${e}`);
  for (const c of data.curves) if (c.err) out.push(`${c.name || 'Kurve'}: ${c.err}`);
  return out;
}

const numField = (st, key, label, { say, changed, refresh, disabled = false, unit = '' }) => h('label', { class: 'lab-setting' }, `${label} `,
  field(st[key] === null || st[key] === undefined ? '' : siFmt(Number(st[key]), '', 4), (v) => {
    try { st[key] = evalExpr(v)[0]; changed(); refresh(); } catch (err) { say(`⚠️ ${err.message}`); }
  }, { size: 5, disabled }), unit ? ` ${unit}` : '');
const checkField = (st, key, label, { changed, refresh, disabled = false, dflt = true }) => h('label', { class: 'lab-check' },
  h('input', { type: 'checkbox', checked: st[key] === undefined ? dflt : st[key] !== false, disabled, onchange: (e) => { st[key] = e.target.checked; changed(); refresh(); } }), ` ${label}`);

// ==================== Bode ====================

export function mountBode(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  const teacher = mode === 'teacher';
  const canvas = h('div', { class: 'lab-canvas', title: 'Über das Diagramm fahren: Werte bei dieser Frequenz' });
  const readout = h('div', { class: 'lab-readout' });
  const panel = h('div', { class: 'lab-panel' });
  el.append(canvas, readout, panel);
  let cursor = null;
  const changed = () => onChange(clone(st));
  const redraw = () => {
    canvas.innerHTML = bodeSvg(st, { cursor });
    showReadout();
  };
  const showReadout = () => {
    const errs = errorsOf(bodeEval(st, 2));
    if (errs.length) { readout.textContent = `⚠️ ${errs.join(' · ')}`; readout.classList.add('lab-err'); return; }
    readout.classList.remove('lab-err');
    if (!cursor) { readout.textContent = 'Über das Diagramm fahren oder tippen: Werte bei dieser Frequenz.'; return; }
    const vals = bodeAt(st, cursor).filter((v) => v.show !== false);
    readout.replaceChildren(h('strong', { text: `f = ${siFmt(cursor, 'Hz', 3)}: ` }),
      ...vals.map((v) => h('span', { class: 'lab-read', style: { color: v.color } }, v.err ? `${v.name}: ${v.err}` : `|${v.name}| = ${fmtNum(v.db, 3)} dB (${fmtNum(Math.abs(v.h[0]) + Math.abs(v.h[1]) ? Math.hypot(v.h[0], v.h[1]) : 0, 3)}), φ = ${fmtNum(v.ph, 3)}°`)));
  };
  const pointer = (e) => {
    const svg = canvas.querySelector('svg');
    if (!svg) return;
    const [x] = svgPoint(svg, e);
    const { L, R, W } = BODE_GEOM;
    const t = (x - L) / (W - L - R);
    const fmin = Number(st.fmin) || 10;
    const fmax = Number(st.fmax) || 1e5;
    cursor = t >= 0 && t <= 1 ? fmin * (fmax / fmin) ** t : null;
    redraw();
  };
  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('pointerdown', pointer);
  const refresh = () => {
    redraw();
    const opts = { say, changed, refresh, disabled: !teacher && st.lockRange };
    panel.replaceChildren(
      ...listPanels(st, {
        teacher, say, redraw, refresh, changed,
        curveHint: 'Formel in f, w (= ω) oder s (= jω) und den Parametern, z. B. 1/(1 + j*w*R*C)',
        newCurve: (cs) => ({ id: uid('h'), name: `H${cs.length + 1}`, expr: cs[cs.length - 1]?.expr || '1/(1 + s*R*C)', color: LAB_COLORS[cs.length % LAB_COLORS.length] }),
      }),
      h('div', { class: 'lab-row lab-settings' },
        numField(st, 'fmin', 'f von', opts), numField(st, 'fmax', 'bis', { ...opts, unit: 'Hz' }),
        numField(st, 'dbmin', '|H| von', opts), numField(st, 'dbmax', 'bis', { ...opts, unit: 'dB' }),
        checkField(st, 'phase', 'Phase', opts), checkField(st, 'mark3db', '−3-dB-Linie', opts),
        teacher ? h('label', { class: 'lab-check', title: 'Schüler können den Bereich nicht ändern' }, h('input', { type: 'checkbox', checked: !!st.lockRange, onchange: (e) => { st.lockRange = e.target.checked; changed(); } }), ' Bereich fest') : null),
      h('p', { class: 'lab-hint', text: 'Formeln: j, w (= ω = 2πf), s (= jω), f, Parameter; 10k, 100n, 4,7µ; R || X = parallel. Beispiel Tiefpass 2. Ordnung: 1/(1 + s*R*C)^2' }));
  };
  refresh();
  return { getState: () => clone(st), setState: (s) => { st = clone(s); refresh(); }, destroy: () => el.replaceChildren() };
}

// ==================== Ortskurve ====================

export function mountOrtskurve(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  const teacher = mode === 'teacher';
  const canvas = h('div', { class: 'lab-canvas' });
  const cursorRow = h('div', { class: 'lab-row lab-cursor' });
  const panel = h('div', { class: 'lab-panel' });
  el.append(canvas, cursorRow, panel);
  const changed = () => onChange(clone(st));
  const redraw = () => {
    canvas.innerHTML = ortskurveSvg(st);
    showCursor();
  };
  const range = () => {
    const from = Number(st.from) || 1;
    const to = Number(st.to) || 1000;
    const log = st.log !== false && from > 0 && to > 0;
    return { from, to, log, at: (t) => (log ? from * (to / from) ** t : from + (to - from) * t), pos: (v) => (log ? Math.log(v / from) / Math.log(to / from) : (v - from) / (to - from)) };
  };
  const info = h('span', { class: 'lab-read' });
  const showCursor = () => {
    const data = ortskurveEval(st, 2);
    const errs = errorsOf(data);
    if (errs.length) { info.textContent = `⚠️ ${errs.join(' · ')}`; return; }
    if (typeof st.cursor !== 'number') { info.textContent = ''; return; }
    const first = data.curves.find((c) => c.show !== false);
    const z = first ? data.valueAt(first, st.cursor) : null;
    const name = data.name;
    info.textContent = z ? `${name} = ${siFmt(st.cursor, name === 'f' ? 'Hz' : '', 3)}: ${first.name || 'Z'} = ${fmtCx(z, st.unit || '', 'kart', 3)} = ${fmtCx(z, st.unit || '', 'polar', 3)}` : '';
  };
  const slider = h('input', { type: 'range', min: '0', max: '1000', step: '1', class: 'lab-slider lab-slider-wide', title: 'Laufparameter: Zeiger zu diesem Kurvenpunkt',
    oninput: (e) => { st.cursor = Number(range().at(Number(e.target.value) / 1000).toPrecision(4)); redraw(); },
    onchange: () => changed() });
  const showBox = h('input', { type: 'checkbox', onchange: (e) => {
    st.cursor = e.target.checked ? range().at(0.5) : null;
    changed();
    refresh();
  } });
  cursorRow.append(h('label', { class: 'lab-check' }, showBox, ' Zeiger zum Punkt'), slider, info);
  const refresh = () => {
    redraw();
    const on = typeof st.cursor === 'number';
    showBox.checked = on;
    slider.hidden = !on;
    if (on) slider.value = String(Math.round(Math.min(Math.max(range().pos(st.cursor), 0), 1) * 1000));
    const opts = { say, changed, refresh, disabled: !teacher && st.lockRange };
    panel.replaceChildren(
      ...listPanels(st, {
        teacher, say, redraw, refresh, changed,
        curveHint: 'Formel im Laufparameter (z. B. f, mit w = ω und s = jω) und den Parametern, z. B. R + j*w*L',
        newCurve: (cs) => ({ id: uid('z'), name: `Z${cs.length + 1}`, expr: cs[cs.length - 1]?.expr || 'R + 1/(s*C)', color: LAB_COLORS[cs.length % LAB_COLORS.length] }),
      }),
      h('div', { class: 'lab-row lab-settings' },
        h('label', { class: 'lab-setting' }, 'Laufparameter ', field(st.var || 'f', (v) => { st.var = v.trim() || 'f'; changed(); refresh(); }, { size: 3, disabled: opts.disabled })),
        numField(st, 'from', 'von', opts), numField(st, 'to', 'bis', opts),
        checkField(st, 'log', 'logarithmisch', opts),
        h('label', { class: 'lab-setting' }, 'Einheit ', field(st.unit ?? '', (v) => { st.unit = v.trim(); changed(); refresh(); }, { size: 3, disabled: opts.disabled })),
        checkField(st, 'marks', 'Werte markieren', opts),
        teacher ? h('label', { class: 'lab-check', title: 'Schüler können Laufparameter und Bereich nicht ändern' }, h('input', { type: 'checkbox', checked: !!st.lockRange, onchange: (e) => { st.lockRange = e.target.checked; changed(); } }), ' Bereich fest') : null),
      h('p', { class: 'lab-hint', text: 'Ist der Laufparameter f, gibt es auch w (= ω) und s (= jω). Laufparameter darf auch ein Bauteil sein (z. B. R von 0 bis 1k, linear) – er gilt dann statt des gleichnamigen Parameters.' }));
  };
  refresh();
  return { getState: () => clone(st), setState: (s) => { st = clone(s); refresh(); }, destroy: () => el.replaceChildren() };
}
