import test from 'node:test';
import assert from 'node:assert/strict';
import { findBlock, insertBlocks, removeBlocks, moveBlocks, replaceBlock } from '../src/doc/block-ops.js';

const spec = () => ({ content: [{ type: 'text', text: 'a', id: 'ida0000a' }, { type: 'text', text: 'b', id: 'idb0000b' }, { type: 'box', id: 'idc0000c', blocks: [{ type: 'text', text: 'c1', id: 'idd0000d' }] }] });
const texts = (s) => s.content.map((b) => b.text ?? b.type);

test('Einfügen: Stelle, neue IDs, mitgebrachte ID zählt nicht', () => {
  const s = insertBlocks(spec(), 'ida0000a', [{ type: 'text', text: 'neu', id: 'idb0000b' }]);
  assert.deepEqual(texts(s), ['a', 'neu', 'b', 'box']);
  assert.ok(s.content[1].id && s.content[1].id !== 'idb0000b');
  assert.deepEqual(texts(insertBlocks(spec(), null, [{ type: 'text', text: 'x' }])), ['x', 'a', 'b', 'box']);
});

test('Verschieben, Entfernen, Ersetzen', () => {
  assert.deepEqual(texts(moveBlocks(spec(), ['ida0000a'], 'idc0000c')), ['b', 'box', 'a']);
  assert.deepEqual(texts(moveBlocks(spec(), ['idc0000c'], null)), ['box', 'a', 'b']);
  assert.deepEqual(texts(removeBlocks(spec(), ['idb0000b', 'idd0000d'])), ['a', 'box']);
  const r = replaceBlock(spec(), 'idb0000b', [{ type: 'text', text: 'B' }, { type: 'text', text: 'B2' }]);
  assert.deepEqual(texts(r), ['a', 'B', 'B2', 'box']);
  assert.equal(r.content[1].id, 'idb0000b');
  assert.equal(findBlock(spec(), 'idd0000d').block.text, 'c1');
});
