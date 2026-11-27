// ==================== LABORE: KERN ====================
//
// Labore sind Bausteine im Dokument ({ type: 'lab', lab: 'zeiger', preset: {…} }), in denen Schüler
// selbst etwas aufbauen: Zeigerdiagramme, Bode-Diagramme, Ortskurven, Logikschaltungen.
// Diese Datei rechnet und zeichnet (SVG) – ohne DOM, damit der Server sie für den Druck genauso lädt wie
// der Browser (src/core/browser-module.ts in LearningModules). Importe nur als „import { … } from './…';“
// aus ebenso schlichten Geschwisterdateien (plant-core.js). Bedienung: labs.js und die *-ui.js je Labor.
// "export" nur vor function/const/class am Zeilenanfang.
//
// Stand eines Labors: `preset` (Vorgabe der Lehrkraft) und – je Schüler – `state` mit demselben Aufbau.
// labMerge() setzt beides zusammen: Was die Lehrkraft mit locked: true festlegt, gilt immer.

import { plantSvgParts, plantUpgrade } from './plant-core.js';

export const LABS = [
  { name: 'zeiger', label: 'Zeigerlabor', icon: '↗', what: 'Zeiger als komplexe Zahlen zeichnen, verschieben und berechnen' },
  { name: 'bode', label: 'Bode-Diagramm', icon: '〽', what: 'Amplituden- und Phasengang einer Übertragungsfunktion H(jω)' },
  { name: 'ortskurve', label: 'Ortskurve', icon: '⤿', what: 'Ortskurve Z(f) oder H(ω) in der komplexen Ebene' },
  { name: 'logik', label: 'Logikschaltung', icon: '&', what: 'Gatter verbinden, Eingänge schalten, Wahrheitstabelle' },
  { name: 'sps', label: 'SPS-Labor', icon: '⏭', what: 'Ablaufkette (IEC 61131-3) mit Zuordnungstabelle erstellen und simulieren' },
];
export const LAB_NAMES = LABS.map((l) => l.name);
export const LAB_MAX_JSON = 200000;

export class LabError extends Error {}

// ==================== Komplexe Zahlen [re, im] ====================

export const C0 = [0, 0];
export function cAdd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
export function cSub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
export function cMul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
export function cDiv(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  if (d === 0) throw new LabError('Division durch 0');
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
export function cAbs(a) { return Math.hypot(a[0], a[1]); }
/** Winkel in Grad (−180 … 180]. */
export function cArg(a) { return (Math.atan2(a[1], a[0]) * 180) / Math.PI; }
export function cPolar(r, deg) { const p = (deg * Math.PI) / 180; return [r * Math.cos(p), r * Math.sin(p)]; }
export function cExp(a) { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; }
export function cLog(a) {
  if (a[0] === 0 && a[1] === 0) throw new LabError('Logarithmus von 0');
  return [Math.log(cAbs(a)), Math.atan2(a[1], a[0])];
}
export function cPow(a, b) {
  if (a[0] === 0 && a[1] === 0) return b[0] === 0 && b[1] === 0 ? [1, 0] : [0, 0];
  if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {
    let r = [1, 0];
    for (let i = 0; i < Math.abs(b[0]); i++) r = cMul(r, a);
    return b[0] < 0 ? cDiv([1, 0], r) : r;
  }
  return cExp(cMul(b, cLog(a)));
}
export function cSqrt(a) { const r = Math.sqrt(cAbs(a)); const p = Math.atan2(a[1], a[0]) / 2; return [r * Math.cos(p), r * Math.sin(p)]; }
const isReal = (a) => Math.abs(a[1]) <= 1e-12 * Math.max(1, Math.abs(a[0]));
const realOf = (a, what) => {
  if (!isReal(a)) throw new LabError(`${what} braucht eine reelle Zahl`);
  return a[0];
};

// ==================== Formeln ====================
//
// 3 + j4 · 5∠30° · 10k (SI-Vorsätze p n u µ m k M G) · 0,5 oder 0.5 · u2 / z2 · R || (j*w*L) (parallel) ·
// 2^3 · abs, arg (Grad), conj, re, im, sqrt, exp, ln, lg, sin/cos/tan (Grad), polar(r; φ), par(a; b), db(x).
// Mehrere Argumente mit „;“ (das Komma ist Dezimalzeichen). Malpunkt darf fehlen: 2pi, 3(R+X), j4.

const SI = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 };
const IDENT_START = /[A-Za-z_Ͱ-Ͽ]/;
const IDENT_CHAR = /[A-Za-z0-9_'Ͱ-Ͽ]/;

function tokenize(src) {
  const s = String(src ?? '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) {
      let v = Number(num[0].replace(',', '.'));
      i += num[0].length;
      const next = s[i];
      if (next && SI[next] !== undefined && !(s[i + 1] && IDENT_CHAR.test(s[i + 1]))) { v *= SI[next]; i++; }
      out.push({ t: 'num', v, at: i });
      continue;
    }
    if (IDENT_START.test(ch)) {
      // j4, j0,5 – imaginäre Einheit mit Zahl dahinter (ein Name „j2“ ist damit nicht möglich).
      const jm = /^j(\d+(?:[.,]\d+)?)(?![A-Za-z0-9_'Ͱ-Ͽ])/.exec(s.slice(i));
      if (jm) {
        out.push({ t: 'id', v: 'j', at: i }, { t: 'num', v: Number(jm[1].replace(',', '.')), at: i + 1 });
        i += jm[0].length;
        continue;
      }
      let j = i + 1;
      while (j < s.length && IDENT_CHAR.test(s[j])) j++;
      out.push({ t: 'id', v: s.slice(i, j), at: i });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '||' || two === '/_') { out.push({ t: 'op', v: two === '||' ? '||' : '∠', at: i }); i += 2; continue; }
    // „<“ statt ∠ (steht auf jeder Tastatur): 10<120 = 10∠120°.
    if (s[i] === '<') { out.push({ t: 'op', v: '∠', at: i }); i++; continue; }
    if ('+-−*/^()∠°;,·×∥'.includes(ch)) {
      // Ein Komma ohne Ziffer dahinter trennt Werte wie „;“ (polar(10, 30)).
      const v = ch === '−' ? '-' : ch === '·' || ch === '×' ? '*' : ch === '∥' ? '||' : ch === ',' ? ';' : ch;
      out.push({ t: 'op', v, at: i });
      i++;
      continue;
    }
    throw new LabError(`Unbekanntes Zeichen „${ch}“`);
  }
  return out;
}

const FUNCS = {
  abs: [1, (a) => [cAbs(a), 0]], betrag: [1, (a) => [cAbs(a), 0]],
  arg: [1, (a) => [cArg(a), 0]], winkel: [1, (a) => [cArg(a), 0]],
  conj: [1, (a) => [a[0], -a[1]]], re: [1, (a) => [a[0], 0]], im: [1, (a) => [a[1], 0]],
  sqrt: [1, cSqrt], wurzel: [1, cSqrt], exp: [1, cExp], ln: [1, cLog],
  lg: [1, (a) => { const l = cLog(a); return [l[0] / Math.LN10, l[1] / Math.LN10]; }],
  log: [1, (a) => { const l = cLog(a); return [l[0] / Math.LN10, l[1] / Math.LN10]; }],
  sin: [1, (a) => [Math.sin((realOf(a, 'sin') * Math.PI) / 180), 0]],
  cos: [1, (a) => [Math.cos((realOf(a, 'cos') * Math.PI) / 180), 0]],
  tan: [1, (a) => [Math.tan((realOf(a, 'tan') * Math.PI) / 180), 0]],
  atan: [1, (a) => [(Math.atan(realOf(a, 'atan')) * 180) / Math.PI, 0]],
  // Umkehrfunktionen in Grad (wie sin/cos): asin(0,5) = 30.
  asin: [1, (a) => [(Math.asin(Math.max(-1, Math.min(1, realOf(a, 'asin')))) * 180) / Math.PI, 0]],
  acos: [1, (a) => [(Math.acos(Math.max(-1, Math.min(1, realOf(a, 'acos')))) * 180) / Math.PI, 0]],
  arcsin: [1, (a) => [(Math.asin(Math.max(-1, Math.min(1, realOf(a, 'arcsin')))) * 180) / Math.PI, 0]],
  arccos: [1, (a) => [(Math.acos(Math.max(-1, Math.min(1, realOf(a, 'arccos')))) * 180) / Math.PI, 0]],
  arctan: [1, (a) => [(Math.atan(realOf(a, 'arctan')) * 180) / Math.PI, 0]],
  polar: [2, (r, p) => cPolar(realOf(r, 'polar'), realOf(p, 'polar'))],
  par: [-1, (...xs) => cDiv([1, 0], xs.reduce((s, x) => cAdd(s, cDiv([1, 0], x)), [0, 0]))],
  db: [1, (a) => [20 * Math.log10(cAbs(a)), 0]],
};
const CONSTS = { pi: [Math.PI, 0], π: [Math.PI, 0], j: [0, 1], i: [0, 1], e: [Math.E, 0] };

/** Formel → Baum. Wirft LabError mit verständlicher Meldung. */
export function parseExpr(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = () => toks[k];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const take = (v) => { if (isOp(v)) { k++; return true; } return false; };
  const fail = (msg) => { throw new LabError(msg); };
  const startsOperand = () => { const t = peek(); return t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); };

  function primary() {
    const t = peek();
    if (!t) fail('Formel endet zu früh');
    if (t.t === 'num') { k++; return { n: [t.v, 0] }; }
    if (t.t === 'id') {
      k++;
      if (isOp('(')) {
        k++;
        const args = [];
        if (!isOp(')')) {
          do args.push(par()); while (take(';'));
        }
        if (!take(')')) fail(`„)“ fehlt nach ${t.v}(…`);
        const f = FUNCS[t.v.toLowerCase()];
        if (!f) fail(`Unbekannte Funktion „${t.v}“`);
        if (f[0] >= 0 && args.length !== f[0]) fail(`${t.v} braucht ${f[0]} Wert${f[0] === 1 ? '' : 'e'} (getrennt mit „;“)`);
        if (f[0] < 0 && args.length < 2) fail(`${t.v} braucht mindestens 2 Werte (getrennt mit „;“)`);
        return { f: t.v.toLowerCase(), args };
      }
      return { v: t.v };
    }
    if (take('(')) {
      const e = par();
      if (!take(')')) fail('„)“ fehlt');
      return e;
    }
    fail(`„${t.v}“ steht hier falsch`);
  }
  function postfix() {
    const e = primary();
    take('°');
    return e;
  }
  function angle() {
    const e = postfix();
    if (take('∠')) return { op: '∠', a: e, b: unary() };
    return e;
  }
  function power() {
    const e = angle();
    if (take('^')) return { op: '^', a: e, b: unary() };
    return e;
  }
  function unary() {
    if (take('-')) return { op: 'neg', a: unary() };
    if (take('+')) return unary();
    return power();
  }
  function mul() {
    let e = unary();
    for (;;) {
      if (take('*')) e = { op: '*', a: e, b: unary() };
      else if (take('/')) e = { op: '/', a: e, b: unary() };
      else if (startsOperand()) e = { op: '*', a: e, b: unary() };
      else return e;
    }
  }
  function add() {
    let e = mul();
    for (;;) {
      if (take('+')) e = { op: '+', a: e, b: mul() };
      else if (take('-')) e = { op: '-', a: e, b: mul() };
      else return e;
    }
  }
  function par() {
    let e = add();
    while (take('||')) e = { op: '||', a: e, b: add() };
    return e;
  }
  if (!toks.length) fail('Formel ist leer');
  const tree = par();
  if (k < toks.length) fail(`„${toks[k].v}“ steht hier falsch`);
  return tree;
}

/** Namen, die eine Formel braucht (ohne Funktionen und Konstanten j, pi …). */
export function exprNames(tree, out = new Set()) {
  if (!tree) return out;
  if (tree.v !== undefined) out.add(tree.v);
  if (tree.a) exprNames(tree.a, out);
  if (tree.b) exprNames(tree.b, out);
  (tree.args || []).forEach((x) => exprNames(x, out));
  return out;
}

function lookup(env, name) {
  if (Object.prototype.hasOwnProperty.call(env, name)) return env[name];
  const lower = name.toLowerCase();
  const hits = Object.keys(env).filter((n) => n.toLowerCase() === lower);
  if (hits.length === 1) return env[hits[0]];
  if (name === 'ω' || name === 'omega') return lookup(env, 'w');
  if (CONSTS[name]) return CONSTS[name];
  throw new LabError(`„${name}“ ist unbekannt`);
}

export function evalTree(tree, env = {}) {
  if (tree.n) return tree.n;
  if (tree.v !== undefined) return lookup(env, tree.v);
  if (tree.f) {
    const args = tree.args.map((a) => evalTree(a, env));
    return FUNCS[tree.f][1](...args);
  }
  const a = evalTree(tree.a, env);
  if (tree.op === 'neg') return [-a[0], -a[1]];
  const b = evalTree(tree.b, env);
  switch (tree.op) {
    case '+': return cAdd(a, b);
    case '-': return cSub(a, b);
    case '*': return cMul(a, b);
    case '/': return cDiv(a, b);
    case '^': return cPow(a, b);
    case '∠': return cMul(a, cPolar(1, realOf(b, '∠')));
    case '||': return cDiv(cMul(a, b), cAdd(a, b));
    default: throw new LabError('Unbekannte Rechenart');
  }
}

/** Formel ausrechnen; `env`: { name: [re, im] }. */
export function evalExpr(src, env = {}) {
  const v = evalTree(parseExpr(src), env);
  if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) throw new LabError('Ergebnis ist unendlich groß');
  return v;
}

