import { describe, it, expect } from './expect.js';
import {
  outline, shapeBounds, hitShape, movedShape, resizedShape, rotatedShape, toPolygon, shapeFromDrag,
  normalizedAngle, shapeCorners, rotateHandle, dashArray,
} from '../src/ink/ink-shapes.js';
import { bounds, itemAt, inSelection, moved } from '../src/ink/ink-geometry.js';

const rect = { id: 'r', type: 'shape', kind: 'rect', x: 100, y: 100, w: 80, h: 40, rot: 0, color: '#000', width: 2 };
const close = (a, b, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('Formen im Stift-Editor', () => {
  it('Umriss und Rahmen – gedreht um die Mitte', () => {
    const r90 = { ...rect, rot: 90 };
    const b = shapeBounds(r90);
    close(b.w, 40 + 2); close(b.h, 80 + 2); // Breite und Höhe vertauscht, plus Linienstärke
    close(b.x + b.w / 2, 140); close(b.y + b.h / 2, 120); // Mitte bleibt
    expect(bounds(r90)).toEqual(b);
  });

  it('Treffen: auf der Linie immer, innen nur mit Füllung', () => {
    expect(hitShape(rect, 140, 101, 2)).toBe(true);
    expect(hitShape(rect, 140, 120, 2)).toBe(false);
    expect(hitShape({ ...rect, fill: '#fef08a' }, 140, 120, 2)).toBe(true);
    expect(itemAt([rect], 100, 120, 2)?.id).toBe('r');
    expect(inSelection(rect, { x: 90, y: 90, w: 20, h: 20 })).toBe(true);
  });

  it('Ellipse und Linie treffen', () => {
    const el = { ...rect, kind: 'ellipse' };
    expect(hitShape(el, 180, 120, 2)).toBe(true);   // rechter Scheitel
    expect(hitShape(el, 100, 100, 2)).toBe(false);  // Ecke des Rahmens liegt außerhalb
    const line = { id: 'l', type: 'shape', kind: 'line', points: [[0, 0], [100, 0]], width: 2 };
    expect(hitShape(line, 50, 1.5, 1)).toBe(true);
    expect(hitShape(line, 50, 10, 1)).toBe(false);
  });

  it('Verschieben', () => {
    expect(movedShape(rect, 5, -5)).toMatchObject({ x: 105, y: 95 });
    expect(moved({ type: 'shape', kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }, 1, 2).points).toEqual([[1, 2], [11, 2], [1, 12]]);
  });

  it('Größe ziehen: gedreht bleibt die gegenüberliegende Ecke auf der Seite stehen', () => {
    const r = { ...rect, rot: 30 };
    const fixed = shapeCorners(r)[0];               // links oben bleibt, gezogen wird rechts unten
    const [dx, dy] = shapeCorners(r)[2];
    const next = resizedShape(r, 2, dx + 20, dy + 10);
    const after = shapeCorners(next)[0];
    close(after[0], fixed[0]); close(after[1], fixed[1]);
    expect(next.rot).toBe(30);
    expect(next.w).toBeGreaterThan(r.w);
  });

  it('Vieleck: Größe im Rahmen der Seite, Drehen dreht die Punkte', () => {
    const tri = { type: 'shape', kind: 'polygon', points: [[0, 0], [100, 0], [0, 100]] };
    expect(resizedShape(tri, 2, 200, 50).points).toEqual([[0, 0], [200, 0], [0, 50]]);
    const turned = rotatedShape({ type: 'shape', kind: 'line', points: [[0, 0], [100, 0]] }, 90);
    close(turned.points[0][0], 50); close(turned.points[0][1], -50);
    close(turned.points[1][0], 50); close(turned.points[1][1], 50);
  });

  it('In Vieleck umwandeln: gleiche Punkte auf der Seite, ohne Drehung', () => {
    const poly = toPolygon({ ...rect, rot: 90 });
    expect(poly.kind).toBe('polygon');
    expect(poly.rot).toBe(undefined);
    expect(poly.points).toHaveLength(4);
    const was = outline({ ...rect, rot: 90 });
    poly.points.forEach(([x, y], i) => { close(x, was[i][0]); close(y, was[i][1]); });
    expect(toPolygon({ ...rect, kind: 'ellipse' }, 12).points).toHaveLength(12);
  });

  it('Aufziehen: Quadrat, Kreis, Linie in 15°-Schritten', () => {
    expect(shapeFromDrag('rect', [10, 10], [50, 30], true)).toMatchObject({ x: 10, y: 10, w: 40, h: 40 });
    expect(shapeFromDrag('ellipse', [10, 10], [0, 50])).toMatchObject({ x: 0, y: 10, w: 10, h: 40 });
    const l = shapeFromDrag('line', [0, 0], [100, 8], true).points[1];
    close(l[1], 0, 0.001); // 4,6° → 0°
  });

  it('Winkel einrasten und Dreh-Anfasser über der Oberkante', () => {
    expect(normalizedAngle(-92, 3)).toBe(270);
    expect(normalizedAngle(47, 3)).toBe(45);
    expect(normalizedAngle(50, 3)).toBe(50);
    const [hx, hy] = rotateHandle(rect, 20);
    close(hx, 140); close(hy, 80);
  });

  it('Stricharten', () => {
    expect(dashArray('solid', 2)).toBe(null);
    expect(dashArray('dash', 2)).toBe('8.00 5.00');
    expect(dashArray('dot', 2)).toBe('0.01 4.40');
  });
});
