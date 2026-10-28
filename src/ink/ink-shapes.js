// Formen der Stift-Ebene: Rechteck, Ellipse, Vieleck, Linie, Pfeil – als
// Objekte mit Linie (Farbe, Stärke, Strichart), Füllung (Farbe, Deckkraft) und
// Drehung. Reine Rechnung ohne DOM (ink-view.js zeichnet, ink-editor.js
// bedient), damit sie sich ohne Browser prüfen lässt.
//
// Ein Element: { id, type: 'shape', kind, color, width, dash?, fill?, opacity?, … }
//   rect, ellipse: x, y, w, h (ungedreht) und rot (Grad, um die Mitte)
//   polygon (geschlossen), line, arrow: points [[x, y], …] auf der Seite;
//   Drehen dreht die Punkte selbst, rot bleibt 0
//   arrow: heads 'end' | 'both'
//   Rechteck, Ellipse, Vieleck: text (Zeilen mit \n), textSize (pt) – mittig, dreht mit
//   (beim Vieleck über textRot, weil seine Drehung in den Punkten steckt); textTurn: Text
//   zusätzlich gedreht (0, 90, 180, 270), z. B. senkrecht in einem geraden Rechteck

export const SHAPE_KINDS = ['rect', 'ellipse', 'polygon', 'line', 'arrow'];
/** Hellere Farben für Flächen. */
export const FILL_COLORS = ['#fef9c3', '#fde68a', '#fed7aa', '#fecaca', '#fbcfe8', '#e9d5ff', '#bfdbfe', '#bbf7d0', '#e5e7eb', '#ffffff'];
export const DASHES = ['solid', 'dash', 'dot'];
/** Linienstärken in Punkten (dünn, mittel, dick). */
export const SHAPE_WIDTHS = [1, 2, 3.5];

const rad = (deg) => (deg * Math.PI) / 180;
export const usesPoints = (item) => item.kind === 'polygon' || item.kind === 'line' || item.kind === 'arrow';
export const isClosed = (item) => item.kind !== 'line' && item.kind !== 'arrow';
/** Schriftgröße eines Textes in der Form ohne Angabe. */
export const SHAPE_TEXT_SIZE = 12;

/** Text in der Form: Mitte, Drehung, Zeilen und Grundlinie der ersten Zeile – oder null. */
export function shapeTextLayout(item) {
  if (!item.text || !isClosed(item)) return null;
  const size = item.textSize || SHAPE_TEXT_SIZE;
  const lines = String(item.text).split('\n');
  const lh = size * 1.25;
  const [cx, cy] = shapeCenter(item);
  // textTurn: eigene Drehung des Texts in der Form (90°-Schritte), zur Drehung der Form dazu.
  const rot = ((usesPoints(item) ? item.textRot || 0 : item.rot || 0) + (item.textTurn || 0)) % 360;
  return { cx, cy, size, lines, lh, firstY: cy - ((lines.length - 1) * lh) / 2 + size * 0.35, rot };
}

