// ==================== WIE GUT IST DER IMPORT? ====================
//
// Bewertet ein importiertes Dokument (DocSpec) automatisch: Steckt viel Text in
// Bildern statt editierbar zu sein, läuft Text in Zeichnungen über Linien und
// Tabellen, sehen Absätze wie Aufgaben aus, ohne eine zu sein? Dieselbe
// Bewertung nutzen der Import-Bericht in LearningModules und der Prüfbestand
// (scripts/import-check.mjs) – so misst der Prüfbestand, was die Lehrkraft sieht.
//
// Läuft im Browser und unter Node (atob, TextDecoder).

import { textWidth } from './odt-core.js';

const TASK_LIKE = /^(\*\*)?((Aufgabe|Übung)\s*\d+|\d{1,2}[.)]\s+\S|[a-h]\)\s+\S)/;
const WRITE_LINE = /_{6,}|\.{10,}|…{4,}/;

const utf8 = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/** Text in einer Zeichnung (SVG) und Zeilen umbrochenen Fließtexts, die über eine senkrechte Linie laufen. */
function svgInfo(src) {
  const m = /^data:image\/svg\+xml;base64,(.+)$/.exec(src || '');
  if (!m) return null;
  let svg;
  try { svg = utf8(m[1]); } catch { return null; }
  const texts = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)]
    .map((t) => ({
      x: +t[1], y: +t[2], size: +t[3], bold: /font-weight="bold"/.test(t[4]),
      anchor: /text-anchor="(middle|end)"/.exec(t[4])?.[1], text: t[5].replace(/&[a-z#0-9]+;/g, 'x'),
      length: /textLength="([\d.]+)"/.test(t[4]) ? Number(/textLength="([\d.]+)"/.exec(t[4])[1]) : undefined,
    }));
  const edges = [];
  for (const l of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    if (Math.abs(+l[1] - +l[3]) < 1.5 && Math.abs(+l[2] - +l[4]) > 20) edges.push({ x: +l[1], y1: Math.min(+l[2], +l[4]), y2: Math.max(+l[2], +l[4]) });
  }
  // Nur umbrochener Fließtext zählt (mindestens zwei Zeilen mit gleichem Anfang) –
  // einzelne Beschriftungen an Achsen liegen dort mit Absicht.
  const inParagraph = (t) => texts.some((o) => o !== t && Math.abs(o.x - t.x) < 1 && o.size === t.size && Math.abs(o.y - t.y) <= 1.6 * t.size);
  let overflow = 0;
  for (const t of texts) {
    if (t.anchor || !inParagraph(t)) continue;
    const w = t.length ?? textWidth(t.text, t.size, t.bold);
    if (edges.some((e) => e.x > t.x + 4 && e.x < t.x + w - 4 && t.y > e.y1 && t.y - t.size < e.y2)) overflow++;
  }
  return { chars: texts.reduce((n, t) => n + t.text.trim().length, 0), overflow };
}

/** Kennzahlen eines Dokuments. */
export function importMetrics(spec) {
  const r = { blocks: 0, types: {}, textChars: 0, svgChars: 0, overflow: 0, images: 0, drawings: 0, taskLike: 0, writeLines: 0, tasks: 0, solutions: 0, karos: 0, columns: 0, tables: 0 };
  const text = (s) => {
    if (typeof s !== 'string' || !s.trim()) return;
    r.textChars += s.trim().length;
    if (WRITE_LINE.test(s)) r.writeLines++;
  };
  const image = (src) => {
    r.images++;
    const info = svgInfo(src);
    if (info) { r.drawings++; r.svgChars += info.chars; r.overflow += info.overflow; }
  };
  // Text direkt unter einer Aufgabe („a) … b) …“) ist deren Aufgabentext, keine verlorene Aufgabe.
  let afterTask = false;
  const walk = (node, parentType) => {
    if (Array.isArray(node)) { node.forEach((n) => walk(n, parentType)); return; }
    if (!node || typeof node !== 'object') { if (typeof node === 'string') text(node); return; }
    const t = node.type;
    if (t) { r.blocks++; r.types[t] = (r.types[t] || 0) + 1; }
    if (t === 'task' || t === 'subtask') r.tasks++;
    if (t === 'solution') r.solutions++;
    if (t === 'karo') r.karos++;
    if (t === 'columns') r.columns++;
    if (t === 'table') r.tables++;
    if (t === 'text' && TASK_LIKE.test(String(node.text || '').trim()) && parentType !== 'solution' && !afterTask) r.taskLike++;
    if (t) afterTask = t === 'task' || t === 'subtask' || (afterTask && ['karo', 'solution', 'image', 'formula', 'text', 'list'].includes(t));
    if (typeof node.src === 'string') image(node.src);
    for (const [k, v] of Object.entries(node)) {
      if (k === 'src' || k === 'type' || k === 'id') continue;
      if (k === 'images' && Array.isArray(v)) { v.forEach((im) => im?.src && image(im.src)); continue; }
      if (typeof v === 'string' && ['text', 'title', 'caption', 'latex', 'code'].includes(k)) text(v);
      else if (typeof v === 'object') walk(v, t || parentType);
    }
  };
  walk(spec?.content || [], null);
  const total = r.textChars + r.svgChars;
  r.textInImages = total ? Math.round((100 * r.svgChars) / total) : 0;
  return r;
}

/**
 * Ampel für die Lehrkraft: `good` (🟢), `check` (🟡 bitte durchsehen) oder `weak` (🔴 lohnt
 * „Mit KI neu aufbereiten“), dazu die Gründe in Klartext und die Kennzahlen.
 */
export function rateImport(spec, warnings = []) {
  const m = importMetrics(spec);
  const weak = [];
  const check = [];
  if (!m.blocks) weak.push('Es wurde kein Inhalt übernommen.');
  if (m.svgChars >= 200 && m.textInImages >= 60) weak.push(`${m.textInImages} % des Textes stecken in Bildern und lassen sich nicht bearbeiten.`);
  else if (m.svgChars >= 80 && m.textInImages >= 25) check.push(`${m.textInImages} % des Textes stecken in Bildern.`);
  if (m.overflow >= 3) weak.push(`In Zeichnungen laufen ${m.overflow} Zeilen über Linien oder Tabellen.`);
  else if (m.overflow) check.push(`In einer Zeichnung ${m.overflow === 1 ? 'läuft eine Zeile' : `laufen ${m.overflow} Zeilen`} über eine Linie oder Tabelle.`);
  if (m.taskLike >= 2) check.push(`${m.taskLike} Absätze sehen wie Aufgaben aus, sind aber als Text übernommen.`);
  if (m.writeLines) check.push(`${m.writeLines === 1 ? 'Eine Schreiblinie' : `${m.writeLines} Schreiblinien`} aus Unterstrichen oder Punkten ${m.writeLines === 1 ? 'ist' : 'sind'} Text geblieben.`);
  const big = warnings.find((w) => /zu groß/.test(w));
  if (big) (m.blocks ? check : weak).push(big.replace(/^[^:]*: /, ''));
  const level = weak.length ? 'weak' : check.length ? 'check' : 'good';
  return { level, reasons: [...weak, ...check], metrics: m };
}

export const LEVEL_ICON = { good: '🟢', check: '🟡', weak: '🔴' };
export const LEVEL_TEXT = { good: 'gut übernommen', check: 'bitte durchsehen', weak: 'schwach – Nachbessern lohnt' };
