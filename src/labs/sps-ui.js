// ==================== SPS-LABOR (Bedienung) ====================
//
// Links die Ablaufkette (Bild wie im Arbeitsblatt, aktive Schritte grün), darunter der Simulator:
// ▶ Start, ⏸, ⟲. Zuordnungstabelle: IN/OUT/Merker mit Symbol, Adresse, Beschreibung, Kontaktart
// (Schließer, Öffner, rastend) – Eingänge hier betätigen, Ausgänge leuchten. Darunter die Schritte mit
// Aktionsblöcken (Bestimmungszeichen, Zeit, Aktionsname, Aktorvariable, Zuweisungsbedingung) und
// Transitionen. Verzweigungen (alternativ, parallel) und Sprünge entstehen in der Grafik: Schritt antippen →
// „⑂ Alternativ danach“ / „⫴ Parallel danach“; Linie der Verzweigung antippen → Zweige, Sprungziel.
// Rechnen und Zeichnen: lab-core.js (spsGraph, spsCycle, spsSvg). Rechts die Anlage (plant-core.js, plant-ui.js):
// Sensoren und Endlagen liefern dort ihre Eingänge selbst, Ausgänge bewegen Bänder und Zylinder.

import { spsSvg, spsInit, spsCycle, spsCheck, spsInputSignal, spsFlat, spsLocate, spsGraph, spsSortIo, spsNextAddr, spsInsertIo, spsRenumber, SPS_QUALIFIERS, SPS_TIMED } from './lab-core.js';
import { h, field } from './labs.js';
import { plantInit, plantStep, plantInputs, plantInputNames, plantUpgrade } from './plant-core.js';
import { mountPlant } from './plant-ui.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const CYCLE_MS = 50;
const KINDS = [['in', 'IN'], ['out', 'OUT'], ['mem', 'Merker'], ['tim', 'Zeitglied']];
const CONTACTS = [['NO', 'Schließer'], ['NC', 'Öffner'], ['latch', 'rastend']];
const Q_HELP = {
  N: 'nicht speichernd – solange der Schritt aktiv ist', S: 'speichernd setzen', R: 'vorrangig rücksetzen',
  L: 'zeitbegrenzt (höchstens T)', D: 'zeitverzögert (nach T)', P: 'Impuls (ein Zyklus)',
  DS: 'verzögert gespeichert (nach T, wenn noch aktiv)', SD: 'gespeichert verzögert (nach T, auch wenn nicht mehr aktiv)', SL: 'gespeichert zeitbegrenzt (für T)',
};