// ==================== Zahlen schreiben ====================

/** Deutsche Schreibweise mit `digits` gültigen Stellen, ohne überflüssige Nullen. */
export function fmtNum(x, digits = 4) {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '–';
  if (Math.abs(x) < 1e-12) return '0';
  let s;
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-3) {
    const [m, e] = x.toExponential(digits - 1).split('e');
    s = `${m.replace(/\.?0+$/, '')}·10^${Number(e)}`;
  } else {
    s = Number(x.toPrecision(digits)).toString();
    if (/e/.test(s)) s = x.toFixed(6);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  }
  return s.replace('.', ',').replace(/^-/, '−');
}

const PREFIXES = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
/** 0,0123 A → „12,3 mA“; ohne Einheit „12,3m“. */
export function siFmt(x, unit = '', digits = 4) {
  if (!Number.isFinite(x) || x === 0) return `${fmtNum(x, digits)}${unit ? ` ${unit}` : ''}`;
  const ax = Math.abs(x);
  const [f, p] = PREFIXES.find(([v]) => ax >= v * 0.9995) || PREFIXES[PREFIXES.length - 1];
  const num = fmtNum(x / f, digits);
  return unit ? `${num} ${p}${unit}` : `${num}${p}`;
}

/** Komplexe Zahl: „3 + j4 V“ (kart) oder „5 V ∠ 53,13°“ (polar). */
export function fmtCx(c, unit = '', mode = 'kart', digits = 4) {
  if (!c) return '–';
  const u = unit ? ` ${unit}` : '';
  if (mode === 'polar') return `${fmtNum(cAbs(c), digits)}${u} ∠ ${fmtNum(cAbs(c) ? cArg(c) : 0, digits)}°`;
  const re = Math.abs(c[0]) < 1e-12 * Math.max(1, Math.abs(c[1])) ? 0 : c[0];
  const im = Math.abs(c[1]) < 1e-12 * Math.max(1, Math.abs(c[0])) ? 0 : c[1];
  if (!im) return `${fmtNum(re, digits)}${u}`;
  const ims = `j${fmtNum(Math.abs(im), digits)}`;
  if (!re) return `${im < 0 ? '−' : ''}${ims}${u}`;
  return `${unit ? '(' : ''}${fmtNum(re, digits)} ${im < 0 ? '−' : '+'} ${ims}${unit ? ')' : ''}${u}`;
}

// ==================== Gemeinsames fürs Zeichnen ====================

export const LAB_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2', '#000000'];
const colorOk = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const color = (c, i = 0) => (colorOk(c) ? c : LAB_COLORS[i % LAB_COLORS.length]);
const escX = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const FONT = 'font-family="Liberation Sans, Arial, sans-serif"';

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r3(w)}cm" height="${r3(h)}cm" viewBox="0 0 ${r3(w)} ${r3(h)}">`
    + `<rect x="0" y="0" width="${r3(w)}" height="${r3(h)}" fill="#ffffff"/>`;
}
function text(x, y, s, { size = 0.38, fill = '#222', anchor = 'start', bold = false } = {}) {
  return `<text x="${r3(x)}" y="${r3(y)}" font-size="${size}" ${FONT} fill="${fill}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}>${escX(s)}</text>`;
}
function line(x1, y1, x2, y2, stroke, w, extra = '') {
  return `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke="${stroke}" stroke-width="${r3(w)}"${extra}/>`;
}
/** Pfeil von (x1,y1) nach (x2,y2): Linie bis vor die Spitze, Spitze als Dreieck (LibreOffice kennt keine Marker). */
function arrow(x1, y1, x2, y2, stroke, w, head = null) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return '';
  const hl = Math.min(head ?? 0.22 + 2.2 * w, len * 0.6);
  const hw = hl * 0.42;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * hl;
  const by = y2 - uy * hl;
  return line(x1, y1, bx + ux * 0.01, by + uy * 0.01, stroke, w, ' stroke-linecap="round"')
    + `<polygon points="${r3(x2)},${r3(y2)} ${r3(bx - uy * hw)},${r3(by + ux * hw)} ${r3(bx + uy * hw)},${r3(by - ux * hw)}" fill="${stroke}"/>`;
}
/** „Schöne“ Schrittweite für etwa `n` Teilungen. */
export function niceStep(range, n = 8) {
  const raw = Math.abs(range) / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Parameter (R = 1k …) der Reihe nach ausrechnen; Fehler je Name. */
function paramEnv(params, base = {}) {
  const env = { ...base };
  const errors = {};
  for (const p of Array.isArray(params) ? params : []) {
    const name = String(p?.name ?? '').trim();
    if (!name) continue;
    try { env[name] = evalExpr(String(p.value ?? ''), env); } catch (e) { errors[name] = e.message; }
  }
  return { env, errors };
}

// ==================== Zeigerlabor ====================

export const ZEIGER_UNITS = ['V', 'A', 'Ω', 'VA', 'W', 'var', 'S', ''];
export const ZEIGER_WIDTHS = { f: 0.025, m: 0.045, d: 0.075 };
/** Einheit nach dem Anfangsbuchstaben: u → V, i → A, z/r/x → Ω, s → VA, p → W, q → var, y/g/b → S. */
export function guessUnit(name) {
  const c = String(name || '').trim()[0]?.toLowerCase();
  return { u: 'V', i: 'A', z: 'Ω', r: 'Ω', x: 'Ω', s: 'VA', p: 'W', q: 'var', y: 'S', g: 'S', b: 'S' }[c] ?? '';
}

export function zeigerDefault() {
  return {
    xmin: -1, xmax: 13, ymin: -4.5, ymax: 4.5, grid: 0.5,
    scales: { V: 2, A: 0.5 },
    items: [
      { id: 'u', name: 'U', unit: 'V', value: [16, 0], x0: 0, y0: 0, color: '#d62728', width: 'm', locked: true },
      { id: 'i', name: 'I', unit: 'A', value: [1.5, -1.2], x0: 0, y0: 0, color: '#1f77b4', width: 'm' },
    ],
  };
}

/** Werte und Lage aller Zeiger: Formeln ausrechnen, Anfang an der Spitze eines anderen („anchor“). */
export function zeigerResolve(state) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const scales = state?.scales || {};
  const byName = new Map(items.map((it) => [String(it.name ?? '').trim(), it]));
  const vals = new Map();
  const errs = new Map();
  const busy = new Set();
  const valueOf = (it) => {
    if (vals.has(it.id)) return vals.get(it.id);
    if (errs.has(it.id)) throw new LabError(errs.get(it.id));
    let v = null;
    if (typeof it.expr === 'string' && it.expr.trim()) {
      if (busy.has(it.id)) throw new LabError(`„${it.name}“ hängt von sich selbst ab`);
      busy.add(it.id);
      try {
        const tree = parseExpr(it.expr);
        const env = {};
        for (const n of exprNames(tree)) {
          const dep = byName.get(n) || [...byName.entries()].find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1];
          if (dep && dep !== it) env[n] = valueOf(dep);
        }
        v = evalTree(tree, env);
        if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) throw new LabError('Ergebnis ist unendlich groß');
      } catch (e) {
        errs.set(it.id, e.message);
        throw e;
      } finally {
        busy.delete(it.id);
      }
    } else {
      v = Array.isArray(it.value) ? [num(it.value[0], 0), num(it.value[1], 0)] : [0, 0];
    }
    vals.set(it.id, v);
    return v;
  };
  for (const it of items) { try { valueOf(it); } catch (e) { if (!errs.has(it.id)) errs.set(it.id, e.message); } }
  const scaleOf = (unit) => {
    const s = Number(scales[unit ?? '']);
    return s > 0 ? s : 1;
  };
  const byId = new Map(items.map((it) => [it.id, it]));
  const starts = new Map();
  const startOf = (it, depth = 0) => {
    if (starts.has(it.id)) return starts.get(it.id);
    let s = [num(it.x0, 0), num(it.y0, 0)];
    const a = it.anchor ? byId.get(it.anchor) : null;
    if (a && a !== it && depth < 50 && vals.has(a.id)) {
      const as = startOf(a, depth + 1);
      const v = vals.get(a.id);
      const k = scaleOf(a.unit);
      s = [as[0] + v[0] / k, as[1] + v[1] / k];
    }
    starts.set(it.id, s);
    return s;
  };
  return items.map((it) => {
    const val = vals.get(it.id) || null;
    const start = startOf(it);
    const k = scaleOf(it.unit);
    const tip = val ? [start[0] + val[0] / k, start[1] + val[1] / k] : start;
    return { ...it, val, err: errs.get(it.id) || null, start, tip, scale: k };
  });
}

/**
 * Griffe eines gewählten Zeigers (in cm wie start/tip): ✥ in der Mitte verschiebt, ⟳ hinter der
 * Spitze dreht um den Anfang (der Betrag bleibt).
 */
export function zeigerHandles(r) {
  const dx = r.tip[0] - r.start[0];
  const dy = r.tip[1] - r.start[1];
  const len = Math.hypot(dx, dy) || 1;
  return { move: [r.start[0] + dx / 2, r.start[1] + dy / 2], rotate: [r.tip[0] + (dx / len) * 0.55, r.tip[1] + (dy / len) * 0.55] };
}

export function zeigerSvg(state, { selected = null, handles = false } = {}) {
  const st = { ...zeigerDefault(), ...(state || {}) };
  const xmin = num(st.xmin, -1);
  const xmax = Math.max(num(st.xmax, 13), xmin + 2);
  const ymin = num(st.ymin, -4.5);
  const ymax = Math.max(num(st.ymax, 4.5), ymin + 2);
  const grid = Math.min(Math.max(num(st.grid, 0.5), 0.2), 2);
  const W = xmax - xmin;
  const H = ymax - ymin;
  const X = (x) => x - xmin;
  const Y = (y) => ymax - y;
  let s = svgOpen(W, H);
  for (let x = Math.ceil(xmin / grid) * grid; x <= xmax + 1e-9; x += grid) s += line(X(x), 0, X(x), H, '#8fbbe0', Math.abs(x % 1) < 1e-9 ? 0.016 : 0.01);
  for (let y = Math.ceil(ymin / grid) * grid; y <= ymax + 1e-9; y += grid) s += line(0, Y(y), W, Y(y), '#8fbbe0', Math.abs(y % 1) < 1e-9 ? 0.016 : 0.01);
  if (ymin < 0 && ymax > 0) s += arrow(0, Y(0), W - 0.05, Y(0), '#555', 0.02, 0.22) + text(W - 0.15, Y(0) + 0.45, 'Re', { size: 0.32, fill: '#555', anchor: 'end' });
  if (xmin < 0 && xmax > 0) s += arrow(X(0), H, X(0), 0.05, '#555', 0.02, 0.22) + text(X(0) + 0.15, 0.4, 'Im', { size: 0.32, fill: '#555' });
  const res = zeigerResolve(st);
  res.forEach((it, i) => {
    if (it.show === false || !it.val) return;
    const c = color(it.color, i);
    const w = ZEIGER_WIDTHS[it.width] ?? ZEIGER_WIDTHS.m;
    const [x1, y1] = [X(it.start[0]), Y(it.start[1])];
    const [x2, y2] = [X(it.tip[0]), Y(it.tip[1])];
    if (selected === it.id) s += line(x1, y1, x2, y2, '#ffd54f', w + 0.16, ' stroke-linecap="round" opacity="0.7"');
    s += arrow(x1, y1, x2, y2, c, w);
    if (selected === it.id && handles) {
      const hd = zeigerHandles(it);
      const knob = ([hx, hy], sym, title) => `<g class="lab-handle"><title>${title}</title><circle cx="${r3(X(hx))}" cy="${r3(Y(hy))}" r="0.2" fill="#ffffff" stroke="#1d4ed8" stroke-width="0.03"/>`
        + `<text x="${r3(X(hx))}" y="${r3(Y(hy) + 0.1)}" font-size="0.28" text-anchor="middle" fill="#1d4ed8">${sym}</text></g>`;
      s += knob(hd.move, '✥', 'Verschieben') + knob(hd.rotate, '⟳', 'Drehen um den Anfang');
    }
    // Name an der Spitze, etwas seitlich (unterstrichen wie komplexe Größen in der E-Technik).
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const lx = x1 + dx * 0.78 + nx * 0.32;
    const ly = y1 + dy * 0.78 + ny * 0.32 + 0.13;
    const name = String(it.name ?? '');
    if (name) {
      const tw = name.length * 0.22;
      s += text(lx, ly, name, { size: 0.4, fill: c, anchor: 'middle', bold: true })
        + line(lx - tw / 2, ly + 0.07, lx + tw / 2, ly + 0.07, c, 0.022);
    }
  });
  // Maßstab je Einheit der gezeigten Zeiger.
  const units = [...new Set(res.filter((it) => it.show !== false && it.val).map((it) => it.unit ?? ''))];
  if (units.length) {
    const lines = units.map((u) => `1 cm ≙ ${fmtNum(res.find((it) => (it.unit ?? '') === u).scale)}${u ? ` ${u}` : ''}`);
    const bw = Math.max(...lines.map((l) => l.length)) * 0.17 + 0.3;
    const bh = lines.length * 0.42 + 0.2;
    s += `<rect x="0.1" y="${r3(H - bh - 0.1)}" width="${r3(bw)}" height="${r3(bh)}" fill="#ffffff" fill-opacity="0.85" stroke="#999" stroke-width="0.012"/>`;
    lines.forEach((l, i) => { s += text(0.25, H - bh + 0.25 + i * 0.42, l, { size: 0.3, fill: '#333' }); });
  }
  return `${s}</svg>`;
}

