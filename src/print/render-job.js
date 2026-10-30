// ==================== DRUCKAUFTRAG FÜR DEN RENDERER ====================
//
// Dokument (.zlm) → Auftrag für den worksheet-renderer (POST /render), wie ihn
// LearningModules auf dem Server baut (src/worksheets/worksheets.service.ts,
// prepare): Bilder aus media/ und data:-Adressen gehen als Dateien mit, die
// Beschriftung aus dem Stift-Editor (ink-print.js) als SVG je Baustein.
// Was sich so nicht drucken lässt, steht als Hinweis im Blatt und in `warnings`.
// Ohne DOM – testbar in Node.

import { resolveDocRefs } from '../doc/docspec.js';

const PRINTABLE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };
const BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' };
const TEXT_WIDTH_CM = 16.5;
const MAX_WIDTH_CM = 25.5;

/** Breite der Ansicht (9cm, 90mm, 50%, 300px) → cm für den Renderer. */
export function widthInCm(width) {
  const m = /^(\d+(?:\.\d+)?)(cm|mm|px|%)$/.exec(typeof width === 'string' || typeof width === 'number' ? String(width) : '');
  if (!m) return null;
  const v = parseFloat(m[1]);
  const cm = m[2] === 'cm' ? v : m[2] === 'mm' ? v / 10 : m[2] === '%' ? (v / 100) * TEXT_WIDTH_CM : v / 37.8;
  return `${Math.min(cm, MAX_WIDTH_CM).toFixed(2)}cm`;
}

