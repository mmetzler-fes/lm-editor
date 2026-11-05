import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, inSelection, itemAt, moved, resizedKeepingRatio } from '../src/ink/ink-geometry.js';
import { safeInkSvg } from '../src/print/render-job.js';
import { mergeParagraphs } from '../src/ink/ink-rich.js';
import { specToPm } from '../src/doc/pm-convert.js';

const image = { id: 'b', type: 'image', x: 10, y: 20, w: 100, h: 50, src: 'data:image/png;base64,AAAA' };

test('Freies Bild: Rahmen, Treffer, Auswahl, Verschieben', () => {
  assert.deepEqual(bounds(image), { x: 10, y: 20, w: 100, h: 50 });
  assert.equal(itemAt([image], 50, 40, 2)?.id, 'b');
  assert.equal(itemAt([image], 200, 40, 2), null);
  assert.equal(inSelection(image, { x: 0, y: 0, w: 15, h: 25 }), true);
  assert.deepEqual([moved(image, 5, 7).x, moved(image, 5, 7).y], [15, 27]);
});

test('Freies Bild: Größe ändern behält das Seitenverhältnis', () => {
  const r = resizedKeepingRatio(image, 2, 60, 200);
  assert.equal(r.w, 50);
  assert.equal(r.h, 25);
  assert.equal(r.y, 20);
  const top = resizedKeepingRatio(image, 1, 60, 0);
  assert.equal(top.h, 25);
  assert.equal(top.y + top.h, 70); // die untere Kante bleibt stehen
});

test('Druck-SVG: nur eingebettete PNG/JPEG, sonst nichts Nachladbares', () => {
  const wrap = (x) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 9 9">${x}</svg>`;
  assert.equal(safeInkSvg(wrap('<image x="0" xlink:href="data:image/png;base64,QUJD"/>')), true);
  assert.equal(safeInkSvg(wrap('<image href="data:image/jpeg;base64,QUJD"/>')), true);
  assert.equal(safeInkSvg(wrap('<image xlink:href="https://x.example/a.png"/>')), false);
  assert.equal(safeInkSvg(wrap('<image xlink:href="file:///etc/passwd"/>')), false);
  assert.equal(safeInkSvg(wrap('<image xlink:href="data:image/svg+xml;base64,QUJD"/>')), false);
  assert.equal(safeInkSvg(wrap('<a href="data:image/png;base64,QUJD"><text>x</text></a>')), false);
  assert.equal(safeInkSvg(wrap('<foreignObject><div/></foreignObject>')), false);
});

test('Textblock: Enter-Zeilen bleiben ein Baustein, Formatiertes für sich', () => {
  const t = (text, more = {}) => ({ type: 'text', text, ...more });
  assert.deepEqual(mergeParagraphs([t('a'), t('b'), t('c')]), [t('a\n\nb\n\nc')]);
  assert.deepEqual(mergeParagraphs([t('a', { id: 'x' }), t('b', { id: 'y' })]), [t('a\n\nb', { id: 'x' })]);
  const list = { type: 'list', items: ['1'] };
  assert.deepEqual(mergeParagraphs([t('a'), list, t('b')]), [t('a'), list, t('b')]);
  const centered = t('b', { align: 'center' });
  assert.deepEqual(mergeParagraphs([t('a'), centered]), [t('a'), centered]);
  assert.deepEqual(mergeParagraphs([]), []);
});

test('Textblock: Beim erneuten Bearbeiten sind es wieder zwei Absätze', () => {
  const doc = specToPm({ content: [{ type: 'text', text: 'erste\n\nzweite' }] });
  assert.equal(doc.content.filter((n) => n.type === 'paragraph').length, 2);
});
