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
//   { type: 'cylinder', x, y, dir: 'right'|'left'|'up'|'down', stroke: 4, speed: 4,   – Gehäuse = Hub + 0,8
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
const CYL = { thick: 1, head: 0.4, plate: 1.6, extra: 0.8 };

/** Gehäuselänge eines Zylinders: Hub plus Kolben und Deckel – die Stange kann nie länger ausfahren. */
export function cylinderLen(it) {
  return Math.max(0.2, num(it?.stroke, 4)) + CYL.extra;
}

/**
 * Hub ändern, ohne dass die Kolbenplatte (eingefahren) wandert: Das Gehäuse wächst nach hinten.
 * Für Bedienung und KI – setzt it.stroke und verschiebt x bzw. y.
 */
export function cylinderSetStroke(it, stroke) {
  const before = cylinderLen(it);
  it.stroke = Math.max(0.2, Math.round(stroke * 100) / 100);
  const d = cylinderLen(it) - before;
  if (it.dir === 'down') it.y = Math.round((num(it.y, 0) - d) * 100) / 100;
  else if (it.dir !== 'up' && it.dir !== 'left') it.x = Math.round((num(it.x, 0) - d) * 100) / 100;
}
const EPS = 1e-6;
const SUB = 1 / 120;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const sig = (out, name) => !!(name && out && out[String(name).trim()]);

/** Leere Anlage (v: 2 – Zylindergehäuse so lang wie der Hub). */
export function plantDefault() {
  return { v: 2, w: 24, h: 12, items: [] };
}

/**
 * Anlage aus der ersten Fassung (ohne v): Zylinder hatten ein Gehäuse von 3 E. Das Gehäuse wächst
 * auf Hub + 0,8 nach hinten, die Kolbenplatte bleibt, wo sie war. Ändert `plant`; true = umgestellt.
 */
export function plantUpgrade(plant) {
  if (!plant || typeof plant !== 'object' || plant.v >= 2) return false;
  for (const it of plant.items || []) {
    if (it.type !== 'cylinder') continue;
    const d = cylinderLen(it) - 3;
    if (it.dir === 'down') it.y = Math.round((num(it.y, 0) - d) * 100) / 100;
    else if (it.dir !== 'up' && it.dir !== 'left') it.x = Math.round((num(it.x, 0) - d) * 100) / 100;
  }
  plant.v = 2;
  return true;
}