export function mount(el, { state, mode, onChange, say = () => {} }) {
  let st = clone(state);
  plantUpgrade(st.plant); // Anlage der ersten Fassung: Zylindergehäuse = Hub + 0,8
  const teacher = mode === 'teacher';
  let rt = null;          // Laufzeit (spsInit), null = gestoppt
  let world = null;       // Anlage während des Laufs (plantInit)
  let timer = 0;
  const pressed = {};     // Eingang → betätigt (Taster gedrückt bzw. Rastschalter eingerastet)
  // Rastende Eingänge mit start: true sind zu Beginn betätigt (z. B. Endlage „eingefahren“ ohne Anlage).
  for (const x of st.io || []) if (x.kind === 'in' && x.contact === 'latch' && x.start) pressed[x.id] = true;
  let selStep = null;
  let listOpen = false; // Liste der Schritte unter der Grafik: zugeklappt
  // Lineare Nummerierung (S_1, S_2, …), solange alle Schritte so heißen – nach jeder Änderung.
  const changed = () => { spsRenumber(st); onChange(clone(st)); if (rt) restart(); renderAll(); };
  const io = () => (st.io ||= []);
  const steps = () => (st.steps ||= []);
  const allSteps = () => spsFlat(st);
  // Fest (🔒) ist ein Eintrag auch, wenn die Verzweigung, in der er steht, fest ist.
  const can = (x) => teacher || !(x?.locked || (x?.id && (spsLocate(st, x.id)?.parents || []).some((p) => p.locked)));
  const uid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;
  /** Neuer Schritt mit freiem Namen S_n (`also`: Schritte, die noch nicht in der Kette stehen). */
  const newStep = (...also) => {
    const used = new Set([...allSteps(), ...also].map((x) => String(x.name ?? '').trim()));
    let n = allSteps().length + also.length + 1;
    while (used.has(`S_${n}`)) n++;
    return { id: uid('s'), name: `S_${n}`, trans: '', actions: [] };
  };

  const bar = h('div', { class: 'lab-row lab-tools sps-run' });
  const canvas = h('div', { class: 'lab-canvas sps-canvas', title: 'Schritt antippen: unten bearbeiten' });
  const plantHost = h('div', { class: 'plant-host' });
  const status = h('div', { class: 'sps-status' });
  const panel = h('div', { class: 'lab-panel' });
  el.append(bar, h('div', { class: 'sps-main' }, canvas, plantHost), status, panel);

  // ---------- Simulation ----------
  // Eingänge: Sensoren und Endlagen aus der Anlage, alles andere von den Tastern (Tabelle oder Anlage).
  const inputs = () => {
    const fromPlant = st.plant && world ? plantInputs(st.plant, world) : {};
    const byPlant = st.plant ? plantInputNames(st.plant) : new Set();
    return Object.fromEntries(io().filter((x) => x.kind === 'in' && x.name).map((x) => {
      const n = String(x.name).trim();
      // Auch Sensoren und Endlagen der Anlage richten sich nach der Kontaktart (Öffner: betätigt = 0).
      return [n, byPlant.has(n) ? spsInputSignal(x, !!fromPlant[n]) : spsInputSignal(x, !!pressed[x.id])];
    }));
  };
  function tick() {
    if (!rt) return;
    spsCycle(st, rt, inputs(), CYCLE_MS);
    if (st.plant) {
      world ||= plantInit(st.plant);
      plantStep(st.plant, world, rt.vars, CYCLE_MS / 1000);
    }
    renderLive();
  }
  function start() {
    const problems = spsCheck(st);
    if (problems.length) say(`⚠️ ${problems[0]}`);
    rt = spsInit(st);
    world = st.plant ? plantInit(st.plant) : null;
    tick();
    clearInterval(timer);
    timer = setInterval(tick, CYCLE_MS);
    renderBar();
  }
  function restart() { if (rt) { rt = spsInit(st); world = st.plant ? plantInit(st.plant) : null; } }
  function pause() { clearInterval(timer); timer = 0; renderBar(); }
  function resume() { if (!rt) return start(); clearInterval(timer); timer = setInterval(tick, CYCLE_MS); renderBar(); }
  function stop() { clearInterval(timer); timer = 0; rt = null; world = null; renderAll(); }

  function renderBar() {
    const running = !!timer;
    bar.replaceChildren(
      h('button', { type: 'button', class: 'lab-btn', onclick: running ? pause : resume, title: running ? 'Anhalten' : 'Steuerung starten (Initialschritt aktiv)' }, running ? '⏸ Anhalten' : rt ? '▶ Weiter' : '▶ Start'),
      h('button', { type: 'button', class: 'lab-btn', onclick: stop, disabled: !rt, title: 'Steuerung stoppen und zurücksetzen' }, '⏹ Stopp'),
      h('span', { class: 'lab-hint', text: rt ? '' : 'Eingänge in der Zuordnungstabelle betätigen (Taster: drücken, rastend: antippen).' }));
  }
  function renderLive() {
    canvas.innerHTML = spsSvg(st, { ...(rt ? { active: rt.active, vars: rt.vars } : {}), edit: true });
    canvas.querySelectorAll('[data-step]').forEach((g) => {
      g.style.cursor = 'pointer';
      g.addEventListener('click', (e) => { selStep = g.dataset.step; popStep(byStep(g.dataset.step), e); });
    });
    canvas.querySelectorAll('[data-trans]').forEach((g) => g.addEventListener('click', (e) => popTrans(byStep(g.dataset.trans), e)));
    canvas.querySelectorAll('[data-act]').forEach((g) => g.addEventListener('click', (e) => {
      const [sid, aid] = g.dataset.act.split('|');
      const s0 = byStep(sid);
      popAction(s0, (s0?.actions || []).find((a) => a.id === aid), e);
    }));
    // (+) an der Transition: Menü – Schritt danach (Regelfall), Alternativ- oder Parallelverzweigung
    canvas.querySelectorAll('[data-add-step]').forEach((g) => g.addEventListener('click', (e) => popInsert(g.dataset.addStep, e)));
    // Verzweigungen: Linie antippen, Transition eines Zweigs, Synchronisation, Zweig dazu, erster Schritt
    canvas.querySelectorAll('[data-fork]').forEach((g) => g.addEventListener('click', (e) => popFork(spsLocate(st, g.dataset.fork)?.el, e)));
    canvas.querySelectorAll('[data-btrans]').forEach((g) => g.addEventListener('click', (e) => {
      const [fid, bid] = g.dataset.btrans.split('|');
      const fork = spsLocate(st, fid)?.el;
      popBranch(fork, (fork?.branches || []).find((b) => b.id === bid), e);
    }));
    canvas.querySelectorAll('[data-ptrans]').forEach((g) => g.addEventListener('click', (e) => popSync(spsLocate(st, g.dataset.ptrans)?.el, e)));
    canvas.querySelectorAll('[data-add-branch]').forEach((g) => g.addEventListener('click', (e) => {
      const fork = spsLocate(st, g.dataset.addBranch)?.el;
      if (!fork || !can(fork)) return;
      const b = { id: uid('b'), ...(fork.type === 'alt' ? { trans: '' } : {}), steps: [newStep()] };
      fork.branches.push(b);
      changed();
      if (fork.type === 'alt') popBranch(fork, b, e);
    }));
    canvas.querySelectorAll('[data-add-first]').forEach((g) => g.addEventListener('click', () => {
      const [fid, bid] = g.dataset.addFirst.split('|');
      const fork = spsLocate(st, fid)?.el;
      const b = (fork?.branches || []).find((x) => x.id === bid);
      if (!b || !can(fork)) return;
      (b.steps ||= []).unshift(newStep());
      changed();
    }));
    canvas.querySelectorAll('[data-add-act]').forEach((g) => g.addEventListener('click', (e) => {
      const s0 = byStep(g.dataset.addAct);
      if (!s0 || !can(s0)) return;
      const a = { id: uid('a'), q: 'N', time: '', text: '', var: '', cond: '' };
      (s0.actions ||= []).push(a);
      changed();
      popAction(s0, a, e);
    }));
    if (rt) {
      const act = allSteps().filter((s) => rt.active.includes(s.id)).map((s) => `${s.name} (${((rt.t - rt.since[s.id]) / 1000).toFixed(1)} s)`);
      status.textContent = rt.error ? `⚠️ ${rt.error}` : `Aktiv: ${act.join(', ') || '–'}`;
      status.classList.toggle('sps-err', !!rt.error);
    } else {
      const problems = spsCheck(st);
      status.textContent = problems.length ? `⚠️ ${problems.join(' · ')}` : '';
      status.classList.toggle('sps-err', problems.length > 0);
    }
    plant.render(world, rt ? rt.vars : {});
    panel.querySelectorAll('[data-lamp]').forEach((l) => {
      const v = rt ? rt.vars[l.dataset.lamp] : 0;
      l.classList.toggle('sps-on', !!v);
    });
  }

  // ---------- Bearbeiten in der Grafik (kleines Feld an der angetippten Stelle) ----------
  const byStep = (id) => allSteps().find((x) => x.id === id) || null;
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  function openPop(e, title, ...rows) {
    closePop();
    // Am Labor (nicht in der Zeichnung): Die Zeichnung wird bei jeder Änderung neu aufgebaut.
    el.style.position = 'relative';
    const r = el.getBoundingClientRect();
    const k = r.width / (el.offsetWidth || r.width || 1) || 1; // Zoom des Blatts (Stift-Editor)
    const left = (e.clientX - r.left) / k;
    const top = (e.clientY - r.top) / k + 12;
    pop = h('div', { class: 'sps-pop', style: { left: `${Math.max(0, left)}px`, top: `${top}px` } },
      h('div', { class: 'sps-pop-head' }, h('strong', { text: title }), h('button', { type: 'button', class: 'lab-mini', title: 'Schließen', onclick: closePop }, '✕')),
      ...rows.filter(Boolean));
    pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.appendChild(pop);
    // Ganz sichtbar halten: nicht über den Rand des Fensters oder des Blatts (das abschneidet) hinaus.
    const clip = el.closest('.ink-scroll, .lm-paper, .lab-dialog')?.getBoundingClientRect();
    const minX = Math.max(0, clip?.left ?? 0) + 8;
    const maxX = Math.min(window.innerWidth, clip?.right ?? window.innerWidth) - 8;
    const pr = pop.getBoundingClientRect();
    let dx = 0;
    if (pr.right > maxX) dx = maxX - pr.right;
    if (pr.left + dx < minX) dx = minX - pr.left;
    if (dx) pop.style.left = `${left + dx / k}px`;
    pop.querySelector('input, select')?.focus({ preventScroll: true });
  }
  // Vorschläge für Bedingungen: Eingänge, Merker, Zeitglieder (.Q), Schritte (.X)
  const condWords = () => [...io().filter((x) => x.name).map((x) => (x.kind === 'tim' ? `${x.name}.Q` : x.name)), ...allSteps().map((x) => `${x.name}.X`), 'AND', 'OR', 'NOT'];
  function condField(value, onSet, placeholder) {
    const listId = uid('dl');
    const inp = field(value ?? '', (v) => onSet(v.trim()), { size: 28, placeholder, list: listId });
    const chips = h('div', { class: 'sps-chips' }, ...condWords().map((w) => h('button', { type: 'button', class: 'lab-mini', onclick: () => {
      inp.value = `${inp.value.trim()}${inp.value.trim() ? ' ' : ''}${w}`.trim();
      inp.focus();
    } }, w)));
    const apply = h('button', { type: 'button', class: 'lab-btn', onclick: () => { onSet(inp.value.trim()); closePop(); } }, 'Übernehmen');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') closePop(); });
    return [inp, h('datalist', { id: listId }, ...condWords().map((w) => h('option', { value: w }))), chips, apply];
  }
  function popTrans(s0, e, fresh = false) {
    if (!s0 || !can(s0)) return;
    openPop(e, `${fresh ? 'Neuer Schritt – ' : ''}Transition ${s0.name} → ${targetsOf(s0.id)}`,
      ...condField(s0.trans, (v) => { s0.trans = v; changed(); }, 'z. B. SF1 AND NOT B2 oder tonT1.Q'));
  }
  /** Namen der Schritte, zu denen die Transition nach `id` führt. */
  function targetsOf(id) {
    const g = spsGraph(st);
    const t = g.trans.find((x) => x.from.includes(id));
    return t ? t.to.map((x) => g.flat.find((s) => s.id === x)?.name).join(', ') : '–';
  }
  function popStep(s0, e) {
    if (!s0) return;
    const ok = can(s0);
    const loc = spsLocate(st, s0.id);
    const list = loc?.list || steps();
    const i = list.indexOf(s0);
    const move = (d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); closePop(); };
    openPop(e, `Schritt ${s0.name}`,
      h('div', { class: 'lab-row' }, h('span', { text: 'Name ' }), field(s0.name ?? '', (v) => { s0.name = v.trim(); changed(); }, { size: 6, disabled: !ok })),
      h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!s0.initial, disabled: !ok, onchange: (ev) => { allSteps().forEach((x) => { delete x.initial; }); if (ev.target.checked) s0.initial = true; changed(); } }), ' Initialschritt'),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-mini', disabled: !ok || i === 0, onclick: () => move(-1) }, '↑ nach oben'),
        h('button', { type: 'button', class: 'lab-mini', disabled: !ok || i === list.length - 1, onclick: () => move(1) }, '↓ nach unten'),
        h('button', { type: 'button', class: 'lab-mini', disabled: !ok, onclick: () => { (s0.actions ||= []).push({ id: uid('a'), q: 'N', time: '', text: '', var: '', cond: '' }); changed(); closePop(); } }, '+ Aktion')),
      ok && allSteps().length > 1 ? h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => { list.splice(list.indexOf(s0), 1); changed(); closePop(); } }, '✕ Schritt löschen')) : null);
  }
  /**
   * (+) an der Transition nach Schritt `id`: Schritt danach (Regelfall, lineare Kette) oder eine Verzweigung.
   * Verzweigung: zwei Zweige mit je einem neuen Schritt; was danach kam, folgt der Zusammenführung.
   */
  function popInsert(id, e) {
    const loc = spsLocate(st, id);
    const s0 = loc?.el;
    if (!loc?.list || !s0 || !can(s0)) return;
    const after = (el) => { loc.list.splice(loc.list.indexOf(s0) + 1, 0, el); };
    const step = () => {
      after(newStep());
      changed();
      closePop();
      if (spsGraph(st).uses.has(s0.id)) popTrans(s0, e, true);
    };
    const branch = (type) => {
      const a = newStep();
      const b = newStep(a);
      const fork = type === 'alt'
        ? { id: uid('v'), type, branches: [{ id: uid('b'), trans: s0.trans || '', steps: [a] }, { id: uid('b'), trans: '', steps: [b] }] }
        : { id: uid('v'), type, trans: '', branches: [{ id: uid('b'), steps: [a] }, { id: uid('b'), steps: [b] }] };
      if (type === 'alt') s0.trans = '';
      after(fork);
      changed();
      closePop();
      say(type === 'alt' ? '⑂ Alternativverzweigung: Transitionen an den Zweigen eintragen (antippen).' : '⫴ Parallelverzweigung: Transition davor und nach der Synchronisation eintragen.');
    };
    openPop(e, `Nach ${s0.name} einfügen`,
      h('button', { type: 'button', class: 'lab-btn lab-btn-primary', title: 'Neuer Schritt direkt dahinter – die folgenden rücken eine Nummer weiter', onclick: step }, '+ Schritt danach'),
      h('button', { type: 'button', class: 'lab-btn', title: 'Danach geht es je nach Bedingung in einen von mehreren Zweigen (ODER) – mit Sprung auch zurück', onclick: () => branch('alt') }, '⑂ Alternativverzweigung'),
      h('button', { type: 'button', class: 'lab-btn', title: 'Danach laufen mehrere Zweige gleichzeitig (UND), weiter erst, wenn alle fertig sind', onclick: () => branch('par') }, '⫴ Parallelverzweigung'));
  }

  /** Linie einer Verzweigung: Zweig dazu, festlegen, ganze Verzweigung löschen. */
  function popFork(fork, e) {
    if (!fork) return;
    const ok = can(fork);
    const loc = spsLocate(st, fork.id);
    const alt = fork.type === 'alt';
    openPop(e, alt ? '⑂ Alternativverzweigung (ODER)' : '⫴ Parallelverzweigung (UND)',
      h('div', { class: 'lab-hint', text: alt ? 'Je Zweig eine Transition – es geht in den ersten Zweig, dessen Bedingung erfüllt ist (links hat Vorrang). Zweig antippen: Bedingung, Sprung.'
        : 'Alle Zweige starten zugleich. Weiter geht es erst, wenn in jedem Zweig der letzte Schritt aktiv ist und die Transition darunter erfüllt ist.' }),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-mini', disabled: !ok, onclick: () => { fork.branches.push({ id: uid('b'), ...(alt ? { trans: '' } : {}), steps: [newStep()] }); changed(); closePop(); } }, '+ Zweig'),
        teacher ? h('button', { type: 'button', class: `lab-mini${fork.locked ? ' lab-on' : ''}`, title: 'Für Schüler festlegen (mit allem darin)', onclick: () => { fork.locked = !fork.locked; if (!fork.locked) delete fork.locked; changed(); closePop(); } }, fork.locked ? '🔒 fest' : '🔓 festlegen') : null,
        ok ? h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => {
          if (!confirm('Die Verzweigung mit allen Schritten darin löschen?')) return;
          loc.list.splice(loc.index, 1);
          changed();
          closePop();
        } }, '✕ Verzweigung löschen') : null));
  }
  /** Zweig einer Alternativverzweigung: Transition, Sprungziel, Schritt am Anfang, löschen. */
  function popBranch(fork, b, e) {
    if (!fork || !b) return;
    const ok = can(fork);
    const k = fork.branches.indexOf(b);
    const names = allSteps().map((x) => String(x.name ?? '').trim()).filter(Boolean);
    openPop(e, `Zweig ${k + 1} – Transition`,
      ...(ok ? condField(b.trans, (v) => { b.trans = v; changed(); }, 'z. B. B1 AND NOT B2') : [h('span', { text: b.trans || '–' })]),
      h('div', { class: 'lab-row' }, h('span', { text: 'Am Ende ' }),
        h('select', { disabled: !ok, title: 'Zusammenführen oder zu einem Schritt springen (z. B. zurück für eine Schleife)', onchange: (ev) => { if (ev.target.value) b.jump = ev.target.value; else delete b.jump; changed(); } },
          h('option', { value: '', selected: !b.jump }, 'zusammenführen'),
          ...names.map((n) => h('option', { value: n, selected: b.jump === n }, `Sprung zu ${n}`)))),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-mini', disabled: !ok, onclick: () => { (b.steps ||= []).unshift(newStep()); changed(); closePop(); } }, '+ Schritt am Anfang'),
        ok && fork.branches.length > 1 ? h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => { fork.branches.splice(k, 1); changed(); closePop(); } }, '✕ Zweig löschen') : null));
  }
  /** Transition nach der Synchronisation einer Parallelverzweigung. */
  function popSync(fork, e) {
    if (!fork || !can(fork)) return;
    openPop(e, 'Transition nach der Synchronisation', ...condField(fork.trans, (v) => { fork.trans = v; changed(); }, 'z. B. B3 AND B4'));
  }
  function popAction(s0, a, e) {
    if (!s0 || !a) return;
    const ok = can(s0);
    const vars = [['out', 'Ausgänge'], ['mem', 'Merker'], ['tim', 'Zeitglieder']];
    const timeRow = h('div', { class: 'lab-row', style: { display: SPS_TIMED.includes(a.q) ? '' : 'none' } }, h('span', { text: 'Zeit ' }),
      field(a.time ?? '', (v) => { a.time = v.trim(); changed(); }, { size: 8, disabled: !ok, placeholder: 'T#3s' }));
    openPop(e, `Aktion in ${s0.name}`,
      h('div', { class: 'lab-row sps-qs' }, ...SPS_QUALIFIERS.map((q) => h('button', { type: 'button', class: `lab-mini${a.q === q ? ' lab-on' : ''}`, title: Q_HELP[q], disabled: !ok, onclick: () => {
        a.q = q;
        if (SPS_TIMED.includes(q) && !a.time) a.time = 'T#3s';
        changed();
        popAction(s0, a, e);
      } }, q))),
      h('div', { class: 'lab-hint', text: Q_HELP[a.q] || '' }),
      timeRow,
      h('div', { class: 'lab-row' }, h('span', { text: 'Aktion ' }), field(a.text ?? '', (v) => { a.text = v; changed(); }, { size: 22, disabled: !ok, placeholder: 'z. B. Schütz QA1 ein' })),
      h('div', { class: 'lab-row' }, h('span', { text: 'Variable ' }), h('select', { disabled: !ok, onchange: (ev) => { a.var = ev.target.value; changed(); } },
        h('option', { value: '', selected: !a.var }, '–'),
        ...vars.map(([k, label]) => {
          const names = io().filter((x) => x.kind === k && x.name).map((x) => String(x.name).trim());
          return names.length ? h('optgroup', { label }, ...names.map((v) => h('option', { value: v, selected: a.var === v }, v))) : null;
        }))),
      h('div', { class: 'lab-row' }, h('span', { text: 'Bedingung (A4) ' }), field(a.cond ?? '', (v) => { a.cond = v.trim(); changed(); }, { size: 16, disabled: !ok, placeholder: 'leer = immer' })),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-btn', onclick: closePop }, 'Fertig'),
        ok ? h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => { s0.actions = s0.actions.filter((x) => x !== a); changed(); closePop(); } }, '✕ Aktion löschen') : null));
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
      if (x.kind === 'in' && st.plant && plantInputNames(st.plant).has(name)) {
        control = h('span', { class: 'sps-lamp', 'data-lamp': name, title: 'Kommt von der Anlage (Sensor bzw. Endlage)' });
      } else if (x.kind === 'in') {
        control = h('button', { type: 'button', class: `lab-mini sps-key${pressed[x.id] ? ' lab-on' : ''}`, title: x.contact === 'latch' ? 'Antippen: einrasten / lösen' : 'Gedrückt halten = betätigt' }, x.contact === 'NC' ? '⊣/⊢' : x.contact === 'latch' ? '⇅' : '⊣⊢');
        const set = (v) => press(x, v);
        control.dataset.key = x.id;
        if (x.contact === 'latch') control.addEventListener('click', () => set(!pressed[x.id]));
        else {
          control.addEventListener('pointerdown', (e) => { e.preventDefault(); control.setPointerCapture?.(e.pointerId); set(true); });
          for (const ev of ['pointerup', 'pointercancel']) control.addEventListener(ev, () => set(false));
        }
      } else control = h('span', { class: 'sps-lamp', 'data-lamp': name, title: 'Zustand' });
      return h('tr', { 'data-io': x.id },
        h('td', { class: 'sps-grip-cell' }, ok ? h('span', { class: 'sps-grip', title: 'Zeile verschieben: anfassen und ziehen', onpointerdown: (e) => dragRow(e, x) }, '⠿') : null),
        h('td', {}, h('select', { disabled: !ok, onchange: (e) => {
          x.kind = e.target.value;
          if (x.kind !== 'in') delete x.contact; else x.contact ||= 'NO';
          // Zeitglieder haben keine Adresse (Multiinstanz im FB oder eigener DB); sonst die nächste freie
          if (x.kind === 'tim') delete x.addr; else if (!x.addr || !String(x.addr).toUpperCase().includes({ in: 'I', out: 'Q', mem: 'M' }[x.kind])) x.addr = spsNextAddr(io().filter((y) => y !== x), x.kind);
          changed();
        } },
          ...KINDS.map(([k, l]) => h('option', { value: k, selected: x.kind === k }, l)))),
        h('td', {}, field(x.name ?? '', (v) => { x.name = v.trim(); changed(); }, { size: 5, disabled: !ok, class: dup ? 'lab-bad' : '', title: dup ? 'Symbol doppelt' : 'Symbolname' })),
        h('td', {}, x.kind === 'tim' ? h('span', { class: 'lab-hint', text: '–', title: 'Zeitglied: keine Adresse (Multiinstanz im FB oder eigener DB)' })
          : field(x.addr ?? '', (v) => { x.addr = v.trim(); changed(); }, { size: 6, disabled: !ok, placeholder: { in: '%I0.0', out: '%Q0.0', mem: '%M0.0' }[x.kind] || '' })),
        h('td', {}, field(x.desc ?? '', (v) => { x.desc = v; changed(); }, { size: 18, disabled: !ok, placeholder: 'Beschreibung' })),
        h('td', {}, x.kind === 'in' ? h('select', { disabled: !ok, onchange: (e) => { x.contact = e.target.value; pressed[x.id] = false; changed(); } },
          ...CONTACTS.map(([k, l]) => h('option', { value: k, selected: (x.contact || 'NO') === k }, l))) : ''),
        h('td', {}, control),
        h('td', { class: 'lab-acts' },
          teacher ? h('button', { type: 'button', class: `lab-mini${x.locked ? ' lab-on' : ''}`, title: x.locked ? 'Für Schüler fest – zum Freigeben klicken' : 'Für Schüler festlegen', onclick: () => { x.locked = !x.locked; if (!x.locked) delete x.locked; changed(); } }, x.locked ? '🔒' : '🔓') : (x.locked ? h('span', { text: '🔒', title: 'vorgegeben' }) : null),
          ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Zeile löschen', onclick: () => { st.io = io().filter((y) => y !== x); changed(); } }, '✕') : null));
    });
    // Neue Zeile: freier Name, nächste freie Adresse, an ihrem Platz (Art, dann Adresse)
    const add = (kind) => () => {
      const used = new Set(io().map((x) => String(x.name ?? '').trim()));
      const base = { in: 'S', out: 'Y', mem: 'M', tim: 'tonT' }[kind];
      let n = io().filter((x) => x.kind === kind).length + 1;
      while (used.has(`${base}${n}`)) n++;
      spsInsertIo(io(), { id: uid('io'), kind, name: `${base}${n}`, ...(kind === 'tim' ? {} : { addr: spsNextAddr(io(), kind) }), desc: '', ...(kind === 'in' ? { contact: 'NO' } : {}) });
      changed();
    };
    return h('div', { class: 'sps-section' },
      h('div', { class: 'lab-label', text: 'Zuordnungstabelle' }),
      h('table', { class: 'lab-table sps-io' },
        h('thead', {}, h('tr', {}, ...['', '', 'Symbol', 'Adresse', 'Beschreibung', 'Kontakt', 'Zustand', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...rows)),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-btn', onclick: add('in') }, '+ Eingang'),
        h('button', { type: 'button', class: 'lab-btn', onclick: add('out') }, '+ Ausgang'),
        h('button', { type: 'button', class: 'lab-btn', onclick: add('mem') }, '+ Merker'),
        h('button', { type: 'button', class: 'lab-btn', onclick: add('tim'), title: 'Zeitglied: im Aktionsblock mit D/L T#… ansteuern, in der Transition tonT1.Q abfragen' }, '+ Zeitglied'),
        h('button', { type: 'button', class: 'lab-btn', title: 'Ganze Tabelle ordnen: Eingänge, Ausgänge, Merker, Zeitglieder – je nach Adresse', onclick: () => { spsSortIo(io()); changed(); } }, '⇅ Sortieren')));
  }

  /**
   * Zeile am Griff ⠿ ziehen (Maus, Finger, Stift): Die Zeile folgt dem Zeiger, eine Linie zeigt, wo sie
   * landet; beim Loslassen wird die Tabelle umsortiert.
   */
  function dragRow(e, x) {
    const tr = e.target.closest('tr');
    const tbody = tr?.parentElement;
    if (!tbody) return;
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    const rows = [...tbody.children];
    const from = rows.indexOf(tr);
    const startY = e.clientY;
    let to = from;
    tr.classList.add('sps-dragging');
    const mark = (i) => rows.forEach((r, k) => { r.classList.toggle('sps-drop-before', k === i && i < from); r.classList.toggle('sps-drop-after', k === i && i > from); });
    const move = (ev) => {
      tr.style.transform = `translateY(${ev.clientY - startY}px)`;
      to = from;
      rows.forEach((r, k) => {
        if (r === tr) return;
        const b = r.getBoundingClientRect();
        const mid = b.top + b.height / 2;
        if (k < from && ev.clientY < mid) to = Math.min(to, k);
        if (k > from && ev.clientY > mid) to = Math.max(to, k);
      });
      mark(to);
    };
    const up = () => {
      e.target.removeEventListener('pointermove', move);
      e.target.removeEventListener('pointerup', up);
      e.target.removeEventListener('pointercancel', up);
      tr.style.transform = '';
      tr.classList.remove('sps-dragging');
      mark(-1);
      if (to === from) return;
      const list = io();
      const i = list.indexOf(x);
      const target = list.indexOf(io().find((y) => y.id === rows[to].dataset.io));
      if (i < 0 || target < 0) return;
      list.splice(i, 1);
      list.splice(target, 0, x);
      changed();
    };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
    e.target.addEventListener('pointercancel', up);
  }

  // ---------- Schritte ----------
  function stepEditor(s, uses) {
    const ok = can(s);
    const varList = io().filter((x) => x.kind !== 'in' && x.name).map((x) => String(x.name).trim());
    const l = spsLocate(st, s.id)?.list || steps();
    const i = l.indexOf(s);
    const move = (d) => () => { const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; changed(); };
    const actRows = (s.actions || []).map((a) => {
      const timed = SPS_TIMED.includes(a.q);
      return h('tr', {},
        h('td', {}, h('select', { disabled: !ok, title: Q_HELP[a.q] || '', onchange: (e) => { a.q = e.target.value; if (SPS_TIMED.includes(a.q) && !a.time) a.time = 'T#2s'; changed(); } },
          ...SPS_QUALIFIERS.map((q) => h('option', { value: q, selected: a.q === q, title: Q_HELP[q] }, q)))),
        h('td', {}, timed ? field(a.time ?? '', (v) => { a.time = v.trim(); changed(); }, { size: 6, disabled: !ok, placeholder: 'T#2s' }) : ''),
        h('td', {}, field(a.text ?? '', (v) => { a.text = v; changed(); }, { size: 14, disabled: !ok, placeholder: 'Aktionsname' })),
        h('td', {}, h('select', { disabled: !ok, onchange: (e) => { a.var = e.target.value; changed(); } },
          h('option', { value: '', selected: !a.var }, '–'),
          // Nach Art gruppiert: Ausgänge, Merker, Zeitglieder (z. B. tonT1 mit D T#3s)
          ...[['out', 'Ausgänge'], ['mem', 'Merker'], ['tim', 'Zeitglieder']].map(([k, label]) => {
            const names = io().filter((x) => x.kind === k && x.name).map((x) => String(x.name).trim());
            return names.length ? h('optgroup', { label }, ...names.map((v) => h('option', { value: v, selected: a.var === v }, v))) : null;
          }),
          ...(a.var && !varList.includes(a.var) ? [h('option', { value: a.var, selected: true }, `${a.var} (nicht in der Tabelle)`)] : []))),
        h('td', {}, field(a.cond ?? '', (v) => { a.cond = v.trim(); changed(); }, { size: 10, disabled: !ok, placeholder: '(Bedingung)', title: 'Zuweisungsbedingung (A4) – leer: immer' })),
        h('td', {}, ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Aktion löschen', onclick: () => { s.actions = s.actions.filter((x) => x !== a); changed(); } }, '✕') : null));
    });
    return h('div', { class: `sps-step${selStep === s.id ? ' lab-sel' : ''}`, 'data-edit': s.id },
      h('div', { class: 'lab-row' },
        field(s.name ?? '', (v) => { s.name = v.trim(); changed(); }, { size: 5, disabled: !ok, class: 'lab-name', title: 'Schrittname' }),
        h('label', { class: 'lab-check', title: 'Initialschritt: nach dem Start aktiv (doppelt umrandet)' }, h('input', { type: 'checkbox', checked: !!s.initial, disabled: !ok, onchange: (e) => { allSteps().forEach((x) => { delete x.initial; }); if (e.target.checked) s.initial = true; changed(); } }), ' Initialschritt'),
        h('span', { style: { flex: '1' } }),
        h('button', { type: 'button', class: 'lab-mini', title: 'Nach oben', disabled: !ok || i === 0, onclick: move(-1) }, '↑'),
        h('button', { type: 'button', class: 'lab-mini', title: 'Nach unten', disabled: !ok || i === l.length - 1, onclick: move(1) }, '↓'),
        teacher ? h('button', { type: 'button', class: `lab-mini${s.locked ? ' lab-on' : ''}`, title: s.locked ? 'Für Schüler fest' : 'Für Schüler festlegen', onclick: () => { s.locked = !s.locked; if (!s.locked) delete s.locked; changed(); } }, s.locked ? '🔒' : '🔓') : (s.locked ? h('span', { text: '🔒' }) : null),
        ok ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Schritt löschen', onclick: () => { l.splice(l.indexOf(s), 1); changed(); } }, '✕') : null),
      actRows.length ? h('table', { class: 'lab-table sps-acts' },
        h('thead', {}, h('tr', {}, ...['A1', 'Zeit', 'A2 Aktion', 'A3 Variable', 'A4 Bedingung', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...actRows)) : null,
      ok ? h('button', { type: 'button', class: 'lab-mini', onclick: () => { (s.actions ||= []).push({ id: uid('a'), q: 'N', time: '', text: '', var: varList[0] || '', cond: '' }); changed(); } }, '+ Aktion') : null,
      uses.has(s.id) ? h('div', { class: 'lab-row sps-trans' }, h('span', { class: 'lab-label', text: `Transition → ${targetsOf(s.id)}:` }),
        field(s.trans ?? '', (v) => { s.trans = v.trim(); changed(); }, { size: 26, disabled: !ok, placeholder: 'z. B. S1 AND NOT B2 oder S_2.T >= T#3s' }))
        : h('div', { class: 'lab-hint', text: 'Transition an der Verzweigung (in der Grafik)' }));
  }

  function renderPanel() {
    const uses = spsGraph(st).uses;
    const list = allSteps().map((s) => stepEditor(s, uses));
    const addStep = () => {
      const first = !allSteps().length;
      steps().push({ ...newStep(), ...(first ? { initial: true } : {}) });
      changed();
    };
    const initRow = h('div', { class: 'lab-row', title: 'Solange dieser Eingang 1 ist, steht die Kette im Initialschritt (wie xINIT beim Standard-Ablaufkettenbaustein)' },
      h('span', { class: 'lab-label', text: 'Kette initialisieren mit' }),
      h('select', { onchange: (e) => { if (e.target.value) st.init = e.target.value; else delete st.init; changed(); } },
        h('option', { value: '', selected: !st.init }, '– (keine INIT-Taste) –'),
        ...io().filter((x) => (x.kind === 'in' || x.kind === 'mem') && x.name).map((x) => h('option', { value: String(x.name).trim(), selected: st.init === String(x.name).trim() }, String(x.name).trim()))));
    panel.replaceChildren(ioTable(), initRow,
      // Die Kette entsteht in der Grafik – die Liste ist nur noch zum Nachsehen da (zugeklappt).
      h('details', { class: 'sps-section', open: listOpen, ontoggle: (e) => { listOpen = e.target.open; } }, h('summary', { class: 'lab-label', text: 'Schrittkette als Liste' }), ...list,
        h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-btn', onclick: addStep }, '+ Schritt'),
          h('label', { class: 'lab-check', title: 'Nach dem letzten Schritt zurück zum Initialschritt' }, h('input', { type: 'checkbox', checked: st.back !== false, onchange: (e) => { st.back = e.target.checked; changed(); } }), ' Kette schließen (zurück zum Initialschritt)'))),
      h('p', { class: 'lab-hint', text: 'Bedingungen: AND (&, *), OR (+), XOR, NOT (/, !), Klammern, Schrittmerker S_2.X, Zeitglied tonT1.Q (im Aktionsblock z. B. D T#3s → tonT1), Schrittzeit S_2.T >= T#3s. Bestimmungszeichen: N S R L D P DS SD SL (L, D, DS, SD, SL mit Zeit T#…).' }));
    renderLive();
  }
  /** Taster betätigen (Tabelle oder Anlage): beide zeigen es. */
  function press(x, v) {
    pressed[x.id] = v;
    panel.querySelectorAll(`[data-key="${x.id}"]`).forEach((k) => k.classList.toggle('lab-on', v));
    if (rt) tick(); else renderLive();
  }
  const plant = mountPlant(plantHost, {
    getSt: () => st, changed, pressed, teacher, say, uid,
    ioByName: (n) => io().find((x) => n && String(x.name ?? '').trim() === String(n).trim()) || null,
    openPop: (e, title, ...rows) => openPop(e, title, ...rows), closePop: () => closePop(),
    running: () => !!rt,
    onPress: press,
  });
  function renderAll() { renderBar(); renderPanel(); }

  renderAll();
  return {
    getState: () => clone(st),
    setState: (s) => { st = clone(s); plantUpgrade(st.plant); stop(); },
    destroy: () => { clearInterval(timer); el.replaceChildren(); },
  };
}
