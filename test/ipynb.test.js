// Jupyter-Notebook → Dokument: Markdown wird Text, Code wird ausführbares Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipynbToSpec, imageKey } from '../src/doc/ipynb.js';
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
