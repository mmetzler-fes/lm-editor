// ==================== MathML → LaTeX ====================
//
// Formeln werden als LaTeX gespeichert (docspec.js, Baustein `formula`). Wer
// lieber MathML eingibt oder es aus Word, LibreOffice oder einer Webseite
// kopiert, bekommt es hier in LaTeX umgeschrieben. Gelesen wird
// Presentation-MathML; Anmerkungen (<annotation>, z. B. die TeX-Quelle von
// Temml oder StarMath aus LibreOffice) werden übergangen, damit eine
// Änderung am MathML auch wirklich ankommt. Läuft ohne DOM (Browser und Node).

export class MathmlError extends Error {}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', InvisibleTimes: '⁢', ApplyFunction: '⁡', minus: '−', middot: '·', times: '×', le: '≤', ge: '≥', ne: '≠', pm: '±', infin: '∞', rarr: '→', larr: '←', hArr: '⇔', rArr: '⇒', deg: '°' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  }
  return ENTITIES[e] ?? m;
});

/** Kleiner XML-Leser: `{ name, attrs, children }`, Text als String. Namensräume (m:mi) fallen weg. */
function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  let last = 0;
  while ((m = token.exec(xml))) {
    if (m.index !== last) throw new MathmlError('MathML ist kein gültiges XML.');
    last = token.lastIndex;
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[6] !== undefined) top.children.push(decode(m[6]));
    else if (m[3]) {
      const name = m[3].replace(/^.*:/, '');
      if (m[2]) {
        if (stack.length < 2 || top.name !== name) throw new MathmlError(`MathML: </${name}> passt nicht zu <${top.name}>.`);
        stack.pop();
      } else {
        const attrs = {};
        for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^.*:/, '')] = decode(a[2] ?? a[3]);
        const el = { name, attrs, children: [] };
        top.children.push(el);
        if (!m[5]) stack.push(el);
      }
    }
  }
  if (last !== xml.length) throw new MathmlError('MathML ist kein gültiges XML.');
  if (stack.length > 1) throw new MathmlError(`MathML: <${stack[stack.length - 1].name}> wird nicht geschlossen.`);
  return root;
}

// Zeichen → LaTeX-Befehl (griechisch, Operatoren, Pfeile …)
const SYMBOLS = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', ϑ: '\\vartheta',
  ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon',
  φ: '\\varphi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
  Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Υ: '\\Upsilon', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  '·': '\\cdot', '⋅': '\\cdot', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '−': '-', '∗': '*',
  '≤': '\\le', '≥': '\\ge', '≠': '\\neq', '≈': '\\approx', '≙': '\\triangleq', '≡': '\\equiv', '∼': '\\sim', '∝': '\\propto', '≪': '\\ll', '≫': '\\gg',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '↑': '\\uparrow', '↓': '\\downarrow',
  '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla', '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∮': '\\oint', '√': '\\surd',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∀': '\\forall', '∃': '\\exists',
  '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee', '°': '^\\circ', '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '…': '\\ldots', '⋯': '\\cdots', '′': "'",
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '$': '\\$', '|': '|', '‖': '\\|',
  '⁡': '', '⁢': '', '⁣': '', '⁤': '', ' ': '~',
};
const FUNCTIONS = ['sin', 'cos', 'tan', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'deg', 'arg', 'sgn'];
// Akzente in <mover>/<munder>
const OVER = { '¯': '\\overline', '‾': '\\overline', '―': '\\overline', '^': '\\hat', 'ˆ': '\\hat', '→': '\\vec', '⃗': '\\vec', '˙': '\\dot', '¨': '\\ddot', '~': '\\tilde', '˜': '\\tilde', '⏞': '\\overbrace' };
const UNDER = { '_': '\\underline', '¯': '\\underline', '‾': '\\underline', '⏟': '\\underbrace' };

