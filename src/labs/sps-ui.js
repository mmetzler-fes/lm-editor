// ==================== SPS-LABOR (Bedienung) ====================
//
// Links die Ablaufkette (Bild wie im Arbeitsblatt, aktive Schritte grün), darunter der Simulator:
// ▶ Start, ⏸, ⟲. Zuordnungstabelle: IN/OUT/Merker mit Symbol, Adresse, Beschreibung, Kontaktart
// (Schließer, Öffner, rastend) – Eingänge hier betätigen, Ausgänge leuchten. Darunter die Schritte mit
// Aktionsblöcken (Bestimmungszeichen, Zeit, Aktionsname, Aktorvariable, Zuweisungsbedingung) und
// Transitionen. Rechnen und Zeichnen: lab-core.js (spsCycle, spsSvg). Später rechts: die Anlage (Physik).

import { spsSvg, spsInit, spsCycle, spsCheck, spsInputSignal, SPS_QUALIFIERS, SPS_TIMED } from './lab-core.js';
import { h, field } from './labs.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const CYCLE_MS = 50;
const KINDS = [['in', 'IN'], ['out', 'OUT'], ['mem', 'Merker']];
const CONTACTS = [['NO', 'Schließer'], ['NC', 'Öffner'], ['latch', 'rastend']];
const Q_HELP = {
  N: 'nicht speichernd – solange der Schritt aktiv ist', S: 'speichernd setzen', R: 'vorrangig rücksetzen',
  L: 'zeitbegrenzt (höchstens T)', D: 'zeitverzögert (nach T)', P: 'Impuls (ein Zyklus)',
  DS: 'verzögert gespeichert (nach T, wenn noch aktiv)', SD: 'gespeichert verzögert (nach T, auch wenn nicht mehr aktiv)', SL: 'gespeichert zeitbegrenzt (für T)',
};

