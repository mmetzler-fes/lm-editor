import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlashCommand } from '../src/doc/docspec.js';

test('/write: deutsche und englische Musternamen', () => {
  assert.deepEqual(parseSlashCommand('/write 2').built, { type: 'karo', lines: 2 });
  assert.deepEqual(parseSlashCommand('/write karo 2').built, { type: 'karo', lines: 2 });
  assert.deepEqual(parseSlashCommand('/write grid 2').built, { type: 'karo', lines: 2 });
  assert.deepEqual(parseSlashCommand('/write Grid').built, { type: 'karo', lines: 4 });
  assert.deepEqual(parseSlashCommand('/write lines 3').built, { type: 'karo', lines: 3, pattern: 'linien' });
  assert.deepEqual(parseSlashCommand('/write linien 3').built, { type: 'karo', lines: 3, pattern: 'linien' });
  assert.deepEqual(parseSlashCommand('/write blank 5').built, { type: 'karo', lines: 5, pattern: 'leer' });
  assert.deepEqual(parseSlashCommand('/write invisible 1').built, { type: 'karo', lines: 1, pattern: 'frei' });
});

test('//write bleibt Text, Unbekanntes ist kein Kommando', () => {
  assert.deepEqual(parseSlashCommand('//write grid 2'), { escaped: '/write grid 2' });
  assert.equal(parseSlashCommand('/foo 2'), null);
});
