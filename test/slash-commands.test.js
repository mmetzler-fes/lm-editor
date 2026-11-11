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

test('U+03A6 + Enter: Sonderzeichen aus der Unicode-Schreibweise', async () => {
  const { parseUnicodeEscape } = await import('../src/doc/docspec.js');
  assert.deepEqual(parseUnicodeEscape('Fluss U+03A6'), { length: 6, char: 'Φ' });
  assert.deepEqual(parseUnicodeEscape('u+03a9'), { length: 6, char: 'Ω' });
  assert.deepEqual(parseUnicodeEscape('(U+1F600'), { length: 7, char: '😀' });
  assert.equal(parseUnicodeEscape('U+03A6 danach'), null); // nur direkt vor der Schreibmarke
  assert.equal(parseUnicodeEscape('ABU+03A6'), null); // nicht mitten im Wort
  assert.equal(parseUnicodeEscape('U+03'), null);
  assert.equal(parseUnicodeEscape('U+D800'), null); // Surrogat
  assert.equal(parseUnicodeEscape('U+110000'), null);
  assert.equal(parseUnicodeEscape('U+0007'), null); // Steuerzeichen
});