/** Nur ein SVG aus Pfaden, Gruppen, Formen und Text – LibreOffice soll nichts nachladen. */
export function safeInkSvg(svg) {
  if (typeof svg !== 'string' || svg.length > 2_000_000 || !/^\s*<svg[\s>]/.test(svg)) return false;
  if (/href|url\s*\(|<!|<\?|\bon[a-z]+\s*=|javascript:/i.test(svg)) return false;
  const tags = svg.match(/<\/?([a-zA-Z][\w:-]*)/g) || [];
  return tags.every((t) => /^<\/?(svg|g|path|rect|line|polyline|polygon|circle|ellipse|text|tspan)$/i.test(t));
}

export function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * `spec`: das Dokument (mit `ink` aus applyInkToSpec), `media`: Name → Bytes
 * (doc.media), `modules`: eingebettete Quizze (doc.modules).
 * Ergebnis: `{ job, warnings }`.
 */
export function renderJob(spec, { title = '', media = {}, modules = {}, outputs = ['pdf'] } = {}) {
  const files = {};
  const warnings = [];
  let n = 0;
  let inkCount = 0;

  const imageData = (src) => {
    const inline = /^data:([^;,]+);base64,(.*)$/s.exec(src);
    if (inline) return { mime: inline[1].toLowerCase(), data: inline[2] };
    const name = /^media\/(.+)$/.exec(src)?.[1];
    if (name && media[name]) return { mime: BY_EXT[name.split('.').pop().toLowerCase()] || '', data: base64(media[name]) };
    return null;
  };

  const imageBlock = (block) => {
    const src = String(block.src ?? '');
    const label = block.caption || block.alt || 'Bild';
    const img = imageData(src);
    const ext = img && PRINTABLE[img.mime];
    if (!ext) {
      warnings.push(img ? `„${label}“: ${img.mime || 'dieses Format'} lässt sich nicht drucken – bitte PNG, JPEG oder SVG.`
        : `„${label}“: Bilder aus dem Netz kommen nicht in den Druck.`);
      return { type: 'note', text: `[${label}]` };
    }
    const name = `bilder/bild-${++n}.${ext}`;
    files[name] = img.data;
    const { src: _src, alt: _alt, ...rest } = block;
    return { ...rest, file: name, width: widthInCm(block.width) || '12cm' };
  };

  const groupBlock = (block) => {
    const items = [];
    for (const it of Array.isArray(block.items) ? block.items : []) {
      if (!it || typeof it !== 'object') continue;
      if (typeof it.text === 'string') { items.push(it); continue; }
      const done = imageBlock({ type: 'image', src: it.src, alt: it.alt });
      if (done.type === 'image') items.push({ file: done.file, x: it.x, y: it.y, w: it.w, h: it.h });
    }
    if (!items.length) return { type: 'note', text: '[Bildgruppe]' };
    const { items: _i, ...rest } = block;
    return { ...rest, items, width: widthInCm(block.width) || '16.5cm' };
  };

  // Ohne LearningModules gibt es keinen Quick-Link (QR-Code): ein Kasten mit dem Namen.
  const quizBlock = (block) => {
    const mod = modules[String(block.module ?? '')];
    const title = String(block.title || mod?.title || 'Quiz');
    warnings.push(`Quiz „${title}“: Im Druck steht ein Kasten – QR-Code und Link gibt es nur über LearningModules.`);
    return { type: 'box', title: `Quiz: ${title}`, blocks: [{ type: 'note', text: 'Dieses Quiz wird am Gerät bearbeitet.' }] };
  };

  const tableCells = (block) => {
    const cell = (c) => {
      if (c && typeof c === 'object' && Array.isArray(c.blocks)) c = { ...c, blocks: walk(c.blocks) };
      if (!c || typeof c !== 'object' || !Array.isArray(c.images) || !c.images.length) return c;
      const images = [];
      const notes = [];
      for (const img of c.images) {
        const done = imageBlock({ type: 'image', ...img });
        if (done.type === 'image') images.push({ file: done.file, width: done.width });
        else notes.push(done.text);
      }
      const { images: _i, ...rest } = c;
      return { ...rest, text: [c.text || '', ...notes].filter(Boolean).join(' '), ...(images.length ? { images } : {}) };
    };
    const row = (r) => (Array.isArray(r) ? r.map(cell) : r);
    return {
      ...block,
      ...(Array.isArray(block.header) ? { header: row(block.header) } : {}),
      rows: Array.isArray(block.rows) ? block.rows.map(row) : block.rows,
    };
  };

  // Beschriftung: SVG je Baustein, Lage in Punkt → Datei und cm.
  const pt = (v) => Math.round((Number(v) / 72) * 2.54 * 1000) / 1000;
  const inkFile = (ink) => {
    if (!ink || typeof ink !== 'object' || ![ink.x, ink.y, ink.w, ink.h].every((v) => Number.isFinite(Number(v)))) return null;
    if (!safeInkSvg(ink.svg)) {
      warnings.push('Eine Beschriftung ließ sich nicht drucken (unerwarteter Inhalt).');
      return null;
    }
    const name = `stift/stift-${++inkCount}.svg`;
    files[name] = base64(new TextEncoder().encode(ink.svg));
    return { file: name, x: pt(ink.x), y: pt(ink.y), width: pt(ink.w), height: pt(ink.h) };
  };

  function walk(blocks) {
    const out = [];
    for (const item of blocks) {
      const { ink, ...block } = item && typeof item === 'object' && !Array.isArray(item) ? item : { ink: null };
      const printedInk = ink ? inkFile(ink) : null;
      const at = out.length;
      if (!item || typeof item !== 'object') out.push(item);
      else if (block.type === 'quiz') out.push(quizBlock(block));
      else if (block.type === 'table') out.push(tableCells(block));
      else if (block.type === 'image' && block.src !== undefined) out.push(imageBlock(block));
      else if (block.type === 'group') out.push(groupBlock(block));
      else if ((block.type === 'code' && block.file !== undefined && block.code === undefined) || (block.type === 'image' && block.file !== undefined)) {
        warnings.push(`„${block.file}“ gibt es nur im Kurs-Projekt – im Druck steht ein Hinweis.`);
        out.push({ type: 'note', text: `[${block.file}]` });
      } else out.push(Array.isArray(block.blocks) ? { ...block, blocks: walk(block.blocks) } : block);
      if (printedInk && out[at] && typeof out[at] === 'object') out[at] = { ...out[at], ink: printedInk };
    }
    return out;
  }

  const resolved = resolveDocRefs(spec, null);
  const { titel: _t, nummer: _n, kurs: _k, titelmuster: _m, ...rest } = resolved;
  const head = title || spec.titel || 'Dokument';
  const meta = { ...(rest.meta || {}) };
  if (!meta.TITEL) meta.TITEL = head;
  return {
    job: { spec: { ...rest, titel: head, meta, content: walk(resolved.content || []) }, course: {}, files, outputs },
    warnings,
  };
}