/** Punkt um die Mitte (cx, cy) drehen. */
export function rotatePoint([x, y], [cx, cy], deg) {
  if (!deg) return [x, y];
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

function boxOfPoints(points) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Ungedrehter Rahmen der Form: { x, y, w, h }. */
export function shapeBox(item) {
  return usesPoints(item) ? boxOfPoints(item.points || [[0, 0]]) : { x: item.x, y: item.y, w: item.w, h: item.h };
}

export function shapeCenter(item) {
  const b = shapeBox(item);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

/** Umriss als Punkte auf der Seite (Ellipse angenähert) – zum Treffen und für den Rahmen. */
export function outline(item, steps = 32) {
  if (usesPoints(item)) return (item.points || []).map(([x, y]) => [x, y]);
  const c = shapeCenter(item);
  let pts;
  if (item.kind === 'ellipse') {
    pts = Array.from({ length: steps }, (_, i) => {
      const a = (2 * Math.PI * i) / steps;
      return [c[0] + (item.w / 2) * Math.cos(a), c[1] + (item.h / 2) * Math.sin(a)];
    });
  } else {
    pts = [[item.x, item.y], [item.x + item.w, item.y], [item.x + item.w, item.y + item.h], [item.x, item.y + item.h]];
  }
  return pts.map((p) => rotatePoint(p, c, item.rot || 0));
}

/** Spitze eines Pfeils am Ende p1 (aus Richtung p0): drei Punkte. */
export function arrowHead(p0, p1, width) {
  const len = Math.max(6, width * 4);
  const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const side = (s) => [p1[0] - len * Math.cos(a - s * 0.42), p1[1] - len * Math.sin(a - s * 0.42)];
  return [side(1), [p1[0], p1[1]], side(-1)];
}

/** Umgebendes Rechteck auf der Seite (mit Linienstärke und Pfeilspitzen). */
export function shapeBounds(item) {
  const pts = outline(item);
  if (item.kind === 'arrow' && pts.length >= 2) {
    pts.push(...arrowHead(pts[pts.length - 2], pts[pts.length - 1], item.width || 2));
    if (item.heads === 'both') pts.push(...arrowHead(pts[1], pts[0], item.width || 2));
  }
  const b = boxOfPoints(pts.length ? pts : [[0, 0]]);
  const pad = (item.width || 0) / 2;
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

function distToSegment(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Trifft (x, y) die Form? Auf der Linie (± radius) – gefüllt auch innen. */
export function hitShape(item, x, y, radius) {
  const pts = outline(item);
  const reach = radius + (item.width || 1) / 2;
  const closed = isClosed(item);
  if (closed && (item.fill || item.text) && insidePolygon(x, y, pts)) return true;
  for (let i = 1; i < pts.length; i++) if (distToSegment(x, y, pts[i - 1], pts[i]) <= reach) return true;
  return closed && pts.length > 2 && distToSegment(x, y, pts[pts.length - 1], pts[0]) <= reach;
}

/** Verschieben (neue Kopie). */
export function movedShape(item, dx, dy) {
  if (usesPoints(item)) return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...item, x: item.x + dx, y: item.y + dy };
}

/** Anfasser zum Größe-Ziehen: die vier Ecken des (gedrehten) Rahmens, Reihenfolge wie resizedShape. */
export function shapeCorners(item) {
  const b = shapeBox(item);
  const c = [b.x + b.w / 2, b.y + b.h / 2];
  const rot = usesPoints(item) ? 0 : item.rot || 0;
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((p) => rotatePoint(p, c, rot));
}

/** Anfasser zum Drehen: über der Mitte der Oberkante, `gap` darüber. */
export function rotateHandle(item, gap) {
  const b = shapeBox(item);
  const c = [b.x + b.w / 2, b.y + b.h / 2];
  const rot = usesPoints(item) ? 0 : item.rot || 0;
  return rotatePoint([c[0], b.y - gap], c, rot);
}

/**
 * Ecke `corner` (0 links oben … 3 links unten) auf (x, y) ziehen; die gegenüberliegende Ecke
 * bleibt, wo sie ist – bei Rechteck und Ellipse im gedrehten Rahmen, bei Punkten im Rahmen der Seite.
 */
export function resizedShape(item, corner, x, y, min = 4) {
  const b = shapeBox(item);
  const c = [b.x + b.w / 2, b.y + b.h / 2];
  const rot = usesPoints(item) ? 0 : item.rot || 0;
  const local = rotatePoint([x, y], c, -rot);
  const left = corner === 0 || corner === 3;
  const top = corner === 0 || corner === 1;
  const fx = left ? b.x + b.w : b.x;
  const fy = top ? b.y + b.h : b.y;
  const nx = left ? Math.min(local[0], fx - min) : Math.max(local[0], fx + min);
  const ny = top ? Math.min(local[1], fy - min) : Math.max(local[1], fy + min);
  const nb = { x: Math.min(fx, nx), y: Math.min(fy, ny), w: Math.abs(nx - fx), h: Math.abs(ny - fy) };
  if (usesPoints(item)) {
    const sx = b.w ? nb.w / b.w : 1;
    const sy = b.h ? nb.h / b.h : 1;
    return { ...item, points: item.points.map(([px, py]) => [nb.x + (px - b.x) * sx, nb.y + (py - b.y) * sy]) };
  }
  // Neue Mitte im ungedrehten Rahmen → auf die Seite; dort liegt die Form, gedreht um ihre neue Mitte.
  const ncLocal = [nb.x + nb.w / 2, nb.y + nb.h / 2];
  const nc = rotatePoint(ncLocal, c, rot);
  return { ...item, x: nc[0] - nb.w / 2, y: nc[1] - nb.h / 2, w: nb.w, h: nb.h };
}

/** Auf 0–360 Grad, ganz nahe an Vielfachen von 15° eingerastet (`snap` Grad). */
export function normalizedAngle(deg, snap = 0) {
  let a = ((deg % 360) + 360) % 360;
  if (snap) {
    const near = Math.round(a / 15) * 15;
    if (Math.abs(a - near) <= snap) a = near % 360;
  }
  return Math.round(a * 10) / 10;
}

/** `base` um `delta` Grad gedreht (um seine Mitte). */
export function rotatedShape(base, delta) {
  if (usesPoints(base)) {
    const c = shapeCenter(base);
    const turned = { ...base, points: base.points.map((p) => rotatePoint(p, c, delta)) };
    if (base.text) turned.textRot = normalizedAngle((base.textRot || 0) + delta);
    return turned;
  }
  return { ...base, rot: normalizedAngle((base.rot || 0) + delta) };
}

/** Rechteck bzw. Ellipse → Vieleck mit denselben Punkten auf der Seite (Ecken einzeln ziehbar). */
export function toPolygon(item, steps = 24) {
  if (usesPoints(item)) return item;
  const { x: _x, y: _y, w: _w, h: _h, rot: _r, ...rest } = item;
  const r2 = (v) => Math.round(v * 100) / 100;
  return { ...rest, kind: 'polygon', points: outline(item, steps).map(([px, py]) => [r2(px), r2(py)]), ...(item.text && item.rot ? { textRot: item.rot } : {}) };
}

/** Strichart als stroke-dasharray (oder null). */
export function dashArray(dash, width) {
  const w = Math.max(width || 1, 0.5);
  if (dash === 'dash') return `${(w * 4).toFixed(2)} ${(w * 2.5).toFixed(2)}`;
  if (dash === 'dot') return `0.01 ${(w * 2.2).toFixed(2)}`;
  return null;
}

/** Neue Form aus einer Zieh-Geste von (x0, y0) nach (x1, y1); `square`: Quadrat, Kreis bzw. 15°-Schritte. */
export function shapeFromDrag(kind, [x0, y0], [x1, y1], square = false) {
  let dx = x1 - x0;
  let dy = y1 - y0;
  if (kind === 'line' || kind === 'arrow') {
    if (square) {
      const len = Math.hypot(dx, dy);
      const a = Math.round(Math.atan2(dy, dx) / rad(15)) * rad(15);
      dx = len * Math.cos(a);
      dy = len * Math.sin(a);
    }
    return { kind, points: [[x0, y0], [x0 + dx, y0 + dy]] };
  }
  if (square) {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * s;
    dy = Math.sign(dy || 1) * s;
  }
  return { kind, x: Math.min(x0, x0 + dx), y: Math.min(y0, y0 + dy), w: Math.abs(dx), h: Math.abs(dy), rot: 0 };
}