// ==================== Bode-Diagramm ====================

export function bodeDefault() {
  return {
    params: [{ name: 'R', value: '1k' }, { name: 'C', value: '100n' }],
    curves: [{ id: 'h1', name: 'H', expr: '1/(1 + j*w*R*C)', color: '#1f77b4' }],
    fmin: 10, fmax: 100000, dbmin: -60, dbmax: 10, phase: true, mark3db: true,
  };
}

/** Frequenzgang je Kurve: Punkte { f, db, ph } (Phase stetig fortgesetzt). */
export function bodeEval(state, n = 240) {
  const st = { ...bodeDefault(), ...(state || {}) };
  const fmin = Math.max(num(st.fmin, 10), 1e-6);
  const fmax = Math.max(num(st.fmax, 1e5), fmin * 1.01);
  const { env, errors } = paramEnv(st.params);
  const curves = (Array.isArray(st.curves) ? st.curves : []).map((c, i) => {
    const out = { ...c, color: color(c.color, i), pts: [], err: null };
    try {
      const tree = parseExpr(c.expr);
      let last = null;
      for (let k = 0; k <= n; k++) {
        const f = fmin * (fmax / fmin) ** (k / n);
        const w = 2 * Math.PI * f;
        const h = evalTree(tree, { ...env, f: [f, 0], w: [w, 0], s: [0, w] });
        let ph = cArg(h);
        if (last !== null) while (ph - last > 180) ph -= 360;
        if (last !== null) while (ph - last < -180) ph += 360;
        last = ph;
        out.pts.push({ f, db: 20 * Math.log10(cAbs(h)), ph, h });
      }
    } catch (e) {
      out.err = e.message;
      out.pts = [];
    }
    return out;
  });
  return { fmin, fmax, curves, paramErrors: errors };
}

