// ==================== SPS-LABOR: ANLAGE (Bild und Bedienung) ====================
//
// Die Anlage neben der Ablaufkette (Physik: plant-core.js). Taster drücken geht immer, auch während die
// Steuerung läuft; aufbauen (Elemente aus der Leiste, ziehen, antippen → Eigenschaften) geht, solange
// sie steht. Taster und Sensoren hängen über ihr Symbol an der Zuordnungstabelle.

import { PLANT_MATERIALS, PLANT_EXAMPLES, plantSize, cylinderHead, plantInputs, plantDefault } from './plant-core.js';
import { h, field, svgPoint } from './labs.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = 'font-family="Liberation Sans, Arial, sans-serif"';
const MAT_COLOR = { metal: '#9ca3af', plastic: '#f59e0b', wood: '#b7791f' };
const LAMP_COLOR = { yellow: '#facc15', red: '#ef4444', green: '#22c55e', blue: '#3b82f6', white: '#f8fafc' };
const PALETTE = [
  ['button', '🔘 Taster', 'Taster oder Schalter – Schließer, Öffner oder rastend (Kontaktart in der Zuordnungstabelle), wahlweise beleuchtet'],
  ['lamp', '💡 Lampe', 'Meldeleuchte an einem Ausgang'],
  ['conveyor', '➡ Band', 'Förderband: vorwärts und (wahlweise) rückwärts über Ausgänge'],
  ['cylinder', '⇥ Zylinder', 'Zylinder ein- oder doppeltwirkend, mit Endlagensensoren'],
  ['object', '▣ Objekt', 'Werkstück (beweglich) oder feste Fläche (Tisch, Wand)'],
  ['sensor', '◉ Sensor', 'Lichtschranke oder Näherungsschalter, wahlweise nur für einen Werkstoff'],
  ['creator', '⊕ Erzeuger', 'Legt Werkstücke nach – bei einem Signal oder im Takt'],
  ['destroyer', '⊗ Vernichter', 'Werkstücke verschwinden hier (Behälter, Ende der Anlage)'],
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

  // ---------- Zeichnen ----------
  function svg() {
    const p = plant();
    const W = p.w || 24;
    const H = p.h || 12;
    const inp = world ? plantInputs(p, world) : {};
    const on = (n) => !!(n && vars[String(n).trim()]);
    const edit = canEdit();
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plant-svg${edit ? ' plant-edit' : ''}">`;
    o += `<defs><pattern id="pg" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e5e7eb" stroke-width="0.02"/></pattern>`
      + '<pattern id="ph" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.4" stroke="#64748b" stroke-width="0.08"/></pattern></defs>';
    o += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#pg)"/>`;
    const txt = (x, y, s, size = 0.4, fill = '#334155', anchor = 'middle') => `<text x="${r3(x)}" y="${r3(y)}" font-size="${size}" ${FONT} fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
    const items = p.items || [];
    // Zuerst Flächen und Geräte, dann Werkstücke, dann Sensoren (Strahl über allem)
    const order = { destroyer: 0, creator: 1, object: 2, conveyor: 3, cylinder: 4, lamp: 5, button: 6, sensor: 8 };
    for (const it of [...items].sort((a, b) => (order[a.type] ?? 5) - (order[b.type] ?? 5))) {
      if (it.type === 'object' && !it.fixed && world) continue; // beweglich: während des Laufs aus der Physik
      if (it.type === 'sensor') continue;
      const { w, h: hh } = plantSize(it);
      const x = it.x || 0;
      const y = it.y || 0;
      let g = '';
      switch (it.type) {
        case 'button': {
          const io = ioByName(it.in);
          const lit = on(it.lamp);
          const down = !!(io && pressed[io.id]);
          const ring = io?.contact === 'NC' ? '#dc2626' : io?.contact === 'latch' ? '#2563eb' : '#16a34a';
          g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="0.15" fill="#e2e8f0" stroke="#475569" stroke-width="0.04"/>`;
          g += `<circle cx="${r3(x + w / 2)}" cy="${r3(y + hh / 2)}" r="${down ? 0.45 : 0.5}" fill="${lit ? '#fde047' : down ? '#94a3b8' : '#f8fafc'}" stroke="${ring}" stroke-width="0.12"${lit ? ' filter="drop-shadow(0 0 0.2px #facc15)"' : ''}/>`;
          g += txt(x + w / 2, y + hh + 0.45, it.label || it.in || 'Taster', 0.36);
          break;
        }
        case 'lamp': {
          const lit = on(it.out);
          g += `<circle cx="${r3(x + w / 2)}" cy="${r3(y + hh / 2)}" r="0.55" fill="${lit ? LAMP_COLOR[it.color] || '#facc15' : '#cbd5e1'}" stroke="#334155" stroke-width="0.05"/>`;
          if (lit) g += `<circle cx="${r3(x + w / 2)}" cy="${r3(y + hh / 2)}" r="0.8" fill="none" stroke="${LAMP_COLOR[it.color] || '#facc15'}" stroke-width="0.08" opacity="0.6"/>`;
          g += `<path d="M${r3(x + w / 2 - 0.3)} ${r3(y + hh / 2 - 0.3)}l0.6 0.6M${r3(x + w / 2 + 0.3)} ${r3(y + hh / 2 - 0.3)}l-0.6 0.6" stroke="#334155" stroke-width="0.05"/>`;
          g += txt(x + w / 2, y + hh + 0.45, it.label || it.out || 'Lampe', 0.36);
          break;
        }
        case 'conveyor': {
          const v = on(it.out) ? 1 : on(it.rev) ? -1 : 0;
          const shift = world ? -(world.t * Math.abs(it.speed || 3) * v) % 0.8 : 0;
          g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${hh / 2}" fill="#475569"/>`;
          g += `<line x1="${r3(x + hh / 2)}" y1="${r3(y + 0.06)}" x2="${r3(x + w - hh / 2)}" y2="${r3(y + 0.06)}" stroke="${v ? '#22c55e' : '#cbd5e1'}" stroke-width="0.1" stroke-dasharray="0.4 0.4" stroke-dashoffset="${r3(shift)}"/>`;
          for (const cx of [x + hh / 2, x + w - hh / 2]) g += `<circle cx="${r3(cx)}" cy="${r3(y + hh / 2)}" r="${r3(hh / 2 - 0.1)}" fill="#94a3b8"/>`;
          g += txt(x + w / 2, y + hh + 0.45, [it.out, it.rev].filter(Boolean).join(' / ') || 'Band', 0.34);
          break;
        }
        case 'cylinder': {
          const pos = world?.cyl?.[it.id] || 0;
          const head = cylinderHead(it, pos);
          const horiz = !/^(up|down)$/.test(it.dir);
          g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="0.1" fill="#cbd5e1" stroke="#334155" stroke-width="0.05"/>`;
          const cx = x + w / 2;
          const cy = y + hh / 2;
          const hx = head.x + head.w / 2;
          const hy = head.y + head.h / 2;
          // Kolbenstange ab dem Gehäuse (die Beschriftung im Gehäuse bleibt frei)
          const sx = hx > cx ? x + w : x;
          const sy = hy > cy ? y + hh : y;
          g += horiz ? `<line x1="${r3(sx)}" y1="${r3(cy)}" x2="${r3(hx)}" y2="${r3(cy)}" stroke="#334155" stroke-width="0.2"/>` : `<line x1="${r3(cx)}" y1="${r3(sy)}" x2="${r3(cx)}" y2="${r3(hy)}" stroke="#334155" stroke-width="0.2"/>`;
          g += `<rect x="${r3(head.x)}" y="${r3(head.y)}" width="${r3(head.w)}" height="${r3(head.h)}" fill="#1e293b"/>`;
          g += txt(cx, cy + 0.14, it.label || it.out || 'Zylinder', 0.3, '#1e293b');
          // Endlagensensoren als grüne Punkte (leuchten, wenn erreicht)
          const inp2 = world ? plantInputs(p, world) : {};
          const dot = (name, px, py) => (name ? `<circle cx="${r3(px)}" cy="${r3(py)}" r="0.18" fill="${inp2[String(name).trim()] ? '#22c55e' : '#e2e8f0'}" stroke="#15803d" stroke-width="0.04"/>${txt(px + 0.3, py + 0.12, name, 0.3, '#334155', 'start')}` : '');
          if (horiz) g += dot(it.home, x + 0.3, y - 0.25) + dot(it.ext, x + w - 0.3, y - 0.25);
          else g += dot(it.home, x + w + 0.2, y + 0.3) + dot(it.ext, x + w + 0.2, y + hh - 0.3);
          break;
        }
        case 'object':
          g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${it.shape === 'round' ? Math.min(w, hh) / 2 : 0.08}" fill="${it.color || (it.fixed ? '#cbd5e1' : MAT_COLOR[it.material] || '#f59e0b')}" stroke="#334155" stroke-width="0.04"/>`;
          if (it.fixed && !it.color) g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#ph)" opacity="0.5"/>`;
          break;
        case 'creator':
          g += `<path d="M${r3(x)} ${r3(y)}h${r3(w)}l-0.3 ${r3(hh)}h${r3(-(w - 0.6))}z" fill="#dbeafe" stroke="#2563eb" stroke-width="0.05"/>`;
          g += txt(x + w / 2, y - 0.15, `⊕ ${it.out || (it.every ? `${it.every} s` : 'Erzeuger')}`, 0.32, '#2563eb');
          break;
        case 'destroyer':
          g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#fee2e2" stroke="#dc2626" stroke-width="0.05" stroke-dasharray="0.2 0.12"/>`;
          g += txt(x + w / 2, y + hh / 2 + 0.15, '⊗', 0.5, '#dc2626');
          break;
        default: break;
      }
      o += `<g data-pit="${esc(it.id)}"${it.type === 'button' ? ` data-pbtn="${esc(it.id)}"` : ''}>${g}</g>`;
    }
    // Werkstücke aus der Physik
    for (const b of world?.bodies || []) {
      if (b.bend > 0.01) { o += bentSheet(b); continue; }
      o += `<rect x="${r3(b.x)}" y="${r3(b.y)}" width="${r3(b.w)}" height="${r3(b.h)}" rx="${b.shape === 'round' ? r3(Math.min(b.w, b.h) / 2) : 0.08}" fill="${b.color || MAT_COLOR[b.material] || '#f59e0b'}" stroke="#334155" stroke-width="0.04"/>`;
    }
    for (const it of items.filter((x) => x.type === 'sensor')) {
      const { w, h: hh } = plantSize(it);
      const hit = world ? !!inp[String(it.in ?? '').trim()] : false;
      const c = hit ? '#16a34a' : '#dc2626';
      let g = it.kind === 'prox'
        ? `<rect x="${it.x}" y="${it.y}" width="${w}" height="${hh}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-width="0.04" stroke-dasharray="0.12 0.08"/>`
        : `<rect x="${it.x}" y="${it.y}" width="${w}" height="${hh}" fill="${c}" fill-opacity="0.35"/>`;
      g += `<circle cx="${r3(it.x + w / 2)}" cy="${r3(it.y - 0.3)}" r="0.22" fill="${c}"/>`;
      g += `<text x="${r3(it.x + w / 2 + 0.35)}" y="${r3(it.y - 0.2)}" font-size="0.34" ${FONT} fill="#334155">${esc(`${it.in || 'Sensor'}${it.material ? ` (${(PLANT_MATERIALS.find((m) => m[0] === it.material) || [])[1] || it.material})` : ''}${it.nc ? ' Ö' : ''}`)}</text>`;
      o += `<g data-pit="${esc(it.id)}">${g}</g>`;
    }
    // Auswahl (beim Aufbauen): gestricheltes Rechteck um das Element
    const chosen = edit && sel ? items.find((x) => x.id === sel) : null;
    if (chosen) {
      const { w, h: hh } = plantSize(chosen);
      o += `<rect x="${r3((chosen.x || 0) - 0.15)}" y="${r3((chosen.y || 0) - 0.15)}" width="${r3(w + 0.3)}" height="${r3(hh + 0.3)}" fill="none" stroke="#2563eb" stroke-width="0.05" stroke-dasharray="0.2 0.12" pointer-events="none"/>`;
    }
    return `${o}</svg>`;
  }

  /** Gebogenes Blech: gerades Stück auf der Auflage, abgeknicktes Stück über der Kante. */
  function bentSheet(b) {
    const fill = b.color || MAT_COLOR[b.material] || '#475569';
    const L = b.bendLen;
    const d = Math.min(L, b.bend);
    const run = Math.sqrt(Math.max(0, L * L - d * d)); // waagrechter Rest des Stücks
    const e = b.bendEdge;
    const s = b.bendSide;
    const flatA = s < 0 ? e : b.x;
    const flatB = s < 0 ? b.x + b.w : e;
    let o = `<rect x="${r3(flatA)}" y="${r3(b.y)}" width="${r3(flatB - flatA)}" height="${r3(b.h)}" fill="${fill}" stroke="#334155" stroke-width="0.03"/>`;
    const ex = e + s * run;
    const ey = b.y + d;
    // Abgeknicktes Stück als Streifen der Blechdicke von der Kante zum Ende
    o += `<line x1="${r3(e)}" y1="${r3(b.y + b.h / 2)}" x2="${r3(ex)}" y2="${r3(ey + b.h / 2)}" stroke="#334155" stroke-width="${r3(b.h + 0.06)}"/>`;
    o += `<line x1="${r3(e)}" y1="${r3(b.y + b.h / 2)}" x2="${r3(ex)}" y2="${r3(ey + b.h / 2)}" stroke="${fill}" stroke-width="${r3(b.h)}"/>`;
    return o;
  }

  function renderBar() {
    const p = plant();
    if (!p) {
      bar.replaceChildren(
        ...PLANT_EXAMPLES.map((ex) => h('button', { type: 'button', class: 'lab-btn', title: `Beispielanlage – fehlende Einträge (${ex.io.map((x) => x[1]).join(', ')}) kommen in die Zuordnungstabelle`, onclick: () => useExample(ex) }, `🏭 ${ex.label}`)),
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
  function useExample(ex) {
    const st = getSt();
    const io = (st.io ||= []);
    const count = (k) => io.filter((x) => x.kind === k).length;
    for (const [kind, name, desc] of ex.io) {
      if (io.some((x) => String(x.name ?? '').trim() === name)) continue;
      const n = count(kind);
      io.push({ id: uid('io'), kind, name, addr: kind === 'in' ? `%I${Math.floor(n / 8)}.${n % 8}` : `%Q${Math.floor(n / 8)}.${n % 8}`, desc, ...(kind === 'in' ? { contact: 'NO' } : {}) });
    }
    st.plant = ex.make();
    changed();
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
          row('Hub', numF(it.stroke, set(it, 'stroke')), ' Tempo ', numF(it.speed, set(it, 'speed'))));
        break;
      case 'object':
        rows.push(sizeRow(), h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!it.fixed, onchange: (ev) => set(it, 'fixed')(ev.target.checked || '') }), ' feststehend (Tisch, Wand, Rutsche)'),
          row('Werkstoff', matSel(it.material, set(it, 'material'))),
          row('Form', h('select', { onchange: (ev) => set(it, 'shape')(ev.target.value === 'box' ? '' : ev.target.value) }, h('option', { value: 'box', selected: it.shape !== 'round' }, 'eckig'), h('option', { value: 'round', selected: it.shape === 'round' }, 'rund'))),
          row('Farbe', h('input', { type: 'color', value: it.color || MAT_COLOR[it.material] || '#f59e0b', onchange: (ev) => set(it, 'color')(ev.target.value) })));
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
          row('Farbe', h('input', { type: 'color', value: o.color || MAT_COLOR[o.material] || '#f59e0b', onchange: (ev) => setO('color')(ev.target.value) })));
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
    const p = plant();
    openPop(e, '🏭 Anlage',
      row('Größe', numF(p.w, (v) => { p.w = Math.max(6, Math.min(60, v)); changed(); }), ' × ', numF(p.h, (v) => { p.h = Math.max(4, Math.min(40, v)); changed(); }), ' Einheiten'),
      teacher ? h('label', { class: 'lab-check' }, h('input', { type: 'checkbox', checked: !!p.locked, onchange: (ev) => { if (ev.target.checked) p.locked = true; else delete p.locked; changed(); } }), ' 🔒 Für Schüler fest (sie bedienen sie nur)') : null,
      h('div', { class: 'lab-row' }, h('button', { type: 'button', class: 'lab-mini lab-del', onclick: () => {
        if (!confirm('Die ganze Anlage entfernen?')) return;
        delete getSt().plant;
        changed();
        closePop();
      } }, '✕ Anlage entfernen')));
  }

  // ---------- Zeiger: Taster drücken, Elemente ziehen oder antippen ----------
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const svgEl = stage.querySelector('svg');
    if (!svgEl) return;
    const btn = e.target.closest?.('[data-pbtn]');
    if (btn && !canEdit()) {
      const it = (plant().items || []).find((x) => x.id === btn.dataset.pbtn);
      const io = ioByName(it?.in);
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