export function mount(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  const teacher = mode === 'teacher';
  let rt = null;          // Laufzeit (spsInit), null = gestoppt
  let timer = 0;
  const pressed = {};     // Eingang → betätigt (Taster gedrückt bzw. Rastschalter eingerastet)
  let selStep = null;
  const changed = () => { onChange(clone(st)); if (rt) restart(); renderAll(); };
  const io = () => (st.io ||= []);
  const steps = () => (st.steps ||= []);
  const can = (x) => teacher || !x?.locked;
  const uid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;

  const bar = h('div', { class: 'lab-row lab-tools sps-run' });
  const canvas = h('div', { class: 'lab-canvas sps-canvas', title: 'Schritt antippen: unten bearbeiten' });
  const status = h('div', { class: 'sps-status' });
  const panel = h('div', { class: 'lab-panel' });
  el.append(bar, canvas, status, panel);

  // ---------- Simulation ----------
  const inputs = () => Object.fromEntries(io().filter((x) => x.kind === 'in' && x.name).map((x) => [String(x.name).trim(), spsInputSignal(x, !!pressed[x.id])]));
  function tick() {
    if (!rt) return;
    spsCycle(st, rt, inputs(), CYCLE_MS);
    renderLive();
  }
  function start() {
    const problems = spsCheck(st);
    if (problems.length) say(`⚠️ ${problems[0]}`);
    rt = spsInit(st);
    tick();
    clearInterval(timer);
    timer = setInterval(tick, CYCLE_MS);
    renderBar();
  }
  function restart() { if (rt) { rt = spsInit(st); } }
  function pause() { clearInterval(timer); timer = 0; renderBar(); }
  function resume() { if (!rt) return start(); clearInterval(timer); timer = setInterval(tick, CYCLE_MS); renderBar(); }
  function stop() { clearInterval(timer); timer = 0; rt = null; renderAll(); }

  function renderBar() {
    const running = !!timer;
    bar.replaceChildren(
      h('button', { type: 'button', class: 'lab-btn', onclick: running ? pause : resume, title: running ? 'Anhalten' : 'Steuerung starten (Initialschritt aktiv)' }, running ? '⏸ Anhalten' : rt ? '▶ Weiter' : '▶ Start'),
      h('button', { type: 'button', class: 'lab-btn', onclick: stop, disabled: !rt, title: 'Steuerung stoppen und zurücksetzen' }, '⏹ Stopp'),
      h('span', { class: 'lab-hint', text: rt ? '' : 'Eingänge in der Zuordnungstabelle betätigen (Taster: drücken, rastend: antippen).' }));
  }
  function renderLive() {
    canvas.innerHTML = spsSvg(st, rt ? { active: rt.active, vars: rt.vars } : {});
    canvas.querySelectorAll('[data-step]').forEach((g) => {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => { selStep = g.dataset.step; renderPanel(); panel.querySelector(`[data-edit="${CSS.escape(selStep)}"]`)?.scrollIntoView({ block: 'nearest' }); });
    });
    if (rt) {
      const act = steps().filter((s) => rt.active.includes(s.id)).map((s) => `${s.name} (${((rt.t - rt.since[s.id]) / 1000).toFixed(1)} s)`);
      status.textContent = rt.error ? `⚠️ ${rt.error}` : `Aktiv: ${act.join(', ') || '–'}`;
      status.classList.toggle('sps-err', !!rt.error);
    } else {
      const problems = spsCheck(st);
      status.textContent = problems.length ? `⚠️ ${problems.join(' · ')}` : '';
      status.classList.toggle('sps-err', problems.length > 0);
    }
    panel.querySelectorAll('[data-lamp]').forEach((l) => {
      const v = rt ? rt.vars[l.dataset.lamp] : 0;
      l.classList.toggle('sps-on', !!v);
    });
  }

  // ---------- Zuordnungstabelle ----------
  function ioTable() {
    const names = new Set();
    const rows = io().map((x) => {
      const ok = can(x);
      const name = String(x.name ?? '').trim();
      const dup = name && names.has(name);
      names.add(name);
      let control;
      if (x.kind === 'in') {
        control = h('button', { type: 'button', class: `lab-mini sps-key${pressed[x.id] ? ' lab-on' : ''}`, title: x.contact === 'latch' ? 'Antippen: einrasten / lösen' : 'Gedrückt halten = betätigt' }, x.contact === 'NC' ? '⊣/⊢' : x.contact === 'latch' ? '⇅' : '⊣⊢');
        const set = (v) => { pressed[x.id] = v; control.classList.toggle('lab-on', v); if (rt) tick(); };
        if (x.contact === 'latch') control.addEventListener('click', () => set(!pressed[x.id]));
        else {
          control.addEventListener('pointerdown', (e) => { e.preventDefault(); control.setPointerCapture?.(e.pointerId); set(true); });
          for (const ev of ['pointerup', 'pointercancel']) control.addEventListener(ev, () => set(false));
        }
      } else control = h('span', { class: 'sps-lamp', 'data-lamp': name, title: 'Zustand' });
      return h('tr', {},
        h('td', {}, h('select', { disabled: !ok, onchange: (e) => { x.kind = e.target.value; if (x.kind !== 'in') delete x.contact; else x.contact ||= 'NO'; changed(); } },
          ...KINDS.map(([k, l]) => h('option', { value: k, selected: x.kind === k }, l)))),
        h('td', {}, field(x.name ?? '', (v) => { x.name = v.trim(); changed(); }, { size: 5, disabled: !ok, class: dup ? 'lab-bad' : '', title: dup ? 'Symbol doppelt' : 'Symbolname' })),
        h('td', {}, field(x.addr ?? '', (v) => { x.addr = v.trim(); changed(); }, { size: 6, disabled: !ok, placeholder: '%I0.0' })),
        h('td', {}, field(x.desc ?? '', (v) => { x.desc = v; changed(); }, { size: 18, disabled: !ok, placeholder: 'Beschreibung' })),
        h('td', {}, x.kind === 'in' ? h('select', { disabled: !ok, onchange: (e) => { x.contact = e.target.value; pressed[x.id] = false; changed(); } },
          ...CONTACTS.map(([k, l]) => h('option', { value: k, selected: (x.contact || 'NO') === k }, l))) : ''),
        h('td', {}, control),
        h('td', { class: 'lab-acts' },
          teacher ? h('button', { type: 'button', class: `lab-mini${x.locked ? ' lab-on' : ''}`, title: x.locked ? 'Für Schüler fest – zum Freigeben klicken' : 'Für Schüler festlegen', onclick: () => { x.locked = !x.locked; if (!x.locked) delete x.locked; changed(); } }, x.locked ? '🔒' : '🔓') : (x.locked ? h('span', { text: '🔒', title: 'vorgegeben' }) : null),
          ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Zeile löschen', onclick: () => { st.io = io().filter((y) => y !== x); changed(); } }, '✕') : null));
    });
    const add = (kind) => () => {
      const n = io().filter((x) => x.kind === kind).length;
      const name = { in: 'S', out: 'Y', mem: 'M' }[kind] + (n + 1);
      io().push({ id: uid('io'), kind, name, addr: kind === 'in' ? `%I0.${n}` : kind === 'out' ? `%Q0.${n}` : `%M0.${n}`, desc: '', ...(kind === 'in' ? { contact: 'NO' } : {}) });
      changed();
    };
    return h('div', { class: 'sps-section' },
      h('div', { class: 'lab-label', text: 'Zuordnungstabelle' }),
      h('table', { class: 'lab-table sps-io' },
        h('thead', {}, h('tr', {}, ...['', 'Symbol', 'Adresse', 'Beschreibung', 'Kontakt', 'Zustand', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...rows)),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-btn', onclick: add('in') }, '+ Eingang'),
        h('button', { type: 'button', class: 'lab-btn', onclick: add('out') }, '+ Ausgang'),
        h('button', { type: 'button', class: 'lab-btn', onclick: add('mem') }, '+ Merker')));
  }

  // ---------- Schritte ----------
  function stepEditor(s, i) {
    const ok = can(s);
    const varList = io().filter((x) => x.kind !== 'in' && x.name).map((x) => String(x.name).trim());
    const move = (d) => () => { const l = steps(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; changed(); };
    const actRows = (s.actions || []).map((a) => {
      const timed = SPS_TIMED.includes(a.q);
      return h('tr', {},
        h('td', {}, h('select', { disabled: !ok, title: Q_HELP[a.q] || '', onchange: (e) => { a.q = e.target.value; if (SPS_TIMED.includes(a.q) && !a.time) a.time = 'T#2s'; changed(); } },
          ...SPS_QUALIFIERS.map((q) => h('option', { value: q, selected: a.q === q, title: Q_HELP[q] }, q)))),
        h('td', {}, timed ? field(a.time ?? '', (v) => { a.time = v.trim(); changed(); }, { size: 6, disabled: !ok, placeholder: 'T#2s' }) : ''),
        h('td', {}, field(a.text ?? '', (v) => { a.text = v; changed(); }, { size: 14, disabled: !ok, placeholder: 'Aktionsname' })),
        h('td', {}, h('select', { disabled: !ok, onchange: (e) => { a.var = e.target.value; changed(); } },
          h('option', { value: '', selected: !a.var }, '–'),
          ...[...new Set([...varList, ...(a.var && !varList.includes(a.var) ? [a.var] : [])])].map((v) => h('option', { value: v, selected: a.var === v }, v)))),
        h('td', {}, field(a.cond ?? '', (v) => { a.cond = v.trim(); changed(); }, { size: 10, disabled: !ok, placeholder: '(Bedingung)', title: 'Zuweisungsbedingung (A4) – leer: immer' })),
        h('td', {}, ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Aktion löschen', onclick: () => { s.actions = s.actions.filter((x) => x !== a); changed(); } }, '✕') : null));
    });
    return h('div', { class: `sps-step${selStep === s.id ? ' lab-sel' : ''}`, 'data-edit': s.id },
      h('div', { class: 'lab-row' },
        field(s.name ?? '', (v) => { s.name = v.trim(); changed(); }, { size: 5, disabled: !ok, class: 'lab-name', title: 'Schrittname' }),
        h('label', { class: 'lab-check', title: 'Initialschritt: nach dem Start aktiv (doppelt umrandet)' }, h('input', { type: 'checkbox', checked: !!s.initial, disabled: !ok, onchange: (e) => { steps().forEach((x) => { delete x.initial; }); if (e.target.checked) s.initial = true; changed(); } }), ' Initialschritt'),
        h('span', { style: { flex: '1' } }),
        h('button', { type: 'button', class: 'lab-mini', title: 'Nach oben', disabled: !ok || i === 0, onclick: move(-1) }, '↑'),
        h('button', { type: 'button', class: 'lab-mini', title: 'Nach unten', disabled: !ok || i === steps().length - 1, onclick: move(1) }, '↓'),
        teacher ? h('button', { type: 'button', class: `lab-mini${s.locked ? ' lab-on' : ''}`, title: s.locked ? 'Für Schüler fest' : 'Für Schüler festlegen', onclick: () => { s.locked = !s.locked; if (!s.locked) delete s.locked; changed(); } }, s.locked ? '🔒' : '🔓') : (s.locked ? h('span', { text: '🔒' }) : null),
        ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Schritt löschen', onclick: () => { st.steps = steps().filter((x) => x !== s); changed(); } }, '✕') : null),
      actRows.length ? h('table', { class: 'lab-table sps-acts' },
        h('thead', {}, h('tr', {}, ...['A1', 'Zeit', 'A2 Aktion', 'A3 Variable', 'A4 Bedingung', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...actRows)) : null,
      ok ? h('button', { type: 'button', class: 'lab-mini', onclick: () => { (s.actions ||= []).push({ id: uid('a'), q: 'N', time: '', text: '', var: varList[0] || '', cond: '' }); changed(); } }, '+ Aktion') : null,
      h('div', { class: 'lab-row sps-trans' }, h('span', { class: 'lab-label', text: i + 1 < steps().length ? `Transition → ${steps()[i + 1].name}:` : `Transition → ${(steps().find((x) => x.initial) || steps()[0])?.name || ''}:` }),
        field(s.trans ?? '', (v) => { s.trans = v.trim(); changed(); }, { size: 26, disabled: !ok, placeholder: 'z. B. S1 AND NOT B2 oder S_2.T >= T#3s' })));
  }

  function renderPanel() {
    const list = steps().map(stepEditor);
    const addStep = () => {
      const n = steps().length + 1;
      steps().push({ id: uid('s'), name: `S_${n}`, trans: '', actions: [], ...(n === 1 ? { initial: true } : {}) });
      changed();
    };
    panel.replaceChildren(ioTable(),
      h('div', { class: 'sps-section' }, h('div', { class: 'lab-label', text: 'Schrittkette' }), ...list,
        h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-btn', onclick: addStep }, '+ Schritt'),
          h('label', { class: 'lab-check', title: 'Nach dem letzten Schritt zurück zum Initialschritt' }, h('input', { type: 'checkbox', checked: st.back !== false, onchange: (e) => { st.back = e.target.checked; changed(); } }), ' Kette schließen (zurück zum Initialschritt)'))),
      h('p', { class: 'lab-hint', text: 'Bedingungen: AND (&, *), OR (+), XOR, NOT (/, !), Klammern, Schrittmerker S_2.X, Schrittzeit S_2.T >= T#3s. Bestimmungszeichen: N S R L D P DS SD SL (L, D, DS, SD, SL mit Zeit T#…).' }));
    renderLive();
  }
  function renderAll() { renderBar(); renderPanel(); }

  renderAll();
  return {
    getState: () => clone(st),
    setState: (s) => { st = clone(s); stop(); },
    destroy: () => { clearInterval(timer); el.replaceChildren(); },
  };
}
