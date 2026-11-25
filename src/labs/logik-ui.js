// ==================== LOGIKSCHALTUNGEN (Bedienung) ====================
//
// Teile aus der Leiste einfügen, ziehen (Raster), Eingänge antippen = schalten, vom Ausgang eines Teils
// (rechts) zu einem Eingang (links) ziehen = Draht. Draht oder Teil antippen und ✕ / Entf = löschen.
// Wahrheitstabelle für bis zu 6 Eingänge. Rechnen und Zeichnen: lab-core.js.

import { logikSvg, logikShape, logikPin, logikWirePath, logikTruthTable, LOGIK_TYPES, LOGIK_UNIT, LabError } from './lab-core.js';
import { h, svgPoint, field } from './labs.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const PALETTE = [['in', 'Eingang', 'Schalter (0/1)'], ['out', 'Ausgang', 'Lampe'], ['and', '&', 'UND'], ['or', '≥1', 'ODER'], ['not', '1 ○', 'NICHT'],
  ['nand', '& ○', 'NAND'], ['nor', '≥1 ○', 'NOR'], ['xor', '=1', 'XOR (Exklusiv-ODER)'], ['xnor', '=1 ○', 'XNOR (Äquivalenz)']];

export function mount(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  let sel = null; // Teil-ID oder „w<Index>“ für einen Draht
  let drag = null;
  let pending = null;
  let showTable = false;
  const teacher = mode === 'teacher';
  const parts = () => (st.parts ||= []);
  const wires = () => (st.wires ||= []);
  const byId = (id) => parts().find((p) => p.id === id);
  const fixedPart = (p) => !teacher && (p.locked || st.lockAll);
  const fixedWire = (w) => !teacher && (w.locked || st.lockAll);
  const changed = () => onChange(clone(st));

  const palette = h('div', { class: 'lab-row lab-tools lab-palette' });
  const canvas = h('div', { class: 'lab-canvas', tabindex: '0', title: 'Teile ziehen · Eingang antippen = schalten · vom Ausgang (rechts) zum Eingang (links) ziehen = Draht' });
  const selBar = h('div', { class: 'lab-row lab-selbar' });
  const table = h('div', { class: 'lab-truth' });
  el.append(palette, canvas, selBar, table);

  const nextLabel = (type) => {
    const used = new Set(parts().filter((p) => p.type === type).map((p) => p.label));
    if (type === 'in') { for (let c = 97; c < 123; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c); }
    for (let n = 1; n < 100; n++) { const l = type === 'out' ? (n === 1 && !used.has('Q') ? 'Q' : `Q${n}`) : ''; if (!used.has(l)) return l; }
    return '';
  };
  const uid = () => {
    let n = parts().length + 1;
    while (byId(`t${n}`)) n++;
    return `t${n}`;
  };
  function add(type) {
    const w = Number(st.w) || 30;
    const hgt = Number(st.h) || 14;
    // Freier Platz: Eingänge links, Ausgänge rechts, Gatter von der Mitte aus – ohne Überlappung.
    const probe = { type, n: 2 };
    const sh = logikShape(probe);
    const free = (x, y) => parts().every((q) => {
      const qs = logikShape(q);
      return x + sh.w + 1 <= q.x || q.x + qs.w + 1 <= x || y + sh.h + 1 <= q.y || q.y + qs.h + 1 <= y;
    });
    const xs = type === 'in' ? [1, 4] : type === 'out' ? [w - 5, w - 8] : [Math.round(w / 2 - 1.5), Math.round(w / 2 + 3), Math.round(w / 2 - 6), Math.round(w / 2 + 7.5), Math.round(w / 2 - 10)];
    let spot = null;
    for (const x of xs) {
      for (let y = 1; y + sh.h <= Math.max(hgt, parts().reduce((m, q) => Math.max(m, q.y + logikShape(q).h), 0) + sh.h + 2); y++) if (free(x, y)) { spot = [x, y]; break; }
      if (spot) break;
    }
    const [x, y] = spot || [xs[0], parts().reduce((m, q) => Math.max(m, q.y + logikShape(q).h + 1), 1)];
    const p = { id: uid(), type, x, y };
    if (type === 'in' || type === 'out') p.label = nextLabel(type);
    if (!['in', 'out', 'not'].includes(type)) p.n = 2;
    parts().push(p);
    sel = p.id;
    changed();
    render();
  }
  function removeSel() {
    if (!sel) return;
    if (sel.startsWith('w') && !byId(sel)) {
      const i = Number(sel.slice(1));
      const w = wires()[i];
      if (!w || fixedWire(w)) return;
      st.wires = wires().filter((_, k) => k !== i);
    } else {
      const p = byId(sel);
      if (!p || fixedPart(p)) { say('🔒 Dieses Teil ist vorgegeben.'); return; }
      st.parts = parts().filter((x) => x !== p);
      st.wires = wires().filter((w) => w.from !== p.id && w.to !== p.id);
    }
    sel = null;
    changed();
    render();
  }

  // ---------- Treffer ----------
  const toGrid = (e) => {
    const [x, y] = svgPoint(canvas.querySelector('svg'), e);
    return [x / LOGIK_UNIT, y / LOGIK_UNIT];
  };
  const near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) < r;
  function hitPin(g) {
    for (const p of parts()) {
      const sh = logikShape(p);
      if (sh.outs && near(g, logikPin(p, 'out'), 0.6)) return { part: p, kind: 'out' };
      for (let k = 0; k < sh.ins; k++) if (near(g, logikPin(p, 'in', k), 0.6)) return { part: p, kind: 'in', pin: k };
    }
    return null;
  }
  function hitPart(g) {
    for (let i = parts().length - 1; i >= 0; i--) {
      const p = parts()[i];
      const sh = logikShape(p);
      if (g[0] >= p.x - 0.1 && g[0] <= p.x + sh.w + 0.1 && g[1] >= p.y - 0.1 && g[1] <= p.y + sh.h + 0.1) return p;
    }
    return null;
  }
  function hitWire(g) {
    let best = null;
    wires().forEach((w, i) => {
      const a = byId(w.from);
      const b = byId(w.to);
      if (!a || !b) return;
      const pts = logikWirePath(logikPin(a, 'out'), logikPin(b, 'in', w.pin ?? 0));
      for (let k = 1; k < pts.length; k++) {
        const [p, q] = [pts[k - 1], pts[k]];
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const l2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((g[0] - p[0]) * dx + (g[1] - p[1]) * dy) / l2));
        const d = Math.hypot(g[0] - p[0] - t * dx, g[1] - p[1] - t * dy);
        if (d < 0.4 && (!best || d < best.d)) best = { i, d };
      }
    });
    return best;
  }
  function connect(a, b) {
    // a: Ausgang, b: Eingang (Reihenfolge egal beim Ziehen)
    const [out, inn] = a.kind === 'out' ? [a, b] : [b, a];
    if (!out || !inn || out.kind !== 'out' || inn.kind !== 'in') { say('Ein Draht geht von einem Ausgang (rechts) zu einem Eingang (links).'); return; }
    if (out.part.id === inn.part.id && out.part.type !== 'not') { /* Rückkopplung aufs selbe Gatter: erlaubt, zeigt „?“ */ }
    const taken = wires().find((w) => w.to === inn.part.id && (w.pin ?? 0) === inn.pin);
    if (taken && fixedWire(taken)) { say('🔒 Dieser Eingang ist vorgegeben verdrahtet.'); return; }
    st.wires = wires().filter((w) => w !== taken);
    st.wires.push({ from: out.part.id, to: inn.part.id, pin: inn.pin });
    changed();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const g = toGrid(e);
    const pin = hitPin(g);
    if (pin) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { kind: 'wire', from: pin, start: pin.kind === 'out' ? logikPin(pin.part, 'out') : logikPin(pin.part, 'in', pin.pin) };
      pending = drag.start;
      render(false);
      return;
    }
    const p = hitPart(g);
    if (p) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      sel = p.id;
      drag = { kind: 'part', part: p, off: [g[0] - p.x, g[1] - p.y], moved: false, fixed: fixedPart(p) };
      render(false);
      return;
    }
    const w = hitWire(g);
    sel = w ? `w${w.i}` : null;
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const g = toGrid(e);
    if (drag.kind === 'part') {
      if (drag.fixed) return;
      const nx = Math.max(0, Math.round((g[0] - drag.off[0]) * 2) / 2);
      const ny = Math.max(0, Math.round((g[1] - drag.off[1]) * 2) / 2);
      if (nx !== drag.part.x || ny !== drag.part.y) { drag.part.x = nx; drag.part.y = ny; drag.moved = true; render(false); }
    } else {
      pending = g;
      render(false);
      // Linie zum Finger: einfache Vorschau über das Bild gelegt.
      const svg = canvas.querySelector('svg');
      const u = LOGIK_UNIT;
      svg.insertAdjacentHTML('beforeend', `<line x1="${drag.start[0] * u}" y1="${drag.start[1] * u}" x2="${g[0] * u}" y2="${g[1] * u}" stroke="#c90" stroke-width="0.04" stroke-dasharray="0.12,0.08"/>`);
    }
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    pending = null;
    if (d.kind === 'part') {
      if (d.moved) changed();
      else if (d.part.type === 'in') { d.part.on = !d.part.on; changed(); }
    } else if (e.type === 'pointerup') {
      const target = hitPin(toGrid(e));
      if (target && target.part !== d.from.part) connect(d.from, target);
      else if (target && target.part === d.from.part && target.kind !== d.from.kind) connect(d.from, target);
    }
    render();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); } });

  // ---------- Leisten ----------
  palette.append(...PALETTE.map(([type, label, title]) => h('button', { type: 'button', class: 'lab-btn lab-gate', title: `${title} einfügen`, onclick: () => add(type) }, label)),
    h('button', { type: 'button', class: 'lab-btn', title: 'Wahrheitstabelle zeigen/ausblenden', onclick: () => { showTable = !showTable; render(); } }, '▦ Tabelle'));
  if (teacher) {
    palette.append(h('label', { class: 'lab-check', title: 'Alle Teile und Drähte der Vorgabe sind für Schüler fest (Eingänge schalten geht weiter)' },
      h('input', { type: 'checkbox', checked: !!st.lockAll, onchange: (e) => { st.lockAll = e.target.checked; changed(); } }), ' Vorgabe fest'));
  }

  function renderSel() {
    if (!sel) { selBar.replaceChildren(h('span', { class: 'lab-hint', text: 'Teil oder Draht antippen zum Bearbeiten · Eingang antippen = schalten' })); return; }
    if (sel.startsWith('w') && !byId(sel)) {
      const w = wires()[Number(sel.slice(1))];
      selBar.replaceChildren(h('span', { text: 'Draht ' }), w && !fixedWire(w) ? h('button', { type: 'button', class: 'lab-btn', onclick: removeSel }, '✕ Löschen') : h('span', { text: '🔒' }));
      return;
    }
    const p = byId(sel);
    if (!p) { selBar.replaceChildren(); return; }
    const fixed = fixedPart(p);
    const info = LOGIK_TYPES[p.type];
    const kids = [h('strong', { text: `${info?.label || p.type} ` })];
    if (p.type === 'in' || p.type === 'out' || teacher) kids.push(h('label', {}, ' Name ', field(p.label ?? '', (v) => { p.label = v.trim(); changed(); render(); }, { size: 4, disabled: fixed && p.type !== 'in' && p.type !== 'out' ? true : fixed })));
    if (!['in', 'out', 'not'].includes(p.type)) {
      kids.push(h('label', {}, ' Eingänge ', h('select', { disabled: fixed, onchange: (e) => {
        p.n = Number(e.target.value);
        st.wires = wires().filter((w) => !(w.to === p.id && (w.pin ?? 0) >= p.n));
        changed();
        render();
      } }, ...[2, 3, 4].map((n) => h('option', { value: n, selected: (p.n || 2) === n }, String(n))))));
    }
    if (teacher) kids.push(h('button', { type: 'button', class: `lab-mini${p.locked ? ' lab-on' : ''}`, title: 'Für Schüler fest', onclick: () => { p.locked = !p.locked; if (!p.locked) delete p.locked; changed(); render(); } }, p.locked ? '🔒' : '🔓'));
    if (!fixed) kids.push(h('button', { type: 'button', class: 'lab-btn', onclick: removeSel }, '✕ Löschen'));
    else kids.push(h('span', { title: 'vorgegeben', text: ' 🔒' }));
    selBar.replaceChildren(...kids);
  }
  function renderTable() {
    table.hidden = !showTable;
    if (!showTable) return;
    try {
      const tt = logikTruthTable(st);
      if (!tt.ins.length || !tt.outs.length) { table.replaceChildren(h('p', { class: 'lab-hint', text: 'Für die Tabelle braucht es mindestens einen Eingang und einen Ausgang.' })); return; }
      table.replaceChildren(h('table', { class: 'lab-table lab-tt' },
        h('thead', {}, h('tr', {}, ...tt.ins.map((n) => h('th', { text: n })), ...tt.outs.map((n) => h('th', { class: 'lab-tt-out', text: n })))),
        h('tbody', {}, ...tt.rows.map((r) => h('tr', {}, ...r.map((v, i) => h('td', { class: i >= tt.ins.length ? 'lab-tt-out' : '', text: v === null ? '?' : String(v) })))))));
    } catch (err) {
      table.replaceChildren(h('p', { class: 'lab-err', text: err instanceof LabError ? err.message : String(err) }));
    }
  }
  function render(all = true) {
    canvas.innerHTML = logikSvg(st, { selected: sel, pending });
    if (all) { renderSel(); renderTable(); }
  }

  render();
  return { getState: () => clone(st), setState: (s) => { st = clone(s); sel = null; render(); }, destroy: () => el.replaceChildren() };
}
