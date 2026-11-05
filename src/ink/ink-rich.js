import { renderDocSpecHtml } from '../doc/docspec.js';

// ==================== TEXTFLÄCHE ====================
//
// Ein freies Objekt mit formatiertem Inhalt: `{ type: 'text', x, y, w, h, content: [Bausteine], rot? }`.
// Der Text wird gesetzt wie im Dokument (1 Punkt der Ebene = 1 pt), auf dem Blatt und im Browser-Druck
// als HTML. Der Renderer nimmt nur einfaches SVG (safeInkSvg): Dafür gibt richToSvg die vom Browser
// gesetzten Zeilen als Text und Linien aus. Formeln stehen dort als LaTeX-Quelle.

export const PX_PT = 0.75; // 1 CSS-Pixel = 0,75 pt
const FONT = 'LM Sans, Liberation Sans, Arial, sans-serif';
const MONO = 'Liberation Mono, Courier New, monospace';

export const isRich = (item) => item?.type === 'text' && Array.isArray(item.content);
export const richHtml = (item) => renderDocSpecHtml({ content: item.content }, { showSolutions: true });
/** Steckt in der Fläche eine Formel? Im „PDF mit Vorlage“ steht sie dann als Quelle. */
export const richHasFormula = (item) => /<math[\s>]/.test(richHtml(item));

/**
 * Aufeinanderfolgende schlichte Absätze werden ein Baustein (`text` mit Leerzeile dazwischen, wie in der
 * Spec). Der Editor macht aus jeder Enter-Zeile einen Absatz; für die Lehrkraft ist es ein Textblock.
 * Absätze mit eigener Formatierung (Ausrichtung, Abstand …), Überschriften und Listen bleiben für sich.
 */
export function mergeParagraphs(content) {
  const plain = (b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string'
    && Object.keys(b).every((k) => k === 'type' || k === 'text' || k === 'id');
  const out = [];
  for (const b of content || []) {
    const last = out[out.length - 1];
    if (plain(b) && plain(last)) out[out.length - 1] = { ...last, text: `${last.text}\n\n${b.text}` };
    else out.push(b);
  }
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;
const seen = (color) => color && color !== 'transparent' && !/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(color);

let measureCtx = null;
/** Grundlinie einer Textzeile im Rechteck, das der Browser für sie meldet. */
function baseline(rect, cs) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = measureCtx.measureText('Hg');
  const size = parseFloat(cs.fontSize);
  const asc = m.fontBoundingBoxAscent ?? size * 0.8;
  const desc = m.fontBoundingBoxDescent ?? size * 0.2;
  return rect.top + (rect.height - (asc + desc)) / 2 + asc;
}

/**
 * Die Fläche als SVG-Gruppe nur aus Text und Linien. Braucht das DOM und die Stile des Dokuments:
 * Der Browser setzt den Text einmal unsichtbar, die Lage kommt von dort.
 */
export function richToSvg(item, svgEl) {
  const host = document.createElement('div');
  host.className = 'ink-rich-inner';
  host.style.cssText = `position:absolute;left:-20000px;top:0;width:${item.w / PX_PT}px;`;
  host.innerHTML = richHtml(item);
  document.body.appendChild(host);
  const o = host.getBoundingClientRect();
  const X = (px) => r2((px - o.left) * PX_PT + item.x);
  const Y = (px) => r2((px - o.top) * PX_PT + item.y);
  const g = svgEl('g', { 'data-id': item.id });
  if (item.rot) {
    const h = item.h || (o.height * PX_PT);
    g.setAttribute('transform', `rotate(${item.rot} ${r2(item.x + item.w / 2)} ${r2(item.y + h / 2)})`);
  }
  const line = (x1, y1, x2, y2, stroke, width) => g.appendChild(svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': r2(width) }));
  const write = (text, x, base, cs, deco = {}) => {
    const size = parseFloat(cs.fontSize) * PX_PT;
    const t = svgEl('text', {
      x: X(x), y: Y(base), fill: cs.color, 'font-size': r2(size),
      'font-family': /mono|courier|consolas/i.test(cs.fontFamily) ? MONO : FONT,
      ...(parseInt(cs.fontWeight, 10) >= 600 ? { 'font-weight': 'bold' } : {}),
      ...(cs.fontStyle === 'italic' ? { 'font-style': 'italic' } : {}),
    });
    t.textContent = text;
    g.appendChild(t);
    return size;
  };
  const textNode = (node, cs, deco) => {
    const words = [...node.textContent.matchAll(/\S+/g)];
    let current = null;
    const flush = () => {
      if (!current) return;
      const size = write(current.text, current.left, baseline(current.rect, cs), cs, deco);
      const base = Y(baseline(current.rect, cs));
      if (deco.underline) line(X(current.left), r2(base + size * 0.12), X(current.right), r2(base + size * 0.12), cs.color, size * 0.06);
      if (deco.strike) line(X(current.left), r2(base - size * 0.3), X(current.right), r2(base - size * 0.3), cs.color, size * 0.06);
      current = null;
    };
    for (const w of words) {
      const range = document.createRange();
      range.setStart(node, w.index);
      range.setEnd(node, w.index + w[0].length);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      if (current && Math.abs(rect.top - current.rect.top) < 2) {
        current.text += ` ${w[0]}`;
        current.right = rect.right;
      } else {
        flush();
        current = { text: w[0], left: rect.left, right: rect.right, rect };
      }
    }
    flush();
  };
  const walk = (el, deco) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.localName === 'math') {
      const tex = el.querySelector('annotation[encoding*="tex" i]')?.textContent || el.textContent;
      const rect = el.getBoundingClientRect();
      write(`$${tex.trim()}$`, rect.left, baseline(rect, cs), cs);
      return;
    }
    const r = el.getBoundingClientRect();
    if (seen(cs.backgroundColor) && r.width && r.height) {
      g.appendChild(svgEl('rect', { x: X(r.left), y: Y(r.top), width: r2(r.width * PX_PT), height: r2(r.height * PX_PT), fill: cs.backgroundColor }));
    }
    const side = (name, x1, y1, x2, y2) => {
      const width = parseFloat(cs[`border${name}Width`]);
      if (width > 0 && cs[`border${name}Style`] !== 'none' && seen(cs[`border${name}Color`])) line(X(x1), Y(y1), X(x2), Y(y2), cs[`border${name}Color`], width * PX_PT);
    };
    side('Top', r.left, r.top, r.right, r.top);
    side('Right', r.right, r.top, r.right, r.bottom);
    side('Bottom', r.left, r.bottom, r.right, r.bottom);
    side('Left', r.left, r.top, r.left, r.bottom);
    const decoLine = cs.textDecorationLine || '';
    const mine = { underline: deco.underline || decoLine.includes('underline'), strike: deco.strike || decoLine.includes('line-through') };
    if (el.localName === 'li' && cs.listStyleType !== 'none') {
      const list = el.parentElement;
      const n = [...list.children].indexOf(el) + Number(list.getAttribute('start') || 1);
      const mark = list.localName === 'ol' ? `${n}.` : '•';
      const first = document.createRange();
      first.selectNodeContents(el);
      const lineBox = first.getClientRects()[0] || r;
      write(mark, r.left - parseFloat(cs.fontSize) * (list.localName === 'ol' ? 1.4 : 0.9), baseline(lineBox, cs), cs);
    }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) textNode(c, cs, mine);
      else if (c.nodeType === 1) walk(c, mine);
    }
  };
  walk(host, {});
  host.remove();
  return g;
}
