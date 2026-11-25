import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evalExpr, fmtNum, fmtCx, siFmt, zeigerResolve, zeigerSvg, bodeEval, bodeSvg, ortskurveEval, ortskurveSvg,
  logikEval, logikTruthTable, logikSvg, labMerge, labValidate, labSvg, LabError,
} from '../src/labs/lab-core.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearC = (a, b, eps = 1e-9) => { near(a[0], b[0], eps); near(a[1], b[1], eps); };

test('Formeln: komplex, polar, SI-Vorsätze, Komma, Malpunkt weglassen', () => {
  nearC(evalExpr('3 + j4'), [3, 4]);
  nearC(evalExpr('3+4j'), [3, 4]);
  nearC(evalExpr('j0,5'), [0, 0.5]);
  nearC(evalExpr('10∠90°'), [0, 10]);
  nearC(evalExpr('10/_-90'), [0, -10]);
  nearC(evalExpr('2∠30 * 3∠60'), [0, 6]);
  nearC(evalExpr('1k'), [1000, 0]);
  nearC(evalExpr('4,7µ'), [4.7e-6, 0]);
  nearC(evalExpr('2pi'), [2 * Math.PI, 0]);
  nearC(evalExpr('100 || 100'), [50, 0]);
  nearC(evalExpr('par(100; 100; 100)'), [100 / 3, 0], 1e-9);
  nearC(evalExpr('abs(3+j4)'), [5, 0]);
  nearC(evalExpr('arg(j)'), [90, 0]);
  nearC(evalExpr('conj(1+j)'), [1, -1]);
  nearC(evalExpr('2^3'), [8, 0]);
  nearC(evalExpr('-2^2'), [-4, 0]);
  nearC(evalExpr('u2 / z2', { u2: [10, 0], z2: [0, 5] }), [0, -2]);
  nearC(evalExpr('U*I', { U: [2, 0], i: [3, 0] }), [6, 0]); // Groß/klein egal, wenn eindeutig
  nearC(evalExpr('i1 + i', { i1: [1, 0] }), [1, 1]); // i ohne Variable = imaginäre Einheit
  nearC(evalExpr('1/(1+j*w*R*C)', { w: [1000, 0], R: [1000, 0], C: [1e-6, 0] }), [0.5, -0.5]);
  assert.throws(() => evalExpr('1/0'), LabError);
  assert.throws(() => evalExpr('x + 1'), /„x“ ist unbekannt/);
  assert.throws(() => evalExpr('(1+2'), /„\)“ fehlt/);
  nearC(evalExpr('polar(2, 90)'), [0, 2]);
  nearC(evalExpr('polar(2;0)'), [2, 0]);
});

test('Zahlen schreiben', () => {
  assert.equal(fmtNum(0.5), '0,5');
  assert.equal(fmtNum(-12.3456), '−12,35');
  assert.equal(siFmt(0.0123, 'A'), '12,3 mA');
  assert.equal(siFmt(4700, 'Ω'), '4,7 kΩ');
  assert.equal(fmtCx([3, -4], 'V'), '(3 − j4) V');
  assert.equal(fmtCx([0, 2]), 'j2');
  assert.equal(fmtCx([3, 4], 'V', 'polar'), '5 V ∠ 53,13°');
});

test('Zeiger: Formel, Anker an der Spitze, Kreis erkannt', () => {
  const st = {
    scales: { V: 2, A: 0.5 },
    items: [
      { id: 'u', name: 'U', unit: 'V', value: [10, 0], x0: 1, y0: 0 },
      { id: 'z', name: 'Z', unit: 'Ω', value: [0, 5], show: false },
      { id: 'i', name: 'I', unit: 'A', expr: 'U / Z' },
      { id: 'u2', name: 'U2', unit: 'V', value: [0, 4], anchor: 'u' },
      { id: 'x', name: 'X', expr: 'Y' }, { id: 'y', name: 'Y', expr: 'X' },
    ],
  };
  const r = Object.fromEntries(zeigerResolve(st).map((it) => [it.id, it]));
  nearC(r.i.val, [0, -2]);
  nearC(r.i.tip, [0, -4]);
  nearC(r.u2.start, [6, 0]);
  nearC(r.u2.tip, [6, 2]);
  assert.match(r.x.err, /selbst/);
  const svg = zeigerSvg(st);
  assert.match(svg, /^<svg[^>]+width="14cm"/);
  assert.match(svg, /1 cm ≙ 2 V/);
  assert.match(svg, /1 cm ≙ 0,5 A/);
});

