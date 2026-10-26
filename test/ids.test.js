import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureBlockIds, blockIndex, newBlockId } from '../src/doc/ids.js';

test('neue IDs: 8 Zeichen aus dem Alphabet', () => {
  for (let i = 0; i < 100; i++) assert.match(newBlockId(), /^[a-km-np-z2-9]{8}$/);
});

test('fehlende IDs werden vergeben, auch in verschachtelten Bausteinen', () => {
  const spec = { content: [{ type: 'task', title: 'A', blocks: [{ type: 'karo', lines: 4 }] }, { type: 'text', text: 'x' }] };
  assert.equal(ensureBlockIds(spec), 3);
  assert.equal(blockIndex(spec).size, 3);
  assert.equal(ensureBlockIds(spec), 0, 'zweiter Lauf ändert nichts');
});

test('vorhandene IDs bleiben, die zweite von zwei gleichen wird neu', () => {
  const spec = { content: [{ id: 'abcd2345', type: 'text' }, { id: 'abcd2345', type: 'text' }, { id: 'X!', type: 'text' }] };
  assert.equal(ensureBlockIds(spec), 2);
  assert.equal(spec.content[0].id, 'abcd2345');
  assert.notEqual(spec.content[1].id, 'abcd2345');
  assert.equal(new Set(spec.content.map((b) => b.id)).size, 3);
});

test('Pfad-IDs: fehlende IDs nach dem Pfad, vorhandene bleiben', async () => {
  const { assignPathIds, pathId } = await import('../src/doc/ids.js');
  const spec = { content: [{ type: 'text', id: 'abcd2345' }, { type: 'task', blocks: [{ type: 'karo' }] }] };
  assert.equal(assignPathIds(spec), 2);
  assert.equal(spec.content[0].id, 'abcd2345');
  assert.equal(spec.content[1].id, 'pos1');
  assert.equal(spec.content[1].blocks[0].id, pathId('1.0'));
  assert.equal(pathId('1.0'), 'pos1x0');
});

test('Pfad-IDs: belegte Position bleibt beim früheren Baustein, der neue bekommt eine eigene ID', async () => {
  const { assignPathIds, stampBlockIds } = await import('../src/doc/ids.js');
  // pos1 stand früher an Stelle 1; davor wurde ein Baustein ohne ID eingefügt.
  const spec = { content: [{ type: 'text' }, { type: 'text' }, { id: 'pos1', type: 'karo' }] };
  assert.equal(assignPathIds(spec), 1);
  assert.equal(spec.content[0].id, 'pos0');
  assert.equal(spec.content[1].id, undefined);
  assert.equal(stampBlockIds(spec), 1);
  assert.match(spec.content[1].id, /^[a-km-np-z2-9]{8}$/);
  assert.equal(stampBlockIds(spec), 0, 'zweiter Lauf ändert nichts');
});

test('stampBlockIds: ohne crypto (Server-Sandbox) gibt es trotzdem IDs', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const spec = { content: [{ id: 'pos0', type: 'text' }, { id: 'pos0', type: 'text' }] };
    assert.equal(ensureBlockIds(spec), 1);
    assert.match(spec.content[1].id, /^[a-km-np-z2-9]{8}$/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', saved);
  }
});
