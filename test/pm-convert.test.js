// Spec ⇄ ProseMirror-JSON: Aussehen und Felder bleiben, das JSON passt zum Tiptap-Schema.
import fs from 'node:fs';
import { describe, it, expect } from './expect.js';
import { specToPm, pmToSpec, textToInline, inlineToText } from '../src/doc/pm-convert.js';
import { renderDocSpecHtml } from '../src/doc/docspec.js';
import { pmSchema } from '../src/doc/pm-tiptap.js';
import { PmNode } from '../src/vendor/tiptap/tiptap.mjs';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const html = (s) => renderDocSpecHtml(s, { showSolutions: true });
const viaSchema = (spec) => {
  const n = PmNode.fromJSON(pmSchema(), specToPm(spec));
  n.check();
  return pmToSpec(n.toJSON());
};

const ALLES = {
  titel: 'Alles', meta: { kurs: 'X' },
  content: [
    { type: 'section', text: 'Abschnitt', id: 'sec00001' },
    { type: 'task', id: 'task0001', title: 'Aufgabe', text: 'Text dazu\n\nzweiter', blocks: [
      { type: 'subtask', title: 'Teil', blocks: [{ type: 'karo', lines: 4, pattern: 'linien', width: '8cm', id: 'karo0001' }] },
      { type: 'solution', title: 'Lösung', id: 'sol00001', blocks: [{ type: 'text', text: 'Antwort' }] },
    ] },
    { type: 'heading', level: 2, text: 'Unter', id: 'head0001' },
    { type: 'text', id: 'text0001', text: 'Eins\n\nZwei', align: 'center', spaceBefore: 0.5, lineHeight: 1.5 },
    { type: 'note', text: 'Hinweis', id: 'note0001' },
    { type: 'list', id: 'list0001', marker: 'dash', items: ['a', { text: 'b', items: ['c'] }] },
    { type: 'list', ordered: true, numbering: 'a', items: ['x'] },
    { type: 'code', code: 'a = 1\n  b  = 2\n', caption: 'Code', size: 10, id: 'code0001' },
    { type: 'image', src: 'https://x.de/a.png', width: '5cm', float: 'left', alt: 'A', caption: 'Bild', source: 'Quelle', id: 'imag0001' },
    { type: 'text', text: 'neben dem Bild' },
    { type: 'group', id: 'grou0001', ratio: 0.5, width: '10cm', items: [{ src: 'https://x.de/b.png', x: 0, y: 0, w: 50, h: 50 }, { text: 'Rahmen', x: 50, y: 0, w: 50, h: 50, size: 11 }] },
    { type: 'table', id: 'tabl0001', caption: 'T', widths: ['2cm', ''], heights: ['1cm'], lineWidth: 1.5, border: false, header: ['A', 'B'],
      rows: [['1', { text: 'zwei', colspan: 2, align: 'right' }], [{ text: 'mit', images: [{ src: 'https://x.de/c.png' }], beside: true }, { blocks: [{ type: 'list', items: ['in Zelle'] }] }]] },
    { type: 'formula', latex: 'x^2', id: 'form0001' },
    { type: 'box', title: 'Kasten', shaded: true, id: 'boxx0001', blocks: [{ type: 'text', text: 'drin' }] },
    { type: 'columns', id: 'colu0001', blocks: [{ type: 'column', width: '8cm', id: 'colu0002', blocks: [{ type: 'text', text: 'L' }] }, { type: 'column', id: 'colu0003', blocks: [] }] },
    { type: 'spacer', lines: 2, id: 'spac0001' },
    { type: 'pagebreak', id: 'page0001' },
    { type: 'quiz', module: 'Quiz 1', title: 'Q', scale: 0.8, id: 'quiz0001' },
  ],
};

describe('Spec ⇄ ProseMirror-JSON', () => {
  for (const [name, spec] of [['alle Bausteine', ALLES], ['ohm.json', fixture('../examples/ohm.json').spec], ['beispiel', fixture('./fixtures/beispiel.json')], ['erweitert', fixture('./fixtures/erweitert.json')]]) {
    it(`${name}: sieht gleich aus, zweiter Durchlauf gleich, passt zum Schema`, () => {
      const back = pmToSpec(specToPm(spec));
      expect(html(back)).toBe(html(spec));
      expect(pmToSpec(specToPm(back))).toEqual(back);
      expect(viaSchema(spec)).toEqual(back);
    });
  }
  it('Aufgaben werden flach, Felder neben content und unbekannte Felder bleiben', () => {
    const back = pmToSpec(specToPm(ALLES));
    expect(back.titel).toBe('Alles');
    expect(back.meta).toEqual({ kurs: 'X' });
    expect(back.content.map((b) => b.type).slice(0, 6)).toEqual(['section', 'task', 'text', 'subtask', 'karo', 'solution']);
    expect(back.content.find((b) => b.type === 'image').source).toBe('Quelle');
    expect(back.content.find((b) => b.id === 'text0001').text).toBe('Eins\n\nZwei');
  });
  it('unbekannter Baustein bleibt erhalten', () => {
    const block = { type: 'zukunft', wert: [1, 2] };
    expect(pmToSpec(specToPm({ content: [block] })).content).toEqual([block]);
  });
  it('verschachtelte Aufgabe ohne ID verliert nichts', () => {
    const doc = specToPm({ content: [{ type: 'task', title: 'T', blocks: [{ type: 'text', text: 'x' }] }] });
    expect(doc.content.map((n) => n.type)).toEqual(['heading', 'paragraph']);
    expect(doc.content[0].attrs.role).toBe('task');
  });
});

describe('Auszeichnung', () => {
  const round = (t) => inlineToText(textToInline(t));
  it('bleibt, wie sie ist', () => {
    for (const t of ['**fett** und *kursiv*', '***beides***', '++u++ ~~s~~ `c`', 'x^{2} und _{i}', '[Text](https://x.de)', '[blau]{blau}', '[a]{blau,hl-gelb,14pt}', '[**f**]{hl-gelb}', '$a_b*c*$ Text', '8*7*3', 'zehn $ und 5 $']) {
      expect(round(t)).toBe(t);
    }
  });
  it('zerlegt in Knoten', () => {
    expect(textToInline('a **b** $x$')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'inlineMath', attrs: { latex: 'x' } },
    ]);
    expect(textToInline('U_R')).toEqual([{ type: 'text', text: 'U' }, { type: 'text', text: 'R', marks: [{ type: 'subscript' }] }]);
  });
  it('Zeilenumbruch: hardBreak und wieder „\\“', () => {
    expect(textToInline('a\\\nb').map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(round('a\\\nb')).toBe('a\\\nb');
  });
  it('schützt Zeichen nur, wo sie sonst wirken', () => {
    expect(inlineToText([{ type: 'text', text: 'a *b* c' }])).toBe('a \\*b\\* c');
    expect(inlineToText([{ type: 'text', text: '1 + 2 = 3' }])).toBe('1 + 2 = 3');
    expect(textToInline(inlineToText([{ type: 'text', text: '**nicht fett**' }]))).toEqual([{ type: 'text', text: '**nicht fett**' }]);
  });
  it('Reihenfolge der Schlüssel spielt keine Rolle (nach dem Weg durch Tiptap)', () => {
    expect(inlineToText([{ marks: [{ type: 'subscript' }], type: 'text', text: '1' }, { text: ' + 2', type: 'text' }])).toBe('_{1} + 2');
  });
});
