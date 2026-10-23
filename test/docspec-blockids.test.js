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
