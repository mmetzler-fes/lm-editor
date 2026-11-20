// Entf/Rücktaste: Auswahl bis zum Anfang der nächsten Zeile löscht nur in der Zeile (+ Punkte).
import { describe, it, expect } from './expect.js';
import { inLineDeleteRange } from '../src/editor/pm-delete.js';
import { specToPm } from '../src/doc/pm-convert.js';
import { pmSchema } from '../src/doc/pm-tiptap.js';
import { PmNode } from '../src/vendor/tiptap/tiptap.mjs';

const docOf = (spec) => PmNode.fromJSON(pmSchema(), specToPm(spec));
const doc = docOf({ content: [
  { type: 'task', title: 'Widerstände berechnen', points: 6, text: 'Berechne X_L.' },
  { type: 'text', text: 'Zweiter Absatz' },
  { type: 'text', text: 'Dritter Absatz' },
] });
// Positionen: Überschrift 0, Text 1…; Ende der Überschrift / Anfang des ersten Absatzes
const posOf = (text) => { let at = -1; doc.descendants((n, p) => { if (at < 0 && n.isText && n.text.includes(text)) at = p + n.text.indexOf(text); }); return at; };
const headEnd = posOf('berechnen') + 'berechnen'.length;
const nextStart = posOf('Berechne X');

describe('Löschen in der Zeile', () => {
  it('nur „(6 P)“ markiert: kein Text weg, Punkte weg', () => {
    expect(inLineDeleteRange(doc, headEnd, nextStart)).toEqual({ from: headEnd, to: headEnd, pointsAt: 0 });
  });
  it('Text bis über das Zeilenende: nur bis zum Zeilenende', () => {
    const from = posOf('berechnen');
    expect(inLineDeleteRange(doc, from, nextStart)).toEqual({ from, to: headEnd, pointsAt: 0 });
  });
  it('ohne Punkte: nichts an der Überschrift', () => {
    const from = posOf('Zweiter');
    expect(inLineDeleteRange(doc, from, posOf('Dritter'))).toEqual({ from, to: from + 'Zweiter Absatz'.length, pointsAt: null });
  });
  it('über mehrere Zeilen oder mitten hinein: normales Löschen', () => {
    expect(inLineDeleteRange(doc, posOf('berechnen'), posOf('Zweiter'))).toBe(null);
    expect(inLineDeleteRange(doc, posOf('berechnen'), posOf('Berechne X') + 3)).toBe(null);
    expect(inLineDeleteRange(doc, posOf('Zweiter'), posOf('Zweiter') + 3)).toBe(null);
    expect(inLineDeleteRange(doc, headEnd, headEnd)).toBe(null);
  });
});
