import { describe, it, expect } from './expect.js';
import { richText, parseColorSpec } from '../src/doc/docspec.js';

describe('Schriftgrößen im Text', () => {
  it('[Text]{14pt} – auch mit Farbe und Hervorhebung, relativ zur Grundschrift (11 pt)', () => {
    expect(parseColorSpec('blau,hl-gelb,14pt')).toEqual({ color: 'blau', hl: 'gelb', size: 14 });
    expect(richText('[groß]{22pt}')).toBe('[groß]{22pt}'); // 22 pt gibt es nicht: wörtlich
    const html = richText('Hallo [Welt]{blau,14pt}!');
    expect(html).toContain('data-size="14"');
    expect(html).toContain('font-size:1.273em');
    expect(html).toContain('color:#1d4ed8');
    expect(richText('[**fett**]{8pt}')).toContain('<strong>fett</strong>');
  });
});
