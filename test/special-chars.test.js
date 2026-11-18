import { describe, it, expect } from './expect.js';
import { searchChars, charFromCode, codeOf } from '../src/editor/special-chars.js';

describe('Sonderzeichen', () => {
  it('sucht deutsch im Namen', () => {
    expect(searchChars('ohm').map((x) => x.ch)).toContain('Ω');
    expect(searchChars('Pfeil rechts').map((x) => x.ch)).toContain('→');
    expect(searchChars('alpha').map((x) => x.ch)).toEqual(['α', 'Α']);
    expect(searchChars('ungleich').map((x) => x.ch)).toContain('≠');
  });
  it('findet Buchstaben ohne Akzent', () => {
    const e = searchChars('e').map((x) => x.ch);
    expect(e).toContain('é');
    expect(e).toContain('è');
  });
  it('Codes: U+2126, 2126, 0x3a9', () => {
    expect(charFromCode('U+03A9')).toBe('Ω');
    expect(charFromCode('03A9')).toBe('Ω');
    expect(charFromCode('U+2126')).toBe('\u2126'); // eigenes Ohm-Zeichen
    expect(charFromCode('0x3a9')).toBe('Ω');
    expect(charFromCode('U+D800')).toBe(null);
    expect(charFromCode('hallo')).toBe(null);
    expect(searchChars('U+1F600')[0].ch).toBe('😀');
    expect(codeOf('Ω')).toBe('U+03A9');
  });
  it('Griechisch mit Namen', () => {
    expect(searchChars('omega klein').map((x) => x.ch)).toContain('ω');
  });
});