/** Polylinie in einem Rechteck – Stücke außerhalb (oben/unten) werden am Rand abgeschnitten. */
function clippedPolylines(pts, top, bottom, stroke, w) {
  let s = '';
  let seg = [];
  const flush = () => {
    if (seg.length > 1) s += `<polyline points="${seg.map(([x, y]) => `${r3(x)},${r3(y)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`;
    seg = [];
  };
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const inside = Number.isFinite(y) && y >= top && y <= bottom;
    const prev = pts[i - 1];
    if (prev && Number.isFinite(prev[1]) && Number.isFinite(y)) {
      const pIn = prev[1] >= top && prev[1] <= bottom;
      if (pIn !== inside) {
        const edge = (inside ? prev[1] : y) < top ? top : bottom;
        const t = (edge - prev[1]) / (y - prev[1]);
        seg.push([prev[0] + (x - prev[0]) * t, edge]);
        if (!inside) flush();
      }
    }
    if (inside) seg.push([x, y]);
  }
  flush();
  return s;
}

function logTicks(fmin, fmax) {
  const major = [];
  const minor = [];
  for (let e = Math.floor(Math.log10(fmin)); e <= Math.ceil(Math.log10(fmax)); e++) {
    for (let m = 1; m <= 9; m++) {
      const f = m * 10 ** e;
      if (f < fmin * 0.9999 || f > fmax * 1.0001) continue;
      (m === 1 ? major : minor).push(f);
    }
  }
  return { major, minor };
}

/** Lage des Diagramms (cm) – die Bedienung rechnet damit die Frequenz unter dem Zeiger aus. */
export const BODE_GEOM = { L: 1.7, R: 0.4, W: 16 };

/** Werte aller Kurven bei der Frequenz f: [{ name, color, h, db, ph }] (Phase −180 … 180). */
export function bodeAt(state, f) {
  const st = { ...bodeDefault(), ...(state || {}) };
  const { env } = paramEnv(st.params);
  const w = 2 * Math.PI * f;
  return (Array.isArray(st.curves) ? st.curves : []).map((c, i) => {
    try {
      const hv = evalExpr(c.expr, { ...env, f: [f, 0], w: [w, 0], s: [0, w] });
      return { name: c.name, color: color(c.color, i), h: hv, db: 20 * Math.log10(cAbs(hv)), ph: cArg(hv), show: c.show };
    } catch (e) {
      return { name: c.name, color: color(c.color, i), err: e.message, show: c.show };
    }
  });
}

export function bodeSvg(state, { cursor = null } = {}) {
  const st = { ...bodeDefault(), ...(state || {}) };
  const data = bodeEval(st);
  const { L, R, W } = BODE_GEOM;
  const pw = W - L - R;
  const magH = 5.6;
  const phH = st.phase === false ? 0 : 4;
  const gap = phH ? 0.9 : 0;
  const top = 0.6;
  const H = top + magH + gap + phH + 1.0;
  const lx = (f) => L + (Math.log10(f / data.fmin) / Math.log10(data.fmax / data.fmin)) * pw;
  let dbmin = num(st.dbmin, -60);
  let dbmax = num(st.dbmax, 10);
  if (dbmax <= dbmin) dbmax = dbmin + 10;
  const dy = (db) => top + ((dbmax - db) / (dbmax - dbmin)) * magH;
  const phs = data.curves.flatMap((c) => c.pts.map((p) => p.ph));
  let phmin = Number.isFinite(st.phmin) ? st.phmin : phs.length ? Math.floor(Math.min(...phs, 0) / 45) * 45 : -90;
  let phmax = Number.isFinite(st.phmax) ? st.phmax : phs.length ? Math.ceil(Math.max(...phs, 0) / 45) * 45 : 0;
  if (phmax - phmin < 90) { phmin = Math.min(phmin, phmax - 90); }
  const p0 = top + magH + gap;
  const py = (ph) => p0 + ((phmax - ph) / (phmax - phmin)) * phH;
  let s = svgOpen(W, H);
  const { major, minor } = logTicks(data.fmin, data.fmax);
  const panel = (y0, h) => {
    let g = '';
    for (const f of minor) g += line(lx(f), y0, lx(f), y0 + h, '#d6e4f0', 0.012);
    for (const f of major) g += line(lx(f), y0, lx(f), y0 + h, '#9ab', 0.018);
    g += `<rect x="${L}" y="${r3(y0)}" width="${r3(pw)}" height="${r3(h)}" fill="none" stroke="#555" stroke-width="0.022"/>`;
    return g;
  };
  // Betrag
  s += panel(top, magH);
  const dbStep = niceStep(dbmax - dbmin, 7) < 10 ? niceStep(dbmax - dbmin, 7) : Math.round(niceStep(dbmax - dbmin, 7) / 10) * 10;
  for (let db = Math.ceil(dbmin / dbStep) * dbStep; db <= dbmax + 1e-9; db += dbStep) {
    s += line(L, dy(db), L + pw, dy(db), db === 0 ? '#777' : '#c8d6e3', db === 0 ? 0.02 : 0.012);
    s += text(L - 0.12, dy(db) + 0.11, fmtNum(db), { size: 0.3, anchor: 'end', fill: '#444' });
  }
  s += text(0.15, top - 0.18, '|H| in dB', { size: 0.32, fill: '#333' });
  if (st.mark3db !== false && -3 > dbmin && -3 < dbmax) {
    s += line(L, dy(-3), L + pw, dy(-3), '#e15759', 0.016, ' stroke-dasharray="0.15,0.1"');
    s += text(L + pw - 0.08, dy(-3) - 0.08, '−3 dB', { size: 0.26, fill: '#e15759', anchor: 'end' });
  }
  data.curves.forEach((c) => {
    if (c.show === false || !c.pts.length) return;
    s += clippedPolylines(c.pts.map((p) => [lx(p.f), dy(p.db)]), top, top + magH, c.color, 0.045);
  });
  // Phase
  if (phH) {
    s += panel(p0, phH);
    const phStep = phmax - phmin > 270 ? 90 : 45;
    for (let ph = Math.ceil(phmin / phStep) * phStep; ph <= phmax + 1e-9; ph += phStep) {
      s += line(L, py(ph), L + pw, py(ph), ph === 0 ? '#777' : '#c8d6e3', ph === 0 ? 0.02 : 0.012);
      s += text(L - 0.12, py(ph) + 0.11, `${fmtNum(ph)}°`, { size: 0.3, anchor: 'end', fill: '#444' });
    }
    s += text(0.15, p0 - 0.18, 'φ in °', { size: 0.32, fill: '#333' });
    data.curves.forEach((c) => {
      if (c.show === false || !c.pts.length) return;
      s += clippedPolylines(c.pts.map((p) => [lx(p.f), py(p.ph)]), p0, p0 + phH, c.color, 0.045);
    });
  }
  const bottom = phH ? p0 + phH : top + magH;
  for (const f of major) s += text(lx(f), bottom + 0.42, siFmt(f, '', 3), { size: 0.3, anchor: 'middle', fill: '#444' });
  s += text(L + pw, bottom + 0.85, 'f in Hz', { size: 0.32, anchor: 'end', fill: '#333' });
  // Legende
  const shown = data.curves.filter((c) => c.show !== false && c.pts.length);
  shown.forEach((c, i) => {
    const x = L + 0.25 + i * 2.6;
    s += line(x, 0.32, x + 0.5, 0.32, c.color, 0.06) + text(x + 0.62, 0.43, c.name || `H${i + 1}`, { size: 0.32, fill: c.color, bold: true });
  });
  if (cursor && cursor > data.fmin && cursor < data.fmax) {
    s += line(lx(cursor), top, lx(cursor), bottom, '#333', 0.016, ' stroke-dasharray="0.1,0.08"');
  }
  return `${s}</svg>`;
}

// ==================== Ortskurve ====================

export function ortskurveDefault() {
  return {
    params: [{ name: 'R', value: '1k' }, { name: 'C', value: '1µ' }],
    curves: [{ id: 'z1', name: 'Z', expr: 'R || 1/(j*w*C)', color: '#1f77b4' }],
    var: 'f', from: 10, to: 10000, log: true, unit: 'Ω', cursor: null, marks: true,
  };
}

/** Werte des Laufparameters: logarithmisch oder linear. */
function sweep(from, to, log, n) {
  const out = [];
  for (let k = 0; k <= n; k++) out.push(log && from > 0 && to > 0 ? from * (to / from) ** (k / n) : from + ((to - from) * k) / n);
  return out;
}

/** Umgebung für den Laufparameter: f ↔ w (ω) ↔ s = jω. */
function sweepEnv(env, name, t) {
  const e = { ...env, [name]: [t, 0] };
  if (name === 'f') { e.w = [2 * Math.PI * t, 0]; e.s = [0, 2 * Math.PI * t]; }
  if (name === 'w' || name === 'ω') { e.w = [t, 0]; e.f = [t / (2 * Math.PI), 0]; e.s = [0, t]; }
  return e;
}

export function ortskurveEval(state, n = 300) {
  const st = { ...ortskurveDefault(), ...(state || {}) };
  const name = String(st.var || 'f').trim() || 'f';
  const from = num(st.from, 1);
  const to = num(st.to, 1000);
  const log = st.log !== false && from > 0 && to > 0;
  const { env, errors } = paramEnv(st.params);
  const ts = sweep(from, to, log, n);
  const curves = (Array.isArray(st.curves) ? st.curves : []).map((c, i) => {
    const out = { ...c, color: color(c.color, i), pts: [], err: null };
    try {
      const tree = parseExpr(c.expr);
      for (const t of ts) {
        const z = evalTree(tree, sweepEnv(env, name, t));
        if (Number.isFinite(z[0]) && Number.isFinite(z[1])) out.pts.push({ t, z });
      }
    } catch (e) {
      out.err = e.message;
      out.pts = [];
    }
    return out;
  });
  const valueAt = (c, t) => {
    try { return evalTree(parseExpr(c.expr), sweepEnv(env, name, t)); } catch (_) { return null; }
  };
  return { name, from, to, log, curves, paramErrors: errors, valueAt };
}

/** Beschriftete Punkte: Dekaden (1, 2, 5 …) bzw. glatte Schritte. */
function markValues(from, to, log) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (log && lo > 0) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo * 0.9999 && v <= hi * 1.0001) out.push(v); }
    }
    return out.length > 10 ? out.filter((v) => /^1/.test(v.toExponential())) : out;
  }
  const step = niceStep(hi - lo, 6);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(v);
  return out;
}

export function ortskurveSvg(state) {
  const st = { ...ortskurveDefault(), ...(state || {}) };
  const data = ortskurveEval(st);
  const all = data.curves.flatMap((c) => (c.show === false ? [] : c.pts.map((p) => p.z)));
  // Sichtbereich: fest (xmin …) oder aus den Punkten samt Ursprung, gleicher Maßstab in beide Richtungen.
  let xmin; let xmax; let ymin; let ymax;
  if ([st.xmin, st.xmax, st.ymin, st.ymax].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    ({ xmin, xmax, ymin, ymax } = st);
  } else {
    const clampAbs = (vals) => {
      const sorted = vals.map(Math.abs).sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length * 0.97)] * 1.05 : 1;
    };
    const lim = Math.max(clampAbs(all.map((z) => z[0])), clampAbs(all.map((z) => z[1]))) || 1;
    xmin = Math.min(0, ...all.map((z) => z[0]).filter((v) => Math.abs(v) <= lim));
    xmax = Math.max(0, ...all.map((z) => z[0]).filter((v) => Math.abs(v) <= lim));
    ymin = Math.min(0, ...all.map((z) => z[1]).filter((v) => Math.abs(v) <= lim));
    ymax = Math.max(0, ...all.map((z) => z[1]).filter((v) => Math.abs(v) <= lim));
    const span = Math.max(xmax - xmin, ymax - ymin) || 1;
    const pad = span * 0.08;
    xmin -= pad; xmax += pad; ymin -= pad; ymax += pad;
  }
  const W = 15;
  const L = 0.4;
  const plotW = W - 2 * L;
  // Gleicher Maßstab in beide Richtungen; zu hohe Bilder (über 13 cm) werden kleiner, nicht abgeschnitten.
  const k = Math.min(plotW / (xmax - xmin), 13 / (ymax - ymin));
  const plotH = Math.max((ymax - ymin) * k, 5);
  const xc = (xmin + xmax) / 2;
  const yc = (ymin + ymax) / 2;
  const xhalf = plotW / k / 2;
  const yhalf = plotH / k / 2;
  xmin = xc - xhalf;
  xmax = xc + xhalf;
  const T = 0.7;
  const H = T + plotH + 0.6;
  const X = (x) => L + (x - xmin) * k;
  const Y = (y) => T + plotH / 2 - (y - yc) * k;
  let s = svgOpen(W, H);
  const step = niceStep(Math.max(xmax - xmin, 2 * yhalf), 10);
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) s += line(X(x), T, X(x), T + plotH, '#d6e4f0', 0.012);
  for (let y = Math.ceil((yc - yhalf) / step) * step; y <= yc + yhalf; y += step) s += line(L, Y(y), L + plotW, Y(y), '#d6e4f0', 0.012);
  const unit = st.unit ? ` in ${st.unit}` : '';
  if (yc - yhalf < 0 && yc + yhalf > 0) s += arrow(L, Y(0), L + plotW, Y(0), '#555', 0.02, 0.22);
  if (xmin < 0 && xmax > 0) s += arrow(X(0), T + plotH, X(0), T - 0.15, '#555', 0.02, 0.22);
  // Achsenteilung: Werte an den Achsen.
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step * 2) {
    if (Math.abs(x) > step / 2) s += text(X(x), Math.min(Math.max(Y(0), T), T + plotH) + 0.38, siFmt(x, '', 3), { size: 0.26, anchor: 'middle', fill: '#555' });
  }
  for (let y = Math.ceil((yc - yhalf) / step) * step; y <= yc + yhalf; y += step * 2) {
    if (Math.abs(y) > step / 2) s += text(Math.min(Math.max(X(0), L), L + plotW) - 0.1, Y(y) + 0.09, siFmt(y, '', 3), { size: 0.26, anchor: 'end', fill: '#555' });
  }
  const cname = data.curves[0]?.name || 'Z';
  s += text(L + plotW, Math.min(Math.max(Y(0), T), T + plotH) - 0.15, `Re{${cname}}${unit}`, { size: 0.3, anchor: 'end', fill: '#333' });
  s += text(Math.min(Math.max(X(0), L), L + plotW) + 0.15, T - 0.15, `Im{${cname}}${unit}`, { size: 0.3, fill: '#333' });
  const inside = (z) => z[0] >= xmin && z[0] <= xmax && z[1] >= yc - yhalf && z[1] <= yc + yhalf;
  data.curves.forEach((c) => {
    if (c.show === false || !c.pts.length) return;
    let seg = [];
    const flush = () => {
      if (seg.length > 1) s += `<polyline points="${seg.map((p) => `${r3(X(p[0]))},${r3(Y(p[1]))}`).join(' ')}" fill="none" stroke="${c.color}" stroke-width="0.045" stroke-linejoin="round"/>`;
      seg = [];
    };
    for (const p of c.pts) { if (inside(p.z)) seg.push(p.z); else flush(); }
    flush();
    // Richtungspfeil in der Mitte (wachsender Parameter).
    const mid = c.pts.filter((p) => inside(p.z));
    if (mid.length > 4) {
      const a = mid[Math.floor(mid.length / 2) - 1].z;
      const b = mid[Math.floor(mid.length / 2) + 1].z;
      s += arrow(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), c.color, 0.03, 0.32);
    }
    if (st.marks !== false) {
      const placed = [];
      for (const t of markValues(data.from, data.to, data.log)) {
        const z = data.valueAt(c, t);
        if (!z || !inside(z)) continue;
        // Dicht beieinander (z. B. nahe am Ursprung): nur der erste Punkt bekommt Punkt und Wert.
        if (placed.some(([x, y]) => Math.hypot(x - X(z[0]), y - Y(z[1])) < 0.55)) continue;
        placed.push([X(z[0]), Y(z[1])]);
        s += `<circle cx="${r3(X(z[0]))}" cy="${r3(Y(z[1]))}" r="0.06" fill="${c.color}"/>`;
        s += text(X(z[0]) + 0.12, Y(z[1]) - 0.1, `${data.name}=${siFmt(t, data.name === 'f' ? 'Hz' : '', 3)}`, { size: 0.24, fill: '#333' });
      }
    }
  });
  // Zeiger zum gewählten Wert (cursor) auf der ersten Kurve.
  const cur = typeof st.cursor === 'number' ? st.cursor : null;
  const first = data.curves.find((c) => c.show !== false && c.pts.length);
  if (cur !== null && first) {
    const z = data.valueAt(first, cur);
    if (z && inside(z) && inside([0, 0])) {
      s += arrow(X(0), Y(0), X(z[0]), Y(z[1]), '#222', 0.035);
      s += text(X(z[0]) + 0.15, Y(z[1]) + 0.35, `${first.name || 'Z'} = ${fmtCx(z, st.unit || '', 'polar', 3)}`, { size: 0.28, fill: '#222', bold: true });
    }
  }
  return `${s}</svg>`;
}

// ==================== Logikschaltungen ====================
//
// Teile in Rastereinheiten (0,5 cm): Eingang (Schalter), Ausgang (Lampe), Gatter nach DIN EN 60617
// (Rechteck mit &, ≥1, =1, 1; Negation als Kreis). Drähte von einem Ausgang zu einem Eingang.

export const LOGIK_TYPES = {
  in: { label: 'Eingang', sym: '' },
  out: { label: 'Ausgang', sym: '' },
  not: { label: 'NICHT', sym: '1', neg: true, fixed: 1 },
  and: { label: 'UND', sym: '&' },
  or: { label: 'ODER', sym: '≥1' },
  nand: { label: 'NAND', sym: '&', neg: true },
  nor: { label: 'NOR', sym: '≥1', neg: true },
  xor: { label: 'XOR', sym: '=1' },
  xnor: { label: 'XNOR', sym: '=1', neg: true },
};
export const LOGIK_UNIT = 0.5;

/** Anzahl Eingänge, Breite und Höhe (Raster) eines Teils. */
export function logikShape(part) {
  const info = LOGIK_TYPES[part?.type];
  if (!info) return { ins: 0, outs: 0, w: 2, h: 2 };
  if (part.type === 'in') return { ins: 0, outs: 1, w: 2, h: 2 };
  if (part.type === 'out') return { ins: 1, outs: 0, w: 2, h: 2 };
  const ins = info.fixed || Math.min(Math.max(Math.round(num(part.n, 2)), 2), 4);
  return { ins, outs: 1, w: 3, h: ins === 1 ? 2 : ins + 1 };
}
/** Lage der Anschlüsse in Rastereinheiten. */
export function logikPin(part, kind, k = 0) {
  const sh = logikShape(part);
  const x = num(part.x, 0);
  const y = num(part.y, 0);
  if (kind === 'out') return [x + sh.w + (part.type === 'in' ? 0 : 0.5), y + sh.h / 2];
  return [x - (part.type === 'out' ? 0 : 0.5), sh.ins === 1 ? y + sh.h / 2 : y + 1 + k];
}

export function logikDefault() {
  return {
    w: 30, h: 14,
    parts: [
      { id: 'a', type: 'in', x: 1, y: 2, label: 'a' },
      { id: 'b', type: 'in', x: 1, y: 8, label: 'b' },
      { id: 'g1', type: 'and', x: 12, y: 4, n: 2 },
      { id: 'q', type: 'out', x: 23, y: 4.5, label: 'Q' },
    ],
    wires: [{ from: 'a', to: 'g1', pin: 0 }, { from: 'b', to: 'g1', pin: 1 }, { from: 'g1', to: 'q', pin: 0 }],
  };
}

const GATE = {
  and: (v) => (v.every((x) => x === 1) ? 1 : 0),
  or: (v) => (v.some((x) => x === 1) ? 1 : 0),
  xor: (v) => v.reduce((a, b) => a ^ b, 0),
  not: (v) => v[0],
};

/** Pegel aller Teile: { [id]: 0 | 1 | null } (null = offen oder Rückkopplung). */
export function logikEval(state, inputs = null) {
  const parts = Array.isArray(state?.parts) ? state.parts : [];
  const wires = Array.isArray(state?.wires) ? state.wires : [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const memo = new Map();
  const busy = new Set();
  const driver = (id, pin) => wires.find((w) => w.to === id && (w.pin ?? 0) === pin);
  const level = (id) => {
    if (memo.has(id)) return memo.get(id);
    const p = byId.get(id);
    if (!p || busy.has(id)) return null;
    busy.add(id);
    let v = null;
    if (p.type === 'in') v = (inputs ? inputs[id] : p.on) ? 1 : 0;
    else {
      const sh = logikShape(p);
      const ins = [];
      for (let k = 0; k < sh.ins; k++) {
        const w = driver(id, k);
        ins.push(w ? level(w.from) : null);
      }
      if (p.type === 'out') v = ins[0];
      else if (!ins.includes(null)) {
        const base = p.type.replace(/^n(?=and|or)/, '').replace(/^xnor$/, 'xor');
        v = GATE[base](ins);
        if (LOGIK_TYPES[p.type].neg) v = v ? 0 : 1;
      }
    }
    busy.delete(id);
    memo.set(id, v);
    return v;
  };
  const out = {};
  for (const p of parts) out[p.id] = level(p.id);
  return out;
}

const labelOf = (p, i) => String(p.label ?? '').trim() || (p.type === 'in' ? String.fromCharCode(97 + i) : `Q${i + 1}`);
/** Wahrheitstabelle (höchstens 6 Eingänge): { ins: [Namen], outs: [Namen], rows: [[…ins, …outs]] }. */
export function logikTruthTable(state) {
  const parts = Array.isArray(state?.parts) ? state.parts : [];
  const ins = parts.filter((p) => p.type === 'in').map((p, i) => ({ p, name: labelOf(p, i) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const outs = parts.filter((p) => p.type === 'out').map((p, i) => ({ p, name: labelOf(p, i) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (ins.length > 6) throw new LabError('Wahrheitstabelle nur bis 6 Eingänge');
  const rows = [];
  for (let m = 0; m < 2 ** ins.length; m++) {
    const inputs = {};
    ins.forEach((x, i) => { inputs[x.p.id] = (m >> (ins.length - 1 - i)) & 1; });
    const lv = logikEval(state, inputs);
    rows.push([...ins.map((x) => inputs[x.p.id]), ...outs.map((x) => lv[x.p.id])]);
  }
  return { ins: ins.map((x) => x.name), outs: outs.map((x) => x.name), rows };
}

/** Drahtverlauf (Raster): rechtwinklig über die Mitte. */
export function logikWirePath(a, b) {
  const [x1, y1] = a;
  const [x2, y2] = b;
  if (Math.abs(y1 - y2) < 1e-9) return [a, b];
  if (x2 > x1 + 0.4) {
    const xm = Math.round(((x1 + x2) / 2) * 2) / 2;
    return [a, [xm, y1], [xm, y2], b];
  }
  const ym = (y1 + y2) / 2;
  return [a, [x1 + 0.5, y1], [x1 + 0.5, ym], [x2 - 0.5, ym], [x2 - 0.5, y2], b];
}

export function logikSvg(state, { selected = null, pending = null } = {}) {
  const st = { ...logikDefault(), ...(state || {}) };
  const parts = Array.isArray(st.parts) ? st.parts : [];
  const wires = Array.isArray(st.wires) ? st.wires : [];
  const u = LOGIK_UNIT;
  const gw = Math.max(num(st.w, 30), ...parts.map((p) => num(p.x, 0) + logikShape(p).w + 2));
  const gh = Math.max(num(st.h, 14), ...parts.map((p) => num(p.y, 0) + logikShape(p).h + 1.5));
  const W = gw * u;
  const H = gh * u;
  const lv = logikEval(st);
  const byId = new Map(parts.map((p) => [p.id, p]));
  let s = svgOpen(W, H);
  for (let x = 1; x < gw; x++) for (let y = 1; y < gh; y++) s += `<circle cx="${r3(x * u)}" cy="${r3(y * u)}" r="0.012" fill="#9ab"/>`;
  const levelColor = (v) => (v === 1 ? '#d62728' : v === 0 ? '#1f3b73' : '#9a9a9a');
  wires.forEach((w, i) => {
    const a = byId.get(w.from);
    const b = byId.get(w.to);
    if (!a || !b) return;
    const pts = logikWirePath(logikPin(a, 'out'), logikPin(b, 'in', w.pin ?? 0));
    const v = lv[w.from];
    if (selected === `w${i}`) s += `<polyline points="${pts.map((p) => `${r3(p[0] * u)},${r3(p[1] * u)}`).join(' ')}" fill="none" stroke="#ffd54f" stroke-width="0.18" opacity="0.8"/>`;
    s += `<polyline points="${pts.map((p) => `${r3(p[0] * u)},${r3(p[1] * u)}`).join(' ')}" fill="none" stroke="${levelColor(v)}" stroke-width="${v === 1 ? 0.05 : 0.035}" stroke-linejoin="round"/>`;
  });
  parts.forEach((p, i) => {
    const sh = logikShape(p);
    const x = num(p.x, 0) * u;
    const y = num(p.y, 0) * u;
    const w = sh.w * u;
    const h = sh.h * u;
    const sel = selected === p.id;
    if (sel) s += `<rect x="${r3(x - 0.12)}" y="${r3(y - 0.12)}" width="${r3(w + 0.24)}" height="${r3(h + 0.24)}" fill="#ffd54f" fill-opacity="0.45" rx="0.08"/>`;
    if (p.type === 'in') {
      const on = lv[p.id] === 1;
      s += `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(w)}" height="${r3(h)}" rx="0.12" fill="${on ? '#ffe0e0' : '#eef2f7'}" stroke="#333" stroke-width="0.035"/>`;
      s += text(x + w / 2, y + h / 2 + 0.17, on ? '1' : '0', { size: 0.5, anchor: 'middle', bold: true, fill: on ? '#d62728' : '#1f3b73' });
      s += text(x - 0.1, y + h / 2 + 0.13, labelOf(p, parts.filter((q) => q.type === 'in').indexOf(p)), { size: 0.38, anchor: 'end', fill: '#222', bold: true });
      return;
    }
    if (p.type === 'out') {
      const v = lv[p.id];
      const cx = x + w / 2;
      const cy = y + h / 2;
      s += line(x, cy, cx - 0.35, cy, levelColor(v), 0.035);
      s += `<circle cx="${r3(cx)}" cy="${r3(cy)}" r="0.35" fill="${v === 1 ? '#ffd700' : v === 0 ? '#ffffff' : '#eeeeee'}" stroke="#333" stroke-width="0.035"/>`;
      s += line(cx - 0.25, cy - 0.25, cx + 0.25, cy + 0.25, '#333', 0.025) + line(cx - 0.25, cy + 0.25, cx + 0.25, cy - 0.25, '#333', 0.025);
      s += text(cx + 0.5, cy + 0.13, labelOf(p, parts.filter((q) => q.type === 'out').indexOf(p)), { size: 0.38, fill: '#222', bold: true });
      return;
    }
    const info = LOGIK_TYPES[p.type];
    if (!info) return;
    // Anschlussstriche
    for (let k = 0; k < sh.ins; k++) {
      const [px, py] = logikPin(p, 'in', k);
      s += line(px * u, py * u, x, py * u, '#333', 0.03);
    }
    const [ox, oy] = logikPin(p, 'out');
    s += line(x + w + (info.neg ? 0.16 : 0), oy * u, ox * u, oy * u, '#333', 0.03);
    s += `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(w)}" height="${r3(h)}" fill="#ffffff" stroke="#222" stroke-width="0.04"/>`;
    s += text(x + w / 2, y + 0.48, info.sym, { size: 0.42, anchor: 'middle', fill: '#222', bold: true });
    if (info.neg) s += `<circle cx="${r3(x + w + 0.08)}" cy="${r3(oy * u)}" r="0.08" fill="#ffffff" stroke="#222" stroke-width="0.03"/>`;
    if (p.label) s += text(x + w / 2, y + h + 0.32, p.label, { size: 0.28, anchor: 'middle', fill: '#555' });
    void i;
  });
  if (pending) s += `<circle cx="${r3(pending[0] * u)}" cy="${r3(pending[1] * u)}" r="0.14" fill="#ffd54f" stroke="#c90" stroke-width="0.03"/>`;
  return `${s}</svg>`;
}

