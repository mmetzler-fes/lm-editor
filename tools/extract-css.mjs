// Styles der Anzeige aus styles.css von LearningModules ziehen.
//
//   node tools/extract-css.mjs ../LearningModules/src/renderer/css/styles.css
//
// Übernommen werden die Regeln, deren Klassen alle in den Quellen von
// lm-editor vorkommen (src/**/*.js), dazu :root, das dunkle Design, die
// Grundregeln ohne Klasse und alle @keyframes – in ihrer Reihenfolge, damit
// die Kaskade gleich bleibt. Regeln, die nur im Kontext der App gelten
// (z. B. `.student-run …`), fehlen. Ergebnis: src/css/modules.css.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) { console.error('Pfad zu styles.css fehlt.'); process.exit(1); }

// Alle Wörter aus den Quellen, die Klassen sein könnten.
const words = new Set();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor') walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/[a-zA-Z][\w-]*/g)) words.add(m[0]);
  }
};
walk(join(root, 'src'));

const css = readFileSync(source, 'utf8');

/** Regeln einer Ebene: [{ prelude, body, text }] – @media/@supports mit ihren Regeln. */
function parse(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let depth = 1;
    let k = open + 1;
    while (depth && k < text.length) {
      const c = text[k];
      if (c === '/' && text[k + 1] === '*') { k = text.indexOf('*/', k + 2) + 2; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      k++;
    }
    const raw = text.slice(i, open);
    const prelude = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const comment = (raw.match(/\/\*[\s\S]*?\*\//g) || []).join('\n');
    out.push({ prelude, comment, body: text.slice(open + 1, k - 1) });
    i = k;
  }
  return out;
}

const classesOf = (sel) => [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
// Jede Liste von Selektoren: übernehmen, wenn jeder einzelne nur bekannte Klassen hat
// (Regeln mit einzelnen fremden Selektoren behalten nur die passenden).
function keepSelectors(prelude) {
  const parts = prelude.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.filter((p) => !/#[a-zA-Z]/.test(p) && classesOf(p).length && classesOf(p).every((c) => words.has(c)));
}

let kept = 0;
let skipped = 0;
function emit(rules, indent = '') {
  let out = '';
  for (const r of rules) {
    if (/^@(media|supports)/.test(r.prelude)) {
      const inner = emit(parse(r.body), indent + '  ');
      if (inner.trim()) out += `${indent}${r.prelude} {\n${inner}${indent}}\n`;
      continue;
    }
    if (/^@keyframes|^@font-face/.test(r.prelude) || /^(:root|\[data-theme="dark"\]|\*|body|html)$/.test(r.prelude)) {
      out += `${indent}${r.prelude} {${r.body}}\n`;
      kept++;
      continue;
    }
    const sel = keepSelectors(r.prelude);
    if (!sel.length) { skipped++; continue; }
    out += `${indent}${sel.join(',\n' + indent)} {${r.body}}\n`;
    kept++;
  }
  return out;
}

const body = emit(parse(css));
writeFileSync(join(root, 'src/css/modules.css'), `/* Erzeugt mit tools/extract-css.mjs aus styles.css von LearningModules –
   nicht von Hand ändern, sondern dort ändern und neu erzeugen.
   Regeln der Anzeige (Dokument, Quizze) in ihrer ursprünglichen Reihenfolge. */
${body}`);
console.log(`src/css/modules.css: ${kept} Regeln übernommen, ${skipped} der App ausgelassen.`);
