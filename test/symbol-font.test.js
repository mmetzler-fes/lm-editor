import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixSymbolChars, fixSymbolCharsInSpec } from '../src/doc/symbol-font.js';

const P = (c) => String.fromCharCode(0xf000 + c);

test('Symbolschrift: Griechisch, Mathe, Words Autokorrektur-Pfeil', () => {
  assert.equal(fixSymbolChars(`0,5 ${P(0x57)}`), '0,5 Ω');
  assert.equal(fixSymbolChars(`${P(0x68)}_{G}= 88%`), 'η_{G}= 88%');
  assert.equal(fixSymbolChars(`${P(0xd6)}3·U·I·cos ${P(0x6a)}`), '√3·U·I·cos ϕ');
  assert.equal(fixSymbolChars(`${P(0x46)} ${P(0x61)} ${P(0x77)} 4,8${P(0xd7)}10`), 'Φ α ω 4,8·10');
  assert.equal(fixSymbolChars(`erreicht ${P(0xe0)} Stromwendung`), 'erreicht → Stromwendung');
  assert.equal(fixSymbolChars(`${P(0xb7)} Punkt`), '• Punkt');
  assert.equal(fixSymbolChars('normal Ωμ'), 'normal Ωμ');
});

test('Symbolschrift in einer DocSpec: zählt, lässt Code und IDs', () => {
  const stats = { count: 0 };
  const spec = { content: [{ type: 'text', text: `R = 1,2 ${P(0x57)}`, id: 'a' }, { type: 'code', code: P(0x57) }, { type: 'list', items: [`${P(0x68)} = 0,8`] }] };
  const out = fixSymbolCharsInSpec(spec, stats);
  assert.equal(out.content[0].text, 'R = 1,2 Ω');
  assert.equal(out.content[1].code, P(0x57));
  assert.equal(out.content[2].items[0], 'η = 0,8');
  assert.equal(stats.count, 2);
});