// ==================== SPS-Labor: Ablaufkette nach IEC 61131-3 ====================
//
// Stand: { io: [{ id, kind: 'in'|'out'|'mem'|'tim', name, addr, desc, contact: 'NO'|'NC'|'latch' }],
//          steps: [Element], back, init? }  – init: Eingang, der die Kette in den Initialschritt setzt
//   Element: Schritt { id, name, initial, trans, actions: [{ id, q, time, text, var, cond }] }
//              trans: Transition nach dem Schritt (zum nächsten Element)
//          | Alternativverzweigung { id, type: 'alt', branches: [{ id, trans, steps: [Element], jump? }] }
//              Jeder Zweig beginnt mit seiner Transition (trans) – die des Schritts davor entfällt.
//              Der letzte Schritt eines Zweigs hat seine Transition vor der Zusammenführung;
//              jump: Name des Schritts, zu dem der Zweig springt (statt Zusammenführung).
//          | Parallelverzweigung { id, type: 'par', branches: [{ id, steps: [Element] }], trans }
//              Davor gilt die Transition des Schritts davor, alle Zweige starten zugleich; die letzten
//              Schritte der Zweige haben keine eigene Transition – nach der Synchronisation gilt trans.
// Nach dem Ende der Kette geht es (back) zum Initialschritt zurück. Alte Ketten (nur Schritte) bleiben gültig.
// Bestimmungszeichen: N, S, R, L, D, P, DS, SD, SL.

export const SPS_QUALIFIERS = ['N', 'S', 'R', 'L', 'D', 'P', 'DS', 'SD', 'SL'];
export const SPS_TIMED = ['L', 'D', 'DS', 'SD', 'SL'];

export function spsDefault() {
  return {
    io: [
      { id: 'i1', kind: 'in', name: 'S1', addr: '%I0.0', desc: 'Start-Taster', contact: 'NO' },
      { id: 'i2', kind: 'in', name: 'B1', addr: '%I0.1', desc: 'Zylinder ausgefahren', contact: 'NO' },
      { id: 'i3', kind: 'in', name: 'B0', addr: '%I0.2', desc: 'Zylinder eingefahren', contact: 'NO' },
      { id: 'o1', kind: 'out', name: 'Y1', addr: '%Q0.0', desc: 'Zylinder ausfahren' },
      { id: 'o2', kind: 'out', name: 'H1', addr: '%Q0.1', desc: 'Meldeleuchte' },
      { id: 't1', kind: 'tim', name: 'tonT1', addr: '', desc: 'Wartezeit 3s' },
    ],
    steps: [
      { id: 's1', name: 'S_1', initial: true, trans: 'S1', actions: [] },
      { id: 's2', name: 'S_2', trans: 'B1', actions: [{ id: 'a1', q: 'N', time: '', text: 'Zylinder ausfahren', var: 'Y1', cond: '' }] },
      { id: 's3', name: 'S_3', trans: 'tonT1.Q', actions: [
        { id: 'a2', q: 'L', time: 'T#2s', text: 'Leuchte an', var: 'H1', cond: '' },
        { id: 'a3', q: 'D', time: 'T#3s', text: 'Wartezeit 3s', var: 'tonT1', cond: '' },
      ] },
    ],
    back: true,
  };
}

// ---------- Zuordnungstabelle: Reihenfolge und Adressen ----------

const IO_ORDER = { in: 0, out: 1, mem: 2, tim: 3 };
const IO_AREA = { in: 'I', out: 'Q', mem: 'M' };

