// ==================== JUPYTER-NOTEBOOK (.ipynb) → DOKUMENT ====================
//
// Markdown-Zellen werden Text (Überschriften, Listen, Formeln mit $…$ und $$…$$, Bilder), Code-Zellen
// ausführbare Python-Blöcke (Code-Block mit run: true – im Blatt mit ▶, alle teilen sich ihre Variablen
// wie im Notebook). Ausgaben bleiben weg: ▶ erzeugt sie neu. Bilder aus dem Ordner neben dem Notebook
// (<img src="images/…">, ![…](images/…)) und Anhänge der Zellen kommen als data:-Adresse ins Dokument.
// Zurück (specToIpynb): ausführbares Python wird Code-Zelle, alles andere Markdown, wie Jupyter es
// versteht – ohne die Zusätze unseres Markdowns ({.plain}, ::: box …). Bilder werden Anhänge der Zelle.
// Reine Funktionen ohne DOM.

import { markdownToPm, pmToMarkdown } from './pm-markdown.js';
import { pmToSpec, specToPm } from './pm-convert.js';

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

// ---------- Dokument → Notebook ----------

/** Felder, die nur das Aussehen im Blatt bestimmen – in Jupyter ohne Bedeutung. */
const LAYOUT = ['id', 'align', 'indent', 'firstLine', 'spaceBefore', 'spaceAfter', 'lineHeight', 'joined', 'size', 'points', 'marker', 'numbering'];
const strip = (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !LAYOUT.includes(k)));

/** Unser Markdown → Markdown, wie Jupyter es zeigt: {…}-Zusätze und leere Spans weg, [Text]{.farbe} → Text. */
export function jupyterMarkdown(md) {
  return String(md)
    // Bild im Text: als <img> in der Zeile (Jupyter kennt die {…}-Angaben nicht).
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)\{\.inline(?: width=([\d.]+(?:cm|mm|px)))?\}/g, (_m, alt, src, w) => `<img src="${src}" alt="${alt.replace(/"/g, '&quot;')}" style="${w ? `width:${w};` : ''}vertical-align:middle">`)
    .replace(/\[\]\{[^}]*\}/g, '')
    .replace(/(^|[^\\])\[([^\]\n]*)\]\{[^}\n]*\}/g, '$1$2')
    .replace(/^(#{1,6} .*?)[ \t]*\{[^}\n]*\}[ \t]*$/gm, '$1')
    .replace(/^(\$\$[\s\S]*?\$\$)\{[^}\n]*\}/gm, '$1')
    .replace(/^```\s*\{[^}\n]*\}/gm, '```')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const mdOf = (blocks) => jupyterMarkdown(pmToMarkdown(specToPm({ content: blocks.map(strip) }), { ids: false }));
const quote = (md) => md.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
const cellId = (() => { let n = 0; return () => `lm${(++n).toString(16).padStart(6, '0')}`; })();
const lines = (src) => {
  const parts = String(src).split('\n');
  return parts.map((l, i) => (i < parts.length - 1 ? `${l}\n` : l)).filter((l, i, a) => l !== '' || i < a.length - 1);
};

/**
 * Dokument → Notebook (nbformat 4.5). `title`: kommt als Überschrift davor, wenn das Dokument nicht
 * selbst mit einer beginnt. Bilder mit data:-Adresse werden Anhänge, https:// bleibt Adresse; andere
 * (z. B. /api/…) vorher als data:-Adresse einsetzen. Ergebnis: das Notebook als Objekt.
 */
export function specToIpynb(spec, { title = '' } = {}) {
  const cells = [];
  let md = [];
  let attachments = {};
  let imageNo = 0;
  const flush = () => {
    const source = md.filter(Boolean).join('\n\n').trim();
    if (source) {
      cells.push({ cell_type: 'markdown', id: cellId(), metadata: {}, source: lines(source), ...(Object.keys(attachments).length ? { attachments } : {}) });
    }
    md = [];
    attachments = {};
  };
  const image = (b) => {
    const src = String(b.src || '');
    const alt = String(b.alt || b.caption || '').replace(/"/g, '&quot;');
    const width = b.width ? ` width="${String(b.width).replace(/"/g, '')}"` : '';
    const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(src);
    let url = src;
    if (m) {
      const ext = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[m[1]] || m[1].split('/')[1];
      const name = `bild${++imageNo}.${ext}`;
      attachments[name] = { [m[1]]: m[2] };
      url = `attachment:${name}`;
    } else if (!/^https:\/\//i.test(src)) {
      return `*[Bild: ${alt || 'ohne Adresse'}]*`;
    }
    const tag = width ? `<img src="${url}" alt="${alt}"${width}>` : `![${alt}](${url})`;
    return b.caption ? `${tag}\n\n*${b.caption}*` : tag;
  };
  const block = (b) => {
    if (!b || typeof b !== 'object') return '';
    switch (b.type) {
      case 'image': return image(b);
      case 'box': return quote([b.title ? `**${b.title}**` : '', ...(b.text ? [mdOf([{ type: 'text', text: b.text }])] : []), ...(b.blocks || []).map(block)].filter(Boolean).join('\n\n'));
      case 'solution': return quote(['**💡 Lösung**', ...(b.text ? [mdOf([{ type: 'text', text: b.text }])] : []), ...(b.blocks || []).map(block)].filter(Boolean).join('\n\n'));
      case 'columns': return (b.blocks || []).flatMap((c) => (c.blocks || []).map(block)).filter(Boolean).join('\n\n');
      case 'quiz': return `> 🧩 Quiz „${b.title || 'Quiz'}“ – läuft in LearningModules`;
      case 'karo': return b.pattern === 'frei' ? '' : '*(Platz zum Schreiben)*';
      case 'pagebreak': case 'spacer': case 'pdf': case 'group': return '';
      default: return mdOf([b]);
    }
  };
  const content = Array.isArray(spec?.content) ? spec.content : [];
  const first = content.find((b) => b && b.type !== 'pagebreak');
  if (title && !['heading', 'section'].includes(first?.type)) md.push(`# ${title}`);
  for (const b of content) {
    if (b?.type === 'code' && b.run === true) {
      flush();
      cells.push({ cell_type: 'code', id: cellId(), metadata: {}, execution_count: null, outputs: [], source: lines(String(b.code ?? '')) });
    } else {
      md.push(block(b));
    }
  }
  flush();
  return {
    cells,
    metadata: {
      kernelspec: { display_name: 'Python 3 (ipykernel)', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}
