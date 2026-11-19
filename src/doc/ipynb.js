// ==================== JUPYTER-NOTEBOOK (.ipynb) → DOKUMENT ====================
//
// Markdown-Zellen werden Text (Überschriften, Listen, Formeln mit $…$ und $$…$$, Bilder), Code-Zellen
// ausführbare Python-Blöcke (Code-Block mit run: true – im Blatt mit ▶, alle teilen sich ihre Variablen
// wie im Notebook). Ausgaben bleiben weg: ▶ erzeugt sie neu. Bilder aus dem Ordner neben dem Notebook
// (<img src="images/…">, ![…](images/…)) und Anhänge der Zellen kommen als data:-Adresse ins Dokument.
// Reine Funktionen ohne DOM.

import { markdownToPm } from './pm-markdown.js';
import { pmToSpec } from './pm-convert.js';

const text = (src) => (Array.isArray(src) ? src.join('') : String(src ?? ''));
const IMG_TAG = /<img\b[^>]*>/gi;
const MD_IMG = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)(\{[^}]*\})?/g;
const attr = (tag, name) => (new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag) || [])
  .slice(2).find((v) => v !== undefined);

/**
 * Überschriften in Jupyter haben keine Nummer: `## Titel` → `## Titel {.plain}` (sonst würde daraus ein
 * nummerierter Abschnitt bzw. eine Aufgabe, docs/MARKDOWN.md). Zeilen in ```-Blöcken bleiben, wie sie sind.
 */
export function plainHeadings(md) {
  let fence = null;
  return md.split('\n').map((line) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]; return line; }
    if (fence) return line;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h || /\{[^}]*\}\s*$/.test(h[2])) return line;
    return `${h[1]} ${h[2]} {.plain}`;
  }).join('\n');
}

/** Dateiname ohne Ordner, klein – so findet „images/Aufgabe4.png“ die gewählte Datei „Aufgabe4.png“. */
export function imageKey(path) {
  return decodeURIComponent(String(path || '').split(/[?#]/)[0]).split('/').pop().toLowerCase();
}

/**
 * Notebook → { spec, title, warnings }. `images`: Map Dateiname (imageKey) → data:-Adresse der
 * Bilder, die neben dem Notebook liegen und mit ausgewählt wurden.
 */
export function ipynbToSpec(nb, { images = new Map() } = {}) {
  if (!nb || !Array.isArray(nb.cells)) throw new Error('Kein Jupyter-Notebook (nbformat 4) – „cells“ fehlt.');
  const warnings = [];
  const missing = new Set();
  const found = [];
  const content = [];
  let title = '';
  let outputs = 0;

  /** Bildquelle → Platzhalter, den markdown-it durchlässt; nach dem Lesen wird er zur data:-Adresse. */
  const placeholder = (src, cell, alt = '') => {
    let data = null;
    if (/^attachment:/i.test(src)) {
      const att = cell.attachments?.[src.slice('attachment:'.length)];
      const mime = att && Object.keys(att).find((k) => k.startsWith('image/'));
      if (mime) data = `data:${mime};base64,${String(att[mime]).replace(/\s+/g, '')}`;
    } else if (/^data:image\//i.test(src) || /^https:\/\//i.test(src)) {
      data = src;
    } else {
      data = images.get(imageKey(src)) || null;
    }
    if (!data) { missing.add(src); return null; }
    found.push({ data, alt: String(alt || '').trim() });
    return `lm-img:${found.length - 1}`;
  };

  for (const cell of nb.cells) {
    const src = text(cell.source);
    if (cell.cell_type === 'markdown') {
      // Erst ![…](…), dann <img> – sonst liefe das Bild aus <img> ein zweites Mal durch.
      // Der Alt-Text bleibt Alt-Text (in Jupyter unsichtbar), keine Bildunterschrift.
      let md = src.replace(MD_IMG, (all, alt, href, attrs) => {
        const ref = placeholder(href, cell, alt);
        return ref ? `![](${ref})${attrs || ''}` : `*[Bild fehlt: ${href}]*`;
      });
      md = md.replace(IMG_TAG, (tag) => {
        const ref = placeholder(attr(tag, 'src') || '', cell, attr(tag, 'alt') || '');
        const width = attr(tag, 'width');
        const w = width && /^\d+(\.\d+)?%$/.test(width) ? width : width && /^\d+$/.test(width) ? `${width}px` : null;
        return ref ? `\n\n![](${ref})${w ? `{width=${w}}` : ''}\n\n` : `\n\n*[Bild fehlt: ${attr(tag, 'src') || '?'}]*\n\n`;
      });
      const blocks = pmToSpec(markdownToPm(plainHeadings(md), { warnings })).content;
      if (!title) {
        const h = /^#\s+(.+)$/m.exec(src);
        if (h) title = h[1].replace(/[*_`$]/g, '').trim();
      }
      content.push(...blocks);
    } else if (cell.cell_type === 'code') {
      outputs += (cell.outputs || []).length;
      if (!src.trim()) continue;
      content.push({ type: 'code', run: true, code: src.replace(/\s+$/, '') });
    } else if (cell.cell_type === 'raw' && src.trim()) {
      content.push({ type: 'code', code: src.replace(/\s+$/, '') });
    }
  }

  // Platzhalter → data:-Adresse (auch in Spalten, Kästen …).
  const fill = (blocks) => (blocks || []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    const m = /^lm-img:(\d+)$/.exec(String(b.src || ''));
    if (b.type === 'image' && m) {
      const { data, alt } = found[Number(m[1])];
      b.src = data;
      if (alt) b.alt = alt;
    }
    fill(b.blocks);
  });
  fill(content);

  if (missing.size) {
    warnings.push(`Bilder fehlen: ${[...missing].join(', ')} – beim Übernehmen zusammen mit dem Notebook auswählen (Strg/⌘ gedrückt halten).`);
  }
  if (outputs) warnings.push('Gespeicherte Ausgaben sind nicht übernommen – ▶ im Blatt erzeugt sie neu.');
  return { spec: { content }, title, warnings };
}
