import { describe, it, expect } from './expect.js';
import * as ds from '../src/doc/docspec.js';
import '../src/doc/latex.js';

describe('Formeln in LaTeX (Temml)', () => {
  it('setzt LaTeX als MathML mit der Quelle als Anmerkung', () => {
    const m = ds.latexToMathml('\\frac{U}{R}');
    expect(m).toContain('<mfrac><mi>U</mi><mi>R</mi></mfrac>');
    expect(m).toContain('display="block"');
    expect(m).toContain('<annotation encoding="application/x-tex">\\frac{U}{R}</annotation>');
  });

  it('meldet Fehler ohne Vorsilbe von Temml', () => {
    expect(() => ds.latexToMathml('\\frac{U')).toThrow('expected');
    let message = '';
    try { ds.latexToMathml('\\fracc{U}{R}'); } catch (e) { message = e.message; }
    expect(message).toContain('\\fracc');
    expect(message.startsWith('Temml')).toBe(false);
  });

  it('Baustein formula: latex vor math, Prüfung und Anzeige', () => {
    expect(ds.formulaMathml({ latex: 'x^2', math: 'y' })).toMatch(/<msup><mi>x<\/mi><mn[^>]*>2<\/mn><\/msup>/);
    expect(ds.formulaMathml({ math: 'I = U over R' })).toContain('<mfrac>');
    expect(ds.validateDocSpec({ content: [{ type: 'formula', latex: 'I = \\frac{U}{R}' }] })).toEqual([]);
    expect(ds.validateDocSpec({ content: [{ type: 'formula', latex: '\\frac{U' }] }))
      .toEqual([expect.stringContaining('content[0] (formula): Formel –')]);
    expect(ds.validateDocSpec({ content: [{ type: 'formula' }] }))
      .toEqual([expect.stringContaining('latex (Formel) fehlt')]);
    const html = ds.renderDocSpecHtml({ content: [{ type: 'formula', latex: '\\sqrt{2}' }] });
    expect(html).toContain('<div class="ds-formula"><math');
    expect(html).toContain('<msqrt>');
    expect(ds.renderDocSpecHtml({ content: [{ type: 'formula', latex: '\\frac{' }] })).toContain('<code class="ds-missing">\\frac{</code>');
  });
});

describe('StarMath → LaTeX', () => {
  const cases = [
    ['I = U over R', 'I = \\frac{U}{R}'],
    ['{U_a} over {U_e} = {X_C} over sqrt{R^2 + X_C^2}', '\\frac{U_a}{U_e} = \\frac{X_C}{\\sqrt{R^2 + X_C^2}}'],
    ['P = U cdot I cdot cos %varphi', 'P = U \\cdot I \\cdot \\cos \\varphi'],
    ['f_g = 1 over {2 %pi R C}', 'f_g = \\frac{1}{2 \\pi R C}'],
    ['R_{ges} = R_1 + R_2', 'R_{\\mathit{ges}} = R_1 + R_2'],
    ['%DELTA U approx 0,5 "V"', '\\Delta U \\approx 0{,}5 \\text{V}'],
    ['left( a + b right)^2', '{\\left( a + b \\right)}^2'],
    ['nroot{3}{x}', '\\sqrt[3]{x}'],
    ['abs{x} <= 1', '\\left|{x}\\right| \\leq 1'],
    ['U_C(t) = U_0 cdot (1 - e^{-t over %tau})', 'U_C (t) = U_0 \\cdot (1 - e^{- \\frac{t}{\\tau}})'],
    ['color red {x = 2}', '\\textcolor{red}{x = 2}'],
    ['func sinc(x)', '\\operatorname{sinc} (x)'],
    ['x -> infinity', 'x \\to \\infty'],
    ['%OMEGA ~ "Ohm"', '\\Omega \\enspace \\text{Ohm}'],
    ['a +- b <> c', 'a \\pm b \\neq c'],
    ['left lbrace x right none', '\\left\\{ x \\right.'],
    ['"50 % & mehr"', '\\text{50 \\% \\& mehr}'],
    // Nebeneinander bindet schwächer als over – wie im Formeleditor
    ['"3." ~~ {U_A} over {U_E}', '\\text{3.} \\enspace \\enspace \\frac{U_A}{U_E}'],
    ['2 x over y', '2 \\frac{x}{y}'],
    ['a cdot b over c', '\\frac{a \\cdot b}{c}'],
  ];

  it('schreibt übliche Formeln so, wie man sie von Hand schreiben würde', () => {
    for (const [star, tex] of cases) expect(ds.starmathToLatex(star)).toBe(tex);
  });

  it('jede umgeschriebene Formel lässt sich setzen', () => {
    for (const [star] of cases) expect(() => ds.latexToMathml(ds.starmathToLatex(star))).not.toThrow();
  });

  it('Anzeige: „3.“ steht vor dem Bruch, nicht im Zähler', () => {
    expect(ds.starmathToMathml('"3." ~~ a over b')).toMatch(/^<math display="block"><mrow><mtext>3\.<\/mtext>.*<mfrac><mrow><mi>a<\/mi><\/mrow>/);
  });

  it('was StarMath nicht liest, wird nicht umgeschrieben', () => {
    expect(() => ds.starmathToLatex('{a')).toThrow();
    expect(() => ds.starmathToLatex('a over')).toThrow();
  });
});