/** Adresse %I0.3 / %Q1.7 / %M2.0 → [Byte, Bit] (sonst null). */
export function spsAddrKey(addr) {
  const m = /^%?\s*[IQM]\s*(\d+)\.(\d+)/i.exec(String(addr ?? '').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Sortierschlüssel einer Zeile: Art (IN, OUT, Merker, Zeitglied), dann Adresse, dann Name. */
function ioKey(x) {
  const a = spsAddrKey(x?.addr);
  return [IO_ORDER[x?.kind] ?? 9, a ? a[0] : 1e9, a ? a[1] : 1e9, String(x?.name ?? '')];
}
function cmpKey(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a[3].localeCompare(b[3], 'de', { numeric: true });
}

/** Ganze Tabelle sortieren: IN, OUT, Merker, Zeitglieder – je nach Adresse (ändert `io`). */
export function spsSortIo(io) {
  return io.sort((a, b) => cmpKey(ioKey(a), ioKey(b)));
}

/** Nächste freie Adresse einer Art (Bit 0–7, dann nächstes Byte); Zeitglieder: ''. */
export function spsNextAddr(io, kind) {
  const area = IO_AREA[kind];
  if (!area) return '';
  const used = (io || []).filter((x) => x.kind === kind).map((x) => spsAddrKey(x.addr)).filter(Boolean);
  if (!used.length) return `%${area}0.0`;
  const [b, bit] = used.reduce((m, k) => (k[0] > m[0] || (k[0] === m[0] && k[1] > m[1]) ? k : m));
  return bit >= 7 ? `%${area}${b + 1}.0` : `%${area}${b}.${bit + 1}`;
}

/**
 * Neue Zeile an ihren Platz: hinter die letzte Zeile gleicher Art mit kleinerer Adresse – auch wenn die
 * Lehrkraft von Hand umsortiert hat, bleibt der Rest, wie er ist. Liefert den Index.
 */
export function spsInsertIo(io, row) {
  const k = ioKey(row);
  let at = -1;
  io.forEach((x, i) => { if (x.kind === row.kind && cmpKey(ioKey(x), k) <= 0) at = i; });
  if (at < 0) {
    const first = io.findIndex((x) => x.kind === row.kind);
    if (first >= 0) at = first - 1;
    else io.forEach((x, i) => { if ((IO_ORDER[x.kind] ?? 9) < (IO_ORDER[row.kind] ?? 9)) at = i; });
  }
  io.splice(at + 1, 0, row);
  return at + 1;
}

/** T#2s, T#500ms, T#1m30s, T#1,5s → Millisekunden (oder NaN). */
export function spsTime(src) {
  const m = /^\s*(?:T|TIME)#(.+)$/i.exec(String(src ?? ''));
  if (!m) return NaN;
  const re = /(\d+(?:[.,]\d+)?)\s*(ms|h|m|s)/gi;
  let total = 0;
  let any = false;
  let rest = m[1].replace(/_/g, '');
  for (const p of rest.matchAll(re)) {
    any = true;
    const v = Number(p[1].replace(',', '.'));
    total += v * { ms: 1, s: 1000, m: 60000, h: 3600000 }[p[2].toLowerCase()];
  }
  rest = rest.replace(re, '').trim();
  return any && !rest ? total : NaN;
}

/**
 * Bedingung → Baum. Erlaubt: AND/&/*, OR/+/|, XOR, NOT/!/ / (Strich vor dem Namen), Klammern, TRUE/FALSE, 1/0,
 * Vergleiche (=, <>, <, <=, >, >=), Zeiten (T#2s), Schrittmerker S_2.X und Schrittzeit S_2.T.
 */
export function spsParse(src) {
  const s = String(src ?? '');
  const toks = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const time = /^(?:T|TIME)#[0-9a-z_.,]+/i.exec(s.slice(i));
    if (time) { const v = spsTime(time[0]); if (!Number.isFinite(v)) throw new LabError(`Zeit „${time[0]}“ unklar (z. B. T#2s, T#500ms)`); toks.push({ t: 'num', v }); i += time[0].length; continue; }
    const id = /^[A-Za-z_ÄÖÜäöüß][A-Za-z0-9_ÄÖÜäöüß]*(?:\.[A-Za-z]+)?/.exec(s.slice(i));
    if (id) {
      const w = id[0];
      const up = w.toUpperCase();
      if (['AND', 'OR', 'XOR', 'NOT'].includes(up)) toks.push({ t: 'op', v: up });
      else if (up === 'TRUE' || up === 'FALSE') toks.push({ t: 'num', v: up === 'TRUE' ? 1 : 0 });
      else toks.push({ t: 'id', v: w });
      i += w.length;
      continue;
    }
    const n = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (n) { toks.push({ t: 'num', v: Number(n[0].replace(',', '.')) }); i += n[0].length; continue; }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    const one = { '&': 'AND', '*': 'AND', '·': 'AND', '∧': 'AND', '+': 'OR', '|': 'OR', '∨': 'OR', '!': 'NOT', '/': 'NOT', '¬': 'NOT', '(': '(', ')': ')', '<': '<', '>': '>', '=': '=' }[c];
    if (!one) throw new LabError(`Unbekanntes Zeichen „${c}“`);
    toks.push({ t: 'op', v: one });
    i++;
  }
  let k = 0;
  const peek = () => toks[k];
  const take = (v) => { if (peek()?.t === 'op' && peek().v === v) { k++; return true; } return false; };
  const bin = (next, ops) => () => {
    let a = next();
    for (;;) {
      const op = ops.find((o) => peek()?.t === 'op' && peek().v === o);
      if (!op) return a;
      k++;
      a = { op, a, b: next() };
    }
  };
  const atom = () => {
    if (take('NOT')) return { op: 'NOT', a: atom() };
    if (take('(')) { const e = orE(); if (!take(')')) throw new LabError('Klammer „)“ fehlt'); return e; }
    const tk = toks[k++];
    if (!tk) throw new LabError('Bedingung endet zu früh');
    if (tk.t === 'num') return { num: tk.v };
    if (tk.t === 'id') return { id: tk.v };
    throw new LabError(`„${tk.v}“ an dieser Stelle unerwartet`);
  };
  const cmp = () => {
    const a = atom();
    const op = ['<=', '>=', '<>', '<', '>', '='].find((o) => peek()?.t === 'op' && peek().v === o);
    if (!op) return a;
    k++;
    return { op, a, b: atom() };
  };
  const andE = bin(cmp, ['AND']);
  const xorE = bin(andE, ['XOR']);
  const orE = bin(xorE, ['OR']);
  if (!toks.length) return { num: 1 };
  const tree = orE();
  if (k < toks.length) throw new LabError(`„${toks[k].v}“ an dieser Stelle unerwartet`);
  return tree;
}

/** Baum auswerten; `get(name)` liefert Zahl/Wahrheitswert (unbekannt: Fehler). */
export function spsEval(tree, get) {
  if ('num' in tree) return tree.num;
  if ('id' in tree) return get(tree.id);
  const a = spsEval(tree.a, get);
  if (tree.op === 'NOT') return a ? 0 : 1;
  const b = spsEval(tree.b, get);
  switch (tree.op) {
    case 'AND': return a && b ? 1 : 0;
    case 'OR': return a || b ? 1 : 0;
    case 'XOR': return !a !== !b ? 1 : 0;
    case '=': return a === b ? 1 : 0;
    case '<>': return a !== b ? 1 : 0;
    case '<': return a < b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
    default: return 0;
  }
}

/** Signal eines Eingangs aus dem Zustand des Bedienelements: Öffner liefert unbetätigt 1. */
export function spsInputSignal(io, pressed) {
  return io?.contact === 'NC' ? (pressed ? 0 : 1) : pressed ? 1 : 0;
}

export const spsIsStep = (e) => !!e && typeof e === 'object' && e.type !== 'alt' && e.type !== 'par';

/** Jedes Element der Kette (auch in Zweigen) mit seiner Liste, Stelle und den umgebenden Elementen. */
export function spsWalk(list, fn, parents = []) {
  (Array.isArray(list) ? list : []).forEach((el, index) => {
    if (!el || typeof el !== 'object') return;
    fn(el, list, index, parents);
    if (!spsIsStep(el)) for (const b of el.branches || []) spsWalk(b.steps, fn, [...parents, el, b]);
  });
}

/** Alle Schritte der Kette in Lesereihenfolge (Zweige von links nach rechts). */
export function spsFlat(st) {
  const out = [];
  spsWalk(st?.steps, (el) => { if (spsIsStep(el)) out.push(el); });
  return out;
}

/** Element (Schritt, Verzweigung) oder Zweig zu einer ID: { el, list, index, parents } bzw. { branch, fork }. */
export function spsLocate(st, id) {
  let found = null;
  spsWalk(st?.steps, (el, list, index, parents) => {
    if (found) return;
    if (el.id === id) found = { el, list, index, parents };
    else if (!spsIsStep(el)) {
      const b = (el.branches || []).find((x) => x.id === id);
      if (b) found = { branch: b, fork: el, parents: [...parents, el] };
    }
  });
  return found;
}

const spsAnd = (a, b) => {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  return x && y ? `(${x}) AND (${y})` : x || y;
};

/**
 * Die Kette als Graph: Transitionen { from: [Schritt-IDs], to: [Schritt-IDs], cond, where } in der Reihenfolge,
 * in der sie Vorrang haben (Alternativzweige von links nach rechts). `uses`: Schritte, deren trans gilt.
 */
export function spsGraph(st) {
  const flat = spsFlat(st);
  const byName = new Map(flat.map((s) => [String(s.name ?? '').trim(), s]));
  const trans = [];
  const uses = new Set();
  const problems = [];
  const link = (pending, to) => {
    for (const p of pending) if (p.from.length && to.length) trans.push({ from: p.from, to, cond: p.cond, where: p.where });
  };
  // pending: Ausgänge, die noch ein Ziel brauchen ({ from, cond, where }); null = nichts kommt herein.
  function seq(list, pending, ctx) {
    const items = (Array.isArray(list) ? list : []).filter((el) => el && typeof el === 'object');
    items.forEach((el, i) => {
      const next = items[i + 1];
      if (el.type === 'alt') {
        if (!pending) problems.push('Eine Alternativverzweigung braucht einen Schritt davor');
        const out = [];
        (el.branches || []).forEach((b, k) => {
          const where = `Zweig ${k + 1} der Verzweigung`;
          let p = (pending || []).map((q) => ({ from: q.from, cond: spsAnd(q.cond, b.trans), where }));
          p = seq(b.steps, p, 'alt');
          const jump = String(b.jump ?? '').trim();
          if (jump) {
            const target = byName.get(jump);
            if (target) link(p, [target.id]);
            else problems.push(`Sprung zu „${jump}“: diesen Schritt gibt es nicht`);
          } else out.push(...p);
        });
        pending = out;
      } else if (el.type === 'par') {
        const branches = (el.branches || []).filter((b) => (b.steps || []).length);
        if (branches.length < (el.branches || []).length) problems.push('Ein Parallelzweig ist leer');
        if (branches.some((b) => !spsIsStep(b.steps[0]))) problems.push('Ein Parallelzweig muss mit einem Schritt beginnen');
        if (pending) link(pending, branches.map((b) => b.steps[0]).filter(spsIsStep).map((x) => x.id));
        const tails = branches.flatMap((b) => seq(b.steps, null, 'par'));
        if (tails.some((t) => String(t.cond ?? '').trim())) problems.push('Ein Parallelzweig muss mit einem Schritt enden');
        pending = [{ from: [...new Set(tails.flatMap((t) => t.from))], cond: el.trans, where: 'Transition nach der Synchronisation' }];
      } else {
        if (pending) link(pending, [el.id]);
        // Keine eigene Transition: vor einer Alternativverzweigung, als letzter Schritt eines Parallelzweigs.
        const own = next ? next.type !== 'alt' : ctx !== 'par';
        if (own) uses.add(el.id);
        pending = [{ from: [el.id], cond: own ? el.trans : '', where: `Transition nach ${el.name}` }];
      }
    });
    return pending || [];
  }
  const top = Array.isArray(st?.steps) ? st.steps : [];
  if (top.length && !spsIsStep(top[0])) problems.push('Die Kette muss mit einem Schritt beginnen');
  const end = seq(top, null, 'top');
  if (st?.back !== false) {
    const init = flat.find((s) => s.initial) || flat[0];
    if (init) link(end, [init.id]);
  }
  return { flat, trans, uses, problems };
}

/** Laufzeit neu: Initialschritt(e) aktiv. */
export function spsInit(st) {
  const steps = spsFlat(st);
  const init = steps.filter((s) => s.initial);
  const active = (init.length ? init : steps.slice(0, 1)).map((s) => s.id);
  return { t: 0, cycle: 0, active, since: Object.fromEntries(active.map((id) => [id, 0])), entered: new Set(active), stored: {}, timers: {}, vars: {}, error: null };
}

/**
 * Ein Programmzyklus (dt ms): Transitionen schalten, dann Aktionen nach Bestimmungszeichen.
 * `inputs`: Name → Signal (0/1). Ergebnis: rt (verändert) mit vars (alle Variablen), active, error.
 */
export function spsCycle(st, rt, inputs, dt) {
  const graph = spsGraph(st);
  const steps = graph.flat;
  const byName = new Map(steps.map((s) => [String(s.name ?? '').trim(), s]));
  rt.t += dt;
  rt.cycle++;
  rt.error = null;
  const known = new Set((st.io || []).map((io) => String(io.name ?? '').trim()).filter(Boolean));
  const get = (name) => {
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      const step = byName.get(name.slice(0, dot));
      const what = name.slice(dot + 1).toUpperCase();
      if (step && what === 'X') return rt.active.includes(step.id) ? 1 : 0;
      if (step && what === 'T') return rt.active.includes(step.id) ? rt.t - (rt.since[step.id] ?? rt.t) : 0;
    }
    if (byName.has(name)) return rt.active.includes(byName.get(name).id) ? 1 : 0;
    // Zeitglied (oder jede Variable) mit .Q: ihr Ausgang – z. B. tonT1.Q nach „D T#3s tonT1“.
    if (/\.Q$/i.test(name) && known.has(name.slice(0, -2))) return rt.vars[name.slice(0, -2)] ? 1 : 0;
    if (name in inputs) return inputs[name] ? 1 : 0;
    if (known.has(name)) return rt.vars[name] ? 1 : 0;
    throw new LabError(`„${name}“ steht nicht in der Zuordnungstabelle`);
  };
  const cond = (src, where) => {
    try { return spsEval(spsParse(src), get); } catch (e) {
      if (!rt.error) rt.error = `${where}: ${e.message}`;
      return 0;
    }
  };
  // INIT (st.init: Eingang oder Merker): Kette in den Initialschritt, solange er 1 ist – wie xINIT beim
  // Standard-Ablaufkettenbaustein. Gespeicherte (S) Aktionen bleiben; Zeiten der Schritte beginnen neu.
  const initName = String(st.init ?? '').trim();
  if (initName && (inputs[initName] ?? rt.vars[initName])) {
    const init = steps.filter((s) => s.initial);
    rt.active = (init.length ? init : steps.slice(0, 1)).map((s) => s.id);
    for (const id of rt.active) rt.since[id] = rt.t;
    rt.timers = {};
  }
  // 1. Transitionen, deren Schritte davor alle aktiv sind (mit dem Stand vom Anfang des Zyklus).
  // Ein Schritt gibt nur einmal ab: Bei Alternativen hat der linke Zweig Vorrang.
  const fire = [];
  if (rt.cycle > 1 && !(initName && (inputs[initName] ?? rt.vars[initName]))) {
    const used = new Set();
    for (const t of graph.trans) {
      if (!t.from.every((id) => rt.active.includes(id)) || t.from.some((id) => used.has(id))) continue;
      if (cond(t.cond, t.where)) { fire.push(t); t.from.forEach((id) => used.add(id)); }
    }
  }
  rt.entered = rt.cycle === 1 ? new Set(rt.active) : new Set();
  // Die Schrittzeit beginnt im Zyklus, in dem der Schritt aktiv wird (beim Start der Initialschritt).
  if (rt.cycle === 1) for (const id of rt.active) rt.since[id] = rt.t;
  if (fire.length) {
    const off = new Set(fire.flatMap((t) => t.from));
    const on = fire.flatMap((t) => t.to);
    rt.active = [...rt.active.filter((id) => !off.has(id)), ...on.filter((b, i, l) => l.indexOf(b) === i)];
    for (const b of on) { rt.since[b] = rt.t; rt.entered.add(b); }
  }
  // 2. Aktionen
  const on = {};
  const reset = {};
  for (const step of steps) {
    const act = rt.active.includes(step.id);
    const el = act ? rt.t - (rt.since[step.id] ?? rt.t) : 0;
    const entered = rt.entered.has(step.id);
    for (const a of step.actions || []) {
      const v = String(a.var ?? '').trim();
      if (!v) continue;
      const key = `${step.id}:${a.id}`;
      const T = SPS_TIMED.includes(a.q) ? spsTime(a.time) : 0;
      if (SPS_TIMED.includes(a.q) && !Number.isFinite(T)) { if (act && !rt.error) rt.error = `${step.name}: Zeit fehlt bei ${a.q} (z. B. T#2s)`; continue; }
      const ok = () => !String(a.cond ?? '').trim() || cond(a.cond, `${step.name}, Bedingung zu ${v}`);
      switch (a.q) {
        case 'N': if (act && ok()) on[v] = 1; break;
        case 'S': if (act && ok()) rt.stored[v] = 1; break;
        case 'R': if (act && ok()) { reset[v] = 1; rt.stored[v] = 0; for (const [tk, tm] of Object.entries(rt.timers)) if (tm.var === v) delete rt.timers[tk]; } break;
        case 'L': if (act && el < T && ok()) on[v] = 1; break;
        case 'D': if (act && el >= T && ok()) on[v] = 1; break;
        case 'P': if (act && entered && ok()) on[v] = 1; break;
        case 'DS': if (act && el >= T && ok()) rt.stored[v] = 1; break;
        case 'SD': if (entered && ok()) rt.timers[key] = { var: v, start: rt.t, kind: 'SD', T }; break;
        case 'SL': if (entered && ok()) rt.timers[key] = { var: v, start: rt.t, kind: 'SL', T }; break;
        default: break;
      }
    }
  }
  for (const [tk, tm] of Object.entries(rt.timers)) {
    if (reset[tm.var]) { delete rt.timers[tk]; continue; }
    if (tm.kind === 'SD' && rt.t - tm.start >= tm.T) { rt.stored[tm.var] = 1; delete rt.timers[tk]; }
    else if (tm.kind === 'SL') { if (rt.t - tm.start < tm.T) on[tm.var] = 1; else delete rt.timers[tk]; }
  }
  const vars = { ...inputs };
  for (const io of st.io || []) {
    const n = String(io.name ?? '').trim();
    if (!n || io.kind === 'in') continue;
    vars[n] = !reset[n] && (on[n] || rt.stored[n]) ? 1 : 0;
  }
  rt.vars = vars;
  return rt;
}