/** Größe eines Elements (für Bild, Treffer, Ziehen). */
export function plantSize(it) {
  switch (it?.type) {
    case 'button': return { w: 1.4, h: 1.4 };
    case 'lamp': return { w: 1.2, h: 1.2 };
    case 'conveyor': return { w: num(it.w, 8), h: BELT_H };
    case 'cylinder': return /^(up|down)$/.test(it.dir) ? { w: CYL.thick, h: cylinderLen(it) } : { w: cylinderLen(it), h: CYL.thick };
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
    v: 2, w: 24, h: 12,
    items: [
      { id: 'p1', type: 'button', x: 1, y: 1, in: 'S1', label: 'Start' },
      { id: 'p2', type: 'lamp', x: 3.4, y: 1.1, out: 'H1', color: 'yellow', label: 'H1' },
      { id: 'p3', type: 'object', x: 1, y: 8, w: 9, h: 0.6, fixed: true, material: 'metal', color: '#94a3b8' },
      { id: 'p4', type: 'cylinder', x: 1, y: 6.4, dir: 'right', stroke: 4, speed: 4, out: 'Y1', ext: 'B1', home: 'B0' },
      { id: 'p5', type: 'object', x: 6.4, y: 6.2, w: 1.6, h: 1.8, material: 'plastic', color: '#f59e0b' },
      { id: 'p6', type: 'sensor', x: 6.2, y: 6.6, w: 2.5, h: 0.3, in: 'B2', kind: 'light' },
      { id: 'p7', type: 'destroyer', x: 9.6, y: 9.4, w: 3.4, h: 2.4 },
      { id: 'p8', type: 'creator', x: 6.1, y: 3.2, out: 'B0', object: { w: 1.6, h: 1.8, material: 'plastic', color: '#f59e0b' } },
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
    v: 2, w: 18, h: 14,
    items: [
      { id: 'tisch', type: 'object', x: 4, y: 10, w: 11, h: 3, fixed: true, material: 'metal', color: '#9590c8' },
      { id: 'blech', type: 'object', x: 2.4, y: 9.8, w: 12, h: 0.2, material: 'metal', color: '#475569', bendable: true },
      { id: 'mm1', type: 'cylinder', x: 10, y: 4.6, dir: 'down', stroke: 2, speed: 3, out: 'QM11', ret: 'QM12', home: 'BG11', ext: 'BG12', label: 'MM1' },
      { id: 'mm2', type: 'cylinder', x: 2.6, y: 3, dir: 'down', stroke: 3.6, speed: 3, out: 'QM21', home: 'BG21', ext: 'BG22', label: 'MM2' },
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

// ==================== Bild der Anlage ====================

const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = 'font-family="Liberation Sans, Arial, sans-serif"';
export const MAT_COLOR = { metal: '#9ca3af', plastic: '#f59e0b', wood: '#b7791f' };
const LAMP_COLOR = { yellow: '#facc15', red: '#ef4444', green: '#22c55e', blue: '#3b82f6', white: '#f8fafc' };

/**
 * Bild der Anlage (Bildschirm und Druck): { w, h, defs, body } in Rastereinheiten.
 * opts: world (Lauf) oder null (Stand), vars (Ausgänge), io (Zuordnungstabelle), pressed (Taster je io.id),
 * edit (Aufbauen: Auswahl), sel, print (ohne Raster, Schraffur und gestrichelte Endlagen).
 */
export function plantSvgParts(p, { world = null, vars = {}, io = [], pressed = {}, edit = false, sel = null, print = false } = {}) {
  const ioByName = (n) => io.find((x) => n && String(x.name ?? '').trim() === String(n).trim()) || null;
  const W = p.w || 24;
  const H = p.h || 12;
  const inp = world ? plantInputs(p, world) : {};
  const on = (n) => !!(n && vars[String(n).trim()]);
  const defs = print ? '' : `<pattern id="pg" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e5e7eb" stroke-width="0.02"/></pattern>`
    + '<pattern id="ph" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.4" stroke="#64748b" stroke-width="0.08"/></pattern>';
  let o = `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
  o += print ? `<rect x="0.02" y="0.02" width="${W - 0.04}" height="${H - 0.04}" fill="none" stroke="#94a3b8" stroke-width="0.04"/>` : `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#pg)"/>`;
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
        const stroke = Math.max(0.2, it.stroke ?? 4);
        const horiz = !/^(up|down)$/.test(it.dir);
        const sgn = it.dir === 'left' || it.dir === 'up' ? -1 : 1; // Richtung des Ausfahrens
        const cx = x + w / 2;
        const cy = y + hh / 2;
        // Längs der Achse: hinteres Ende des Gehäuses, Kolben bei Hub `q`
        const back = horiz ? (sgn > 0 ? x : x + w) : (sgn > 0 ? y : y + hh);
        const pist = (q) => back + sgn * (0.3 + q);
        const at = (a, d = 0) => (horiz ? [a, cy + d] : [cx + d, a]);
        const ln = (a1, a2, sw, extra = '') => { const [x1, y1] = at(a1); const [x2, y2] = at(a2); return `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke="#334155" stroke-width="${sw}"${extra}/>`; };
        const plate = (head, extra) => `<rect x="${r3(head.x)}" y="${r3(head.y)}" width="${r3(head.w)}" height="${r3(head.h)}" ${extra}/>`;
        // Eingestellt (Simulation steht): Endlage gestrichelt – so weit reicht der Hub.
        if (!world && !print) {
          const end = cylinderHead(it, stroke);
          const endMid = horiz ? end.x + end.w / 2 : end.y + end.h / 2;
          g += ln(back + sgn * (horiz ? w : hh), endMid, 0.08, ' stroke-dasharray="0.15 0.12" opacity="0.6"');
          g += plate(end, 'fill="none" stroke="#2563eb" stroke-width="0.05" stroke-dasharray="0.2 0.12"');
        }
        g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="0.1" fill="#e2e8f0" stroke="#334155" stroke-width="0.05"/>`;
        // Kolben im Gehäuse, Stange vom Kolben zur Platte
        const head = cylinderHead(it, pos);
        const headMid = horiz ? head.x + head.w / 2 : head.y + head.h / 2;
        g += ln(pist(pos), headMid, 0.2);
        const pk = pist(pos);
        g += horiz ? `<rect x="${r3(pk - 0.1)}" y="${r3(y + 0.08)}" width="0.2" height="${r3(hh - 0.16)}" fill="#94a3b8"/>`
          : `<rect x="${r3(x + 0.08)}" y="${r3(pk - 0.1)}" width="${r3(w - 0.16)}" height="0.2" fill="#94a3b8"/>`;
        g += plate(head, 'fill="#1e293b"');
        // Beschriftung neben dem Gehäuse (innen läuft der Kolben)
        g += horiz ? txt(cx, y - 0.2, it.label || it.out || 'Zylinder', 0.3, '#1e293b') : txt(x - 0.15, cy + 0.1, it.label || it.out || 'Zylinder', 0.3, '#1e293b', 'end');
        // Endlagensensoren als grüne Punkte (leuchten, wenn erreicht): eingefahren hinten, ausgefahren vorn
        const inp2 = world ? plantInputs(p, world) : {};
        const dot = (name, a) => {
          if (!name) return '';
          const [px, py] = horiz ? [a, y + hh + 0.3] : [x + w + 0.25, a];
          const on2 = inp2[String(name).trim()];
          return `<circle cx="${r3(px)}" cy="${r3(py)}" r="0.18" fill="${on2 ? '#22c55e' : '#e2e8f0'}" stroke="#15803d" stroke-width="0.04"/>`
            + (horiz ? txt(px, py + 0.55, name, 0.3) : txt(px + 0.3, py + 0.11, name, 0.3, '#334155', 'start'));
        };
        g += dot(it.home, pist(0)) + dot(it.ext, pist(stroke));
        break;
      }
      case 'object':
        g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${it.shape === 'round' ? Math.min(w, hh) / 2 : 0.08}" fill="${it.color || (it.fixed ? '#cbd5e1' : MAT_COLOR[it.material] || '#f59e0b')}" stroke="#334155" stroke-width="0.04"/>`;
        if (it.fixed && !it.color && !print) g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="url(#ph)" opacity="0.5"/>`;
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
  return { w: W, h: H, defs, body: o };
}

/** Die Anlage als ganzes SVG (Bildschirm: cls = Klassen für die Bedienung). */
export function plantSvg(p, opts = {}) {
  const { w, h, defs, body } = plantSvgParts(p, opts);
  const cls = opts.cls ? ` class="plant-svg${opts.edit ? ' plant-edit' : ''}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${opts.cls ? '' : ` width="${w}cm" height="${h}cm"`}${cls}>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
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
