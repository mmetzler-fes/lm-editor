// ==================== SPS-LABOR: ANLAGE (Bild und Bedienung) ====================
//
// Die Anlage neben der Ablaufkette (Physik: plant-core.js). Taster drücken geht immer, auch während die
// Steuerung läuft; aufbauen (Elemente aus der Leiste, ziehen, antippen → Eigenschaften) geht, solange
// sie steht. Taster und Sensoren hängen über ihr Symbol an der Zuordnungstabelle.

import { PLANT_MATERIALS, PLANT_EXAMPLES, MAT_COLOR, plantSvg, plantDefault, plantSymbols, plantRename, symbolAlias, cylinderSetStroke, plantSpawn, plantRemoveBody } from './plant-core.js';
import { spsWalk, spsIsStep, spsInsertIo, spsNextAddr } from './lab-core.js';
import { h, field, svgPoint } from './labs.js';

const PALETTE = [
  ['button', '🔘 Taster', 'Taster oder Schalter – Schließer, Öffner oder rastend (Kontaktart in der Zuordnungstabelle), wahlweise beleuchtet'],
  ['lamp', '💡 Lampe', 'Meldeleuchte an einem Ausgang'],
  ['conveyor', '➡ Band', 'Förderband: vorwärts und (wahlweise) rückwärts über Ausgänge'],
  ['cylinder', '⇥ Zylinder', 'Zylinder ein- oder doppeltwirkend, mit Endlagensensoren'],
  ['object', '▣ Objekt', 'Werkstück (beweglich) oder feste Fläche (Tisch, Wand)'],
  ['sensor', '◉ Sensor', 'Lichtschranke oder Näherungsschalter, wahlweise nur für einen Werkstoff'],
  ['creator', '⊕ Erzeuger', 'Legt Werkstücke nach – bei einem Signal oder im Takt'],
  ['destroyer', '⊗ Vernichter', 'Werkstücke verschwinden hier (Behälter, Ende der Anlage)'],
  ['gate', '⇤ Tor', 'Schiebetor mit Motor (auf/zu), Endlagen und Druckleiste'],
];
const NEW = {
  button: () => ({ in: '' }),
  lamp: () => ({ out: '', color: 'yellow' }),
  conveyor: () => ({ w: 8, out: '', speed: 3 }),
  cylinder: () => ({ dir: 'right', stroke: 4, speed: 4, out: '' }),
  object: () => ({ w: 1.5, h: 1.5, material: 'plastic' }),
  sensor: () => ({ w: 0.3, h: 2, in: '', kind: 'light', material: '' }),
  creator: () => ({ out: '', every: 0, object: { w: 1.5, h: 1.5, material: 'plastic' } }),
  destroyer: () => ({ w: 2, h: 2 }),
  gate: () => ({ w: 6, h: 3, travel: 5, speed: 2, open: '', close: '', isOpen: '', isClosed: '', bar: '' }),
};

/**
 * Anlage in `host`. ctx: { getSt, changed, pressed, ioByName, openPop, closePop, teacher, say, running, uid, onPress }.
 * Liefert { render(world, vars) }.
 */
