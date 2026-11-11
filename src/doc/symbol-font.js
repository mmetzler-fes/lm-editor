/**
 * Zeichen aus Words Symbolschriften lesbar machen. Word legt ein Zeichen der Schrift „Symbol“
 * als U+F000 + Code ab („W“ in Symbol = Ω → U+F057). In .odt, HTML und PDF geht die Schrift
 * oft verloren – übrig bleibt ein Zeichen aus dem privaten Bereich, das ohne die Schrift als
 * Kästchen oder gar nicht erscheint. Hier wird daraus das echte Unicode-Zeichen.
 *
 * Grundlage ist die Adobe-Symbol-Kodierung. Ausnahmen: U+F0E0 und U+F0E8 sind Words
 * Autokorrektur-Pfeile aus Wingdings („-->“ → „→“, „==>“ → „➔“) – in Symbol wären es ◊ und ⎠,
 * die im Fließtext praktisch nie vorkommen. U+F0A7 ist der Wingdings-Aufzählungspunkt ▪.
 */

const GREEK_UPPER = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ'; // A … Z
const GREEK_LOWER = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ'; // a … z

const SYMBOL = {
  0x20: ' ', 0x21: '!', 0x22: '∀', 0x23: '#', 0x24: '∃', 0x25: '%', 0x26: '&', 0x27: '∋', 0x28: '(', 0x29: ')',
  0x2a: '∗', 0x2b: '+', 0x2c: ',', 0x2d: '−', 0x2e: '.', 0x2f: '/',
  0x3a: ':', 0x3b: ';', 0x3c: '<', 0x3d: '=', 0x3e: '>', 0x3f: '?', 0x40: '≅',
  0x5b: '[', 0x5c: '∴', 0x5d: ']', 0x5e: '⊥', 0x5f: '_',
  0x7b: '{', 0x7c: '|', 0x7d: '}', 0x7e: '∼',
  0xa1: 'ϒ', 0xa2: '′', 0xa3: '≤', 0xa4: '⁄', 0xa5: '∞', 0xa6: 'ƒ', 0xa7: '▪', 0xa8: '♦', 0xa9: '♥', 0xaa: '♠',
  0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓',
  0xb0: '°', 0xb1: '±', 0xb2: '″', 0xb3: '≥', 0xb4: '×', 0xb5: '∝', 0xb6: '∂', 0xb7: '•', 0xb8: '÷', 0xb9: '≠',
  0xba: '≡', 0xbb: '≈', 0xbc: '…', 0xbf: '↵',
  0xc0: 'ℵ', 0xc1: 'ℑ', 0xc2: 'ℜ', 0xc3: '℘', 0xc4: '⊗', 0xc5: '⊕', 0xc6: '∅', 0xc7: '∩', 0xc8: '∪',
  0xc9: '⊃', 0xca: '⊇', 0xcb: '⊄', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉',
  0xd0: '∠', 0xd1: '∇', 0xd2: '®', 0xd3: '©', 0xd4: '™', 0xd5: '∏', 0xd6: '√', 0xd7: '·', 0xd8: '¬', 0xd9: '∧', 0xda: '∨',
  0xdb: '⇔', 0xdc: '⇐', 0xdd: '⇑', 0xde: '⇒', 0xdf: '⇓',
  0xe0: '→', 0xe1: '〈', 0xe5: '∑', 0xe8: '➔', 0xf1: '〉', 0xf2: '∫',
};
for (let i = 0; i < 10; i++) SYMBOL[0x30 + i] = String(i);
for (let i = 0; i < 26; i++) {
  SYMBOL[0x41 + i] = GREEK_UPPER[i];
  SYMBOL[0x61 + i] = GREEK_LOWER[i];
}

const PRIVATE_SYMBOL_RE = /[\uF020-\uF0FF]/g;

/** Text mit Symbolschrift-Zeichen (U+F020–U+F0FF) → lesbarer Text; Unbekanntes bleibt. */
export function fixSymbolChars(text) {
  const s = String(text ?? '');
  if (!/[\uF020-\uF0FF]/.test(s)) return s;
  return s.replace(PRIVATE_SYMBOL_RE, (ch) => SYMBOL[ch.charCodeAt(0) - 0xf000] ?? ch);
}

/**
 * Alle Texte einer DocSpec (oder eines Teils) durchgehen. Gibt ein neues Objekt zurück und
 * zählt in `stats.count`, wie viele Zeichen ersetzt wurden. Code und Adressen bleiben unberührt.
 */
export function fixSymbolCharsInSpec(value, stats = { count: 0 }) {
  const SKIP = new Set(['code', 'src', 'file', 'id']);
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (SKIP.has(key)) return v;
      for (const ch of v.match(PRIVATE_SYMBOL_RE) || []) if (SYMBOL[ch.charCodeAt(0) - 0xf000]) stats.count++;
      return fixSymbolChars(v);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value, '');
}
