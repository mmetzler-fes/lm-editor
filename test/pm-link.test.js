// 🔗 Link: Adresse ergänzen und was mit Schreibmarke bzw. Markierung geschieht.
import { describe, it, expect } from './expect.js';
import { linkPlan, normalizeHref } from '../src/editor/pm-link.js';
import { specToPm } from '../src/doc/pm-convert.js';
import { pmSchema } from '../src/doc/pm-tiptap.js';
import { PmNode } from '../src/vendor/tiptap/tiptap.mjs';

const doc = PmNode.fromJSON(pmSchema(), specToPm({ content: [{ type: 'text', text: 'Siehe Wokwi hier' }] }));
const at = (t) => { let p = -1; doc.descendants((n, pos) => { if (p < 0 && n.isText && n.text.includes(t)) p = pos + n.text.indexOf(t); }); return p; };
const URL = 'https://wokwi.com/projects/1';

describe('Link-Plan', () => {
  it('Schreibmarke ohne Text: die Adresse wird eingefügt', () => {
    expect(linkPlan(doc, at('hier'), at('hier'), URL, '')).toEqual({ kind: 'insert', from: at('hier'), to: at('hier'), text: URL });
  });
  it('Schreibmarke mit Text: der Name wird eingefügt', () => {
    expect(linkPlan(doc, at('hier'), at('hier'), URL, 'Projekt')).toEqual({ kind: 'insert', from: at('hier'), to: at('hier'), text: 'Projekt' });
  });
  it('Markierung ohne Text: sie wird zum Link', () => {
    const from = at('Wokwi');
    expect(linkPlan(doc, from, from + 5, URL, '')).toEqual({ kind: 'mark', from, to: from + 5 });
  });
  it('Markierung mit gleichem Text: nur Link', () => {
    const from = at('Wokwi');
    expect(linkPlan(doc, from, from + 5, URL, 'Wokwi').kind).toBe('mark');
  });
  it('Markierung mit anderem Text: wird ersetzt', () => {
    const from = at('Wokwi');
    expect(linkPlan(doc, from, from + 5, URL, 'Simulation')).toEqual({ kind: 'insert', from, to: from + 5, text: 'Simulation' });
  });
  it('leere Adresse entfernt den Link, ohne Markierung nichts', () => {
    const from = at('Wokwi');
    expect(linkPlan(doc, from, from + 5, '', '').kind).toBe('remove');
    expect(linkPlan(doc, from, from, '', '').kind).toBe('none');
  });
});

describe('Adresse ergänzen', () => {
  it('ohne Schema: https://', () => expect(normalizeHref(' wokwi.com/x ')).toBe('https://wokwi.com/x'));
  it('nur „https://“ = leer', () => expect(normalizeHref('https://')).toBe(''));
  it('Mail-Adresse: mailto:', () => expect(normalizeHref('a@b.de')).toBe('mailto:a@b.de'));
  it('mit Schema unverändert', () => expect(normalizeHref('http://x.de')).toBe('http://x.de'));
});
