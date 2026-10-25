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