test('Bode: RC-Tiefpass bei der Grenzfrequenz −3 dB / −45°', () => {
  const fg = 1 / (2 * Math.PI * 1000 * 100e-9);
  const d = bodeEval({ params: [{ name: 'R', value: '1k' }, { name: 'C', value: '100n' }], curves: [{ name: 'H', expr: '1/(1+s*R*C)' }], fmin: fg, fmax: fg * 10 }, 10);
  near(d.curves[0].pts[0].db, -3.0103, 1e-3);
  near(d.curves[0].pts[0].ph, -45, 1e-6);
  assert.match(bodeSvg({}), /f in Hz/);
  assert.equal(bodeEval({ curves: [{ expr: '1/(' }] }).curves[0].err, 'Formel endet zu früh');
});

test('Ortskurve: Reihenschwingkreis rein reell bei der Resonanz', () => {
  const d = ortskurveEval({ params: [{ name: 'R', value: '10' }, { name: 'L', value: '1' }, { name: 'C', value: '1' }], curves: [{ expr: 'R + s*L + 1/(s*C)' }], var: 'w', from: 0.5, to: 2, log: true }, 2);
  nearC(d.curves[0].pts[1].z, [10, 0], 1e-9);
  assert.match(ortskurveSvg({ cursor: 300 }), /Z = /);
});

test('Logik: Gatter, offene Eingänge, Rückkopplung, Wahrheitstabelle', () => {
  const st = {
    parts: [{ id: 'a', type: 'in', on: true, label: 'a' }, { id: 'b', type: 'in', label: 'b' }, { id: 'g', type: 'nand', n: 2 }, { id: 'q', type: 'out', label: 'Q' }, { id: 'g2', type: 'and' }],
    wires: [{ from: 'a', to: 'g', pin: 0 }, { from: 'b', to: 'g', pin: 1 }, { from: 'g', to: 'q' }, { from: 'a', to: 'g2', pin: 0 }],
  };
  const lv = logikEval(st);
  assert.equal(lv.g, 1);
  assert.equal(lv.q, 1);
  assert.equal(lv.g2, null);
  const tt = logikTruthTable(st);
  assert.deepEqual(tt.ins, ['a', 'b']);
  assert.deepEqual(tt.rows.map((r) => r[2]), [1, 1, 1, 0]);
  const loop = { parts: [{ id: 'n', type: 'not' }], wires: [{ from: 'n', to: 'n' }] };
  assert.equal(logikEval(loop).n, null);
  assert.match(logikSvg(st), /≥1|&amp;/);
});

test('Vorgabe + Schülerstand: Festes aus der Vorgabe gilt, Eigenes bleibt', () => {
  const preset = { items: [{ id: 'u', name: 'U', value: [1, 0], locked: true }, { id: 'i', name: 'I', value: [0, 1] }] };
  const state = { items: [{ id: 'u', name: 'U', value: [9, 9] }, { id: 'i', name: 'I', value: [2, 2] }, { id: 'n', name: 'N', value: [3, 3] }] };
  const m = labMerge('zeiger', preset, state);
  assert.deepEqual(m.items.map((x) => [x.id, x.value[0]]), [['u', 1], ['i', 2], ['n', 3]]);
  assert.deepEqual(labMerge('zeiger', preset, null).items.length, 2);
  assert.ok(labMerge('zeiger', {}, null).items.length > 0); // leere Vorgabe → Grundeinstellung
});

test('Prüfen und Zeichnen aller Labore', () => {
  assert.deepEqual(labValidate({ lab: 'zeiger' }), []);
  assert.match(labValidate({ lab: 'xyz' })[0], /lab:/);
  assert.match(labValidate({ lab: 'bode', preset: { curves: [{ expr: '1/(' }] } })[0], /zu früh/);
  assert.match(labValidate({ lab: 'logik', preset: { parts: [{ type: 'flipflop' }] } })[0], /unbekannter Typ/);
  for (const lab of ['zeiger', 'bode', 'ortskurve', 'logik']) {
    const svg = labSvg({ lab });
    assert.match(svg, /^<svg /, lab);
    assert.doesNotMatch(svg, /NaN|undefined/, lab);
  }
  // Text wird maskiert.
  assert.doesNotMatch(labSvg({ lab: 'zeiger', preset: { items: [{ id: 'x', name: '<script>', value: [1, 1] }] } }), /<script>/);
});