/** Prüfen ohne Ausführen: Fehler in Bedingungen, unbekannte Namen, doppelte Symbole. */
export function spsCheck(st) {
  const out = [];
  const names = (st.io || []).map((io) => String(io.name ?? '').trim()).filter(Boolean);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) out.push(`Symbol doppelt: ${[...new Set(dup)].join(', ')}`);
  const graph = spsGraph(st);
  const stepList = graph.flat.map((s) => String(s.name ?? '').trim());
  const dupSteps = stepList.filter((n, i) => n && stepList.indexOf(n) !== i);
  if (dupSteps.length) out.push(`Schrittname doppelt: ${[...new Set(dupSteps)].join(', ')}`);
  out.push(...graph.problems);
  const known = new Set([...names, ...stepList]);
  const check = (src, where) => {
    try {
      const walk = (t) => {
        if ('id' in t) {
          const base = t.id.includes('.') ? t.id.slice(0, t.id.lastIndexOf('.')) : t.id; // S_2.T, tonT1.Q
          if (!known.has(base)) out.push(`${where}: „${t.id}“ steht nicht in der Zuordnungstabelle`);
        } else if (t.a) { walk(t.a); if (t.b) walk(t.b); }
      };
      walk(spsParse(src));
    } catch (e) { out.push(`${where}: ${e.message}`); }
  };
  for (const t of graph.trans) check(t.cond, t.where);
  for (const s of graph.flat) {
    for (const a of s.actions || []) {
      if (String(a.cond ?? '').trim()) check(a.cond, `${s.name}, Bedingung`);
      if (SPS_TIMED.includes(a.q) && !Number.isFinite(spsTime(a.time))) out.push(`${s.name}: ${a.q} braucht eine Zeit (T#2s)`);
      if (a.var && !names.includes(String(a.var).trim())) out.push(`${s.name}: „${a.var}“ steht nicht in der Zuordnungstabelle`);
    }
  }
  return [...new Set(out)];
}

/**
 * Bild der Kette wie im Arbeitsblatt (Schritt, Transition, Aktionsblock A1–A4); aktive Schritte grün.
 * Verzweigungen: Alternativ mit einfacher Linie (jeder Zweig mit eigener Transition), parallel mit
 * Doppellinie; ein Sprung endet als Pfeil mit dem Namen des Ziels.
 * Mit edit: (+) und anklickbare Bereiche (data-step, data-trans, data-act, data-add-step, data-add-act,
 * data-fork, data-btrans, data-ptrans, data-add-branch, data-add-first).
 */
export function spsSvg(state, { active = [], vars = {}, edit = false } = {}) {
  const st = { ...spsDefault(), ...(state || {}) };
  const graph = spsGraph(st);
  const flat = graph.flat;
  const CH = 0.19; // Breite eines Zeichens bei 0,36
  const SW = 1.3;
  const SH = 0.95;
  const TR = 1.1; // Verbindung mit Transition
  const RH = 0.55; // Zeile im Aktionsblock
  const GAP = 0.5; // zwischen Zweigen
  const w1 = 0.95;
  const w2 = Math.max(2.4, ...flat.flatMap((s) => (s.actions || []).map((a) => String(a.text ?? '').length * CH + 0.4)));
  const w3 = Math.max(1.2, ...flat.flatMap((s) => (s.actions || []).map((a) => String(a.var ?? '').length * CH + 0.4)));
  const AW = w1 + w2 + w3;
  const ink = '#111';
  const tw = (c) => String(c ?? '').length * CH + 0.5; // Platz für eine Bedingung links der Linie
  const condText = (c) => String(c ?? '') || (edit ? '(Bedingung)' : '');
  const blockH = (s) => (s.actions || []).reduce((h, a) => h + RH * (String(a.cond ?? '').trim() ? 2 : 1), 0);
  const plus = (x, y, attr, title) => (edit ? `<g ${attr} style="cursor:pointer"><title>${escX(title)}</title><circle cx="${r3(x)}" cy="${r3(y)}" r="0.22" fill="#ffffff" stroke="#2563eb" stroke-width="0.03"/>`
    + `<text x="${r3(x)}" y="${r3(y + 0.11)}" font-size="0.32" text-anchor="middle" fill="#2563eb" ${FONT}>+</text></g>` : '');
  const initName = () => String((flat.find((x) => x.initial) || flat[0])?.name ?? '');
  /** Transition an (x, y): Strich, Bedingung links, klickbar über `attr`. */
  const transMark = (x, y, c, attr) => {
    let o = line(x - 0.2, y, x + 0.2, y, ink, 0.05);
    o += `<g ${attr}${edit ? ' style="cursor:pointer"' : ''}>`;
    if (edit) o += `<rect x="${r3(x - tw(condText(c)) - 0.2)}" y="${r3(y - 0.3)}" width="${r3(tw(condText(c)) + 0.4)}" height="0.6" fill="transparent"/>`;
    o += text(x - 0.3, y + 0.12, condText(c), { size: 0.34, anchor: 'end', fill: c ? '#222' : '#94a3b8' });
    return `${o}</g>`;
  };
  const jumpMark = (x, y, name) => arrow(x, y, x, y + 0.5, ink, 0.03, 0.15) + text(x + 0.15, y + 0.5, String(name ?? ''), { size: 0.3, fill: '#444' });

  // Jedes Teil: { w, h, cx, draw(ox, oy) } – die Linie kommt bei (ox+cx, oy) an und geht bei (ox+cx, oy+h) weiter.
  function stepBox(s) {
    const own = graph.uses.has(s.id);
    const hh = Math.max(SH, blockH(s));
    const L = SW / 2 + (own ? Math.max(1.2, tw(condText(s.trans))) : 0.3);
    const R = SW / 2 + ((s.actions || []).length ? 0.45 + AW + (edit ? 0.7 : 0.1) : (edit ? 0.8 : 0.2));
    const H = hh + (own ? TR : 0.45);
    return {
      w: L + R, h: H, cx: L,
      draw(ox, oy) {
        const cx = ox + L;
        const SX = cx - SW / 2;
        const sy = oy + (hh - SH) / 2;
        const isOn = active.includes(s.id);
        let o = '';
        if (sy > oy) o += line(cx, oy, cx, sy, ink, 0.03);
        o += `<g data-step="${escX(s.id)}">`;
        o += `<rect x="${r3(SX)}" y="${r3(sy)}" width="${SW}" height="${SH}" fill="${isOn ? '#bbf7d0' : '#ffffff'}" stroke="${ink}" stroke-width="0.04"/>`;
        if (s.initial) o += `<rect x="${r3(SX + 0.1)}" y="${r3(sy + 0.1)}" width="${r3(SW - 0.2)}" height="${r3(SH - 0.2)}" fill="none" stroke="${ink}" stroke-width="0.03"/>`;
        o += text(cx, sy + SH / 2 + 0.13, String(s.name ?? ''), { size: 0.36, anchor: 'middle' });
        o += '</g>';
        o += line(cx, sy + SH, cx, oy + H, ink, 0.03);
        if (own) {
          const ty = oy + hh + TR / 2;
          o += transMark(cx, ty, s.trans, `data-trans="${escX(s.id)}"`);
          o += plus(cx + 0.55, ty, `data-add-step="${escX(s.id)}"`, 'Schritt danach einfügen');
        } else o += plus(cx + 0.55, oy + hh + 0.22, `data-add-step="${escX(s.id)}"`, 'Schritt danach einfügen');
        // Aktionsblock
        const AX = SX + SW + 0.45;
        if (!(s.actions || []).length) o += plus(AX, sy + SH / 2, `data-add-act="${escX(s.id)}"`, 'Aktion hinzufügen');
        else {
          o += line(SX + SW, sy + SH / 2, AX, sy + SH / 2, ink, 0.03);
          let ay = oy + (hh - blockH(s)) / 2;
          for (const a of s.actions) {
            // Nur im aktiven Schritt grün: Dieselbe Variable steht oft in mehreren Schritten.
            const val = isOn && vars[String(a.var ?? '').trim()];
            const q = `${a.q || ''}${SPS_TIMED.includes(a.q) && a.time ? ` ${a.time}` : ''}`;
            o += `<g data-act="${escX(s.id)}|${escX(a.id)}"${edit ? ' style="cursor:pointer"' : ''}>`;
            o += `<rect x="${r3(AX)}" y="${r3(ay)}" width="${r3(AW)}" height="${RH}" fill="${val ? '#bbf7d0' : '#ffffff'}" stroke="${ink}" stroke-width="0.03"/>`;
            o += line(AX + w1, ay, AX + w1, ay + RH, ink, 0.03) + line(AX + w1 + w2, ay, AX + w1 + w2, ay + RH, ink, 0.03);
            o += text(AX + 0.08, ay + RH / 2 + 0.11, q, { size: q.length > 4 ? 0.24 : 0.32 });
            o += text(AX + w1 + w2 / 2, ay + RH / 2 + 0.12, String(a.text ?? ''), { size: 0.32, anchor: 'middle' });
            o += text(AX + w1 + w2 + w3 / 2, ay + RH / 2 + 0.12, String(a.var ?? ''), { size: 0.32, anchor: 'middle', bold: !!val });
            o += '</g>';
            ay += RH;
            if (String(a.cond ?? '').trim()) {
              o += `<rect x="${r3(AX)}" y="${r3(ay)}" width="${r3(AW)}" height="${RH}" fill="#ffffff" stroke="${ink}" stroke-width="0.03"/>`;
              o += text(AX + AW / 2, ay + RH / 2 + 0.12, String(a.cond), { size: 0.3, anchor: 'middle' });
              ay += RH;
            }
          }
          o += plus(AX + AW + 0.4, ay - RH / 2, `data-add-act="${escX(s.id)}"`, 'Aktion hinzufügen');
        }
        return o;
      },
    };
  }

  function seqBox(list) {
    const boxes = (Array.isArray(list) ? list : []).filter((el) => el && typeof el === 'object')
      .map((el) => (el.type === 'alt' ? altBox(el) : el.type === 'par' ? parBox(el) : stepBox(el)));
    if (!boxes.length) return { w: 0.8, h: 0, cx: 0.4, draw: () => '' };
    const L = Math.max(...boxes.map((b) => b.cx));
    const R = Math.max(...boxes.map((b) => b.w - b.cx));
    return {
      w: L + R, h: boxes.reduce((sum, b) => sum + b.h, 0), cx: L,
      draw(ox, oy) {
        let y = oy;
        let o = '';
        for (const b of boxes) { o += b.draw(ox + L - b.cx, y); y += b.h; }
        return o;
      },
    };
  }

  /** Zweige nebeneinander: Spalten mit Linie bei cols[i].x (relativ), Breite gesamt. */
  function columns(branches, head) {
    let x = 0;
    const cols = branches.map((b, i) => {
      const inner = seqBox(b.steps);
      const L = Math.max(inner.cx, head(b, i), 0.5);
      const R = Math.max(inner.w - inner.cx, edit ? 0.9 : 0.4);
      const col = { b, inner, x: x + L };
      x += L + R + GAP;
      return col;
    });
    return { cols, w: Math.max(0.8, x - GAP) };
  }

  function altBox(el) {
    const branches = el.branches || [];
    const { cols, w } = columns(branches, (b) => tw(condText(b.trans)) + 0.2);
    const inH = Math.max(0, ...cols.map((c) => c.inner.h));
    const anyJoin = cols.some((c) => !String(c.b.jump ?? '').trim());
    const H = 0.15 + TR + inH + (anyJoin ? 0.35 + 0.35 : 0.6);
    const cx0 = cols[0]?.x ?? 0.4;
    return {
      w: w + (edit ? 0.5 : 0), h: H, cx: cx0,
      draw(ox, oy) {
        const yd = oy + 0.15;
        let o = line(ox + cx0, oy, ox + cx0, yd, ink, 0.03);
        const xs = cols.map((c) => ox + c.x);
        // Auseinander: einfache Linie (anklickbar: Verzweigung bearbeiten)
        o += `<g data-fork="${escX(el.id)}"${edit ? ' style="cursor:pointer"' : ''}>`;
        if (edit) o += `<rect x="${r3(Math.min(...xs, ox + cx0) - 0.1)}" y="${r3(yd - 0.15)}" width="${r3(Math.max(...xs, ox + cx0) - Math.min(...xs, ox + cx0) + 0.2)}" height="0.3" fill="transparent"/>`;
        o += line(Math.min(...xs, ox + cx0), yd, Math.max(...xs, ox + cx0), yd, ink, 0.04);
        o += '</g>';
        o += plus(Math.max(...xs) + 0.45, yd, `data-add-branch="${escX(el.id)}"`, 'Zweig hinzufügen');
        const yc = yd + TR + inH + 0.35;
        const joins = [];
        for (const c of cols) {
          const x = ox + c.x;
          o += line(x, yd, x, yd + TR, ink, 0.03);
          o += transMark(x, yd + TR / 2, c.b.trans, `data-btrans="${escX(el.id)}|${escX(c.b.id)}"`);
          o += c.inner.draw(x - c.inner.cx, yd + TR);
          const end = yd + TR + c.inner.h;
          if (!(c.b.steps || []).length) o += plus(x + 0.45, end - 0.1 > yd + TR / 2 + 0.3 ? end - 0.1 : yd + TR - 0.15, `data-add-first="${escX(el.id)}|${escX(c.b.id)}"`, 'Schritt in den Zweig');
          const jump = String(c.b.jump ?? '').trim();
          if (jump) o += jumpMark(x, end, jump);
          else { o += line(x, end, x, yc, ink, 0.03); joins.push(x); }
        }
        // Zusammen: einfache Linie, weiter auf der Linie des ersten Zweigs
        if (anyJoin) {
          o += line(Math.min(...joins, ox + cx0), yc, Math.max(...joins, ox + cx0), yc, ink, 0.04);
          o += line(ox + cx0, yc, ox + cx0, oy + H, ink, 0.03);
        }
        return o;
      },
    };
  }

  function parBox(el) {
    const branches = el.branches || [];
    const { cols, w } = columns(branches, (b, i) => (i === 0 ? tw(condText(el.trans)) + 0.2 : 0.5));
    const inH = Math.max(0, ...cols.map((c) => c.inner.h));
    const H = 0.2 + 0.08 + 0.3 + inH + 0.3 + 0.08 + TR;
    const cx0 = cols[0]?.x ?? 0.4;
    return {
      w: w + (edit ? 0.5 : 0), h: H, cx: cx0,
      draw(ox, oy) {
        const xs = cols.map((c) => ox + c.x);
        const x1 = Math.min(...xs, ox + cx0) - 0.15;
        const x2 = Math.max(...xs, ox + cx0) + 0.15;
        const dbl = (y) => line(x1, y, x2, y, ink, 0.035) + line(x1, y + 0.08, x2, y + 0.08, ink, 0.035);
        const yt = oy + 0.2;
        let o = line(ox + cx0, oy, ox + cx0, yt, ink, 0.03);
        o += `<g data-fork="${escX(el.id)}"${edit ? ' style="cursor:pointer"' : ''}>`;
        if (edit) o += `<rect x="${r3(x1)}" y="${r3(yt - 0.12)}" width="${r3(x2 - x1)}" height="0.32" fill="transparent"/>`;
        o += `${dbl(yt)}</g>`;
        o += plus(x2 + 0.35, yt + 0.04, `data-add-branch="${escX(el.id)}"`, 'Zweig hinzufügen');
        const yb = yt + 0.08 + 0.3 + inH + 0.3;
        for (const c of cols) {
          const x = ox + c.x;
          const top = yt + 0.08;
          o += line(x, top, x, top + 0.3, ink, 0.03);
          o += c.inner.draw(x - c.inner.cx, top + 0.3);
          if (!(c.b.steps || []).length) o += plus(x + 0.45, top + 0.3, `data-add-first="${escX(el.id)}|${escX(c.b.id)}"`, 'Schritt in den Zweig');
          o += line(x, top + 0.3 + c.inner.h, x, yb, ink, 0.03);
        }
        o += dbl(yb);
        const ty = yb + 0.08 + TR / 2;
        o += line(ox + cx0, yb + 0.08, ox + cx0, oy + H, ink, 0.03);
        o += transMark(ox + cx0, ty, el.trans, `data-ptrans="${escX(el.id)}"`);
        return o;
      },
    };
  }

  const root = seqBox(st.steps);
  const last = (st.steps || [])[st.steps.length - 1];
  const open = !(last?.type === 'alt' && (last.branches || []).every((b) => String(b.jump ?? '').trim()));
  const back = st.back !== false && open && flat.length > 0;
  const W = root.w + 0.5;
  const H = 0.4 + root.h + (back ? 0.8 : 0.3);
  let out = svgOpen(W, H);
  out += root.draw(0.2, 0.4);
  if (back) out += jumpMark(0.2 + root.cx, 0.4 + root.h, initName());
  return `${out}</svg>`;
}