const textOf = (n) => (typeof n === 'string' ? n : n.children.map(textOf).join(''));
const elements = (n) => n.children.filter((c) => typeof c !== 'string');
const sym = (s) => [...s].map((c) => SYMBOLS[c] ?? c).join('');
const escText = (s) => s.replace(/[\\{}%#&_$^~]/g, (c) => ({ '\\': '\\backslash ', '^': '\\^{}', '~': '\\~{}' }[c] || `\\${c}`));
// Gruppe: ein einzelnes Zeichen braucht keine Klammern
const group = (s) => (/^(\\[a-zA-Z]+|[^\\{}\s])$/u.test(s) ? s : `{${s}}`);

/** Zwischen zwei Teilen ein Leerzeichen, wenn sonst ein Befehl mit dem nächsten Buchstaben verschmilzt (\cdot I → \cdotI). */
function join(parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(p)) out += ' ';
    out += p;
  }
  return out;
}

function mi(node) {
  const t = textOf(node).trim();
  const variant = node.attrs.mathvariant;
  if (FUNCTIONS.includes(t)) return `\\${t}`;
  if ([...t].length > 1) return `\\mathrm{${escText(t)}}`;
  if (variant === 'normal' && /^[A-Za-z]$/.test(t)) return `\\mathrm{${t}}`;
  if (variant === 'bold') return `\\mathbf{${sym(t)}}`;
  return sym(t);
}

const DELIM = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle' };

function mo(node) {
  const t = textOf(node).trim();
  // Dehnbare Klammer (\left( … \right) bei Temml): fence ohne stretchy="false"
  if (node.attrs.fence === 'true' && node.attrs.stretchy !== 'false' && (t in DELIM || t === '')) {
    const d = t === '' ? '.' : DELIM[t];
    if (node.attrs.form === 'prefix') return `\\left${d}`;
    if (node.attrs.form === 'postfix') return `\\right${d}`;
  }
  if (t === '(' || t === ')' || t === '[' || t === ']') return t;
  if (t === '=' || t === '+' || t === '<' || t === '>' || t === ',' || t === ';' || t === ':' || t === '!' || t === '/' || t === '.') return t;
  if (FUNCTIONS.includes(t)) return `\\${t}`;
  return sym(t);
}

