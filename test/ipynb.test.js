// Jupyter-Notebook → Dokument: Markdown wird Text, Code wird ausführbares Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipynbToSpec, imageKey, specToIpynb, jupyterMarkdown } from '../src/doc/ipynb.js';
import { validateDocSpec } from '../src/doc/docspec.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const nb = {
  nbformat: 4,
  cells: [
    { cell_type: 'markdown', source: ['# 1. Aufgabe\n', '\n', '## Komplexe Schaltung\n', 'Durch $R_2$ fließen $5 \\, \\text{mA}$.'] },
    { cell_type: 'markdown', source: '<img src="images/Aufgabe4.png" alt="Schaltbild" width="80%">' },
    { cell_type: 'markdown', source: '* Betrag: $|Z| = \\sqrt{x^2 + y^2}$\n\n$$Z_C = \\frac{1}{j \\omega C}$$' },
    { cell_type: 'code', source: ['import cmath\n', 'print(1j)\n'], outputs: [{ output_type: 'stream', text: ['1j\n'] }] },
    { cell_type: 'code', source: [], outputs: [] },
    { cell_type: 'markdown', source: '![Anhang](attachment:bild.png) und ![fehlt](images/weg.png)', attachments: { 'bild.png': { 'image/png': 'iVBORw0KGgo=' } } },
  ],
};

test('Markdown wird Text, Code ausführbar, leere Zellen fallen weg', () => {
  const { spec, title, warnings } = ipynbToSpec(nb, { images: new Map([['aufgabe4.png', PNG]]) });
  assert.equal(title, '1. Aufgabe');
  const types = spec.content.map((b) => b.type);
  assert.ok(spec.content.filter((b) => b.type === 'heading').length >= 2, 'Überschriften ohne Nummer');
  const code = spec.content.filter((b) => b.type === 'code');
  assert.deepEqual(code, [{ type: 'code', run: true, code: 'import cmath\nprint(1j)' }]);
  const imgs = [];
  const walk = (bs) => bs.forEach((b) => { if (b.type === 'image') imgs.push(b); walk(b.blocks || []); });
  walk(spec.content);
  assert.equal(imgs[0].src, PNG);
  assert.equal(imgs[0].width, '80%');
  assert.ok(imgs.some((i) => i.src === 'data:image/png;base64,iVBORw0KGgo='), 'Anhang der Zelle');
  assert.ok(warnings.some((w) => w.includes('images/weg.png')), 'fehlendes Bild gemeldet');
  assert.ok(warnings.some((w) => w.includes('Ausgaben')));
  assert.ok(JSON.stringify(spec).includes('\\\\sqrt'), 'Formeln bleiben LaTeX');
  assert.deepEqual(validateDocSpec(spec).filter((e) => !/Formel/.test(e)), []);
});

test('Bild über den Dateinamen, ohne Ordner', () => {
  assert.equal(imageKey('images/Aufgabe4.png'), 'aufgabe4.png');
  assert.equal(imageKey('./a%20b.PNG?x=1'), 'a b.png');
});

test('kein Notebook', () => {
  assert.throws(() => ipynbToSpec({}), /nbformat/);
});

test('Dokument → Notebook: Python wird Code-Zelle, Bilder Anhänge, Markdown ohne unsere Zusätze', () => {
  const spec = { content: [
    { type: 'heading', level: 1, text: 'Ohm', id: 'h1' },
    { type: 'text', text: 'Mit $U = R I$.', align: 'center', id: 'p1' },
    { type: 'image', src: PNG, width: '80%', alt: 'Schaltbild' },
    { type: 'code', run: true, code: 'x = 6\nprint(x)' },
    { type: 'box', title: 'Merke', blocks: [{ type: 'text', text: 'wichtig' }] },
  ] };
  const nb = specToIpynb(spec, { title: 'Ohm' });
  assert.equal(nb.nbformat, 4);
  assert.deepEqual(nb.cells.map((c) => c.cell_type), ['markdown', 'code', 'markdown']);
  const md = nb.cells[0].source.join('');
  assert.ok(md.startsWith('# Ohm\n'), 'kein zweiter Titel, keine {…}');
  assert.ok(!/[{}]#|\{\./.test(md), md);
  assert.ok(md.includes('<img src="attachment:bild1.png" alt="Schaltbild" width="80%">'));
  assert.deepEqual(nb.cells[0].attachments, { 'bild1.png': { 'image/png': 'iVBORw0KGgo=' } });
  assert.deepEqual(nb.cells[1].source, ['x = 6\n', 'print(x)']);
  assert.ok(nb.cells[2].source.join('').startsWith('> **Merke**'));
});

test('Hin und zurück: Überschriften, Formeln, Bilder und Code bleiben', () => {
  const { spec } = ipynbToSpec(nb, { images: new Map([['aufgabe4.png', PNG]]) });
  const back = ipynbToSpec(specToIpynb(spec), {}).spec;
  // Leerzeichen am Rand eines Absatzes (neben einem herausgelösten Bild) zählen nicht.
  const strip = (s) => JSON.stringify(s.content.map(({ id, ...b }) => (typeof b.text === 'string' ? { ...b, text: b.text.trim() } : b)));
  assert.equal(strip(back), strip(spec));
});

test('Zusätze unseres Markdowns verschwinden', () => {
  assert.equal(jupyterMarkdown('# Titel {.plain #h1}\n\n[]{#p1 align=center}Text [rot]{.rot}'), '# Titel\n\nText rot');
});
