import { describe, it, expect } from './expect.js';
import { validateDocSpec, renderDocSpecHtml } from '../src/doc/docspec.js';
import { groupRow, toCm, fromCm, ungroup } from '../src/doc/image-group.js';

const A = 'data:image/png;base64,AAAA';
const B = 'data:image/png;base64,BBBB';

describe('Bildgruppe', () => {
  it('gültig mit Bildern in Prozent; falsche Lage und Seitenverhältnis fallen auf', () => {
    expect(validateDocSpec({ content: [{ type: 'group', ratio: 0.5, items: [{ src: A, x: 0, y: 0, w: 50, h: 100 }] }] })).toEqual([]);
    expect(validateDocSpec({ content: [{ type: 'group', ratio: 0.5, items: [] }] }).join(' ')).toMatch('items');
    expect(validateDocSpec({ content: [{ type: 'group', ratio: 0.5, items: [{ src: A, x: 60, y: 0, w: 50, h: 100 }] }] }).join(' ')).toMatch('items[0]');
    expect(validateDocSpec({ content: [{ type: 'group', items: [{ src: A, x: 0, y: 0, w: 50, h: 100 }] }] }).join(' ')).toMatch('ratio');
  });

  it('Ansicht: Rahmen mit Seitenverhältnis, Bilder an ihrer Stelle', () => {
    const html = renderDocSpecHtml({ content: [{ type: 'group', width: '12cm', ratio: 0.5, caption: 'Zwei', items: [{ src: A, x: 0, y: 0, w: 50, h: 100 }, { src: B, x: 50, y: 25, w: 50, h: 75 }] }] });
    expect(html).toContain('style="width:12cm;aspect-ratio:1 / 0.5"');
    expect(html).toContain('style="left:50%;top:25%;width:50%;height:75%"');
    expect(html).toContain('<figcaption>Zwei</figcaption>');
  });

  it('Reihe: gleich hoch, nebeneinander, so breit wie verlangt', () => {
    const g = groupRow([{ src: A, aspect: 2 }, { src: B, aspect: 1 }], 15.3);
    expect(g.width).toBe('15.3cm');
    // Höhe: (15,3 − 0,3) / 3 = 5 cm → Verhältnis 5 / 15,3
    expect(g.ratio).toBeCloseTo(5 / 15.3, 3);
    expect(g.items[0]).toMatchObject({ src: A, x: 0, y: 0, h: 100 });
    expect(g.items[0].w).toBeCloseTo((10 / 15.3) * 100, 2);
    expect(g.items[1].x).toBeCloseTo((10.3 / 15.3) * 100, 2);
    expect(validateDocSpec({ content: [g] })).toEqual([]);
  });

  it('cm und zurück; Leerraum am Rand fällt weg', () => {
    const g = { id: 'x', type: 'group', width: '10cm', ratio: 0.5, caption: 'K', items: [{ src: A, x: 10, y: 20, w: 40, h: 40 }, { src: B, x: 60, y: 20, w: 30, h: 60 }] };
    const cm = toCm(g);
    expect(cm.items[1]).toMatchObject({ x: 6, y: 1, w: 3, h: 3 });
    const back = fromCm(cm.items, g);
    expect(back).toMatchObject({ id: 'x', caption: 'K', width: '8cm', ratio: 0.375 });
    expect(back.items[0]).toEqual({ src: A, x: 0, y: 0, w: 50, h: 66.667 });
    expect(back.items[1]).toEqual({ src: B, x: 62.5, y: 0, w: 37.5, h: 100 });
  });

  it('Gruppierung lösen: Bilder in ihrer Größe, Unterschrift am letzten', () => {
    const g = { type: 'group', width: '10cm', ratio: 0.5, caption: 'K', items: [{ src: B, x: 50, y: 0, w: 50, h: 100 }, { src: A, x: 0, y: 0, w: 40, h: 80 }] };
    expect(ungroup(g)).toEqual([{ type: 'image', src: A, width: '4cm' }, { type: 'image', src: B, width: '5cm', caption: 'K' }]);
  });
});