function fenced(node) {
  const open = node.attrs.open ?? '(';
  const close = node.attrs.close ?? ')';
  const seps = node.attrs.separators ?? ',';
  const inner = elements(node).map(conv);
  const body = inner.reduce((acc, s, i) => (i === 0 ? s : `${acc}${seps[Math.min(i - 1, seps.length - 1)] || ','}${s}`), '');
  const d = (c) => ({ '{': '\\{', '}': '\\}', '': '.', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle' }[c] ?? c);
  return `\\left${d(open)}${body}\\right${d(close)}`;
}

function underOver(node, kind) {
  const [base, a, b] = elements(node).map((e) => e);
  const accent = (n, table) => table[textOf(n).trim()];
  const baseTex = conv(base);
  const big = /^\\(sum|prod|int|oint|lim|max|min)$/.test(baseTex);
  if (kind === 'mover') {
    let acc = accent(a, OVER);
    // ‾ ohne Dehnung ist \bar (kurzer Strich), gedehnt \overline
    if (acc === '\\overline' && a.attrs?.stretchy === 'false') acc = '\\bar';
    if (acc && !big) return `${acc}{${baseTex}}`;
    return big ? `${baseTex}^${group(conv(a))}` : `\\overset${group(conv(a))}${group(baseTex)}`;
  }
  if (kind === 'munder') {
    const acc = accent(a, UNDER);
    if (acc && !big) return `${acc}{${baseTex}}`;
    return big ? `${baseTex}_${group(conv(a))}` : `\\underset${group(conv(a))}${group(baseTex)}`;
  }
  return `${baseTex}_${group(conv(a))}^${group(conv(b))}`;
}

/** <mspace>: leer (Temml nach Δ, Ω …) = nichts, sonst der passende LaTeX-Abstand. */
function space(node) {
  const w = String(node.attrs.width || '').trim();
  const em = /^(-?[\d.]+)em$/.exec(w);
  if (!w || (em && Math.abs(Number(em[1])) < 0.05)) return '';
  if (!em) return '\\ ';
  const v = Number(em[1]);
  if (v < 0) return '\\!';
  if (v < 0.2) return '\\,';
  if (v < 0.25) return '\\:';
  if (v < 0.5) return '\\;';
  if (v < 1.5) return '\\quad ';
  return '\\qquad ';
}

function table(node) {
  const rows = elements(node).filter((r) => r.name === 'mtr' || r.name === 'mlabeledtr')
    .map((r) => elements(r).filter((c) => c.name === 'mtd').map((c) => join(elements(c).map(conv))).join(' & '));
  return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
}

function conv(node) {
  if (!node) return '';
  if (typeof node === 'string') return '';
  const kids = elements(node);
  // Abstand, den Temml selbst hinter eine Funktion (sin, cos …) setzt: nicht als \, übernehmen
  const all = () => join(kids.map((k, i) => (k.name === 'mspace' && i > 0 && kids[i - 1].name === 'mo' && textOf(kids[i - 1]) === '\u2061' ? '' : conv(k))));
  switch (node.name) {
    case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'merror': case 'mlabeledtr': return all();
    case 'semantics': return conv(kids.find((k) => k.name !== 'annotation' && k.name !== 'annotation-xml'));
    case 'annotation': case 'annotation-xml': case 'mphantom': case 'none': case 'mprescripts': return '';
    case 'mi': return mi(node);
    case 'mn': return textOf(node).trim().replace(/,/g, '{,}');
    case 'mo': return mo(node);
    case 'mtext': case 'ms': {
      const t = textOf(node);
      return t.trim() ? `\\text{${escText(t)}}` : '\\ ';
    }
    case 'mspace': return space(node);
    case 'msub': return `${group(conv(kids[0]))}_${group(conv(kids[1]))}`;
    case 'msup': return `${group(conv(kids[0]))}^${group(conv(kids[1]))}`;
    case 'msubsup': return `${group(conv(kids[0]))}_${group(conv(kids[1]))}^${group(conv(kids[2]))}`;
    case 'mfrac': return `\\frac{${conv(kids[0])}}{${conv(kids[1])}}`;
    case 'msqrt': return `\\sqrt{${all()}}`;
    case 'mroot': return `\\sqrt[${conv(kids[1])}]{${conv(kids[0])}}`;
    case 'mfenced': return fenced(node);
    case 'mover': case 'munder': case 'munderover': return underOver(node, node.name);
    case 'menclose': {
      const n = node.attrs.notation || 'longdiv';
      if (n === 'top') return `\\overline{${all()}}`;
      if (n === 'bottom') return `\\underline{${all()}}`;
      if (/strike/.test(n)) return `\\cancel{${all()}}`;
      return `\\boxed{${all()}}`;
    }
    case 'mtable': return table(node);
    default: return all();
  }
}

/** Sieht der Text nach MathML aus (<math …> oder <mrow> …)? */
export const looksLikeMathml = (s) => /^\s*(<\?xml[^>]*>\s*)?<(\w+:)?(math|mrow|semantics)[\s>]/.test(String(s ?? ''));

/** MathML → LaTeX. Wirft MathmlError mit lesbarer Meldung. */
export function mathmlToLatex(xml) {
  const root = parseXml(String(xml ?? '').trim());
  const top = elements(root);
  if (!top.length) throw new MathmlError('Kein MathML gefunden.');
  const math = top.find((n) => n.name === 'math') || { name: 'mrow', attrs: {}, children: top };
  return join([conv(math)]).replace(/\s+/g, ' ').trim();
}

/** MathML zum Bearbeiten: ohne <semantics>-Hülle und Anmerkungen – sonst gälte die alte TeX-Quelle weiter. */
export function mathmlForEditing(mathml) {
  return String(mathml ?? '')
    .replace(/<annotation(-xml)?\b[\s\S]*?<\/annotation(-xml)?>/g, '')
    .replace(/<\/?semantics>/g, '')
    // Darstellungshilfen von Temml (class, style) braucht beim Bearbeiten niemand
    .replace(/\s(class|style)="[^"]*"/g, '')
    .trim();
}
