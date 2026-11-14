import { describe, it, expect } from './expect.js';
import { rateImport, importMetrics } from '../src/import/quality.js';

const svg = (body) => ({ type: 'image', src: `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`).toString('base64')}` });
const line = (x, y, t, extra = '') => `<text x="${x}" y="${y}" font-family="Arial" font-size="20" text-anchor="start"${extra}>${t}</text>`;

describe('Import-Bewertung (Ampel)', () => {
  it('sauberes Blatt ist grün', () => {
    const r = rateImport({ content: [{ type: 'task', title: 'Ohmsches Gesetz', text: 'Berechne I.' }, { type: 'karo', lines: 4 }] });
    expect(r.level).toBe('good');
    expect(r.reasons).toEqual([]);
    expect(r.metrics.tasks).toBe(1);
  });

  it('leer ist rot', () => {
    expect(rateImport({ content: [] }).level).toBe('weak');
  });

  it('Fließtext über einer Tabellenlinie wird erkannt, mit textLength nicht mehr', () => {
    const edge = '<line x1="300" y1="0" x2="300" y2="200" stroke="#000"/>';
    const long = 'Dieser Satz ist viel zu lang für den Platz';
    const over = svg(edge + line(10, 40, long) + line(10, 64, long) + line(10, 88, long));
    expect(importMetrics({ content: [over] }).overflow).toBe(3);
    expect(rateImport({ content: [{ type: 'text', text: 'x'.repeat(500) }, over] }).level).toBe('weak');
    const fitted = svg(edge + [40, 64, 88].map((y) => line(10, y, long, ' textLength="280"')).join(''));
    expect(importMetrics({ content: [fitted] }).overflow).toBe(0);
  });

  it('viel Text in Bildern, verlorene Aufgaben und Schreiblinien werden genannt', () => {
    const picture = svg(Array.from({ length: 12 }, (_, i) => line(10, 30 + i * 24, 'Text, der im Bild steckt und nicht bearbeitbar ist')).join(''));
    const r = rateImport({ content: [picture, { type: 'text', text: '1. Berechne den Strom.' }, { type: 'text', text: '2. Berechne die Spannung.' }, { type: 'text', text: 'Name: __________' }] });
    expect(r.level).toBe('weak');
    expect(r.reasons.join(' ')).toContain('stecken in Bildern');
    expect(r.reasons.join(' ')).toContain('sehen wie Aufgaben aus');
    expect(r.reasons.join(' ')).toContain('Schreiblinie');
  });

  it('Aufgabentext unter einer Aufgabe zählt nicht als verlorene Aufgabe', () => {
    const r = importMetrics({ content: [{ type: 'task', title: 'Rechnen' }, { type: 'text', text: 'a) Strom\n\nb) Spannung' }, { type: 'text', text: 'c) Leistung' }] });
    expect(r.taskLike).toBe(0);
  });
});
