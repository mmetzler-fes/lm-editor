// Bildgruppe (Baustein `group`, docspec.js): Bilder an fester Stelle
// zueinander – im Druck eine echte Gruppe in LibreOffice. Hier die Rechnung
// dazu: Bilder zu einer Reihe gruppieren, die Gruppe in cm zum Anordnen,
// zurück in Prozent, Gruppierung lösen.

import { GROUP_MAX_ITEMS } from './docspec.js';

/** Breite einer Gruppe ohne Angabe: die Satzbreite von A4 hoch. */
export const GROUP_DEFAULT_WIDTH_CM = 16.5;
export const GROUP_MAX_WIDTH_CM = 25.5;
/** Abstand zwischen den Bildern einer Reihe in cm. */
export const GROUP_GAP_CM = 0.3;

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Breite in cm aus "12cm" / "120mm" – sonst `fallback`. */
export function cmOf(width, fallback = GROUP_DEFAULT_WIDTH_CM) {
  const m = /^(\d+(?:\.\d+)?)(cm|mm)$/.exec(String(width ?? '').trim());
  if (!m) return fallback;
  return m[2] === 'mm' ? Number(m[1]) / 10 : Number(m[1]);
}

/**
 * Bilder nebeneinander in einer Reihe, alle gleich hoch, mit kleinem Abstand.
 * `images`: [{ src, alt?, source?, aspect (Breite ÷ Höhe) }] – `source`: Zeichnung dazu (🖍 In Draw); `widthCm`: Breite der Reihe.
 */
export function groupRow(images, widthCm = GROUP_DEFAULT_WIDTH_CM) {
  const list = images.filter((i) => i && i.src).slice(0, GROUP_MAX_ITEMS)
    .map((i) => ({ ...i, aspect: i.aspect > 0 && Number.isFinite(i.aspect) ? i.aspect : 4 / 3 }));
  const width = Math.max(1, Math.min(GROUP_MAX_WIDTH_CM, widthCm));
  const gap = Math.min(GROUP_GAP_CM, width / 20);
  const height = (width - gap * (list.length - 1)) / list.reduce((s, i) => s + i.aspect, 0);
  let x = 0;
  const items = list.map((i) => {
    const w = i.aspect * height;
    const item = { src: i.src, ...(i.alt ? { alt: i.alt } : {}), ...(i.source ? { source: i.source } : {}), x, y: 0, w, h: height };
    x += w + gap;
    return item;
  });
  return fromCm(items);
}

/** Gruppe → Lage in cm: { widthCm, heightCm, items: [{ src, alt?, x, y, w, h }] }. */
export function toCm(block) {
  const widthCm = cmOf(block.width);
  const heightCm = widthCm * (Number(block.ratio) || 0.6);
  const items = (block.items || []).map((it) => ({
    ...it,
    x: (it.x / 100) * widthCm,
    y: (it.y / 100) * heightCm,
    w: (it.w / 100) * widthCm,
    h: (it.h / 100) * heightCm,
  }));
  return { widthCm, heightCm, items };
}

/**
 * Lage in cm → Gruppe. Die Gruppe ist so groß wie ihre Bilder zusammen –
 * Leerraum am Rand fällt weg. `base`: übrige Felder (id, caption …).
 */
export function fromCm(items, base = {}) {
  const list = items.filter((it) => it && it.src && it.w > 0 && it.h > 0);
  const x0 = Math.min(...list.map((it) => it.x));
  const y0 = Math.min(...list.map((it) => it.y));
  const widthCm = Math.max(...list.map((it) => it.x + it.w)) - x0;
  const heightCm = Math.max(...list.map((it) => it.y + it.h)) - y0;
  const pct = (v, of) => Math.max(0, Math.min(100, round((v / of) * 100)));
  const { items: _i, width: _w, ratio: _r, ...rest } = base;
  return {
    ...rest,
    type: 'group',
    width: `${round(Math.min(GROUP_MAX_WIDTH_CM, widthCm), 2)}cm`,
    ratio: round(heightCm / widthCm, 4),
    items: list.map(({ src, alt, source, x, y, w, h }) => {
      const px = pct(x - x0, widthCm);
      const py = pct(y - y0, heightCm);
      return {
        src,
        ...(alt ? { alt } : {}),
        ...(source ? { source } : {}),
        x: px,
        y: py,
        w: Math.max(0.5, Math.min(round(100 - px), pct(w, widthCm))),
        h: Math.max(0.5, Math.min(round(100 - py), pct(h, heightCm))),
      };
    }),
  };
}

/**
 * Gruppierung lösen: jedes Bild ein eigener Bild-Baustein in seiner Größe, von
 * oben nach unten, links nach rechts; die Unterschrift kommt ans letzte Bild.
 */
export function ungroup(block) {
  const { items } = toCm(block);
  const images = [...items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((it) => ({ type: 'image', src: it.src, ...(it.alt ? { alt: it.alt } : {}), width: `${round(it.w, 2)}cm`, ...(it.source ? { source: it.source } : {}) }));
  if (block.caption && images.length) images[images.length - 1].caption = block.caption;
  return images;
}
