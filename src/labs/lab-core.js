// ==================== LABORE: KERN ====================
//
// Labore sind Bausteine im Dokument ({ type: 'lab', lab: 'zeiger', preset: {…} }), in denen Schüler
// selbst etwas aufbauen: Zeigerdiagramme, Bode-Diagramme, Ortskurven, Logikschaltungen.
// Diese Datei rechnet und zeichnet (SVG) – ohne DOM und ohne import, damit der Server sie für den Druck
// genauso lädt wie der Browser (src/core/browser-module.ts in LearningModules). Bedienung: labs.js und
// die *-ui.js je Labor. "export" nur vor function/const/class am Zeilenanfang.
//
// Stand eines Labors: `preset` (Vorgabe der Lehrkraft) und – je Schüler – `state` mit demselben Aufbau.
// labMerge() setzt beides zusammen: Was die Lehrkraft mit locked: true festlegt, gilt immer.

export const LABS = [
  { name: 'zeiger', label: 'Zeigerlabor', icon: '↗', what: 'Zeiger als komplexe Zahlen zeichnen, verschieben und berechnen' },
  { name: 'bode', label: 'Bode-Diagramm', icon: '〽', what: 'Amplituden- und Phasengang einer Übertragungsfunktion H(jω)' },
  { name: 'ortskurve', label: 'Ortskurve', icon: '⤿', what: 'Ortskurve Z(f) oder H(ω) in der komplexen Ebene' },
  { name: 'logik', label: 'Logikschaltung', icon: '&', what: 'Gatter verbinden, Eingänge schalten, Wahrheitstabelle' },
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

export function zeigerSvg(state, { selected = null } = {}) {
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

// ==================== Vorgabe + Schülerstand, Prüfen, Zeichnen ====================

const DEFAULTS = { zeiger: zeigerDefault, bode: bodeDefault, ortskurve: ortskurveDefault, logik: logikDefault };
/** Listen, deren Einträge die Lehrkraft einzeln mit locked: true festlegen kann. */
const LOCKABLE = { zeiger: ['items'], bode: ['params', 'curves'], ortskurve: ['params', 'curves'], logik: ['parts', 'wires'] };

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
      const listMax = { items: 80, params: 30, curves: 10, parts: 200, wires: 400 };
      for (const [k, max] of Object.entries(listMax)) {
        if (p[k] !== undefined && (!Array.isArray(p[k]) || p[k].length > max)) errors.push(`preset.${k}: Liste mit höchstens ${max} Einträgen.`);
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

/** SVG des Labors (Vorgabe bzw. Stand) – für Anzeige ohne Bedienung, Druck und „Aufs Blatt“. */
export function labSvg(block, state = null, opts = {}) {
  const st = labMerge(block?.lab, block?.preset, state);
  try {
    switch (block?.lab) {
      case 'zeiger': return zeigerSvg(st, opts);
      case 'bode': return bodeSvg(st, opts);
      case 'ortskurve': return ortskurveSvg(st, opts);
      case 'logik': return logikSvg(st, opts);
      default: return '';
    }
  } catch (e) {
    return `${svgOpen(10, 1)}${text(0.2, 0.65, `Labor: ${e.message}`, { size: 0.35, fill: '#b00' })}</svg>`;
  }
}

/** Breite des Bildes in cm (aus dem SVG). */
export function labSvgWidthCm(svg) {
  const m = /width="([\d.]+)cm"/.exec(String(svg || ''));
  return m ? Number(m[1]) : 16;
}
