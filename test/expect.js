// Kleines expect() im Stil von Jest über node:test – damit sich die Tests aus
// LearningModules (Jest) fast unverändert übernehmen lassen.

import { describe, it as nodeIt } from 'node:test';
import assert from 'node:assert/strict';

export { describe };

export const it = Object.assign((name, fn) => nodeIt(name, fn), {
  each: (rows) => (name, fn) => {
    for (const row of rows) {
      const args = Array.isArray(row) ? row : [row];
      let i = 0;
      nodeIt(name.replace(/%[sdp]/g, () => String(args[i++])), () => fn(...args));
    }
  },
});

class StringContaining {
  constructor(part) { this.part = part; }
  matches(v) { return typeof v === 'string' && v.includes(this.part); }
}

function equal(a, b) {
  if (b instanceof StringContaining) return b.matches(a);
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && kb.every((k) => equal(a[k], b[k]));
}

function matchesObject(a, b) {
  if (typeof b !== 'object' || b === null) return equal(a, b);
  if (typeof a !== 'object' || a === null) return false;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((v, i) => matchesObject(a[i], v));
  return Object.keys(b).every((k) => matchesObject(a[k], b[k]));
}

function matchers(actual, negate) {
  const check = (ok, message) => assert.ok(negate ? !ok : ok, `${negate ? 'nicht: ' : ''}${message}`);
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  return {
    toBe: (v) => check(Object.is(actual, v), `${show(actual)} ist ${show(v)}`),
    toEqual: (v) => check(equal(actual, v), `${JSON.stringify(actual)} gleicht ${JSON.stringify(v)}`),
    toContain: (v) => check(actual.includes(v), `${show(actual)} enthält ${show(v)}`),
    toMatch: (re) => check(typeof re === 'string' ? actual.includes(re) : re.test(actual), `${show(actual)} passt zu ${re}`),
    toBeNull: () => check(actual === null, `${show(actual)} ist null`),
    toHaveLength: (n) => check(actual?.length === n, `Länge ${actual?.length} ist ${n}`),
    // Nur die genannten Felder vergleichen (rekursiv), weitere dürfen dabei sein.
    toMatchObject: (v) => check(matchesObject(actual, v), `${JSON.stringify(actual)} enthält ${JSON.stringify(v)}`),
    toBeGreaterThan: (v) => check(actual > v, `${actual} > ${v}`),
    toBeLessThan: (v) => check(actual < v, `${actual} < ${v}`),
    toThrow: (msg) => {
      let error = null;
      try { actual(); } catch (e) { error = e; }
      const ok = error !== null && (msg === undefined || (msg instanceof RegExp ? msg.test(error.message) : error.message.includes(msg)));
      check(ok, `wirft${msg ? ` „${msg}“` : ''} (gefangen: ${error?.message ?? 'nichts'})`);
    },
  };
}

export function expect(actual) {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) });
}
expect.stringContaining = (part) => new StringContaining(part);
