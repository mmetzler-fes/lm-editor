// ==================== DATEIEN ÜBERNEHMEN ====================
//
// .odt und .pdf → neues Dokument (wie createZlm), samt Hinweisen, was nicht
// mitkam. Läuft im Browser, ohne Server:
//   .odt – Writer-Dokument lesen (odt.js) und zu Bausteinen machen
//          (htmlToDocSpec), wie „📄 Übernehmen“ in LearningModules.
//   .pdf – jede Seite als Bild (pdf.js), ohne den weißen Rand. Text mit
//          Struktur erkennt erst der worksheet-renderer.
// Bilder landen in media/, nicht als data:-Adresse im Dokument.

import { createZlm } from '../zlm/zlm.js';
import { odtToHtml } from './odt.js';
import { htmlToDocSpec } from '../doc/docspec-html.js';

const ODT_MIME = 'application/vnd.oasis.opendocument.text';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
// Satzbreite des A4-Blatts (src/css/paper.css): 21 cm − 2 cm − 2,5 cm.
const TEXT_WIDTH_CM = 16.5;

/** Art der Datei am Inhalt: 'zlm' | 'odt' | 'pdf' | null. */
export function sniff(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 120));
  if (head.startsWith('%PDF-')) return 'pdf';
  // ZIP mit unkomprimiertem mimetype vorne (ODF und .zlm)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (head.includes('application/vnd.lm-editor.zlm+zip')) return 'zlm';
    if (head.includes(ODT_MIME)) return 'odt';
  }
  return null;
}

const baseName = (name) => String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
// „1“ oder „A“ (erste Überschrift, leerer Titel im PDF) taugt nicht als Titel – dann der Dateiname.
const titleOf = (title, fileName, fallback) => {
  const t = String(title || '').trim();
  return (t.length >= 3 && /\p{L}/u.test(t) ? t : '') || baseName(fileName) || t || fallback;
};

function bytesOfDataUrl(url) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}

/** Bilder der Spec (data:) nach doc.media verschieben; src wird „media/bild-N.ext“. */
function moveImagesToMedia(doc) {
  let n = 0;
  const walk = (blocks) => (Array.isArray(blocks) ? blocks : []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'image' && typeof b.src === 'string' && b.src.startsWith('data:')) {
      const img = bytesOfDataUrl(b.src);
      if (img && EXT[img.type]) {
        const name = `bild-${++n}.${EXT[img.type]}`;
        doc.media[name] = img.bytes;
        b.src = `media/${name}`;
      }
    }
    walk(b.blocks);
  });
  walk(doc.spec.content);
}

/** .odt → { doc, warnings } */
export function importOdt(bytes, fileName = '') {
  const { title, html, warnings } = odtToHtml(bytes, fileName);
  const { spec, warnings: more } = htmlToDocSpec(html);
  const doc = createZlm({ title: titleOf(title, fileName, 'Dokument') });
  doc.spec = { titel: doc.manifest.title, ...spec };
  moveImagesToMedia(doc);
  return { doc, warnings: [...warnings, ...more] };
}

let pdfjs = null;
async function pdfLib() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Rechteck mit Inhalt (nicht fast weiß) auf der Leinwand, mit etwas Luft. */
function contentBox(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // leere Seite
  const pad = Math.round(Math.min(w, h) * 0.01);
  return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(w, x1 + pad) - Math.max(0, x0 - pad), h: Math.min(h, y1 + pad) - Math.max(0, y0 - pad) };
}

/**
 * .pdf → { doc, warnings }: jede Seite ein Bild (JPEG, 150 dpi), getrennt
 * durch Seitenumbrüche. `onProgress(seite, seiten)`.
 */
export async function importPdfPages(bytes, fileName = '', { dpi = 150, onProgress = null } = {}) {
  const lib = await pdfLib();
  // verbosity 0: nur Fehler (sonst z. B. „Knockout groups not supported“ je Seite)
  const pdf = await lib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const warnings = [];
  let title = '';
  try { title = (await pdf.getMetadata())?.info?.Title?.trim() || ''; } catch (_) { /* ohne */ }
  const doc = createZlm({ title: titleOf(title, fileName, 'PDF') });
  const content = [];
  let empty = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const box = contentBox(ctx, canvas.width, canvas.height);
    if (!box) { empty++; continue; }
    const crop = document.createElement('canvas');
    crop.width = box.w;
    crop.height = box.h;
    crop.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const blob = await new Promise((resolve) => crop.toBlob(resolve, 'image/jpeg', 0.88));
    const name = `seite-${i}.jpg`;
    doc.media[name] = new Uint8Array(await blob.arrayBuffer());
    // Nie größer als im Original, höchstens Satzbreite.
    const widthCm = Math.min(TEXT_WIDTH_CM, (box.w / dpi) * 2.54);
    if (content.length) content.push({ type: 'pagebreak' });
    content.push({ type: 'image', src: `media/${name}`, width: `${widthCm.toFixed(2)}cm`, alt: `Seite ${i}` });
    page.cleanup();
  }
  await pdf.destroy();
  doc.spec = { titel: doc.manifest.title, content };
  warnings.push('Das PDF ist als Bilder der Seiten übernommen: Darauf lässt sich schreiben, den Text ändern geht nicht.');
  if (empty) warnings.push(`${empty} leere Seite${empty === 1 ? '' : 'n'} ausgelassen.`);
  if (!content.length) warnings.push('Das PDF enthält keine sichtbaren Seiten.');
  return { doc, warnings };
}
