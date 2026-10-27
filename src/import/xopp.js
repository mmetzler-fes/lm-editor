// ==================== .xopp LESEN (Xournal++) ====================
//
// Eine .xopp ist gepacktes XML (gzip): je Seite Größe, Hintergrund (ein PDF
// – nur verknüpft, nicht eingebettet –, Linien oder leer) und Ebenen mit
// Strichen (Punkte in PDF-Punkten, Breite je Punkt aus dem Stiftdruck),
// Textfeldern und Bildern. Daraus werden Striche und Textfelder des
// Stift-Editors (ink-editor.js), je Seite als eine Gruppe – und eine Ebene
// für ein Dokument, dessen Bausteine ihre Lage im PDF kennen (`_pos` aus dem
// PDF-Import, siehe layerFromXopp).
//
// Bewusst ohne DOMParser (läuft auch unter Node für die Tests): Das XML von
// Xournal++ ist flach und regelmäßig.

import { gunzipSync, strFromU8 } from '../vendor/fflate/fflate.js';

const uid = () => Math.random().toString(36).slice(2, 10);

const decode = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

/** "#rrggbbaa" → "#rrggbb" (Deckkraft regelt der Editor je Werkzeug). */
const colorOf = (c) => (/^#[0-9a-f]{6}/i.test(c || '') ? c.slice(0, 7).toLowerCase() : '#1e293b');

/** Breite je Punkt (absolut) → Druck für widthAt(base, p) = base · (0,35 + 0,95 · p). */
const pressureFor = (w, base) => Math.max(0, Math.min(1, ((w / base) - 0.35) / 0.95));

/** Bytes einer .xopp (gzip oder schon entpackt) → Text. */
export function xoppText(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const xml = data[0] === 0x1f && data[1] === 0x8b ? strFromU8(gunzipSync(data)) : strFromU8(data);
  if (!/<xournal[\s>]/.test(xml)) throw new Error('Das ist keine Xournal-Datei (.xopp).');
  return xml;
}

/**
 * .xopp → `{ pages: [{ w, h, pdfPage, items }], pdfName, warnings }`.
 * `pdfPage`: Seite im Hintergrund-PDF (ab 0) oder null; `items`: Striche
 * und Textfelder wie im Stift-Editor, je Seite eine Gruppe.
 */
export function readXopp(bytes) {
  const xml = xoppText(bytes);
  const pages = [];
  let pdfName = null;
  let skippedImages = 0;
  let pdfCount = 0;
  for (const pm of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pa = attrs(pm[1]);
    const body = pm[2];
    const bg = attrs(/<background\b([^>]*)\/?>/.exec(body)?.[1] || '');
    let pdfPage = null;
    if (bg.type === 'pdf') {
      if (bg.filename && !pdfName) pdfName = bg.filename.split(/[\\/]/).pop();
      pdfPage = bg.pageno ? Math.max(0, Number(bg.pageno) - 1) : pdfCount;
      pdfCount++;
    }
    const group = `xopp-${pages.length + 1}-${uid()}`;
    const items = [];
    for (const m of body.matchAll(/<stroke\b([^>]*)>([^<]*)<\/stroke>/g)) {
      const a = attrs(m[1]);
      if (a.tool === 'eraser') continue;
      const nums = m[2].trim().split(/\s+/).map(Number).filter(Number.isFinite);
      const widths = String(a.width || '1').trim().split(/\s+/).map(Number).filter((n) => n > 0);
      const base = widths[0] || 1;
      const marker = a.tool === 'highlighter';
      const points = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const w = widths.length > 1 ? widths[Math.min(1 + i / 2, widths.length - 1)] : base;
        points.push([nums[i], nums[i + 1], widths.length > 1 ? pressureFor(w, base) : 0.684]);
      }
      if (!points.length) continue;
      items.push({ id: uid(), type: 'stroke', tool: marker ? 'marker' : 'pen', color: colorOf(a.color), width: base, points, group });
    }
    for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const a = attrs(m[1]);
      const text = decode(m[2]).replace(/\s+$/, '');
      if (!text.trim()) continue;
      const size = Number(a.size) || 12;
      const lines = text.split('\n');
      items.push({
        id: uid(), type: 'text', x: Number(a.x) || 0, y: Number(a.y) || 0,
        w: Math.max(40, Math.max(...lines.map((l) => l.length)) * size * 0.55), h: lines.length * size * 1.3,
        text, color: colorOf(a.color), size, group,
      });
    }
    skippedImages += (body.match(/<(image|teximage)\b/g) || []).length;
    pages.push({ w: Number(pa.width) || 595, h: Number(pa.height) || 842, pdfPage, items });
  }
  if (!pages.length) throw new Error('In der .xopp-Datei ist keine Seite.');
  const warnings = [];
  if (skippedImages) warnings.push(`${skippedImages} Bild${skippedImages === 1 ? '' : 'er'} aus der Xournal-Beschriftung nicht übernommen – nur Striche und Text.`);
  return { pages, pdfName, warnings };
}

/** Oberkante eines Eintrags (Strich: kleinstes y, Textfeld: y). */
const topOf = (it) => (it.type === 'stroke' ? Math.min(...it.points.map((p) => p[1])) : it.y);

const shift = (it, dy) => (it.type === 'stroke'
  ? { ...it, points: it.points.map(([x, y, p]) => [x, y + dy, p]) }
  : { ...it, y: it.y + dy });

/**
 * Striche einer .xopp → Ebene des Stift-Editors für ein Dokument:
 * `{ blocks: { <bid>: { items, at } } }`. `anchors`: Bausteine mit ihrer
 * Lage im PDF `[{ bid, page, top }]` in Dokumentreihenfolge. Jeder Eintrag
 * hängt am letzten Baustein seiner PDF-Seite, der über ihm beginnt (sonst am
 * ersten der Seite), mit demselben Abstand wie im PDF – das stimmt nur
 * ungefähr, das Dokument bricht anders um. Ohne passenden Baustein: frei
 * auf dem Blatt (`_`), Seiten untereinander.
 */
export function layerFromXopp(xopp, anchors) {
  const blocks = {};
  const put = (bid, it, at = 0) => {
    if (!blocks[bid]) blocks[bid] = { items: [], at };
    blocks[bid].items.push(it);
  };
  let free = 0;
  for (const page of xopp.pages) {
    const pdfPage = page.pdfPage;
    const onPage = pdfPage === null ? [] : anchors.filter((a) => a.page === pdfPage);
    for (const it of page.items) {
      const top = topOf(it);
      const anchor = [...onPage].reverse().find((a) => a.top <= top) || onPage[0] || null;
      if (anchor) put(anchor.bid, shift(it, -anchor.top));
      else put('_', shift(it, free));
    }
    free += page.h;
  }
  return { blocks };
}
