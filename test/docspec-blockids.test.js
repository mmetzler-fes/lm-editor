import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDocSpecHtml } from '../src/doc/docspec.js';

const spec = { content: [
  { id: 'aaaa2222', type: 'task', title: 'A', blocks: [{ type: 'karo', lines: 4 }, { id: 'bbbb3333', type: 'text', text: 'x' }] },
  { type: 'image', src: 'https://example.org/b.png', float: 'left' },
  'Text neben dem Bild',
  { type: 'note', text: 'Hinweis' },
] };

test('ohne blockIds: keine Hüllen', () => {
  assert.doesNotMatch(renderDocSpecHtml(spec), /data-bid/);
});

test('mit blockIds: feste ID oder Pfad, auch verschachtelt und neben Bildern', () => {
  const html = renderDocSpecHtml(spec, { blockIds: true });
  const bids = [...html.matchAll(/data-bid="([^"]+)" data-bpath="([^"]+)" data-btype="([^"]+)"/g)].map((m) => m.slice(1).join('|'));
  assert.deepEqual(bids, [
    'aaaa2222|0|task', 'p:0.0|0.0|karo', 'bbbb3333|0.1|text',
    'p:1|1|image', 'p:2|2|text', 'p:3|3|note',
  ]);
});

test('mit blockIds: Zähler und Inhalt bleiben gleich', () => {
  const strip = (h) => h.replace(/<div class="ds-b"[^>]*>/g, '').replace(/<\/div>/g, '');
  assert.equal(strip(renderDocSpecHtml(spec, { blockIds: true })), strip(renderDocSpecHtml(spec)));
});

test('Schreibfeld: Breite und Muster', async () => {
  const { validateDocSpec, karoWidthCm } = await import('../src/doc/docspec.js');
  const html = renderDocSpecHtml({ content: [
    { type: 'karo', lines: 4 },
    { type: 'karo', lines: 6, width: '8cm', pattern: 'linien' },
    { type: 'karo', lines: 2, width: '30cm', pattern: 'leer' },
  ] });
  assert.match(html, /<div class="ds-karo" style="height:2cm"/);
  assert.match(html, /<div class="ds-karo ds-karo-linien" style="height:3cm;width:8cm"/);
  assert.match(html, /<div class="ds-karo ds-karo-leer" style="height:1cm"/); // breiter als die Satzbreite: volle Breite
  assert.equal(karoWidthCm({ width: '7.3cm' }), 7.5);
  assert.equal(karoWidthCm({}), null);
  assert.deepEqual(validateDocSpec({ content: [{ type: 'karo', width: '8 Zoll', pattern: 'punkte' }] }), [
    'content[0] (karo): width: Breite in cm, z. B. "8cm".',
    'content[0] (karo): pattern: karo, linien, leer.',
  ]);
  assert.deepEqual(validateDocSpec({ content: [{ type: 'karo', lines: 4, width: '8cm', pattern: 'leer' }] }), []);
});
