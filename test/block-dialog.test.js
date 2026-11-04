import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlockFields } from '../src/editor/block-dialog.js';

test('Schreibfeld: Höhe in Zeilen, Breite und Muster; ID und Felder bleiben', () => {
  const next = applyBlockFields({ id: 'a1', type: 'karo', lines: 4, width: '5cm', pattern: 'linien' }, { height: '3', width: '', pattern: 'karo' });
  assert.deepEqual(next, { id: 'a1', type: 'karo', lines: 6 });
  assert.equal(applyBlockFields({ type: 'karo', lines: 1 }, { height: '99', width: '999', pattern: 'frei' }).lines, 60);
  assert.equal(applyBlockFields({ type: 'karo', lines: 1 }, { height: '1', width: '7.3', pattern: 'frei' }).width, '7.5cm');
});

test('Formel: LaTeX ersetzt die alte Schreibweise, Lage nur wenn gewählt', () => {
  assert.deepEqual(applyBlockFields({ id: 'f', type: 'formula', math: 'alt', latex: 'a', align: 'left' }, { latex: 'b', align: '' }), { id: 'f', type: 'formula', latex: 'b' });
  assert.equal(applyBlockFields({ type: 'formula', latex: 'a' }, { latex: 'a', align: 'left' }).align, 'left');
});

test('Quiz: Größe nur, wenn sie von 100 % abweicht', () => {
  assert.deepEqual(applyBlockFields({ type: 'quiz', module: 'm', scale: 0.5 }, { scale: '1' }), { type: 'quiz', module: 'm' });
  assert.equal(applyBlockFields({ type: 'quiz', module: 'm' }, { scale: '1.25' }).scale, 1.25);
});
