import { strokeOutline, polyline, bounds, moved, MM } from './ink-geometry.js';
import { shapeCenter, arrowHead, dashArray, shapeTextLayout } from './ink-shapes.js';

// ==================== BESCHRIFTUNG ANZEIGEN ====================
//
// Die Beschriftung aus dem Stift-Editor (Hintergrund „Dokument“) in der
// gewöhnlichen Ansicht eines Dokuments zeigen – nur zum Ansehen. Das
// Dokument kommt dazu auf ein A4-Blatt wie im Editor (paper.css), sonst
// stimmten Zeilenumbrüche und damit die Lage der Striche nicht. Das Blatt
// wird auf die verfügbare Breite verkleinert. Dieselben Zeichenfunktionen
// nutzt der Editor (ink-editor.js) für Anzeige und Druck.

const TEXT_SIZE = 13;   // wie im Editor
const PX_PT = 0.75;     // 1 CSS-Pixel = 0,75 pt
const FIELD_MAX_CM = 16.5;

export const svgEl = (tag, attrs) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function itemSvg(item) {
  if (item.tool === 'marker') {
    return svgEl('path', { d: polyline(item.points), stroke: item.color, 'stroke-width': item.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-id': item.id });
  }
  return svgEl('path', { d: strokeOutline(item.points, item.width), fill: item.color, 'data-id': item.id });
}

/** Form (ink-shapes.js): Rechteck, Ellipse, Vieleck, Linie, Pfeil – gedreht um ihre Mitte. */
export function shapeSvg(item) {
  const width = item.width ?? 2;
  const stroke = item.color && width > 0 ? { stroke: item.color, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': item.dash === 'dot' ? 'round' : 'butt' } : { stroke: 'none' };
  const dash = dashArray(item.dash, width);
  if (dash) stroke['stroke-dasharray'] = dash;
  const fill = item.fill && item.kind !== 'line' && item.kind !== 'arrow'
    ? { fill: item.fill, 'fill-opacity': String(item.opacity ?? 1) } : { fill: 'none' };
  const g = svgEl('g', { 'data-id': item.id, class: 'ink-shape' });
  const r2 = (v) => Math.round(v * 100) / 100;
  if (item.kind === 'rect' || item.kind === 'ellipse') {
    const [cx, cy] = shapeCenter(item);
    if (item.rot) g.setAttribute('transform', `rotate(${item.rot} ${r2(cx)} ${r2(cy)})`);
    g.appendChild(item.kind === 'rect'
      ? svgEl('rect', { x: r2(item.x), y: r2(item.y), width: r2(item.w), height: r2(item.h), ...fill, ...stroke })
      : svgEl('ellipse', { cx: r2(cx), cy: r2(cy), rx: r2(item.w / 2), ry: r2(item.h / 2), ...fill, ...stroke }));
    appendShapeText(g, item, false);
    return g;
  }
  const pts = (item.points || []).map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
  g.appendChild(item.kind === 'polygon' ? svgEl('polygon', { points: pts, ...fill, ...stroke }) : svgEl('polyline', { points: pts, fill: 'none', ...stroke }));
  if (item.kind === 'arrow' && item.points?.length >= 2 && item.color) {
    const p = item.points;
    const heads = [arrowHead(p[p.length - 2], p[p.length - 1], width)];
    if (item.heads === 'both') heads.push(arrowHead(p[1], p[0], width));
    for (const h of heads) g.appendChild(svgEl('polygon', { points: h.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' '), fill: item.color, stroke: item.color, 'stroke-width': width / 2, 'stroke-linejoin': 'round' }));
  }
  appendShapeText(g, item, true);
  return g;
}

/** Text mittig in der Form; `ownRotation`: beim Vieleck dreht der Text selbst (die Gruppe ist ungedreht). */
function appendShapeText(g, item, ownRotation) {
  const t = shapeTextLayout(item);
  if (!t) return;
  const r2 = (v) => Math.round(v * 100) / 100;
  const text = svgEl('text', {
    x: r2(t.cx), y: r2(t.firstY), 'text-anchor': 'middle', 'font-size': t.size, fill: item.textColor || item.color || '#1e293b',
    'font-family': 'LM Sans, Liberation Sans, Arial, sans-serif', class: 'ink-shape-text',
  });
  // Rechteck, Ellipse: Die Gruppe ist schon um die Form gedreht – dazu nur die eigene Drehung des Texts.
  const turn = ownRotation ? t.rot : (item.textTurn || 0);
  if (turn) text.setAttribute('transform', `rotate(${turn} ${r2(t.cx)} ${r2(t.cy)})`);
  t.lines.forEach((line, i) => {
    const span = svgEl('tspan', { x: r2(t.cx), dy: i ? r2(t.lh) : 0 });
    span.textContent = line || ' ';
    text.appendChild(span);
  });
  g.appendChild(text);
}

/** Feld: weiße Fläche, darauf Karo (5 mm) oder Linien (10 mm) – oder nur weiß. */
export function fieldSvg(item) {
  const g = svgEl('g', { 'data-id': item.id, class: 'ink-field' });
  g.appendChild(svgEl('rect', { x: item.x, y: item.y, width: item.w, height: item.h, fill: '#fff' }));
  let d = '';
  if (item.pattern === 'karo') {
    for (let x = item.x + 5 * MM; x < item.x + item.w - 0.5; x += 5 * MM) d += `M${x.toFixed(2)},${item.y}V${item.y + item.h}`;
    for (let y = item.y + 5 * MM; y < item.y + item.h - 0.5; y += 5 * MM) d += `M${item.x},${y.toFixed(2)}H${item.x + item.w}`;
  } else if (item.pattern === 'linien') {
    for (let y = item.y + 10 * MM; y < item.y + item.h + 0.5; y += 10 * MM) d += `M${item.x},${y.toFixed(2)}H${item.x + item.w}`;
  }
  if (d) g.appendChild(svgEl('path', { d, stroke: item.pattern === 'karo' ? '#c7d2e0' : '#94a3b8', 'stroke-width': 0.6, fill: 'none' }));
  if (item.pattern === 'karo') g.appendChild(svgEl('rect', { x: item.x, y: item.y, width: item.w, height: item.h, fill: 'none', stroke: '#94a3b8', 'stroke-width': 0.6 }));
  return g;
}

/**
 * Striche, Felder und Textfelder eines Bausteins als SVG (Punkte, y ab seiner
 * Oberkante). `left`: Abstand des Bausteins vom linken Blattrand, `width`:
 * Blattbreite – x zählt ab dem Blattrand.
 */
export function inkSvgFor(items, left, width) {
  const h = Math.max(1, ...items.map((it) => { const b = bounds(it); return b.y + b.h; })) + 4;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${h}`, class: 'ink-print-layer' });
  svg.style.left = `${-left}pt`;
  svg.style.width = `${width}pt`;
  svg.style.height = `${h}pt`;
  inkGroups(items).forEach((g) => svg.appendChild(g));
  return svg;
}

/**
 * Striche eines Bausteins als knapp zugeschnittenes SVG für den Druck über den
 * Renderer (ink-print.js): `{ svg, x, y, w, h }` in Punkt, x ab dem Blattrand,
 * y ab der Oberkante des Bausteins – oder null ohne Inhalt.
 */
export function inkSvgBox(items) {
  const list = items.filter((it) => it.type !== 'text' || it.text);
  if (!list.length) return null;
  const bs = list.map(bounds);
  const pad = 2;
  const r = (v) => Math.round(v * 100) / 100;
  const x = r(Math.min(...bs.map((b) => b.x)) - pad);
  const y = r(Math.min(...bs.map((b) => b.y)) - pad);
  const w = r(Math.max(...bs.map((b) => b.x + b.w)) + pad - x);
  const h = r(Math.max(...bs.map((b) => b.y + b.h)) + pad - y);
  const svg = svgEl('svg', { viewBox: `${x} ${y} ${w} ${h}`, width: `${w}pt`, height: `${h}pt` });
  inkGroups(list).forEach((g) => svg.appendChild(g));
  return { svg: new XMLSerializer().serializeToString(svg), x, y, w, h };
}

/** Felder, Formen, Textmarker, Stift und Textfelder – in dieser Stapelfolge. */
function inkGroups(items) {
  const groups = ['fields', 'shapes', 'marker', 'pen', 'texts'].map((name) => svgEl('g', { class: `ink-print-${name}` }));
  for (const it of items) {
    if (it.type === 'field') groups[0].appendChild(fieldSvg(it));
    else if (it.type === 'shape') groups[1].appendChild(shapeSvg(it));
    else if (it.type === 'stroke') groups[it.tool === 'marker' ? 2 : 3].appendChild(itemSvg(it));
    else if (it.type === 'text' && it.text) {
      const size = it.size || TEXT_SIZE;
      const t = svgEl('text', { x: it.x + 3, y: it.y + 1 + size, fill: it.color || '#1e293b', 'font-size': size, 'font-family': 'LM Sans, Liberation Sans, Arial, sans-serif' });
      if (it.rot) {
        // Gedreht um die Mitte des Felds – wie im Editor.
        const cx = it.x + (it.w || 160) / 2;
        const cy = it.y + (it.h || size * 1.4) / 2;
        t.setAttribute('transform', `rotate(${it.rot} ${Math.round(cx * 100) / 100} ${Math.round(cy * 100) / 100})`);
      }
      it.text.split('\n').forEach((line, i) => {
        const span = svgEl('tspan', { x: it.x + 3, dy: i ? size * 1.3 : 0 });
        span.textContent = line || ' ';
        t.appendChild(span);
      });
      groups[4].appendChild(t);
    }
  }
  return groups;
}

/** Hat der Stand eine Beschriftung auf dem Dokument? */
export function hasPaperInk(stand) {
  const blocks = stand?.bg === 'paper' && stand.layer?.blocks;
  if (!blocks) return false;
  return Object.values(blocks).some((b) => (b.items || []).length || b.karoLines || b.karoWidth || b.karoPattern)
    || !!stand.layer.inserts?.length;
}

/** Baustein zu einer ID der Ebene: feste ID, „p:2.0“ oder Positions-ID pos2x0 (wie im Editor). */
function blockEl(sheet, bid) {
  if (!bid.startsWith('p:')) return sheet.querySelector(`[data-bid="${CSS.escape(bid)}"]`);
  const path = bid.slice(2);
  return sheet.querySelector(`[data-bid="${CSS.escape(bid)}"], [data-bid="pos${path.replace(/\./g, 'x')}"]`)
    || [...sheet.querySelectorAll(`[data-bpath="${CSS.escape(path)}"]`)].find((el) => !el.dataset.bid.startsWith('pos')) || null;
}

/**
 * Zwei Stände übereinander: `top` (z. B. die Beschriftung der Lehrkraft) kommt
 * zu `base` dazu – Schreibfelder und Einfügungen bleiben die von `base`.
 */
export function mergeStands(base, top) {
  if (!top?.layer?.blocks) return base;
  if (!base?.layer?.blocks) return { ...top, bg: 'paper' };
  const blocks = { ...base.layer.blocks };
  for (const [bid, entry] of Object.entries(top.layer.blocks)) {
    const items = entry.items || [];
    if (!items.length) continue;
    blocks[bid] = blocks[bid] ? { ...blocks[bid], items: [...(blocks[bid].items || []), ...items] } : { items, at: entry.at };
  }
  return { ...base, bg: 'paper', layer: { ...base.layer, blocks } };
}

/**
 * Striche einer Ebene (nur zum Ansehen) in ein gerendertes Blatt zeichnen –
 * je Baustein ein SVG (`.ink-print-layer`). `sheet`: das .lm-paper-Element.
 */
export function drawLayer(sheet, layer, { className = '' } = {}) {
  const docEl = sheet.querySelector('.docspec') || sheet;
  const r = sheet.getBoundingClientRect();
  const pageW = sheet.offsetWidth * PX_PT;
  const k = r.width ? pageW / r.width : PX_PT;
  const padLeft = parseFloat(getComputedStyle(sheet).paddingLeft) * PX_PT;
  for (const [bid, entry] of Object.entries(layer?.blocks || {})) {
    const items = entry.items || [];
    if (!items.length) continue;
    const host = bid === '_' ? null : blockEl(sheet, bid);
    let svg;
    if (host && host.getClientRects().length) {
      svg = inkSvgFor(items, (host.getBoundingClientRect().left - r.left) * k, pageW);
      host.appendChild(svg);
    } else {
      // Ohne Baustein: am Blatt selbst, wo die Striche zuletzt waren.
      const at = bid === '_' ? 0 : entry.at || 0;
      svg = inkSvgFor(items.map((it) => moved(it, 0, at)), padLeft, pageW);
      svg.classList.add('ink-print-free');
      docEl.prepend(svg);
    }
    if (className) svg.classList.add(className);
  }
}

/** Blatt in `view` wieder auflösen – das Dokument steht dann wie vorher da. */
export function removeInkView(view) {
  const wrap = view.querySelector(':scope .ink-view');
  if (!wrap) return;
  wrap._observer?.disconnect();
  const docEl = wrap.querySelector('.docspec');
  docEl?.querySelectorAll('.ink-print-layer, [data-inserted]').forEach((el) => el.remove());
  docEl?.querySelectorAll('.ds-karo[data-view-base]').forEach((k) => {
    k.style.height = k.dataset.viewBase;
    if (k.dataset.viewWidth) k.style.width = k.dataset.viewWidth; else k.style.removeProperty('width');
    k.className = k.dataset.viewClass;
    delete k.dataset.viewBase; delete k.dataset.viewWidth; delete k.dataset.viewClass;
  });
  if (docEl) wrap.replaceWith(docEl); else wrap.remove();
}

/**
 * Beschriftung `stand` ({ bg: 'paper', layer }) über das Dokument in `view`
 * legen. `view` enthält das gerenderte Dokument (.docspec, mit Block-Hüllen
 * data-bid). Ein zweiter Aufruf ersetzt die vorige Beschriftung.
 */
export async function showInkView(view, stand, { landscape = false } = {}) {
  removeInkView(view);
  if (!hasPaperInk(stand)) return false;
  const docEl = view.querySelector('.docspec');
  if (!docEl || !docEl.querySelector('[data-bid]')) return false;
  const layer = stand.layer;

  const wrap = document.createElement('div');
  wrap.className = 'ink-view';
  wrap.title = 'Mit deiner Beschriftung aus „Mit Stift bearbeiten“';
  const sheet = document.createElement('div');
  sheet.className = `lm-paper${landscape ? ' lm-landscape' : ''}`;
  docEl.replaceWith(wrap);
  wrap.appendChild(sheet);
  sheet.appendChild(docEl);

  // Selbst eingefügte Schreibfelder (⊕ im Editor).
  for (const ins of layer.inserts || []) {
    const box = document.createElement('div');
    box.className = 'ds-b';
    box.dataset.bid = ins.id;
    box.dataset.btype = 'karo';
    box.dataset.inserted = '1';
    const pattern = ['linien', 'leer', 'frei'].includes(ins.pattern) ? ` ds-karo-${ins.pattern}` : '';
    box.innerHTML = `<div class="ds-karo${pattern}" style="height:0.5cm" aria-hidden="true"></div>`;
    const after = ins.after ? docEl.querySelector(`[data-bid="${CSS.escape(ins.after)}"]`) : null;
    if (after) after.after(box);
    else if (ins.after === null) docEl.prepend(box);
    else docEl.appendChild(box);
  }
  // Größe und Muster der Schreibfelder, wie im Editor gezogen.
  for (const [bid, entry] of Object.entries(layer.blocks || {})) {
    if (!entry.karoLines && !entry.karoWidth && !entry.karoPattern) continue;
    const karo = bid === '_' ? null : blockEl(sheet, bid)?.querySelector('.ds-karo');
    if (!karo) continue;
    karo.dataset.viewBase = karo.style.height;
    karo.dataset.viewWidth = karo.style.width || '';
    karo.dataset.viewClass = karo.className;
    const base = Math.round(parseFloat(karo.style.height) / 0.5) || 1;
    if (entry.karoLines) karo.style.height = `${Math.max(base, entry.karoLines) * 0.5}cm`;
    if (entry.karoWidth && entry.karoWidth < FIELD_MAX_CM) karo.style.width = `${entry.karoWidth}cm`;
    if (entry.karoPattern) {
      karo.classList.remove('ds-karo-linien', 'ds-karo-leer', 'ds-karo-frei');
      if (entry.karoPattern !== 'karo') karo.classList.add(`ds-karo-${entry.karoPattern}`);
    }
  }
  try { await document.fonts?.ready; } catch (_) { /* ohne */ }

  // Messen in natürlicher Größe, dann verkleinern.
  wrap.style.zoom = '1';
  drawLayer(sheet, layer);
  const fit = () => {
    const room = view.clientWidth;
    if (room > 0) wrap.style.zoom = String(Math.min(1, room / sheet.offsetWidth));
  };
  fit();
  wrap._observer = new ResizeObserver(fit);
  wrap._observer.observe(view);
  return true;
}
