import { describe, it, expect } from './expect.js';
import * as ds from '../src/doc/docspec.js';

describe('Code-Baustein: Schriftgröße (size)', () => {
  it('prüft size gegen die Liste', () => {
    expect(ds.validateDocSpec({ content: [{ type: 'code', code: 'x', size: 8 }] })).toEqual([]);
    expect(ds.validateDocSpec({ content: [{ type: 'code', code: 'x', size: 13 }] }))
      .toEqual([expect.stringContaining('size: Schriftgröße in pt')]);
  });

  it('setzt die Größe relativ zur Grundschrift, ohne Angabe die Vorgabe (CSS)', () => {
    expect(ds.renderDocSpecHtml({ content: [{ type: 'code', code: 'x', size: 8 }] })).toContain('<pre class="ds-code" style="font-size:0.727em">');
    expect(ds.renderDocSpecHtml({ content: [{ type: 'code', code: 'x' }] })).toContain('<pre class="ds-code"><code>');
  });
});

describe('Code-Baustein: interaktive Darstellung (view: result)', () => {
  it('nur mit run: true erlaubt', () => {
    expect(ds.validateDocSpec({ content: [{ type: 'code', run: true, view: 'result', code: 'x = 1' }] })).toEqual([]);
    expect(ds.validateDocSpec({ content: [{ type: 'code', view: 'result', code: 'x = 1' }] }).length).toBe(1);
    expect(ds.validateDocSpec({ content: [{ type: 'code', run: true, view: 'bild', code: 'x = 1' }] }).length).toBe(1);
  });
  it('kennzeichnet den Block im HTML', () => {
    const html = ds.renderDocSpecHtml({ content: [{ type: 'code', run: true, view: 'result', code: 'x = 1' }] });
    expect(html.includes('data-view="result"')).toBe(true);
  });
});