describe('Druck: MathML zu LaTeX-Formeln', () => {
  it('hängt MathML an, auch in Kästen und Zellen, und lässt das Original unverändert', () => {
    const spec = { content: [
      { type: 'formula', latex: 'a^2' },
      { type: 'formula', math: 'b over c' },
      { type: 'box', blocks: [{ type: 'formula', latex: '\\sqrt{x}' }] },
      { type: 'table', rows: [[{ text: 'Zelle', blocks: [{ type: 'formula', latex: '\\pi' }] }]] },
      { type: 'formula', latex: '\\frac{' },
    ] };
    const out = ds.withFormulaMathml(spec);
    expect(out.content[0].mathml).toContain('<msup>');
    expect(out.content[1].mathml).toBe(undefined);
    expect(out.content[2].blocks[0].mathml).toContain('<msqrt>');
    expect(out.content[3].rows[0][0].blocks[0].mathml).toContain('π');
    expect(out.content[4].mathml).toBe(undefined);
    expect(spec.content[0].mathml).toBe(undefined);
  });
});

describe('Formeln im Text ($…$)', () => {
  const strip = (html) => html.replace(/<math[\s\S]*?<\/math>/g, '<math/>');

  it('setzt $…$ wie Pandoc, Dollarbeträge bleiben Text', () => {
    expect(strip(ds.inlineHtml('Es gilt $x^2 > 10$.'))).toBe('Es gilt <span class="ds-math" contenteditable="false" data-tex="x^2 &gt; 10"><math/></span>.');
    expect(ds.inlineHtml('kostet 5 $ und 7 $')).toBe('kostet 5 $ und 7 $');
    expect(ds.inlineHtml('$5 bis $10')).toBe('$5 bis $10');
    expect(ds.inlineHtml('a \\$x\\$ b')).toBe('a $x$ b');
    expect(ds.inlineHtml('Code `$x$`')).toBe('Code <code>$x$</code>');
    expect(strip(ds.inlineHtml('**$U$**'))).toContain('<strong><span class="ds-math"');
    expect(ds.inlineHtml('$\\frac{a$ x')).toContain('class="ds-math ds-missing"');
  });

  it('Druck: MathML je Formel einmal, oben in der Spec; nicht aus Code', () => {
    const out = ds.withFormulaMathml({ content: [
      { type: 'text', text: 'a $x$ b $x$' },
      { type: 'list', items: ['$y^2$'] },
      { type: 'code', code: '$z$' },
      { type: 'text', text: '$\\frac{$ kaputt' },
    ] });
    expect(Object.keys(out.inlineMathml).sort()).toEqual(['x', 'y^2']);
    expect(out.inlineMathml['y^2']).toContain('<msup>');
    expect(out.inlineMathml.x).not.toContain('display="block"');
    expect(ds.withFormulaMathml({ content: ['ohne'] }).inlineMathml).toBe(undefined);
  });
});