export function mountPlant(host, ctx) {
  const { getSt, changed, pressed, ioByName, openPop, closePop, teacher, say, uid } = ctx;
  const plant = () => getSt().plant;
  const canEdit = () => !ctx.running() && (teacher || !plant()?.locked);
  let world = null;
  let vars = {};
  let sel = null;

  const bar = h('div', { class: 'lab-row plant-bar' });
  const stage = h('div', { class: 'plant-stage' });
  host.append(bar, stage);

  // ---------- Zeichnen (plantSvg in plant-core.js – dasselbe Bild wie im Druck) ----------
  function svg() {
    return plantSvg(plant(), { world, vars, io: getSt().io || [], pressed, edit: canEdit(), sel, cls: true });
  }

  function renderBar() {
    const p = plant();
    if (!p) {
      bar.replaceChildren(
        h('button', { type: 'button', class: 'lab-btn', title: 'Mitgelieferte, eigene und geteilte Anlagen – fehlende Einträge kommen in die Zuordnungstabelle', onclick: (e) => popLibrary(e) }, '📚 Anlage aus der Bibliothek'),
        h('button', { type: 'button', class: 'lab-btn', onclick: () => { getSt().plant = plantDefault(); changed(); } }, '🏭 Leere Anlage'),
        h('span', { class: 'lab-hint', text: 'Anlage neben der Kette: Taster, Lampen, Bänder, Zylinder, Werkstücke, Sensoren (wie in PLC-Lab).' }));
      return;
    }
    const edit = canEdit();
    bar.replaceChildren(...[...(edit ? PALETTE.map(([type, label, title]) => h('button', { type: 'button', class: 'lab-mini', title, onclick: () => add(type) }, label)) : []),
      h('span', { style: { flex: '1' } }),
      edit ? h('button', { type: 'button', class: 'lab-mini', title: 'Größe der Anlage, festlegen, entfernen', onclick: (e) => popPlant(e) }, '⚙ Anlage') : null,
      !edit && ctx.running() ? h('span', { class: 'lab-hint', text: 'Aufbauen geht, wenn die Steuerung steht (⏹).' }) : null,
      !teacher && p.locked ? h('span', { title: 'Anlage vorgegeben', text: '🔒' }) : null].filter(Boolean));
  }

  function render(w = world, v = vars) {
    world = w;
    vars = v || {};
    renderBar();
    stage.hidden = !plant();
    if (plant()) stage.innerHTML = svg();
  }

  /** Beispielanlage einsetzen; fehlende Symbole kommen in die Zuordnungstabelle. */
  // ---------- Bibliothek ----------
  // Eintrag: { title, description, data: { plant, io: [Zeilen der Tabelle], init?, steps?, back? } }.
  // Mitgeliefert (PLANT_EXAMPLES), eigene und geteilte (Gastgeber: window.lmPlantLibrary, sonst Browser).

  /** Ablage: in LearningModules der Server, sonst dieser Browser. */
  function store() {
    const host = globalThis.lmPlantLibrary;
    if (host && (!host.available || host.available())) return host;
    if (host) return null; // LearningModules ohne Anmeldung (Schüler): keine eigene Bibliothek
    const KEY = 'lm_plant_library';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
    const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (_) { throw new Error('Speichern im Browser geht nicht.'); } };
    return {
      local: true,
      list: async () => read().map((x) => ({ ...x, own: true })),
      save: async (entry) => { const l = read().filter((x) => x.id !== entry.id); const id = entry.id || uid('lib'); l.push({ ...entry, id }); write(l); return { id }; },
      remove: async (id) => write(read().filter((x) => x.id !== id)),
    };
  }
  const builtins = () => PLANT_EXAMPLES.map((ex) => ({
    id: `builtin:${ex.key}`, title: ex.label, builtin: true,
    data: { plant: ex.make(), io: ex.io.map(([kind, name, desc, contact, addr]) => ({ kind, name, desc, addr: addr || '', ...(kind === 'in' ? { contact: contact || 'NO' } : {}) })), ...(ex.init ? { init: ex.init } : {}) },
  }));

  /** Anlage (und auf Wunsch die Kette) aus dem Labor für die Bibliothek. */
  function entryData(withSteps) {
    const st = getSt();
    const used = new Set([...plantSymbols(st.plant).keys(), ...(st.init ? [st.init] : [])]);
    const rows = (st.io || []).filter((x) => withSteps || used.has(String(x.name ?? '').trim()))
      .map(({ id: _id, locked: _l, ...rest }) => rest);
    const plant = JSON.parse(JSON.stringify(st.plant));
    delete plant.locked;
    return { plant, io: rows, ...(st.init ? { init: st.init } : {}), ...(withSteps ? { steps: JSON.parse(JSON.stringify(st.steps || [])), back: st.back !== false } : {}) };
  }

  /**
   * Eintrag einsetzen: vorhandene Symbole nutzen (xSF1 für SF1), Fehlendes an seinem Platz in die Tabelle
   * (mit Adresse und Kontaktart aus dem Eintrag, sonst der nächsten freien), Anlage ersetzen.
   */
  function useEntry(entry, withSteps = false) {
    const st = getSt();
    const io = (st.io ||= []);
    const data = entry.data || {};
    const map = {};
    for (const row of data.io || []) {
      const have = symbolAlias(row.name, io.filter((x) => x.kind === row.kind).map((x) => x.name));
      if (have) { map[row.name] = have; continue; }
      const taken = io.some((x) => x.addr && x.addr === row.addr);
      spsInsertIo(io, { ...row, id: uid('io'), addr: row.addr && !taken ? row.addr : spsNextAddr(io, row.kind) });
    }
    st.plant = JSON.parse(JSON.stringify(data.plant));
    for (const [from, to] of Object.entries(map)) if (from !== to) plantRename(st.plant, from, to);
    if (data.init) st.init = map[data.init] || data.init;
    if (withSteps && Array.isArray(data.steps)) {
      // Namen in der Kette wie in der Tabelle (z. B. SF1 → xSF1)
      const swap = (src) => String(src ?? '').replace(/[A-Za-z_ÄÖÜäöüß][A-Za-z0-9_ÄÖÜäöüß]*/g, (w) => (map[w] && map[w] !== w ? map[w] : w));
      st.steps = JSON.parse(JSON.stringify(data.steps));
      spsWalk(st.steps, (el) => {
        el.trans = swap(el.trans);
        if (spsIsStep(el)) for (const x of el.actions || []) { x.var = swap(x.var); x.cond = swap(x.cond); }
        else for (const br of el.branches || []) br.trans = swap(br.trans);
      });
      if (data.back === false) st.back = false; else delete st.back;
    }
    changed();
    const used = Object.entries(map).filter(([x, y]) => x !== y);
    say(`🏭 „${entry.title}“ eingesetzt${used.length ? ` – vorhandene Symbole verwendet: ${used.map(([x, y]) => `${y} für ${x}`).join(', ')}` : ''}.`);
  }

  /** 📚 Bibliothek: mitgelieferte, eigene und geteilte Anlagen. */
  async function popLibrary(e) {
    const lib = store();
    let own = [];
    let error = '';
    if (lib) { try { own = await lib.list(); } catch (err) { error = err.message || String(err); } }
    let withSteps = false;
    const item = (x) => h('div', { class: 'plant-lib-item' },
      h('div', {}, h('strong', { text: x.title }),
        x.owner ? h('span', { class: 'lab-hint', text: ` – von ${x.owner}` }) : null,
        x.data?.steps ? h('span', { class: 'lab-hint', text: ' · mit Schrittkette' }) : null,
        x.description ? h('div', { class: 'lab-hint', text: x.description }) : null),
      h('div', { class: 'lab-row' },
        h('button', { type: 'button', class: 'lab-mini', onclick: () => {
          if (plant() && !confirm(`Die jetzige Anlage durch „${x.title}“ ersetzen?`)) return;
          useEntry(x, withSteps);
          closePop();
        } }, 'Einsetzen'),
        x.own && lib?.share ? h('button', { type: 'button', class: `lab-mini${x.shared ? ' lab-on' : ''}`, title: x.shared ? 'Für alle Lehrkräfte sichtbar – klicken: nur für mich' : 'Für alle Lehrkräfte dieses Servers sichtbar machen',
          onclick: async () => { try { await lib.share(x.id, !x.shared); } catch (err) { say(err.message); } popLibrary(e); } }, x.shared ? '👥 geteilt' : '👤 nur ich') : null,
        x.own ? h('button', { type: 'button', class: 'lab-mini lab-del', title: 'Aus der Bibliothek löschen', onclick: async () => {
          if (!confirm(`„${x.title}“ aus der Bibliothek löschen?`)) return;
          try { await lib.remove(x.id); } catch (err) { say(err.message); }
          popLibrary(e);
        } }, '✕') : null));
    const mine = own.filter((x) => x.own);
    const others = own.filter((x) => !x.own);
    openPop(e, '📚 Bibliothek der Anlagen',
      h('label', { class: 'lab-check', title: 'Nur bei Einträgen, die eine Kette enthalten' }, h('input', { type: 'checkbox', onchange: (ev) => { withSteps = ev.target.checked; } }), ' Schrittkette mit übernehmen (falls gespeichert)'),
      h('div', { class: 'lab-label', text: 'Mitgeliefert' }), ...builtins().map(item),
      ...(lib ? [h('div', { class: 'lab-label', text: lib.local ? 'Meine Anlagen (in diesem Browser)' : 'Meine Anlagen' }),
        ...(mine.length ? mine.map(item) : [h('div', { class: 'lab-hint', text: error || 'Noch keine – unter ⚙ Anlage „In der Bibliothek ablegen“.' })])] : []),
      ...(others.length ? [h('div', { class: 'lab-label', text: 'Von Kolleginnen und Kollegen' }), ...others.map(item)] : []));
  }

  /** Die jetzige Anlage in der Bibliothek ablegen (neu oder über eine eigene gleichen Namens). */
  async function popSave(e) {
    const lib = store();
    if (!lib) { say('Die Bibliothek gibt es für Lehrkräfte (angemeldet).'); return; }
    let mine = [];
    try { mine = (await lib.list()).filter((x) => x.own); } catch (_) { /* dann neu */ }
    const title = field('', () => {}, { size: 24, placeholder: 'Name, z. B. Torsteuerung' });
    const desc = h('textarea', { rows: 2, placeholder: 'Kurze Beschreibung (optional)', style: { width: '100%' } });
    const steps = h('input', { type: 'checkbox' });
    const shared = h('input', { type: 'checkbox' });
    openPop(e, '📚 In der Bibliothek ablegen',
      row('Name', title), desc,
      h('label', { class: 'lab-check', title: 'z. B. als Lehrerlösung – sonst nur Anlage und ihre Einträge der Zuordnungstabelle' }, steps, ' Schrittkette mitspeichern'),
      lib.share ? h('label', { class: 'lab-check' }, shared, ' für alle Lehrkräfte dieses Servers sichtbar') : null,
      h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-btn lab-btn-primary', onclick: async () => {
        const t = title.value.trim();
        if (!t) { title.focus(); return; }
        const same = mine.find((x) => x.title === t);
        if (same && !confirm(`„${t}“ gibt es schon in deiner Bibliothek – überschreiben?`)) return;
        try {
          await lib.save({ ...(same ? { id: same.id } : {}), title: t, description: desc.value.trim(), data: entryData(steps.checked), ...(lib.share ? { shared: shared.checked } : {}) });
          say(`📚 „${t}“ liegt in der Bibliothek.`);
          closePop();
        } catch (err) { say(`⚠️ ${err.message || err}`); }
      } }, 'Ablegen')));
    title.focus();
  }

  // ---------- Aufbauen ----------
  function add(type) {
    const p = plant();
    const n = p.items.length;
    const it = { id: uid('p'), type, x: 1 + (n % 4) * 5, y: 1 + (Math.floor(n / 4) % 3) * 3.5, ...NEW[type]() };
    p.items.push(it);
    sel = it.id;
    changed();
    say('Neues Element oben links – ziehen zum Platzieren, antippen für die Eigenschaften.');
  }
  const names = (kinds) => (getSt().io || []).filter((x) => kinds.includes(x.kind) && x.name).map((x) => String(x.name).trim());
  const pick = (value, kinds, onSet, none = '–') => h('select', { onchange: (e) => onSet(e.target.value) },
    h('option', { value: '', selected: !value }, none),
    ...names(kinds).map((n) => h('option', { value: n, selected: value === n }, n)),
    ...(value && !names(kinds).includes(value) ? [h('option', { value, selected: true }, `${value} (nicht in der Tabelle)`)] : []));
  const numF = (value, onSet, attrs = {}) => field(String(value ?? ''), (v) => { const n = parseFloat(String(v).replace(',', '.')); if (Number.isFinite(n)) onSet(n); }, { size: 4, inputmode: 'decimal', ...attrs });
  const row = (label, ...kids) => h('div', { class: 'lab-row' }, h('span', { class: 'plant-lbl', text: label }), ...kids);
  const set = (it, key) => (v) => { if (v === '' || v === undefined) delete it[key]; else it[key] = v; changed(); };
  const matSel = (value, onSet, all) => h('select', { onchange: (e) => onSet(e.target.value) },
    ...(all ? [h('option', { value: '', selected: !value }, all)] : []),
    ...PLANT_MATERIALS.map(([k, l]) => h('option', { value: k, selected: value === k }, l)));

  function popItem(it, e) {
    const p = plant();
    const title = (PALETTE.find((x) => x[0] === it.type) || [])[1] || it.type;
    const rows = [];
    const sizeRow = () => row('Größe', numF(it.w, set(it, 'w')), ' × ', numF(it.h, set(it, 'h')));
    switch (it.type) {
      case 'button':
        rows.push(row('Eingang', pick(it.in, ['in'], set(it, 'in'))),
          h('div', { class: 'lab-hint', text: 'Schließer, Öffner oder rastend: Kontaktart in der Zuordnungstabelle.' }),
          row('Leuchte', pick(it.lamp, ['out', 'mem'], set(it, 'lamp'), 'ohne')),
          row('Beschriftung', field(it.label ?? '', set(it, 'label'), { size: 10 })));
        break;
      case 'lamp':
        rows.push(row('Ausgang', pick(it.out, ['out', 'mem'], set(it, 'out'))),
          row('Farbe', h('select', { onchange: (ev) => set(it, 'color')(ev.target.value) }, ...[['yellow', 'gelb'], ['red', 'rot'], ['green', 'grün'], ['blue', 'blau'], ['white', 'weiß']].map(([k, l]) => h('option', { value: k, selected: it.color === k }, l)))),
          row('Beschriftung', field(it.label ?? '', set(it, 'label'), { size: 10 })));
        break;
      case 'conveyor':
        rows.push(row('Vorwärts', pick(it.out, ['out', 'mem'], set(it, 'out'))), row('Rückwärts', pick(it.rev, ['out', 'mem'], set(it, 'rev'), 'ohne')),
          row('Länge', numF(it.w, set(it, 'w'))), row('Tempo', numF(it.speed, set(it, 'speed')), ' E/s'));
        break;
      case 'cylinder':
        rows.push(row('Richtung', h('select', { onchange: (ev) => set(it, 'dir')(ev.target.value) }, ...[['right', '→ rechts'], ['left', '← links'], ['up', '↑ oben'], ['down', '↓ unten']].map(([k, l]) => h('option', { value: k, selected: (it.dir || 'right') === k }, l)))),
          row('Ausfahren', pick(it.out, ['out', 'mem'], set(it, 'out'))),
          row('Einfahren', pick(it.ret, ['out', 'mem'], set(it, 'ret'), 'Feder (einfachwirkend)')),
          row('Endlage aus', pick(it.ext, ['in'], set(it, 'ext'), 'ohne')), row('Endlage ein', pick(it.home, ['in'], set(it, 'home'), 'ohne')),
          row('Hub', numF(it.stroke, (v) => { cylinderSetStroke(it, v); changed(); }), ' Tempo ', numF(it.speed, set(it, 'speed'))),
          h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.startExt, onchange: (ev) => set(it, 'startExt')(ev.target.checked || '') }), ' Grundstellung ausgefahren'),
          row('Platte', numF(it.plate ?? 1.6, set(it, 'plate'), { title: 'quer zur Stange' }), ' × ', numF(it.plateThick ?? 0.4, set(it, 'plateThick'), { title: 'längs der Stange' }), ' (quer × längs)'),
          row('Fährt mit', h('select', { title: 'Sitzt auf einem anderen Zylinder und fährt mit ihm', onchange: (ev) => set(it, 'mount')(ev.target.value) },
            h('option', { value: '', selected: !it.mount }, '– fest –'),
            ...(plant().items || []).filter((x) => x.type === 'cylinder' && x.id !== it.id).map((x) => h('option', { value: x.id, selected: it.mount === x.id }, x.label || x.out || x.id)))));
        break;
      case 'gate':
        rows.push(row('Motor auf', pick(it.open, ['out', 'mem'], set(it, 'open'))), row('Motor zu', pick(it.close, ['out', 'mem'], set(it, 'close'))),
          row('Endlage auf', pick(it.isOpen, ['in'], set(it, 'isOpen'), 'ohne')), row('Endlage zu', pick(it.isClosed, ['in'], set(it, 'isClosed'), 'ohne')),
          row('Druckleiste', pick(it.bar, ['in'], set(it, 'bar'), 'ohne')),
          h('div', { class: 'lab-hint', text: 'Öffner (z. B. Endlagen, Druckleiste) stellst du in der Zuordnungstabelle ein.' }),
          sizeRow(), row('Weg', numF(it.travel, set(it, 'travel')), ' Tempo ', numF(it.speed, set(it, 'speed'))),
          h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: it.start === 'open', onchange: (ev) => set(it, 'start')(ev.target.checked ? 'open' : '') }), ' zu Beginn offen'));
        break;
      case 'object':
        rows.push(sizeRow(), h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.fixed, onchange: (ev) => set(it, 'fixed')(ev.target.checked || '') }), ' feststehend (Tisch, Wand, Rutsche)'),
          row('Werkstoff', matSel(it.material, set(it, 'material'))),
          row('Form', h('select', { onchange: (ev) => set(it, 'shape')(ev.target.value === 'box' ? '' : ev.target.value) }, h('option', { value: 'box', selected: it.shape !== 'round' }, 'eckig'), h('option', { value: 'round', selected: it.shape === 'round' }, 'rund'))),
          row('Farbe', h('input', { type: 'color', value: it.color || MAT_COLOR[it.material] || '#f59e0b', onchange: (ev) => set(it, 'color')(ev.target.value) })),
          it.fixed ? h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: it.look === 'wall', onchange: (ev) => set(it, 'look')(ev.target.checked ? 'wall' : '') }), ' als Mauer zeichnen')
            : h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.pick, onchange: (ev) => set(it, 'pick')(ev.target.checked || '') }), ' im Lauf antippen = entnehmen'));
        break;
      case 'sensor':
        rows.push(row('Eingang', pick(it.in, ['in'], set(it, 'in'))),
          row('Art', h('select', { onchange: (ev) => set(it, 'kind')(ev.target.value) }, h('option', { value: 'light', selected: it.kind !== 'prox' }, 'Lichtschranke'), h('option', { value: 'prox', selected: it.kind === 'prox' }, 'Näherungsschalter'))),
          row('Erkennt', matSel(it.material, set(it, 'material'), 'alle Werkstoffe')),
          h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.nc, onchange: (ev) => set(it, 'nc')(ev.target.checked || '') }), ' Öffner (meldet 1, solange nichts da ist)'),
          sizeRow());
        break;
      case 'creator': {
        const o = (it.object ||= { w: 1.5, h: 1.5, material: 'plastic' });
        const setO = (k) => (v) => { if (v === '') delete o[k]; else o[k] = v; changed(); };
        rows.push(row('Signal', pick(it.out, ['out', 'mem', 'in'], set(it, 'out'), 'keins')),
          row('Takt', numF(it.every || 0, set(it, 'every')), ' s (0 = nur bei Signal)'),
          row('Teil', numF(o.w, setO('w')), ' × ', numF(o.h, setO('h')), ' ', matSel(o.material, setO('material'))),
          row('Farbe', h('input', { type: 'color', value: o.color || MAT_COLOR[o.material] || '#f59e0b', onchange: (ev) => setO('color')(ev.target.value) })),
          h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.manual, onchange: (ev) => set(it, 'manual')(ev.target.checked || '') }), ' im Lauf antippen = einlegen'),
          h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!o.pick, onchange: (ev) => setO('pick')(ev.target.checked || '') }), ' Teile lassen sich entnehmen'),
          row('Ablegen bei', numF(it.place?.x ?? '', (v) => { it.place = { ...(it.place || { y: it.y || 0 }), x: v }; changed(); }, { placeholder: 'x' }), ' ',
            numF(it.place?.y ?? '', (v) => { it.place = { ...(it.place || { x: it.x || 0 }), y: v }; changed(); }, { placeholder: 'y' }),
            h('button', { type: 'button', class: 'lab-mini', title: 'Wieder unter dem Trichter', onclick: () => { delete it.place; changed(); } }, '↺')));
        break;
      }
      case 'destroyer':
        rows.push(sizeRow());
        break;
      default: break;
    }
    rows.push(h('div', { class: 'lab-row' },
      h('button', { type: 'button', class: 'lab-mini', onclick: () => { const c = { ...JSON.parse(JSON.stringify(it)), id: uid('p'), x: (it.x || 0) + 1, y: (it.y || 0) + 1 }; p.items.push(c); sel = c.id; changed(); closePop(); } }, '⧉ Verdoppeln'),
      h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => { p.items = p.items.filter((x) => x !== it); sel = null; changed(); closePop(); } }, '✕ Entfernen')));
    openPop(e, title, ...rows);
  }

  function popPlant(e) {
    popPlant.last = e;
    const p = plant();
    openPop(e, '🏭 Anlage',
      row('Größe', numF(p.w, (v) => { p.w = Math.max(6, Math.min(60, v)); changed(); }), ' × ', numF(p.h, (v) => { p.h = Math.max(4, Math.min(40, v)); changed(); }), ' Einheiten'),
      ...symbolRows(),
      teacher ? h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!p.locked, onchange: (ev) => { if (ev.target.checked) p.locked = true; else delete p.locked; changed(); } }), ' 🔒 Für Schüler fest (sie bedienen sie nur)') : null,
      h('div', { class: 'lab-row' },
        store() ? h('button', { type: 'button', class: 'lab-mini', onclick: () => popSave(e) }, '📚 In der Bibliothek ablegen') : null,
        h('button', { type: 'button', class: 'lab-mini', onclick: () => popLibrary(e) }, '📚 Andere Anlage einsetzen')),
      h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => {
        if (!confirm('Die ganze Anlage entfernen?')) return;
        delete getSt().plant;
        changed();
        closePop();
      } }, '✕ Anlage entfernen')));
  }

  /** Namen, die die Ablaufkette verwendet (Transitionen, Bedingungen, Aktorvariablen). */
  function chainNames() {
    const set = new Set();
    const add = (src) => { for (const m of String(src ?? '').matchAll(/[A-Za-z_ÄÖÜäöüß][A-Za-z0-9_ÄÖÜäöüß]*/g)) set.add(m[0]); };
    spsWalk(getSt().steps, (el) => {
      if (spsIsStep(el)) { add(el.trans); for (const a of el.actions || []) { add(a.var); add(a.cond); } } else { add(el.trans); for (const b of el.branches || []) add(b.trans); }
    });
    return set;
  }
  /**
   * Symbole der Anlage mit Auswahl (für alle Elemente zugleich umstellen). ⚠: kommt in der Kette nicht vor –
   * z. B. SF1 in der Anlage, xSF1 in der Kette. „Auf x-Namen umstellen“ macht das für alle passenden.
   */
  function symbolRows() {
    const p = plant();
    const syms = plantSymbols(p);
    if (!syms.size) return [];
    const inChain = chainNames();
    const io = getSt().io || [];
    const kinds = (k) => (k === 'in' ? ['in'] : k === 'out' ? ['out', 'mem'] : ['in', 'out', 'mem']);
    const fixes = [...syms.entries()].map(([n, s]) => [n, symbolAlias(`x${n}`, io.filter((x) => kinds(s.kind).includes(x.kind)).map((x) => x.name))])
      .filter(([n, to]) => to && to !== n && !inChain.has(n) && inChain.has(to));
    return [
      h('div', { class: 'lab-label', text: 'Symbole der Anlage' }),
      ...[...syms.entries()].map(([n, s]) => row(`${inChain.has(n) ? '' : '⚠ '}${n}`,
        pick(n, kinds(s.kind), (v) => { if (v) { plantRename(p, n, v); changed(); popPlant.last && popPlant(popPlant.last); } }),
        h('span', { class: 'lab-hint', text: `${s.uses.length}×${inChain.has(n) ? '' : ' – nicht in der Kette'}` }))),
      fixes.length ? h('button', { type: 'button', class: 'lab-mini', title: fixes.map(([a, b]) => `${a} → ${b}`).join(', '), onclick: () => {
        for (const [a, b] of fixes) plantRename(p, a, b);
        changed();
        say(`Umgestellt: ${fixes.map(([a, b]) => `${a} → ${b}`).join(', ')}. Nicht mehr gebrauchte Zeilen in der Tabelle kannst du löschen (✕).`);
        closePop();
      } }, `Auf Namen der Kette umstellen (${fixes.map(([, b]) => b).join(', ')})`) : null,
    ].filter(Boolean);
  }

  // ---------- Zeiger: Taster drücken, Elemente ziehen oder antippen ----------
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const svgEl = stage.querySelector('svg');
    if (!svgEl) return;
    // Im Lauf: Werkstück einlegen (Erzeuger) oder entnehmen
    if (ctx.running() && world) {
      const cr = e.target.closest?.('[data-pcreate]');
      const body = e.target.closest?.('[data-body]');
      if (cr || body) {
        e.preventDefault();
        if (cr && !plantSpawn(plant(), world, cr.dataset.pcreate, vars)) say('Dort ist kein Platz – erst das Werkstück entnehmen.');
        if (body) plantRemoveBody(world, body.dataset.body);
        render();
        return;
      }
    }
    const btn = e.target.closest?.('[data-pbtn]');
    if (btn && !canEdit()) {
      const it = (plant().items || []).find((x) => x.id === btn.dataset.pbtn);
      const io = ioByName(it?.[btn.dataset.pkey || 'in']);
      if (!io) { say('Dieser Taster hat noch keinen Eingang (antippen, wenn die Steuerung steht).'); return; }
      e.preventDefault();
      if (io.contact === 'latch') ctx.onPress(io, !pressed[io.id]);
      else {
        ctx.onPress(io, true);
        const up = () => { ctx.onPress(io, false); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }
      return;
    }
    if (!canEdit()) return;
    const g = e.target.closest?.('[data-pit]');
    if (!g) { sel = null; render(); return; }
    const it = (plant().items || []).find((x) => x.id === g.dataset.pit);
    if (!it) return;
    e.preventDefault();
    const [px, py] = svgPoint(svgEl, e);
    drag = { it, from: [px, py], at: [it.x || 0, it.y || 0], moved: false, e };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const svgEl = stage.querySelector('svg');
    const [px, py] = svgPoint(svgEl, e);
    const dx = px - drag.from[0];
    const dy = py - drag.from[1];
    if (!drag.moved && Math.hypot(dx, dy) < 0.15) return;
    drag.moved = true;
    const snap = (v) => Math.round(v * 5) / 5; // Raster 0,2
    drag.it.x = snap(drag.at[0] + dx);
    drag.it.y = snap(drag.at[1] + dy);
    sel = drag.it.id;
    stage.innerHTML = svg();
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) changed();
    else { sel = d.it.id; render(); popItem(d.it, e); }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', () => { if (drag?.moved) changed(); drag = null; });

  return { render };
}