// ==================== Vorgabe + Schülerstand, Prüfen, Zeichnen ====================

const DEFAULTS = { zeiger: zeigerDefault, bode: bodeDefault, ortskurve: ortskurveDefault, logik: logikDefault, sps: spsDefault };
/** Listen, deren Einträge die Lehrkraft einzeln mit locked: true festlegen kann. */
const LOCKABLE = { zeiger: ['items'], bode: ['params', 'curves'], ortskurve: ['params', 'curves'], logik: ['parts', 'wires'], sps: ['io', 'steps'] };

export function labDefault(name) {
  return DEFAULTS[name] ? DEFAULTS[name]() : {};
}

/** Wirksamer Stand: Vorgabe (oder Grundeinstellung) mit dem Stand des Schülers; Festes aus der Vorgabe gilt. */
export function labMerge(name, preset, state) {
  const base = preset && typeof preset === 'object' && Object.keys(preset).length ? preset : labDefault(name);
  if (!state || typeof state !== 'object') return JSON.parse(JSON.stringify(base));
  const out = { ...JSON.parse(JSON.stringify(base)), ...JSON.parse(JSON.stringify(state)) };
  for (const key of LOCKABLE[name] || []) {
    const fixed = (Array.isArray(base[key]) ? base[key] : []).filter((x) => x && x.locked);
    if (name === 'logik' && key === 'wires' && base.lockAll) {
      out.wires = [...(base.wires || []), ...(Array.isArray(state.wires) ? state.wires : []).filter((w) => !(base.wires || []).some((b) => b.from === w.from && b.to === w.to && (b.pin ?? 0) === (w.pin ?? 0)))];
      continue;
    }
    const mine = (Array.isArray(state[key]) ? state[key] : []).filter((x) => x && !fixed.some((f) => f.id !== undefined && f.id === x.id));
    // Feste an ihrer Stelle in der Vorgabe-Reihenfolge, dann die eigenen.
    out[key] = [...fixed.map((f) => JSON.parse(JSON.stringify(f))), ...mine.filter((x) => !x.locked)];
  }
  // Feste Eingänge der Logik: Der Schüler darf sie trotzdem schalten.
  if (name === 'logik') {
    const on = new Map((Array.isArray(state.parts) ? state.parts : []).map((p) => [p?.id, p?.on]));
    out.parts = (out.parts || []).map((p) => (p.type === 'in' && on.has(p.id) ? { ...p, on: on.get(p.id) } : p));
  }
  // SPS: vorgegebene Anlage (🔒) gilt, wie die Lehrkraft sie gebaut hat – Schüler bedienen sie nur.
  if (name === 'sps' && base.plant?.locked) out.plant = JSON.parse(JSON.stringify(base.plant));
  if (name === 'logik' && base.lockAll) {
    const ids = new Set((base.parts || []).map((p) => p.id));
    out.parts = [...(base.parts || []).map((p) => ({ ...p, locked: true, on: (state.parts || []).find((q) => q.id === p.id)?.on ?? p.on })),
      ...(Array.isArray(state.parts) ? state.parts : []).filter((p) => !ids.has(p.id))];
  }
  return out;
}

/** Fehler eines Labor-Bausteins (für validateDocSpec). */
export function labValidate(block) {
  const errors = [];
  if (!LAB_NAMES.includes(block?.lab)) errors.push(`lab: eines von ${LAB_NAMES.join(', ')}.`);
  if (block?.preset !== undefined) {
    if (!block.preset || typeof block.preset !== 'object' || Array.isArray(block.preset)) errors.push('preset: Objekt mit der Vorgabe des Labors.');
    else if (JSON.stringify(block.preset).length > LAB_MAX_JSON) errors.push('preset: zu groß.');
    else {
      const p = block.preset;
      const listMax = { items: 80, params: 30, curves: 10, parts: 200, wires: 400, io: 120, steps: 80 };
      for (const [k, max] of Object.entries(listMax)) {
        if (p[k] !== undefined && (!Array.isArray(p[k]) || p[k].length > max)) errors.push(`preset.${k}: Liste mit höchstens ${max} Einträgen.`);
      }
      if (block.lab === 'sps' && p.plant !== undefined && (!p.plant || typeof p.plant !== 'object' || !Array.isArray(p.plant.items) || p.plant.items.length > 200)) {
        errors.push('preset.plant: { w, h, items: [...] } mit höchstens 200 Elementen.');
      }
      if (block.lab === 'logik' && Array.isArray(p.parts)) {
        for (const part of p.parts) if (!LOGIK_TYPES[part?.type]) { errors.push(`preset.parts: unbekannter Typ „${part?.type}“ (${Object.keys(LOGIK_TYPES).join(', ')}).`); break; }
      }
      if ((block.lab === 'bode' || block.lab === 'ortskurve') && Array.isArray(p.curves)) {
        for (const c of p.curves) {
          try { parseExpr(String(c?.expr ?? '')); } catch (e) { errors.push(`preset.curves: „${c?.expr}“ – ${e.message}.`); break; }
        }
      }
    }
  }
  return errors;
}

/**
 * Texte für LibreOffice (Druck über die Vorlage): Bei Schriftgrößen unter 1 Einheit (hier cm) lässt es
 * zentrierten und rechtsbündigen Text weg. Deshalb jeder Text 100-fach groß und mit scale(0.01) zurück –
 * im Browser sieht das gleich aus.
 */
export function svgPrintTexts(svg) {
  return String(svg).replace(/<text\b([^>]*)>/g, (m, attrs) => {
    if (/\btransform=/.test(attrs)) return m;
    let a = attrs;
    for (const k of ['x', 'y', 'font-size']) {
      a = a.replace(new RegExp(`(\\s${k}=")(-?[\\d.]+)(")`), (_q, pre, v, post) => `${pre}${r3(Number(v) * 100)}${post}`);
    }
    return `<text transform="scale(0.01)"${a}>`;
  });
}

/** SVG des Labors (Vorgabe bzw. Stand) – für Anzeige ohne Bedienung, Druck und „Aufs Blatt“. */
export function labSvg(block, state = null, opts = {}) {
  return svgPrintTexts(labSvgRaw(block, state, opts));
}

function labSvgRaw(block, state = null, opts = {}) {
  const st = labMerge(block?.lab, block?.preset, state);
  try {
    switch (block?.lab) {
      case 'zeiger': return zeigerSvg(st, opts);
      case 'bode': return bodeSvg(st, opts);
      case 'ortskurve': return ortskurveSvg(st, opts);
      case 'logik': return logikSvg(st, opts);
      case 'sps': return st.plant && Array.isArray(st.plant.items) ? spsWithPlant(st, opts) : spsSvg(st, opts);
      default: return '';
    }
  } catch (e) {
    return `${svgOpen(10, 1)}${text(0.2, 0.65, `Labor: ${e.message}`, { size: 0.35, fill: '#b00' })}</svg>`;
  }
}

/**
 * SPS-Labor mit Anlage als ein Bild (Druck, „Bild“, Aufs Blatt): Blatt hoch – Anlage unter der Kette,
 * Blatt quer (opts.landscape) – daneben; wie auf dem Bildschirm. Die Anlage ohne Raster und Endlagen.
 */
function spsWithPlant(st, opts = {}) {
  const chain = spsSvg(st, opts);
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(chain);
  const W1 = vb ? Number(vb[1]) : 10;
  const H1 = vb ? Number(vb[2]) : 10;
  const inner = chain.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const plant = JSON.parse(JSON.stringify(st.plant));
  plantUpgrade(plant);
  const p = plantSvgParts(plant, { io: st.io || [], print: true });
  const GAP = 0.6;
  let sc;
  let px;
  let py;
  let W;
  let H;
  if (opts.landscape) {
    const th = Math.max(H1, 7);
    sc = th / p.h;
    px = W1 + GAP;
    py = 0;
    W = px + p.w * sc;
    H = Math.max(H1, th);
  } else {
    const tw = Math.max(W1, 12);
    sc = tw / p.w;
    px = 0;
    py = H1 + GAP;
    W = Math.max(W1, tw);
    H = py + p.h * sc;
  }
  return `${svgOpen(W, H)}<g>${inner}</g><g transform="translate(${r3(px)} ${r3(py)}) scale(${r3(sc)})">${p.defs ? `<defs>${p.defs}</defs>` : ''}${p.body}</g></svg>`;
}

/** Breite des Bildes in cm (aus dem SVG). */
export function labSvgWidthCm(svg) {
  const m = /width="([\d.]+)cm"/.exec(String(svg || ''));
  return m ? Number(m[1]) : 16;
}
