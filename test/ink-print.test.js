import { describe, it, expect } from './expect.js';
import { applyInkToSpec } from '../src/ink/ink-print.js';

describe('Druck über den Renderer: applyInkToSpec', () => {
  const spec = { content: [
    { type: 'section', text: 'A', id: 'a' },
    { type: 'task', title: 'Aufgabe', blocks: ['Text', { type: 'karo', lines: 4, id: 'k1' }] },
    { type: 'karo', lines: 2 },
  ] };
  const ink = { svg: '<svg/>', x: 10, y: -2, w: 50, h: 20 };

  it('Striche und Feldmaße an den Bausteinen, Original unverändert', () => {
    const out = applyInkToSpec(spec, {
      overlays: [{ path: '1.1', ...ink }, { path: '1.0', ...ink }],
      karo: [{ path: '1.1', lines: 8, width: 8, pattern: 'linien' }, { path: '2', width: 16.5 }],
    });
    expect(out.content[1].blocks[1]).toEqual({ type: 'karo', lines: 8, id: 'k1', width: '8cm', pattern: 'linien', ink });
    expect(out.content[1].blocks[0]).toEqual({ type: 'text', text: 'Text', ink });
    expect(out.content[2]).toEqual({ type: 'karo', lines: 2 });
    expect(spec.content[1].blocks[0]).toBe('Text');
  });

  it('eingefügte Felder an ihrer Stelle, in ihrer Reihenfolge, mit Beschriftung', () => {
    const out = applyInkToSpec(spec, {
      inserts: [{ id: 'i1', after: '0', lines: 3 }, { id: 'i2', after: '0' }, { id: 'i3', after: null }, { id: 'i4', after: 'end' }, { id: 'i5', after: '1.1' }],
      overlays: [{ insert: 'i2', ...ink }],
    });
    expect(out.content.map((b) => b.id || b.type)).toEqual(['karo', 'a', 'karo', 'karo', 'task', 'karo', 'karo']);
    expect(out.content[2].lines).toBe(3);
    expect(out.content[3].ink).toEqual(ink);
    expect(out.content[4].blocks.map((b) => b.id || b.type || b)).toEqual(['Text', 'k1', 'karo']);
  });

  it('unbekannte Pfade ändern nichts', () => {
    expect(applyInkToSpec(spec, { overlays: [{ path: '9.9', ...ink }], karo: [{ path: 'x', lines: 3 }] })).toEqual(spec);
  });
});
