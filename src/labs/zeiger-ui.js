// ==================== ZEIGERLABOR (Bedienung) ====================
//
// Zeiger ziehen (Mitte: verschieben, Spitze: Wert ändern), Anfang rastet an der Spitze eines anderen
// Zeigers ein (Zeigeraddition) oder am Karo. Liste darunter: Name, Wert (3 + j4, 5∠30°, = U2 / Z2),
// Einheit, Anfang, Farbe, Dicke. Rechnen und Zeichnen: lab-core.js.

import { zeigerSvg, zeigerResolve, evalExpr, fmtCx, fmtNum, guessUnit, ZEIGER_UNITS, LAB_COLORS, LabError } from './lab-core.js';
import { h, svgPoint, field } from './labs.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = () => `p${Math.random().toString(36).slice(2, 8)}`;
const SNAP = 0.3;
const round = (v) => Math.round(v * 1e6) / 1e6;
const WIDTHS = [['f', 'dünn'], ['m', 'mittel'], ['d', 'dick']];

export function mount(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  let sel = null;
  let drag = null;
  const teacher = mode === 'teacher';
  const editable = (it) => teacher || !it.locked;
  const canvas = h('div', { class: 'lab-canvas', tabindex: '0', title: 'Zeiger in der Mitte ziehen = verschieben, an der Spitze ziehen = Wert ändern' });
  const panel = h('div', { class: 'lab-panel' });
  el.append(canvas, panel);

  const changed = () => onChange(clone(st));
  const items = () => (st.items ||= []);
  const byId = (id) => items().find((it) => it.id === id);
  const view = () => ({ xmin: Number(st.xmin ?? -1), xmax: Number(st.xmax ?? 13), ymin: Number(st.ymin ?? -4.5), ymax: Number(st.ymax ?? 4.5), grid: Number(st.grid ?? 0.5) || 0.5 });

  function renderCanvas() {
    canvas.innerHTML = zeigerSvg(st, { selected: sel });
  }
  function renderAll() {
    renderCanvas();
    renderPanel();
  }

  // ---------- Ziehen ----------
  const toMath = (e) => {
    const svg = canvas.querySelector('svg');
    const [vx, vy] = svgPoint(svg, e);
    const v = view();
    return [vx + v.xmin, v.ymax - vy];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  /** Hängt `other` (über seine Anker) an `id`? Dann darf `id` nicht an `other` einrasten. */
  const hangsOn = (other, id) => {
    let cur = byId(other);
    for (let n = 0; cur && n < 60; n++) {
      if (cur.id === id) return true;
      cur = cur.anchor ? byId(cur.anchor) : null;
    }
    return false;
  };
  const gridSnap = (p, e) => {
    if (e.altKey || e.shiftKey) return p;
    const g = view().grid / 2;
    return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = toMath(e);
    const res = zeigerResolve(st).filter((r) => r.show !== false && r.val);
    let hit = null;
    // Spitzen zuerst (die liegen oft auf anderen Zeigern), dann die Strecken.
    for (const r of res) if (!r.expr && dist(p, r.tip) < SNAP && (!hit || dist(p, r.tip) < hit.d)) hit = { r, kind: 'tip', d: dist(p, r.tip) };
    if (!hit) for (const r of res) { const d = segDist(p, r.start, r.tip); if (d < 0.25 && (!hit || d < hit.d)) hit = { r, kind: 'move', d }; }
    if (!hit) {
      if (sel) { sel = null; renderAll(); }
      return;
    }
    let id = hit.r.id;
    let kind = hit.kind;
    let created = false;
    if (!editable(hit.r)) {
      // Vorgegebener Zeiger: eine verbundene Kopie herausziehen (z. B. an die Spitze eines anderen legen).
      id = copyOf(hit.r.id, false, false).id;
      kind = 'move';
      created = true;
    }
    sel = id;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { id, kind, off: [p[0] - hit.r.start[0], p[1] - hit.r.start[1]], moved: false, created, orig: hit.r.id };
    renderCanvas();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const it = byId(drag.id);
    if (!it) return;
    const p = toMath(e);
    const res = zeigerResolve(st);
    const me = res.find((r) => r.id === it.id);
    const others = res.filter((r) => r.id !== it.id && r.show !== false && r.val);
    drag.moved = true;
    if (drag.kind === 'move') {
      const want = [p[0] - drag.off[0], p[1] - drag.off[1]];
      let best = null;
      const consider = (pt, anchor) => { const d = dist(want, pt); if (d < SNAP && (!best || d < best.d)) best = { pt, anchor, d }; };
      consider([0, 0], null);
      for (const r of others) {
        if (!hangsOn(r.id, it.id)) consider(r.tip, r.id);
        consider(r.start, null);
      }
      if (best?.anchor) {
        it.anchor = best.anchor;
      } else {
        const pt = best ? best.pt : gridSnap(want, e);
        delete it.anchor;
        it.x0 = round(pt[0]);
        it.y0 = round(pt[1]);
      }
    } else {
      let tip = gridSnap(p, e);
      for (const r of others) for (const pt of [r.tip, r.start]) if (dist(p, pt) < SNAP * 0.7) tip = pt;
      it.value = [round((tip[0] - me.start[0]) * me.scale), round((tip[1] - me.start[1]) * me.scale)];
    }
    renderCanvas();
  });
  const endDrag = () => {
    if (!drag) return;
    const { moved, created, id, orig } = drag;
    drag = null;
    if (created && !moved) {
      // Nur angetippt: keine Kopie, nur auswählen.
      st.items = items().filter((it) => it.id !== id);
      sel = orig;
      say('🔒 Vorgegeben – ziehen legt eine Kopie an, „−“ in der Liste den Gegenzeiger.');
    } else if (moved) changed();
    renderAll();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && editable(byId(sel) || {})) { e.preventDefault(); remove(sel); }
    if (e.key === '-' && sel && byId(sel)) { e.preventDefault(); copyOf(sel, true); }
  });

  // ---------- Kopie / Gegenzeiger ----------
  const freeName = (base) => {
    const taken = new Set(items().map((it) => String(it.name ?? '').trim()));
    let n = base;
    while (taken.has(n)) n += "'";
    return n;
  };
  /** Neuer Zeiger, über eine Formel mit dem Original verbunden: Kopie (= I23) oder Gegenzeiger (= -I23). */
  function copyOf(id, negate, commit = true) {
    const src = byId(id);
    const r = zeigerResolve(st).find((x) => x.id === id);
    if (!src || !r) return null;
    const name = String(src.name ?? '').trim();
    const it = {
      id: uid(),
      name: freeName(negate ? `−${name.replace(/^[−-]/, '')}` : name),
      unit: src.unit ?? '',
      expr: negate ? `-(${name})` : name,
      x0: round(r.start[0]),
      y0: round(r.start[1]),
      color: src.color || LAB_COLORS[0],
      width: src.width || 'm',
    };
    if (negate && /^[−-]/.test(name)) it.name = freeName(name.replace(/^[−-]/, ''));
    // Nur ein schlichter Name lässt sich in einer Formel verwenden (−I23 nicht) – sonst den Wert übernehmen.
    if (!/^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_'Ͱ-Ͽ]*$/.test(name)) { it.value = (r.val || [0, 0]).map((v) => round(negate ? -v : v)); delete it.expr; }
    items().push(it);
    sel = it.id;
    if (commit) {
      changed();
      renderAll();
      say(negate ? `Gegenzeiger ${it.name} angelegt – in der Mitte anfassen und an eine Spitze ziehen.` : `Kopie ${it.name} angelegt.`);
    }
    return it;
  }

  // ---------- Liste ----------
  function remove(id) {
    const res = zeigerResolve(st);
    for (const it of items()) {
      if (it.anchor === id) {
        const r = res.find((x) => x.id === it.id);
        delete it.anchor;
        it.x0 = round(r.start[0]);
        it.y0 = round(r.start[1]);
      }
    }
    st.items = items().filter((it) => it.id !== id);
    if (sel === id) sel = null;
    changed();
    renderAll();
  }
  const envFor = (except) => {
    const env = {};
    for (const r of zeigerResolve(st)) if (r.id !== except && r.val && r.name) env[r.name] = r.val;
    return env;
  };
  /** Wert-Eingabe: „= Formel“ bleibt verbunden, sonst wird ausgerechnet (auch 2*U, 5∠30°). */
  function setValue(it, text) {
    const t = String(text).trim();
    if (!t) return;
    if (t.startsWith('=')) {
      it.expr = t.slice(1).trim();
      delete it.value;
    } else {
      try {
        it.value = evalExpr(t, envFor(it.id)).map(round);
        delete it.expr;
      } catch (err) {
        say(`⚠️ ${err.message}`);
        return;
      }
    }
    changed();
    renderAll();
  }
  /** Zeile „I2 = U2 / Z2“: neuer (oder vorhandener) Zeiger mit Formel. */
  function fromFormula(text) {
    const m = /^\s*([^=\s][^=]*?)\s*=\s*(.+)$/.exec(String(text));
    if (!m) { say('Formel so eingeben: I2 = U2 / Z2'); return false; }
    const name = m[1].trim();
    try { evalExpr(m[2], envFor(null)); } catch (err) {
      if (!(err instanceof LabError)) throw err;
      say(`⚠️ ${err.message}`);
      return false;
    }
    let it = items().find((x) => x.name === name);
    if (it && !editable(it)) { say(`🔒 „${name}“ ist vorgegeben.`); return false; }
    if (!it) {
      it = { id: uid(), name, unit: guessUnit(name), x0: 0, y0: 0, color: LAB_COLORS[items().length % LAB_COLORS.length], width: 'm' };
      items().push(it);
    }
    it.expr = m[2].trim();
    delete it.value;
    sel = it.id;
    changed();
    renderAll();
    return true;
  }
  function addPointer(show = true) {
    const n = items().length + 1;
    const name = show ? `U${n}` : `Z${n}`;
    const unit = guessUnit(name);
    const k = Number(st.scales?.[unit]) > 0 ? Number(st.scales[unit]) : 1;
    const it = { id: uid(), name, unit, value: [round(3 * k), round(1.5 * k)], x0: 0, y0: 0, color: LAB_COLORS[items().length % LAB_COLORS.length], width: 'm' };
    if (!show) it.show = false;
    items().push(it);
    sel = it.id;
    changed();
    renderAll();
  }

  function renderPanel() {
    const res = zeigerResolve(st);
    const formula = field('', (v, input) => { if (fromFormula(v)) input.value = ''; }, { class: 'lab-formula', placeholder: 'Neu aus Formel, z. B.  I2 = U2 / Z2   (Enter)' });
    const top = h('div', { class: 'lab-row lab-tools' },
      h('button', { type: 'button', class: 'lab-btn', onclick: () => addPointer(true), title: 'Neuen Zeiger anlegen' }, '+ Zeiger'),
      h('button', { type: 'button', class: 'lab-btn', onclick: () => addPointer(false), title: 'Größe zum Rechnen, ohne Pfeil (z. B. eine Impedanz)' }, '+ Wert'),
      formula);
    // Maßstab je Einheit
    const units = [...new Set(items().map((it) => it.unit ?? ''))];
    const scales = h('div', { class: 'lab-row lab-scales' }, h('span', { class: 'lab-label', text: 'Maßstab:' }),
      ...units.map((u) => h('label', { class: 'lab-scale' }, '1 cm ≙ ', field(fmtNum(Number(st.scales?.[u]) > 0 ? Number(st.scales[u]) : 1), (v) => {
        try {
          const k = evalExpr(v)[0];
          if (!(k > 0)) throw new LabError('Maßstab muss größer als 0 sein');
          st.scales = { ...(st.scales || {}), [u]: k };
          changed();
          renderAll();
        } catch (err) { say(`⚠️ ${err.message}`); }
      }, { size: 5, disabled: !teacher && st.lockScales }), u ? ` ${u}` : '')),
      teacher ? h('label', { class: 'lab-check', title: 'Schüler können den Maßstab nicht ändern' }, h('input', { type: 'checkbox', checked: !!st.lockScales, onchange: (e) => { st.lockScales = e.target.checked; changed(); } }), ' fest') : null);
    const rows = res.map((r) => {
      const it = byId(r.id);
      const can = editable(it);
      const polar = it.mode === 'polar';
      const valueField = field(it.expr ? `= ${it.expr}` : fmtCx(it.value || [0, 0], '', polar ? 'polar' : 'kart'), (v) => setValue(it, v), { class: 'lab-value', disabled: !can, title: '3 + j4 · 5∠30° · = U / Z (Formel bleibt verbunden)' });
      const other = r.val ? fmtCx(r.val, it.unit ?? '', polar ? 'kart' : 'polar') : '';
      const start = it.anchor && byId(it.anchor)
        ? h('span', { class: 'lab-anchor' }, `an ${byId(it.anchor).name || '?'} `, can ? h('button', { type: 'button', class: 'lab-mini', title: 'Lösen – der Anfang bleibt, wo er ist', onclick: () => {
          delete it.anchor;
          it.x0 = round(r.start[0]);
          it.y0 = round(r.start[1]);
          changed();
          renderAll();
        } }, '✂') : null)
        : h('span', { class: 'lab-start' },
          field(fmtNum(Number(it.x0) || 0), (v) => { try { it.x0 = round(evalExpr(v)[0]); changed(); renderAll(); } catch (err) { say(`⚠️ ${err.message}`); } }, { size: 3, disabled: !can, title: 'Anfang x in cm' }),
          field(fmtNum(Number(it.y0) || 0), (v) => { try { it.y0 = round(evalExpr(v)[0]); changed(); renderAll(); } catch (err) { say(`⚠️ ${err.message}`); } }, { size: 3, disabled: !can, title: 'Anfang y in cm' }));
      const row = h('tr', { class: `${sel === it.id ? 'lab-sel' : ''}${it.show === false ? ' lab-hidden' : ''}`, onclick: (e) => {
        if (e.target.closest('input, select, button')) return;
        sel = sel === it.id ? null : it.id;
        renderAll();
      } },
        h('td', {}, h('input', { type: 'color', value: it.color || LAB_COLORS[0], disabled: !can, title: 'Farbe', oninput: (e) => { it.color = e.target.value; renderCanvas(); }, onchange: () => { changed(); } })),
        h('td', {}, field(it.name ?? '', (v) => { it.name = v.trim(); if (!it.unit && guessUnit(it.name)) it.unit = guessUnit(it.name); changed(); renderAll(); }, { size: 4, disabled: !can, class: 'lab-name', title: 'Name' })),
        h('td', { class: 'lab-valcell' }, valueField,
          h('button', { type: 'button', class: 'lab-mini', title: polar ? 'Als x + jy schreiben' : 'Als Betrag ∠ Winkel schreiben', onclick: () => { it.mode = polar ? 'kart' : 'polar'; changed(); renderAll(); } }, polar ? 'x+jy' : '∠'),
          r.err ? h('div', { class: 'lab-err', text: r.err }) : h('div', { class: 'lab-other', text: other })),
        h('td', {}, h('select', { disabled: !can, title: 'Einheit', onchange: (e) => { it.unit = e.target.value; changed(); renderAll(); } },
          ...ZEIGER_UNITS.map((u) => h('option', { value: u, selected: (it.unit ?? '') === u }, u || '–')))),
        h('td', {}, start),
        h('td', {}, h('select', { disabled: !can, title: 'Dicke', onchange: (e) => { it.width = e.target.value; changed(); renderCanvas(); } },
          ...WIDTHS.map(([k, label]) => h('option', { value: k, selected: (it.width || 'm') === k }, label)))),
        h('td', { class: 'lab-acts' },
          h('button', { type: 'button', class: 'lab-mini', disabled: !can, title: it.show === false ? 'Als Pfeil zeigen' : 'Nur als Wert (ohne Pfeil)', onclick: () => { it.show = it.show === false; if (it.show) delete it.show; changed(); renderAll(); } }, it.show === false ? '🙈' : '👁'),
          h('button', { type: 'button', class: 'lab-mini', title: 'Kopie (bleibt mit dem Zeiger verbunden)', onclick: () => copyOf(it.id, false) }, '⧉'),
          h('button', { type: 'button', class: 'lab-mini', title: 'Gegenzeiger anlegen (gleich lang, entgegengesetzt)', onclick: () => copyOf(it.id, true) }, '−'),
          it.expr && can ? h('button', { type: 'button', class: 'lab-mini', title: 'Von der Formel lösen – der Wert bleibt fest', onclick: () => {
            if (!r.val) return;
            it.value = r.val.map(round);
            delete it.expr;
            changed();
            renderAll();
          } }, '🔓') : null,
          teacher ? h('button', { type: 'button', class: `lab-mini${it.locked ? ' lab-on' : ''}`, title: it.locked ? 'Für Schüler fest – zum Freigeben klicken' : 'Für Schüler festlegen', onclick: () => { it.locked = !it.locked; if (!it.locked) delete it.locked; changed(); renderAll(); } }, it.locked ? '🔒' : '🔓') : (it.locked ? h('span', { title: 'vorgegeben', text: '🔒' }) : null),
          can ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Löschen', onclick: () => remove(it.id) }, '✕') : null));
      return row;
    });
    const table = h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {}, ...['', 'Name', 'Wert', 'Einheit', 'Anfang (cm)', 'Dicke', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...rows));
    const viewRow = teacher ? h('div', { class: 'lab-row lab-view' }, h('span', { class: 'lab-label', text: 'Bereich (cm):' }),
      ...[['xmin', 'x von'], ['xmax', 'bis'], ['ymin', 'y von'], ['ymax', 'bis']].map(([k, label]) => h('label', {}, ` ${label} `, field(fmtNum(view()[k]), (v) => {
        try { st[k] = evalExpr(v)[0]; changed(); renderAll(); } catch (err) { say(`⚠️ ${err.message}`); }
      }, { size: 3 })))) : null;
    panel.replaceChildren(top, table, scales, ...(viewRow ? [viewRow] : []),
      h('p', { class: 'lab-hint', text: 'Ziehen: Mitte verschiebt, Spitze ändert den Wert (Alt = ohne Raster). Vorgegebene (🔒) Zeiger ziehen = Kopie herausziehen; ⧉ Kopie, − Gegenzeiger (Taste „-“). Der Anfang rastet an der Spitze eines anderen Zeigers ein und wandert dann mit. Werte: 3 + j4, 5∠30°, 10k, = U2 / Z2.' }));
  }

  renderAll();
  return {
    getState: () => clone(st),
    setState: (s) => { st = clone(s); sel = null; renderAll(); },
    destroy: () => el.replaceChildren(),
  };
}
