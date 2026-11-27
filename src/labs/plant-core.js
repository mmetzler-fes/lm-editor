// ==================== SPS-LABOR: ANLAGE (Physik) ====================
//
// Die Anlage neben der Ablaufkette – angelehnt an PLC-Lab: Taster, Lampen, Förderbänder, Zylinder,
// Objekte, Sensoren, Erzeuger und Vernichter. Reine Rechnung ohne DOM (Tests: test/plant-core.test.js);
// Bedienung und Bild: plant-ui.js.
//
// Bewusst eine kleine eigene Physik statt einer allgemeinen Engine: Alle Körper sind achsparallele
// Kästen (auch „runde“ Objekte rechnen als Kasten). Sie fallen, liegen aufeinander, fahren auf einem
// laufenden Band mit und werden vom Zylinder geschoben – aber sie kippen und rollen nicht. So verhält
// sich die Anlage vorhersehbar: Ein Schülerprogramm scheitert nicht an einer umgefallenen Kiste.
//
// Einheiten: Länge in Rastereinheiten (1 E ≈ 1 cm im Bild), Zeit in Sekunden, y zeigt nach unten.
//
// plant: { w, h, items: [Element] } mit Element (x, y = linke obere Ecke):
//   { type: 'button', x, y, in: 'S1', lamp?: 'H1', label? }        – Kontaktart (Schließer, Öffner,
//                                                                      rastend) steht in der Zuordnungstabelle
//   { type: 'lamp', x, y, out: 'H1', color: 'yellow'|'red'|'green'|'blue'|'white', label? }
//   { type: 'conveyor', x, y, w, out: 'M1', rev?: 'M2', speed: 3 } – Band, Oberkante bei y
//   { type: 'cylinder', x, y, dir: 'right'|'left'|'up'|'down', stroke: 4, speed: 4,
//     out: 'Y1', ret?: 'Y2', ext?: 'B1', home?: 'B0' }             – ohne ret: einfachwirkend (Feder)
//   { type: 'object', x, y, w, h, fixed?: true, material: 'metal'|'plastic'|'wood', color?, shape?: 'box'|'round',
//     bendable?: true }                                              – Blech: biegt über einer Kante ab
//   { type: 'sensor', x, y, w, h, in: 'B2', kind: 'light'|'prox', material?: ''|'metal'|…, nc?: true }
//   { type: 'creator', x, y, out?: 'Y3', every?: 0, object: { w, h, material, color, shape } }
//   { type: 'destroyer', x, y, w, h }
//
// Ablauf: world = plantInit(plant); je Zyklus plantStep(plant, world, ausgänge, dt) und
// plantInputs(plant, world) → Eingänge (Sensoren, Endlagen der Zylinder).

export const PLANT_TYPES = ['button', 'lamp', 'conveyor', 'cylinder', 'object', 'sensor', 'creator', 'destroyer'];
export const PLANT_MATERIALS = [['metal', 'Metall'], ['plastic', 'Kunststoff'], ['wood', 'Holz']];
export const GRAVITY = 40;
const BELT_H = 0.8;
const CYL = { len: 3, thick: 1, head: 0.4, plate: 1.6 };
const EPS = 1e-6;
const SUB = 1 / 120;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const sig = (out, name) => !!(name && out && out[String(name).trim()]);

/** Leere Anlage. */
export function plantDefault() {
  return { w: 24, h: 12, items: [] };
}

/** Größe eines Elements (für Bild, Treffer, Ziehen). */
export function plantSize(it) {
  switch (it?.type) {
    case 'button': return { w: 1.4, h: 1.4 };
    case 'lamp': return { w: 1.2, h: 1.2 };
    case 'conveyor': return { w: num(it.w, 8), h: BELT_H };
    case 'cylinder': return /^(up|down)$/.test(it.dir) ? { w: CYL.thick, h: CYL.len } : { w: CYL.len, h: CYL.thick };
    case 'creator': return { w: num(it.object?.w, 1.5) + 0.6, h: 0.6 };
    default: return { w: num(it?.w, 1.5), h: num(it?.h, 1.5) };
  }
}

