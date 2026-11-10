import { describe, it, expect } from './expect.js';
import * as ds from '../src/doc/docspec.js';
import '../src/doc/latex.js';
import { mathmlToLatex, mathmlForEditing, looksLikeMathml, MathmlError } from '../src/doc/mathml-latex.js';

// Vergleich ohne Anmerkung: Das MathML der Rückübersetzung muss dasselbe ergeben.
const bare = (tex) => mathmlForEditing(ds.latexToMathml(tex));

describe('MathML → LaTeX', () => {
  it.each([
    'I = \\frac{U}{R}',
    'U_{ges} = U_1 + U_2',
    'P = \\sqrt{3} \\cdot U \\cdot I \\cdot \\cos\\varphi',
    'M = 9550 \\cdot \\frac{P_{ab}}{n}',
    'x^2 + y^{2} = r^2',
    'Z = \\sqrt{R^2 + (X_L - X_C)^2}',
    'R_{\\vartheta} = R_{20} \\cdot (1 + \\alpha \\cdot \\Delta\\vartheta)',
    '\\Omega \\le 5 \\ne 6 \\approx \\pi',
    'U_i = \\frac{\\Delta\\Phi}{\\Delta t}',
    '\\sqrt[3]{8} = 2',
    'f = \\frac{1}{2\\pi\\sqrt{L \\cdot C}}',
    '\\bar{U} = g \\cdot U',
    '\\sum_{i=1}^{n} x_i',
    'U = 230\\,\\text{V}',
    '\\left(\\frac{a}{b}\\right)^2',
    '\\overline{AB} + \\vec{F} + \\hat{x}',
    'a \\quad b \\; c',
    '\\sin(\\omega t)',
  ])('Rundreise %s', (tex) => {
    const back = mathmlToLatex(ds.latexToMathml(tex));
    expect(bare(back)).toBe(bare(tex));
  });

  it('übergeht die Anmerkung – eine Änderung am MathML zählt', () => {
    const m = ds.latexToMathml('\\frac{U}{R}').replace('<mi>R</mi></mfrac>', '<mi>Z</mi></mfrac>');
    expect(mathmlToLatex(m)).toBe('\\frac{U}{Z}');
  });

  it('liest MathML aus LibreOffice (Namensraum, StarMath-Anmerkung, Entitäten)', () => {
    const lo = `<?xml version="1.0" encoding="UTF-8"?>
      <math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow>
      <msub><mi>U</mi><mi>A</mi></msub><mo stretchy="false">=</mo><msub><mi>U</mi><mi>i</mi></msub>
      <mo stretchy="false">+</mo><msub><mi>I</mi><mi>A</mi></msub><mo>&middot;</mo><msub><mi>R</mi><mi>A</mi></msub>
      </mrow><annotation encoding="StarMath 5.0">U_A = U_i + I_A cdot R_A</annotation></semantics></math>`;
    expect(mathmlToLatex(lo)).toBe('U_A=U_i+I_A\\cdot R_A');
  });

  it('liest MathML mit Präfix (Word: mml:)', () => {
    const word = '<mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mfrac><mml:mrow><mml:mi>Δ</mml:mi><mml:mi>s</mml:mi></mml:mrow><mml:mrow><mml:mi>Δ</mml:mi><mml:mi>t</mml:mi></mml:mrow></mml:mfrac></mml:math>';
    expect(mathmlToLatex(word)).toBe('\\frac{\\Delta s}{\\Delta t}');
  });

  it('Text, mehrbuchstabige Namen und Funktionen', () => {
    expect(mathmlToLatex('<math><mi>sin</mi><mi>x</mi></math>')).toBe('\\sin x');
    expect(mathmlToLatex('<math><mi>Re</mi></math>')).toBe('\\mathrm{Re}');
    expect(mathmlToLatex('<math><mtext>in V</mtext></math>')).toBe('\\text{in V}');
    expect(mathmlToLatex('<math><mfenced><mi>a</mi><mi>b</mi></mfenced></math>')).toBe('\\left(a,b\\right)');
  });

  it('meldet kaputtes MathML verständlich', () => {
    expect(() => mathmlToLatex('<math><mi>x</mo></math>')).toThrow('passt nicht');
    let err = null;
    try { mathmlToLatex('<mi>'); } catch (e) { err = e; }
    expect(err instanceof MathmlError).toBe(true);
    expect(() => mathmlToLatex('<math><mi>x</mi>')).toThrow('nicht geschlossen');
    expect(() => mathmlToLatex('')).toThrow('Kein MathML');
  });

  it('erkennt MathML beim Einfügen', () => {
    expect(looksLikeMathml('<math xmlns="…"><mi>x</mi></math>')).toBe(true);
    expect(looksLikeMathml('  <?xml version="1.0"?><math>')).toBe(true);
    expect(looksLikeMathml('<mml:math>')).toBe(true);
    expect(looksLikeMathml('a < b')).toBe(false);
    expect(looksLikeMathml('\\frac{a}{b}')).toBe(false);
  });

  it('MathML zum Bearbeiten hat keine Anmerkung mehr', () => {
    const m = mathmlForEditing(ds.latexToMathml('x^2'));
    expect(m).not.toContain('annotation');
    expect(m).not.toContain('semantics');
    expect(m).toContain('<msup>');
  });
});