const unit = (dir) => ({ right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[dir] || [1, 0]);

/** Kolbenplatte des Zylinders bei Hub `pos` (als Kasten). */
export function cylinderHead(it, pos) {
  const [ux, uy] = unit(it.dir);
  const { w, h } = plantSize(it);
  const x = num(it.x, 0);
  const y = num(it.y, 0);
  if (ux) {
    const px = ux > 0 ? x + w + pos : x - CYL.head - pos;
    return { x: px, y: y + h / 2 - CYL.plate / 2, w: CYL.head, h: CYL.plate };
  }
  const py = uy > 0 ? y + h + pos : y - CYL.head - pos;
  return { x: x + w / 2 - CYL.plate / 2, y: py, w: CYL.plate, h: CYL.head };
}

const overlap = (a, b, eps = EPS) => a.x < b.x + b.w - eps && a.x + a.w > b.x + eps && a.y < b.y + b.h - eps && a.y + a.h > b.y + eps;

/** Laufzeit neu: bewegliche Objekte als Körper, Zylinder eingefahren. */
export function plantInit(plant) {
  const world = { t: 0, bodies: [], cyl: {}, prev: {}, spawnAt: {}, next: 1 };
  for (const it of plant?.items || []) {
    if (it.type === 'object' && !it.fixed) world.bodies.push(newBody(world, it, num(it.x, 0), num(it.y, 0)));
    if (it.type === 'cylinder') world.cyl[it.id] = 0;
    if (it.type === 'creator') world.spawnAt[it.id] = num(it.every, 0) > 0 ? 0 : Infinity;
  }
  return world;
}

function newBody(world, o, x, y) {
  return {
    id: `b${world.next++}`, x, y, w: Math.max(0.2, num(o.w, 1.5)), h: Math.max(0.2, num(o.h, 1.5)), vx: 0, vy: 0,
    material: o.material || 'plastic', color: o.color || '', shape: o.shape || 'box', on: null,
    ...(o.bendable ? { bendable: true } : {}),
  };
}

/** Feste Kästen dieses Augenblicks: Objekte (fest), Bänder, Zylinder (Gehäuse und Kolbenplatte). */
function solids(plant, world, out) {
  const list = [];
  for (const it of plant?.items || []) {
    const x = num(it.x, 0);
    const y = num(it.y, 0);
    if (it.type === 'object' && it.fixed) list.push({ x, y, w: num(it.w, 1.5), h: num(it.h, 1.5), vx: 0, kind: 'fixed' });
    else if (it.type === 'conveyor') {
      const s = Math.abs(num(it.speed, 3));
      const v = sig(out, it.out) ? s : sig(out, it.rev) ? -s : 0;
      list.push({ x, y, w: num(it.w, 8), h: BELT_H, vx: 0, belt: v, kind: 'conveyor' });
    } else if (it.type === 'cylinder') {
      const { w, h } = plantSize(it);
      list.push({ x, y, w, h, vx: 0, kind: 'cylinder' });
      list.push({ ...cylinderHead(it, world.cyl[it.id] || 0), vx: 0, kind: 'head', cyl: it.id });
    }
  }
  return list;
}

/**
 * Was trägt den Körper (direkt darunter, Kanten berühren sich)? Ragt seine Mitte über alle Kanten
 * hinaus, fällt er (statt Kippen): Er rutscht über die Kante, bis seine Mitte frei ist.
 */
function supportOf(b, list) {
  let best = null;
  let edge = null;
  const cx = b.x + b.w / 2;
  for (const s of list) {
    if (s === b) continue;
    const hx = Math.min(b.x + b.w, s.x + s.w) - Math.max(b.x, s.x);
    if (hx <= 0.05 || Math.abs(b.y + b.h - s.y) >= 0.02) continue;
    if (cx >= s.x - EPS && cx <= s.x + s.w + EPS) { if (!best || hx > best.hx) best = { s, hx }; } else edge = s;
  }
  // Mitte über der Kante: abrutschen (zur freien Seite), bis er frei ist und fällt.
  if (!best && edge) { const dir = cx < edge.x + edge.w / 2 ? -1 : 1; if (b.vx * dir < 3) b.vx = 3 * dir; }
  return best?.s || null;
}

/** Körper `b` aus `s` herausschieben, entlang (dx, dy); stößt er an andere Körper, schiebt er sie mit. */
function shove(b, s, dx, dy, bodies, depth = 0) {
  if (dx > 0) b.x = Math.max(b.x, s.x + s.w);
  else if (dx < 0) b.x = Math.min(b.x, s.x - b.w);
  if (dy > 0) b.y = Math.max(b.y, s.y + s.h);
  else if (dy < 0) b.y = Math.min(b.y, s.y - b.h);
  if (depth > 8) return;
  for (const o of bodies) if (o !== b && overlap(o, b)) shove(o, b, dx, dy, bodies, depth + 1);
}

/**
 * Kolbenplatte drückt von oben auf ein biegbares Teil. Liegt die Platte über der Auflage: Spannen
 * ('clamp', der Zylinder steht). Liegt sie neben der Kante: Das überstehende Stück biegt ab (b.bend:
 * Tiefe, b.bendEdge: x der Kante, b.bendSide: -1 links, 1 rechts); true = gebogen.
 */
function bendAt(b, head, ground) {
  const sup = ground.find((g) => Math.abs(b.y + b.h - g.y) < 0.02 && Math.min(b.x + b.w, g.x + g.w) - Math.max(b.x, g.x) > 0.05);
  if (!sup) return false;
  const hc = head.x + head.w / 2;
  if (hc >= sup.x && hc <= sup.x + sup.w) return 'clamp';
  const side = hc < sup.x ? -1 : 1;
  const edge = side < 0 ? sup.x : sup.x + sup.w;
  const len = side < 0 ? edge - b.x : b.x + b.w - edge; // überstehende Länge
  if (len <= 0.05) return false;
  const depth = Math.min(len, Math.max(0, head.y + head.h - b.y));
  if (b.bendEdge !== undefined && b.bendEdge !== edge) return 'clamp';
  b.bendEdge = edge;
  b.bendSide = side;
  b.bendLen = len;
  b.bend = Math.max(b.bend || 0, depth);
  return depth >= len - 0.01 && head.y + head.h - b.y > len + 0.01 ? 'clamp' : true; // ganz gebogen: Anschlag
}

/** Ein Zeitschritt der Anlage. `out`: Name → 0/1 (Ausgänge, Merker der SPS). */
export function plantStep(plant, world, out, dt) {
  let left = Math.max(0, dt);
  while (left > EPS) {
    const h = Math.min(SUB, left);
    substep(plant, world, out, h);
    left -= h;
  }
  // Erzeuger: steigende Flanke des Signals oder alle `every` Sekunden
  for (const it of plant?.items || []) {
    if (it.type !== 'creator') continue;
    const on = sig(out, it.out);
    const edge = on && !world.prev[it.id];
    world.prev[it.id] = on;
    const every = num(it.every, 0);
    const due = every > 0 && world.t >= (world.spawnAt[it.id] ?? 0);
    if (!edge && !due) continue;
    if (due) world.spawnAt[it.id] = world.t + every;
    const o = it.object || {};
    const w = num(o.w, 1.5);
    const cand = newBody(world, o, num(it.x, 0) + 0.3, num(it.y, 0) + 0.6);
    cand.w = w;
    // Nur, wenn dort Platz ist (sonst stapelten sich Objekte ineinander)
    const blocked = world.bodies.some((b) => overlap(b, cand)) || solids(plant, world, out).some((s) => overlap(s, cand));
    if (!blocked) world.bodies.push(cand); else world.next--;
  }
  // Vernichter: Mitte des Körpers im Bereich; aus der Anlage gefallen
  const bottom = num(plant?.h, 12) + 4;
  const killers = (plant?.items || []).filter((it) => it.type === 'destroyer');
  world.bodies = world.bodies.filter((b) => {
    if (b.y > bottom || b.x + b.w < -6 || b.x > num(plant?.w, 24) + 6) return false;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return !killers.some((k) => cx >= k.x && cx <= k.x + num(k.w, 2) && cy >= k.y && cy <= k.y + num(k.h, 2));
  });
  return world;
}

function substep(plant, world, out, h) {
  world.t += h;
  // 1. Zylinder: Hub ändern, die Kolbenplatte schiebt, was ihr im Weg liegt
  for (const it of plant?.items || []) {
    if (it.type !== 'cylinder') continue;
    const stroke = Math.max(0.2, num(it.stroke, 4));
    const ext = sig(out, it.out);
    const ret = it.ret ? sig(out, it.ret) && !ext : !ext; // einfachwirkend: Feder zieht zurück
    const before = world.cyl[it.id] || 0;
    let pos = before;
    if (ext && !(it.ret && sig(out, it.ret))) pos = Math.min(stroke, pos + num(it.speed, 4) * h);
    else if (ret) pos = Math.max(0, pos - num(it.speed, 4) * h);
    world.cyl[it.id] = pos;
    const d = pos - before;
    if (Math.abs(d) < EPS) continue;
    const [ux, uy] = unit(it.dir);
    const head = cylinderHead(it, pos);
    const keep = world.bodies.map((b) => [b.x, b.y]);
    let stall = false;
    const ground = solids(plant, world, out).filter((x) => x.kind !== 'head');
    for (const b of world.bodies) {
      // Schon gebogenes Blech: Die Platte drückt weiter auf das abgeknickte Stück (unter der Blechebene).
      const onBent = b.bendable && b.bendEdge !== undefined && uy > 0 && head.y + head.h > b.y
        && Math.min(head.x + head.w, b.x + b.w) - Math.max(head.x, b.x) > 0.05;
      if (!overlap(b, head) && !onBent) continue;
      // Einfahren über einem gebogenen Blech: Die Platte löst sich, die Biegung bleibt (nicht mitziehen).
      if (b.bendable && b.bendEdge !== undefined && d < 0) continue;
      // Biegbares Teil (Blech), von oben gedrückt: Was über die Kante ragt, biegt nach unten ab.
      if (b.bendable && uy > 0 && d > 0) {
        const bent = bendAt(b, head, ground);
        if (bent === 'clamp') { stall = true; break; }
        if (bent) continue;
      }
      shove(b, head, ux * Math.sign(d), uy * Math.sign(d), world.bodies);
    }
    // Drückt der Zylinder ein Teil gegen etwas Festes, bleibt er stehen (Spannen, Anschlag).
    // (nur Teile, die er gerade bewegt hat)
    if (!stall) stall = world.bodies.some((b, i) => (b.x !== keep[i][0] || b.y !== keep[i][1]) && ground.some((g) => overlap(b, g, 0.01)));
    if (stall) {
      world.cyl[it.id] = before;
      world.bodies.forEach((b, i) => { [b.x, b.y] = keep[i]; });
    }
  }
  const fixed = solids(plant, world, out);
  // 2. Körper, von unten nach oben (wer oben liegt, fährt mit dem darunter mit)
  const bodies = [...world.bodies].sort((a, b) => b.y + b.h - (a.y + a.h));
  for (const b of bodies) {
    const others = [...fixed, ...world.bodies.filter((o) => o !== b)];
    const sup = supportOf(b, others);
    b.on = sup ? (sup.kind || 'body') : null;
    if (sup) {
      const carry = sup.belt ?? sup.vx ?? 0;
      // Haftreibung: auf dem Band dessen Tempo, auf festem Grund schnell zum Stillstand
      b.vx = carry !== 0 || sup.kind === 'conveyor' || sup.kind === undefined ? carry : b.vx * Math.max(0, 1 - 12 * h);
      if (Math.abs(b.vx) < 0.01) b.vx = 0;
    }
    // waagrecht
    if (b.vx) {
      b.x += b.vx * h;
      for (const s of others) {
        if (!overlap(b, s)) continue;
        if (b.vx > 0) b.x = s.x - b.w; else b.x = s.x + s.w;
        b.vx = s.vx ?? 0;
      }
    }
    // senkrecht
    b.vy = sup && b.vy >= 0 ? 0 : b.vy + GRAVITY * h;
    if (b.vy) {
      b.y += b.vy * h;
      for (const s of others) {
        if (!overlap(b, s)) continue;
        if (b.vy > 0) { b.y = s.y - b.h; b.vy = 0; } else { b.y = s.y + s.h; b.vy = 0; }
      }
    }
  }
}

/** Eingänge aus der Anlage: Sensoren (mit Werkstoff, Öffner) und Endlagen der Zylinder. */
export function plantInputs(plant, world) {
  const inp = {};
  const set = (name, v) => {
    const n = String(name ?? '').trim();
    if (n) inp[n] = inp[n] || v ? 1 : 0;
  };
  for (const it of plant?.items || []) {
    if (it.type === 'sensor') {
      const area = { x: num(it.x, 0), y: num(it.y, 0), w: num(it.w, 1), h: num(it.h, 1) };
      const hit = (world?.bodies || []).some((b) => overlap(b, area) && (!it.material || it.material === b.material));
      set(it.in, it.nc ? !hit : hit);
    } else if (it.type === 'cylinder') {
      const pos = world?.cyl?.[it.id] || 0;
      const stroke = Math.max(0.2, num(it.stroke, 4));
      if (it.home) set(it.home, pos <= 0.02);
      if (it.ext) set(it.ext, pos >= stroke - 0.02);
    }
  }
  return inp;
}

/** Namen der Eingänge, die die Anlage selbst liefert (nicht über Taster der Tabelle). */
export function plantInputNames(plant) {
  const names = new Set();
  for (const it of plant?.items || []) {
    if (it.type === 'sensor' && it.in) names.add(String(it.in).trim());
    if (it.type === 'cylinder') { if (it.home) names.add(String(it.home).trim()); if (it.ext) names.add(String(it.ext).trim()); }
  }
  return names;
}

/**
 * Beispielanlage zur Grundeinstellung des SPS-Labors (S1, B0, B1, Y1, H1; Lichtschranke B2): Start legt
 * ein Teil vor den Zylinder, der schiebt es vom Tisch in den Behälter (Vernichter); ist er wieder
 * eingefahren (B0), legt der Erzeuger das nächste Teil nach.
 */
export function plantExample() {
  return {
    w: 24, h: 12,
    items: [
      { id: 'p1', type: 'button', x: 1, y: 1, in: 'S1', label: 'Start' },
      { id: 'p2', type: 'lamp', x: 3.4, y: 1.1, out: 'H1', color: 'yellow', label: 'H1' },
      { id: 'p3', type: 'object', x: 1, y: 8, w: 9, h: 0.6, fixed: true, material: 'metal', color: '#94a3b8' },
      { id: 'p4', type: 'cylinder', x: 1, y: 6.4, dir: 'right', stroke: 5, speed: 4, out: 'Y1', ext: 'B1', home: 'B0' },
      { id: 'p5', type: 'object', x: 5, y: 6.2, w: 1.6, h: 1.8, material: 'plastic', color: '#f59e0b' },
      { id: 'p6', type: 'sensor', x: 4.6, y: 6.6, w: 3, h: 0.3, in: 'B2', kind: 'light' },
      { id: 'p7', type: 'destroyer', x: 9.6, y: 9.4, w: 3.4, h: 2.4 },
      { id: 'p8', type: 'creator', x: 4.6, y: 3.2, out: 'B0', object: { w: 1.6, h: 1.8, material: 'plastic', color: '#f59e0b' } },
    ],
  };
}

/**
 * Biegewerkzeug (Arbeitsblatt „Bending Machine“): MM1 spannt das Blech auf dem Tisch (doppeltwirkend,
 * QM11 aus / QM12 ein, BG11 oben / BG12 unten), MM2 biegt das überstehende Stück an der Tischkante ab
 * (einfachwirkend mit Feder, QM21, BG21 oben / BG22 unten). SF1 Start.
 */
export function plantBending() {
  return {
    w: 18, h: 14,
    items: [
      { id: 'tisch', type: 'object', x: 4, y: 10, w: 11, h: 3, fixed: true, material: 'metal', color: '#9590c8' },
      { id: 'blech', type: 'object', x: 2.4, y: 9.8, w: 12, h: 0.2, material: 'metal', color: '#475569', bendable: true },
      { id: 'mm1', type: 'cylinder', x: 10, y: 2, dir: 'down', stroke: 4.4, speed: 3, out: 'QM11', ret: 'QM12', home: 'BG11', ext: 'BG12', label: 'MM1' },
      { id: 'mm2', type: 'cylinder', x: 2.6, y: 2, dir: 'down', stroke: 6, speed: 3, out: 'QM21', home: 'BG21', ext: 'BG22', label: 'MM2' },
      { id: 'sf1', type: 'button', x: 15.5, y: 1, in: 'SF1', label: 'SF1 Start' },
    ],
  };
}

/** Beispielanlagen mit den Einträgen der Zuordnungstabelle, die sie brauchen. */
export const PLANT_EXAMPLES = [
  { key: 'press', label: 'Zylinder schiebt Teile', make: plantExample, io: [
    ['in', 'S1', 'Start-Taster'], ['in', 'B0', 'Zylinder eingefahren'], ['in', 'B1', 'Zylinder ausgefahren'], ['in', 'B2', 'Lichtschranke Teil da'],
    ['out', 'Y1', 'Zylinder ausfahren'], ['out', 'H1', 'Meldeleuchte']] },
  { key: 'bend', label: 'Biegewerkzeug', make: plantBending, io: [
    ['in', 'SF1', 'Start-Taster'], ['in', 'BG11', 'MM1 eingefahren (oben)'], ['in', 'BG12', 'MM1 ausgefahren (Blech gespannt)'],
    ['in', 'BG21', 'MM2 eingefahren (oben)'], ['in', 'BG22', 'MM2 ausgefahren (Blech gebogen)'],
    ['out', 'QM11', 'MM1 ausfahren (Ventil 1 Spule 1)'], ['out', 'QM12', 'MM1 einfahren (Ventil 1 Spule 2)'], ['out', 'QM21', 'MM2 ausfahren (Ventil 2 Spule 1)']] },
];

/** Welche Felder eines Elements Symbole der Zuordnungstabelle tragen (und welcher Art). */
export const PLANT_SIGNALS = {
  button: [['in', 'in'], ['lamp', 'out']],
  lamp: [['out', 'out']],
  conveyor: [['out', 'out'], ['rev', 'out']],
  cylinder: [['out', 'out'], ['ret', 'out'], ['ext', 'in'], ['home', 'in']],
  sensor: [['in', 'in']],
  creator: [['out', 'any']],
};

/** Symbole, die die Anlage verwendet: Name → { kind: 'in'|'out'|'any', uses: [{ it, key }] }. */
export function plantSymbols(plant) {
  const out = new Map();
  for (const it of plant?.items || []) {
    for (const [key, kind] of PLANT_SIGNALS[it.type] || []) {
      const n = String(it[key] ?? '').trim();
      if (!n) continue;
      if (!out.has(n)) out.set(n, { kind, uses: [] });
      out.get(n).uses.push({ it, key });
    }
  }
  return out;
}

/** Ein Symbol in der ganzen Anlage umbenennen (z. B. SF1 → xSF1). */
export function plantRename(plant, from, to) {
  for (const { it, key } of plantSymbols(plant).get(String(from).trim())?.uses || []) it[key] = to;
}

/**
 * Vorhandener Name in der Tabelle, der zu `name` passt: gleich, mit vorangestelltem x (xSF1 für SF1,
 * wie in TIA/IEC üblich für BOOL) oder ohne es; Groß-/Kleinschreibung egal. Sonst null.
 */
export function symbolAlias(name, names) {
  const n = String(name ?? '').trim();
  if (!n) return null;
  const low = n.toLowerCase();
  const list = [...names].map((x) => String(x ?? '').trim()).filter(Boolean);
  return list.find((x) => x === n)
    || list.find((x) => x.toLowerCase() === low)
    || list.find((x) => x.toLowerCase() === `x${low}`)
    || (low.startsWith('x') ? list.find((x) => x.toLowerCase() === low.slice(1)) : null)
    || null;
}
