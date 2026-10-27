// ==================== .odt LESEN ====================
//
// Aus LearningModules (src/core/interchange/odt/odt.ts) übertragen – dort
// läuft er auf dem Server, hier im Browser (und unter Node für die Tests).
// Ergebnis ist HTML; daraus macht htmlToDocSpec (src/doc/docspec-html.js)
// das Dokument.

import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.js';
// Statt der Node-Module (adm-zip, path): fflate und kleine Helfer – so läuft
// der Leser im Browser wie unter Node.
const extname = (p) => /\.[^./\\]*$/.exec(p)?.[0] ?? '';
const basename = (p, ext = '') => {
    const b = p.split(/[\\/]/).pop() ?? '';
    return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
function b64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
// Gegen ZIP-Bomben: höchstens so viel auspacken.
const MAX_ENTRIES = 5000;
const MAX_UNPACKED = 300 * 1024 * 1024;
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_m, e) => {
    if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? '';
});
function parseXml(xml) {
    const root = { name: '#root', attrs: {}, children: [] };
    const stack = [root];
    const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = token.exec(xml))) {
        const top = stack[stack.length - 1];
        if (m[1] !== undefined) {
            top.children.push(m[1]);
        }
        else if (m[3]) {
            if (m[2] === '/') {
                if (stack.length > 1)
                    stack.pop();
                continue;
            }
            const attrs = {};
            const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let a;
            while ((a = attrRe.exec(m[4] || '')))
                attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
            const node = { name: m[3], attrs, children: [] };
            top.children.push(node);
            if (m[5] !== '/')
                stack.push(node);
        }
        else if (m[6] !== undefined) {
            top.children.push(decode(m[6]));
        }
    }
    return root;
}
const elements = (n) => n.children.filter((c) => typeof c !== 'string');
const find = (n, name) => {
    for (const c of elements(n)) {
        if (c.name === name)
            return c;
        const deep = find(c, name);
        if (deep)
            return deep;
    }
    return undefined;
};
const textOf = (n) => typeof n === 'string' ? n : n.children.map(textOf).join('');
/** Name, unter dem die Standardvorlage für Zeichnungen geführt wird. */
const DEFAULT_GRAPHIC = '#default-graphic';
class Styles {
    styles = new Map();
    /** Listenvorlage → je Ebene nummeriert (ol) oder mit Aufzählungszeichen (ul). */
    lists = new Map();
    /** Bildfüllungen: Name → Pfad im Archiv (aus styles.xml). */
    fillImages = new Map();
    read(root) {
        if (!root)
            return;
        const visit = (n) => {
            if (n.name === 'style:style')
                this.readStyle(n);
            else if (n.name === 'style:default-style' && n.attrs['style:family'] === 'graphic') {
                this.readStyle({ ...n, attrs: { ...n.attrs, 'style:name': DEFAULT_GRAPHIC } });
            }
            else if (n.name === 'text:list-style')
                this.readList(n);
            else if (n.name === 'draw:fill-image') {
                if (n.attrs['draw:name'] && n.attrs['xlink:href'])
                    this.fillImages.set(n.attrs['draw:name'], n.attrs['xlink:href']);
            }
            else
                for (const c of elements(n))
                    visit(c);
        };
        visit(root);
    }
    readStyle(n) {
        const name = n.attrs['style:name'];
        if (!name)
            return;
        const info = {
            parent: n.attrs['style:parent-style-name'],
            displayName: n.attrs['style:display-name'] || name,
            listStyle: n.attrs['style:list-style-name'],
        };
        const tp = elements(n).find((c) => c.name === 'style:text-properties');
        if (tp) {
            const weight = tp.attrs['fo:font-weight'];
            if (weight)
                info.bold = weight === 'bold' || Number(weight) >= 600;
            const fstyle = tp.attrs['fo:font-style'];
            if (fstyle)
                info.italic = fstyle === 'italic' || fstyle === 'oblique';
            const ul = tp.attrs['style:text-underline-style'];
            if (ul)
                info.underline = ul !== 'none';
            const lt = tp.attrs['style:text-line-through-style'];
            if (lt)
                info.strike = lt !== 'none';
            const pos = tp.attrs['style:text-position'] || '';
            if (/^(super|\d)/.test(pos) && !/^0/.test(pos))
                info.position = 'super';
            if (/^(sub|-)/.test(pos))
                info.position = 'sub';
            const display = tp.attrs['text:display'];
            if (display)
                info.hidden = display === 'none';
        }
        const gp = elements(n).find((c) => c.name === 'style:graphic-properties');
        if (gp) {
            const g = gp.attrs;
            if (g['draw:stroke'])
                info.stroke = g['draw:stroke'];
            if (g['svg:stroke-color'])
                info.strokeColor = g['svg:stroke-color'];
            if (g['svg:stroke-width'])
                info.strokeWidth = g['svg:stroke-width'];
            if (g['draw:fill'])
                info.fill = g['draw:fill'];
            if (g['draw:fill-color'])
                info.fillColor = g['draw:fill-color'];
            if (g['draw:marker-start'] !== undefined)
                info.markerStart = g['draw:marker-start'];
            if (g['draw:marker-end'] !== undefined)
                info.markerEnd = g['draw:marker-end'];
            if (g['draw:fill-image-name'])
                info.fillImage = g['draw:fill-image-name'];
            if (g['fo:border'])
                info.border = g['fo:border'];
            if (g['fo:background-color'])
                info.background = g['fo:background-color'];
            if (g['draw:textarea-vertical-align'])
                info.textVAlign = g['draw:textarea-vertical-align'];
            if (g['draw:textarea-horizontal-align'])
                info.textHAlign = g['draw:textarea-horizontal-align'];
            const pad = g['fo:padding-left'] || g['fo:padding'];
            if (pad)
                info.padding = pad;
            if (g['style:wrap'])
                info.wrap = g['style:wrap'];
        }
        if (tp?.attrs['fo:color'])
            info.fontColor = tp.attrs['fo:color'];
        if (tp?.attrs['fo:font-size'] && !/%$/.test(tp.attrs['fo:font-size']))
            info.fontSize = tp.attrs['fo:font-size'];
        const pp = elements(n).find((c) => c.name === 'style:paragraph-properties');
        const align = pp?.attrs['fo:text-align'];
        if (align) {
            info.align = align === 'center' ? 'center' : align === 'end' || align === 'right' ? 'right'
                : align === 'justify' ? 'justify' : 'left';
        }
        const cp = elements(n).find((c) => c.name === 'style:table-column-properties');
        if (cp?.attrs['style:column-width'])
            info.columnWidth = cp.attrs['style:column-width'];
        const rp = elements(n).find((c) => c.name === 'style:table-row-properties');
        const height = rp?.attrs['style:row-height'] || rp?.attrs['style:min-row-height'];
        if (height)
            info.rowHeight = height;
        this.styles.set(name, { ...this.styles.get(name), ...info });
    }
    readList(n) {
        const name = n.attrs['style:name'];
        if (!name)
            return;
        const levels = new Map();
        for (const c of elements(n)) {
            const level = Number(c.attrs['text:level'] || 1);
            if (c.name === 'text:list-level-style-number') {
                // Ohne Zahlenformat ist die "Nummerierung" leer – dann eher eine Liste ohne Zeichen.
                levels.set(level, c.attrs['style:num-format'] ? 'ol' : 'ul');
            }
            else
                levels.set(level, 'ul');
        }
        this.lists.set(name, levels);
    }
    /** Eigenschaft mit Vererbung über die Elternvorlagen. */
    prop(name, key) {
        const seen = new Set();
        while (name && !seen.has(name)) {
            seen.add(name);
            const s = this.styles.get(name);
            if (!s)
                return undefined;
            if (s[key] !== undefined)
                return s[key];
            name = s.parent;
        }
        return undefined;
    }
    /** Eigenschaft einer Zeichnung, notfalls aus der Standardvorlage für Grafiken. */
    graphic(name, key) {
        return this.prop(name, key) ?? this.prop(DEFAULT_GRAPHIC, key);
    }
    /** Heißt die Vorlage (oder eine Elternvorlage) so? */
    inherits(name, pattern) {
        const seen = new Set();
        while (name && !seen.has(name)) {
            seen.add(name);
            if (pattern.test(name) || pattern.test(this.styles.get(name)?.displayName || ''))
                return true;
            name = this.styles.get(name)?.parent;
        }
        return false;
    }
    /** Pfad des Bildes einer Bildfüllung. */
    fillImage(name) {
        return name ? this.fillImages.get(name) : undefined;
    }
    listType(listStyle, level) {
        return this.lists.get(listStyle || '')?.get(level) || 'ul';
    }
}
// ---- Umwandlung ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const IMAGE_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
/** Länge wie "8.5cm", "3in" oder "120pt" in CSS-Pixel. */
const BESIDE_OPEN = '<!--lm-beside-->';
const BESIDE_CLOSE = '<!--/lm-beside-->';

/** Ende (Index hinter dem schließenden Tag) des Elements, das bei `start` beginnt – oder -1. */
function elementEnd(s, start) {
  const tag = /^<([a-z0-9]+)/i.exec(s.slice(start))?.[1];
  if (!tag) return -1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[1]) {
      if (--depth === 0) return re.lastIndex;
    } else if (!m[0].endsWith('/>')) depth++;
  }
  return -1;
}

/**
 * Textrahmen, die schmal neben dem Text standen (z. B. eine Wertetabelle neben
 * der Schaltung), hängen am Absatz davor – meist der Überschrift. Im Blatt
 * folgen sie dem Block, neben dem sie standen; über eine Überschrift hinweg
 * wandern sie nicht.
 */
function placeBeside(html) {
  let out = html;
  let from = 0;
  for (;;) {
    const a = out.indexOf(BESIDE_OPEN, from);
    if (a < 0) break;
    const b = out.indexOf(BESIDE_CLOSE, a);
    if (b < 0) break;
    const chunk = out.slice(a + BESIDE_OPEN.length, b);
    const rest = out.slice(b + BESIDE_CLOSE.length);
    const next = /^\s*(?:<p data-empty="1"><br><\/p>\s*)*(?=<(p|div|table|ul|ol|figure)\b)/i.exec(rest);
    const end = next ? elementEnd(rest, next[0].length) : -1;
    if (end > 0) {
      out = out.slice(0, a) + rest.slice(0, end) + chunk + rest.slice(end);
      from = a + end + chunk.length;
    } else {
      out = out.slice(0, a) + chunk + rest;
      from = a + chunk.length;
    }
  }
  return out;
}

/** Länge in cm, auf 0,1 gerundet – null ohne brauchbare Angabe. */
function lengthCm(value) {
    const m = /^([\d.]+)\s*(cm|mm|in|pt|pc|px)$/.exec(String(value || '').trim());
    const cm = m ? parseFloat(m[1]) * ({ cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, px: 2.54 / 96 }[m[2]] ?? 1) : 0;
    return cm > 0 ? Math.round(cm * 10) / 10 : null;
}
function toPx(value) {
    const m = /^([\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(value || '').trim());
    if (!m)
        return null;
    const n = parseFloat(m[1]);
    const factor = { cm: 37.8, mm: 3.78, in: 96, pt: 96 / 72, pc: 16, px: 1 }[m[2] || 'px'] ?? 1;
    return Math.round(n * factor);
}
const SKIP = new Set([
    'text:sequence-decls', 'text:variable-decls', 'text:user-field-decls', 'office:forms',
    'text:tracked-changes', 'text:soft-page-break', 'text:bookmark', 'text:bookmark-start',
    'text:bookmark-end', 'text:reference-mark', 'text:reference-mark-start', 'text:reference-mark-end',
    'office:annotation', 'office:annotation-end', 'text:note', 'text:table-of-content',
    'text:alphabetical-index', 'text:illustration-index', 'text:table-index', 'text:bibliography',
    'table:table-column', 'table:table-columns', 'table:table-column-group', 'svg:title', 'svg:desc',
]);
const DRAWINGS = new Set([
    'draw:g', 'draw:custom-shape', 'draw:line', 'draw:polygon', 'draw:polyline', 'draw:rect',
    'draw:ellipse', 'draw:circle', 'draw:path', 'draw:connector', 'draw:measure', 'draw:control',
]);
// ---- Zeichnungen als SVG ----
/**
 * Wandelt Zeichnungselemente (Linien, Rechtecke, Ellipsen, Polygone,
 * Pfade, Verbinder, einfache Formen, Gruppen) in ein SVG-Bild.
 *
 * Alle Zeichnungen eines Absatzes landen in einem gemeinsamen Bild, damit
 * ihre Lage zueinander erhalten bleibt – zusammen mit den frei verankerten
 * Bildern und Textrahmen desselben Absatzes (Beschriftungen auf einem Foto,
 * Schrittkästen in einem Ablaufplan). Bildfüllungen werden als Bild unter
 * die Form gelegt, Textrahmen behalten Rand, Hintergrund und Ausrichtung.
 *
 * Formen aus der Formen-Palette (Sterne, Sprechblasen …) werden nur
 * übernommen, wenn ihr Umriss ohne Formeln beschrieben ist; sonst
 * erscheinen sie als Rechteck bzw. Ellipse mit ihrem Text.
 */
class DrawingSvg {
    styles;
    imageData;
    parts = [];
    markers = new Map();
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    shapes = 0;
    constructor(styles, imageData) {
        this.styles = styles;
        this.imageData = imageData;
    }
    grow(x, y) {
        this.minX = Math.min(this.minX, x);
        this.minY = Math.min(this.minY, y);
        this.maxX = Math.max(this.maxX, x);
        this.maxY = Math.max(this.maxY, y);
    }
    /** ODF-Transformation ("rotate (0.5) translate (2cm 1cm)") als SVG-Attribut. */
    transform(n) {
        const t = n.attrs['draw:transform'];
        if (!t)
            return { attr: '', dx: 0, dy: 0 };
        const ops = [];
        let dx = 0;
        let dy = 0;
        for (const m of t.matchAll(/(rotate|translate|scale|skewX|skewY)\s*\(([^)]*)\)/g)) {
            const args = m[2].trim().split(/[\s,]+/);
            if (m[1] === 'rotate')
                ops.push(`rotate(${(-parseFloat(args[0]) * 180) / Math.PI})`);
            else if (m[1] === 'translate') {
                const x = toPx(args[0]) ?? 0;
                const y = toPx(args[1] ?? '0') ?? 0;
                dx += x;
                dy += y;
                ops.push(`translate(${x} ${y})`);
            }
            else if (m[1] === 'scale')
                ops.push(`scale(${parseFloat(args[0])} ${parseFloat(args[1] ?? args[0])})`);
        }
        // ODF wendet die Schritte in Leserichtung an, SVG von rechts nach links.
        return { attr: ops.length ? ` transform="${ops.reverse().join(' ')}"` : '', dx, dy };
    }
    paint(n, closed) {
        const style = n.attrs['draw:style-name'];
        const g = (k) => this.styles.graphic(style, k);
        const stroke = g('stroke') === 'none' ? 'none' : g('strokeColor') || '#3465a4';
        const width = Math.max(1, toPx(g('strokeWidth') || '0') || 1);
        const dash = g('stroke') === 'dash' ? ' stroke-dasharray="6 4"' : '';
        const fill = !closed || g('fill') === 'none' || g('fill') === 'bitmap' || g('fill') === 'gradient' && !g('fillColor') ? 'none'
            : g('fillColor') || '#729fcf';
        let markers = '';
        if (stroke !== 'none') {
            if (g('markerEnd'))
                markers += ` marker-end="url(#${this.marker(stroke)})"`;
            if (g('markerStart'))
                markers += ` marker-start="url(#${this.marker(stroke)})"`;
        }
        return `stroke="${esc(stroke)}" stroke-width="${width}" fill="${esc(fill)}"${dash}${markers}`;
    }
    marker(color) {
        let id = this.markers.get(color);
        if (!id) {
            id = `a${this.markers.size}`;
            this.markers.set(color, id);
        }
        return id;
    }
    box(n) {
        return {
            x: toPx(n.attrs['svg:x']) ?? 0,
            y: toPx(n.attrs['svg:y']) ?? 0,
            // Mitwachsende Textrahmen haben oft nur eine Mindestgröße.
            w: toPx(n.attrs['svg:width']) ?? toPx(n.attrs['fo:min-width']) ?? 0,
            h: toPx(n.attrs['svg:height']) ?? toPx(n.attrs['fo:min-height']) ?? 0,
        };
    }
    /**
     * Bildfüllung einer Form: das Bild in ihrem Rahmen, darüber zeichnet die
     * Form selbst nur noch ihren Umriss. Für nicht rechteckige Formen ist das
     * eine Näherung – in Arbeitsblättern sind es praktisch immer Rechtecke.
     */
    bitmap(n, b, tr) {
        const style = n.attrs['draw:style-name'];
        if (this.styles.graphic(style, 'fill') !== 'bitmap')
            return '';
        const href = this.styles.fillImage(this.styles.graphic(style, 'fillImage'));
        const data = href ? this.imageData(href) : null;
        return data
            ? `<image href="${data}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="none"${tr}/>`
            : '';
    }
    /** Zeilen eines Absatzes: Zeilenumbrüche, Tabs und Leerzeichen wie im Dokument. */
    lineText(p) {
        const walk = (n) => {
            if (typeof n === 'string')
                return n.replace(/\s+/g, ' ');
            if (n.name === 'text:line-break')
                return '\n';
            if (n.name === 'text:tab')
                return '    ';
            if (n.name === 'text:s')
                return ' '.repeat(Math.min(Number(n.attrs['text:c'] || 1), 20));
            if (DRAWINGS.has(n.name) || n.name === 'draw:frame')
                return '';
            return n.children.map(walk).join('');
        };
        return walk(p).split('\n');
    }
    /** Schriftgröße eines Absatzes (oder seines ersten Abschnitts) in px. */
    fontSize(p, fallback) {
        const own = toPx(this.styles.prop(p.attrs['text:style-name'], 'fontSize'));
        if (own)
            return own;
        const span = elements(p).find((c) => c.name === 'text:span' && this.styles.prop(c.attrs['text:style-name'], 'fontSize'));
        return toPx(this.styles.prop(span?.attrs['text:style-name'], 'fontSize')) || fallback;
    }
    /**
     * Text in einer Form oder einem Textrahmen. Ausrichtung, Schriftgröße,
     * Fettdruck und Farbe kommen aus den Absatzvorlagen; ohne Angabe gelten
     * die Vorgaben des Aufrufers (Formen: mittig, Textrahmen: oben links).
     */
    textBlock(container, b, tr, opts) {
        const paras = elements(container).filter((c) => c.name === 'text:p' || c.name === 'text:h');
        const lines = [];
        for (const p of paras) {
            const style = p.attrs['text:style-name'];
            const size = this.fontSize(p, 14.7);
            const align = this.styles.prop(style, 'align') || opts.h;
            const span = elements(p).find((c) => c.name === 'text:span');
            const bold = !!(this.styles.prop(style, 'bold') || this.styles.prop(span?.attrs['text:style-name'], 'bold'));
            const color = this.styles.prop(style, 'fontColor') || this.styles.prop(span?.attrs['text:style-name'], 'fontColor') || opts.color || '#000000';
            for (const text of this.lineText(p))
                lines.push({ text: text.replace(/\s+$/, ''), size, align, bold, color });
        }
        // Leerzeilen am Ende fallen weg; die am Anfang sind oft gewollter Abstand.
        while (lines.length && !lines[lines.length - 1].text.trim())
            lines.pop();
        if (!lines.length)
            return '';
        const total = lines.reduce((sum, l) => sum + l.size * 1.2, 0);
        let y = opts.v === 'bottom' ? b.y + b.h - opts.pad - total
            : opts.v === 'top' ? b.y + opts.pad
                : b.y + b.h / 2 - total / 2;
        let out = '';
        for (const l of lines) {
            y += l.size * 1.2;
            if (!l.text.trim())
                continue;
            const x = l.align === 'center' ? b.x + b.w / 2 : l.align === 'right' ? b.x + b.w - opts.pad : b.x + opts.pad;
            const anchor = l.align === 'center' ? 'middle' : l.align === 'right' ? 'end' : 'start';
            out += `<text x="${x.toFixed(1)}" y="${(y - l.size * 0.28).toFixed(1)}" font-family="Arial, Helvetica, sans-serif"` +
                ` font-size="${l.size.toFixed(1)}"${l.bold ? ' font-weight="bold"' : ''} fill="${esc(l.color)}"` +
                ` text-anchor="${anchor}" xml:space="preserve"${tr}>${esc(l.text)}</text>`;
        }
        return out;
    }
    /** Text in einer Form – standardmäßig mittig, sofern die Form nichts anderes sagt. */
    label(n, b, tr) {
        const style = n.attrs['draw:style-name'];
        const h = this.styles.graphic(style, 'textHAlign');
        return this.textBlock(n, b, tr, {
            h: h === 'left' ? 'left' : h === 'right' ? 'right' : 'center',
            v: this.styles.graphic(style, 'textVAlign') || 'middle',
            pad: toPx(this.styles.graphic(style, 'padding')) ?? 5,
            color: this.styles.graphic(n.attrs['draw:text-style-name'], 'fontColor'),
        });
    }
    /** Textrahmen: Rand und Hintergrund wie im Dokument, Text oben links. */
    textFrame(n, box, b, tr) {
        const style = n.attrs['draw:style-name'];
        const g = (k) => this.styles.graphic(style, k);
        const border = /([\d.]+\s*(?:pt|cm|mm|in|px))\s+(solid|dashed|dotted|double)\s+(#[0-9a-f]{6})/i.exec(g('border') || '');
        const bg = g('fill') === 'solid' ? g('fillColor') : g('background') && g('background') !== 'transparent' ? g('background') : '';
        let out = this.bitmap(n, b, tr);
        if (border || bg) {
            const sw = border ? Math.max(1, toPx(border[1]) || 1) : 0;
            out += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${esc(bg || 'none')}"` +
                `${border ? ` stroke="${esc(border[3])}" stroke-width="${sw}"${border[2] === 'dashed' ? ' stroke-dasharray="6 4"' : ''}` : ''}${tr}/>`;
        }
        return out + this.textBlock(box, b, tr, {
            h: 'left',
            v: g('textVAlign') || 'top',
            pad: toPx(g('padding')) ?? 2,
        });
    }
    /** Punkte einer viewBox auf den Rahmen der Form umrechnen. */
    fit(n, b) {
        const vb = (n.attrs['svg:viewBox'] || '').trim().split(/[\s,]+/).map(Number);
        const [vx, vy, vw, vh] = vb.length === 4 && vb[2] && vb[3] ? vb : [0, 0, b.w || 1, b.h || 1];
        return { sx: (b.w || vw) / vw, sy: (b.h || vh) / vh, vx, vy };
    }
    add(n) {
        const t = this.transform(n);
        const b = this.box(n);
        // Für den Rahmen des Bildes zählt die verschobene Lage; die Drehung
        // wird dabei nicht nachgerechnet – etwas Rand fängt das auf.
        const ox = b.x + t.dx;
        const oy = b.y + t.dy;
        switch (n.name) {
            case 'draw:g': {
                let any = false;
                for (const c of elements(n))
                    any = this.add(c) || any;
                return any;
            }
            case 'draw:line':
            case 'draw:connector': {
                const x1 = toPx(n.attrs['svg:x1']) ?? 0;
                const y1 = toPx(n.attrs['svg:y1']) ?? 0;
                const x2 = toPx(n.attrs['svg:x2']) ?? 0;
                const y2 = toPx(n.attrs['svg:y2']) ?? 0;
                this.grow(x1 + t.dx, y1 + t.dy);
                this.grow(x2 + t.dx, y2 + t.dy);
                this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${this.paint(n, false)}${t.attr}/>`);
                this.parts.push(this.label(n, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, t.attr));
                break;
            }
            case 'draw:rect': {
                const r = toPx(n.attrs['draw:corner-radius']) ?? 0;
                this.parts.push(this.bitmap(n, b, t.attr));
                this.parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"${r ? ` rx="${r}"` : ''} ${this.paint(n, true)}${t.attr}/>`);
                this.parts.push(this.label(n, b, t.attr));
                break;
            }
            case 'draw:ellipse':
            case 'draw:circle':
                this.parts.push(this.bitmap(n, b, t.attr));
                this.parts.push(`<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" ${this.paint(n, true)}${t.attr}/>`);
                this.parts.push(this.label(n, b, t.attr));
                break;
            case 'draw:polygon':
            case 'draw:polyline': {
                const f = this.fit(n, b);
                const pts = (n.attrs['draw:points'] || '').trim().split(/\s+/).map((p) => p.split(',').map(Number))
                    .filter((p) => p.length === 2 && p.every(Number.isFinite))
                    .map(([px, py]) => `${b.x + (px - f.vx) * f.sx},${b.y + (py - f.vy) * f.sy}`)
                    .join(' ');
                const closed = n.name === 'draw:polygon';
                if (closed)
                    this.parts.push(this.bitmap(n, b, t.attr));
                this.parts.push(`<${closed ? 'polygon' : 'polyline'} points="${pts}" ${this.paint(n, closed)}${t.attr}/>`);
                break;
            }
            case 'draw:path': {
                const f = this.fit(n, b);
                const d = n.attrs['svg:d'] || '';
                const closed = /z\s*$/i.test(d.trim());
                if (closed)
                    this.parts.push(this.bitmap(n, b, t.attr));
                this.parts.push(`<path d="${esc(d)}" vector-effect="non-scaling-stroke" ${this.paint(n, closed)}` +
                    ` transform="${t.attr ? t.attr.slice(12, -1) + ' ' : ''}translate(${b.x} ${b.y}) scale(${f.sx} ${f.sy}) translate(${-f.vx} ${-f.vy})"/>`);
                break;
            }
            case 'draw:custom-shape': {
                const geo = elements(n).find((c) => c.name === 'draw:enhanced-geometry');
                const type = geo?.attrs['draw:type'] || '';
                const path = geo?.attrs['draw:enhanced-path'] || '';
                this.parts.push(this.bitmap(n, b, t.attr));
                // Umriss ohne Formeln ($, ?) und nur mit einfachen Befehlen: direkt übernehmen.
                if (geo && path && !/[?$]/.test(path) && /^[\sMLCZNFS\d.,-]+$/.test(path)) {
                    const f = this.fit(geo, b);
                    const noFill = /F/.test(path);
                    const d = path.replace(/[NFS]/g, ' ').trim();
                    this.parts.push(`<path d="${esc(d)}" vector-effect="non-scaling-stroke" ${this.paint(n, !noFill)}` +
                        ` transform="${t.attr ? t.attr.slice(12, -1) + ' ' : ''}translate(${b.x} ${b.y}) scale(${f.sx} ${f.sy}) translate(${-f.vx} ${-f.vy})"/>`);
                }
                else if (/ellipse|circle|ring/i.test(type)) {
                    this.parts.push(`<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" ${this.paint(n, true)}${t.attr}/>`);
                }
                else {
                    const r = /round/i.test(type) ? Math.min(b.w, b.h) / 6 : 0;
                    this.parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"${r ? ` rx="${r}"` : ''} ${this.paint(n, true)}${t.attr}/>`);
                }
                this.parts.push(this.label(n, b, t.attr));
                break;
            }
            case 'draw:frame': {
                // Mehrere draw:image: das erste lesbare (z. B. PNG-Ersatz für eine SVM-Grafik).
                let data = null;
                for (const img of elements(n).filter((c) => c.name === 'draw:image')) {
                    data = this.imageData(img.attrs['xlink:href'] || '');
                    if (data)
                        break;
                }
                if (data) {
                    this.parts.push(`<image href="${data}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" preserveAspectRatio="none"${t.attr}/>`);
                }
                else {
                    const box = elements(n).find((c) => c.name === 'draw:text-box');
                    if (!box)
                        return false;
                    this.parts.push(this.textFrame(n, box, b, t.attr));
                }
                break;
            }
            default:
                return false;
        }
        if (n.name !== 'draw:line' && n.name !== 'draw:connector') {
            this.grow(ox, oy);
            this.grow(ox + b.w, oy + b.h);
        }
        this.shapes++;
        return true;
    }
    /** Das fertige Bild als <img>, oder '' wenn nichts darzustellen war. */
    toImg() {
        if (!this.shapes || !Number.isFinite(this.minX))
            return '';
        const pad = 12;
        const x = Math.floor(this.minX - pad);
        const y = Math.floor(this.minY - pad);
        const w = Math.ceil(this.maxX - this.minX + 2 * pad);
        const h = Math.ceil(this.maxY - this.minY + 2 * pad);
        const defs = [...this.markers].map(([color, id]) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
            `<path d="M0,0L10,5L0,10z" fill="${esc(color)}"/></marker>`).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
            (defs ? `<defs>${defs}</defs>` : '') + this.parts.join('') + '</svg>';
        return `<img src="data:image/svg+xml;base64,${b64(new TextEncoder().encode(svg))}" alt="Zeichnung" width="${w}">`;
    }
}
/**
 * Titel aus den Metadaten nur, wenn er nach einem Titel aussieht: Vorlagen
 * tragen oft „1“, „Unbenannt“ oder den Namen der Vorlage – dann zählen die
 * erste Überschrift bzw. der Dateiname.
 */
export function usableTitle(t) {
  const s = String(t || '').trim();
  return (s.match(/\p{L}/gu) || []).length >= 3 && !/^(unbenannt|untitled|ohne titel|titel|dokument|document|vorlage)\s*\d*$/i.test(s);
}

export function odtToHtml(buffer, fileName = '') {
    let files;
    try {
        let count = 0;
        let total = 0;
        files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), {
            filter(f) {
                count++;
                total += f.originalSize;
                if (count > MAX_ENTRIES || total > MAX_UNPACKED)
                    throw new Error('zu groß');
                return !f.name.endsWith('/');
            },
        });
    }
    catch {
        throw new Error('Die Datei ist kein gültiges OpenDocument (.odt).');
    }
    const zip = { getEntry: (name) => (files[name] ? { getData: () => files[name] } : null) };
    const read = (entry) => { const d = zip.getEntry(entry)?.getData(); return d ? strFromU8(d) : undefined; };
    const mimetype = (read('mimetype') || '').trim();
    if (mimetype && !mimetype.startsWith('application/vnd.oasis.opendocument.text')) {
        throw new Error('Das ist kein Writer-Dokument (.odt).');
    }
    const contentXml = read('content.xml');
    if (!contentXml)
        throw new Error('content.xml fehlt – die Datei ist beschädigt.');
    const content = parseXml(contentXml);
    const styles = new Styles();
    const stylesXml = read('styles.xml');
    if (stylesXml)
        styles.read(parseXml(stylesXml));
    styles.read(find(content, 'office:automatic-styles'));
    const body = find(content, 'office:text');
    if (!body)
        throw new Error('Das Dokument enthält keinen Text.');
    const stats = { headings: 0, paragraphs: 0, tables: 0, images: 0, drawings: 0 };
    let skippedDrawings = 0;
    let skippedImages = 0;
    let skippedLarge = 0;
    let linkedImages = 0;
    let imageBytes = 0;
    // ---- Bilder ----
    const image = (frame) => {
        for (const img of elements(frame).filter((c) => c.name === 'draw:image')) {
            const href = img.attrs['xlink:href'] || '';
            const type = IMAGE_TYPES[extname(href).slice(1).toLowerCase()];
            if (/^[a-z]+:/i.test(href) || href.startsWith('../') || href.startsWith('/')) {
                // Nur verknüpft, nicht im Dokument eingebettet.
                linkedImages++;
                return '';
            }
            if (!type)
                continue;
            const data = zip.getEntry(href.replace(/^\.\//, ''))?.getData();
            if (!data) {
                linkedImages++;
                return '';
            }
            if (data.length > MAX_IMAGE_BYTES || imageBytes + data.length > MAX_TOTAL_IMAGE_BYTES) {
                skippedLarge++;
                return '';
            }
            imageBytes += data.length;
            stats.images++;
            const width = toPx(frame.attrs['svg:width']);
            const alt = textOf(elements(frame).find((c) => c.name === 'svg:title') || '') || frame.attrs['draw:name'] || '';
            return `<img src="data:${type};base64,${b64(data)}" alt="${esc(alt)}"${width ? ` width="${width}"` : ''}>`;
        }
        return null;
    };
    /** Bilddaten für eine Zeichnung (als data:-URL), sofern eingebettet und lesbar. */
    const imageData = (href) => {
        const type = IMAGE_TYPES[extname(href).slice(1).toLowerCase()];
        if (!type || /^[a-z]+:/i.test(href))
            return null;
        const data = zip.getEntry(href.replace(/^\.\//, ''))?.getData();
        if (!data || data.length > MAX_IMAGE_BYTES || imageBytes + data.length > MAX_TOTAL_IMAGE_BYTES)
            return null;
        imageBytes += data.length;
        return `data:${type};base64,${b64(data)}`;
    };
    /** Mehrere Zeichnungselemente zu einem Bild; zählt, was nicht ging. */
    const drawing = (nodes) => {
        const svg = new DrawingSvg(styles, imageData);
        // Stapelreihenfolge wie im Dokument: Bilder unten, Beschriftungen oben.
        const z = (n) => Number(n.attrs['draw:z-index'] ?? 0);
        for (const n of [...nodes].sort((a, b) => z(a) - z(b)))
            if (!svg.add(n))
                skippedDrawings++;
        const img = svg.toImg();
        if (img) {
            stats.images++;
            stats.drawings++;
        }
        return img;
    };
    // ---- Inline-Inhalt ----
    const wrap = (html, styleName, skipBold = false) => {
        if (!html)
            return html;
        if (!skipBold && styles.prop(styleName, 'bold'))
            html = `<strong>${html}</strong>`;
        if (styles.prop(styleName, 'italic'))
            html = `<em>${html}</em>`;
        if (styles.prop(styleName, 'underline'))
            html = `<u>${html}</u>`;
        if (styles.prop(styleName, 'strike'))
            html = `<s>${html}</s>`;
        const pos = styles.prop(styleName, 'position');
        if (pos === 'sub')
            html = `<sub>${html}</sub>`;
        if (pos === 'super')
            html = `<sup>${html}</sup>`;
        return html;
    };
    /** Frei verankert (am Absatz, Zeichen, Seite) statt wie ein Buchstabe im Text. */
    const anchored = (c) => !!c.attrs['text:anchor-type'] && c.attrs['text:anchor-type'] !== 'as-char';
    const isImageFrame = (f) => elements(f).some((c) => c.name === 'draw:image');
    const isTextFrame = (f) => elements(f).some((c) => c.name === 'draw:text-box');
    /**
     * Seite, an der ein einzelnes verankertes Bild stehen soll, damit der Text
     * es umfließt wie im Dokument – oder null für eine eigene Zeile (kein
     * Umfluss eingestellt oder breiter als gut die Hälfte des Satzspiegels).
     */
    const floatSide = (f) => {
        const wrap = styles.graphic(f.attrs['draw:style-name'], 'wrap');
        if (wrap === 'none' || wrap === 'run-through')
            return null;
        const x = toPx(f.attrs['svg:x']) ?? 0;
        const w = toPx(f.attrs['svg:width']) ?? 0;
        if (!w || w > 380)
            return null;
        // Satzspiegel einer A4-Seite mit üblichen Rändern: rund 17 cm.
        return x + w / 2 > 320 ? 'right' : 'left';
    };
    const inline = (n) => {
        const out = [];
        // Zeichnungen eines Absatzes werden gesammelt und am Ende als ein Bild
        // ausgegeben – so bleibt ihre Lage zueinander erhalten. Frei verankerte
        // Rahmen (Bilder, Textrahmen) desselben Absatzes kommen mit hinein, wenn
        // sie zusammengehören: Beschriftungen auf einem Foto, Schrittkästen in
        // einem Ablaufplan, Bilder nebeneinander.
        const shapes = [];
        const frames = [];
        for (const c of n.children) {
            if (typeof c === 'string') {
                out.push({ inline: esc(c.replace(/\s+/g, ' ')) });
                continue;
            }
            if (SKIP.has(c.name))
                continue;
            switch (c.name) {
                case 'text:s': {
                    const count = Math.min(Number(c.attrs['text:c'] || 1), 40);
                    out.push({ inline: '&nbsp;'.repeat(count) });
                    break;
                }
                case 'text:tab':
                    out.push({ inline: '&emsp;' });
                    break;
                case 'text:line-break':
                    out.push({ inline: '<br>' });
                    break;
                case 'text:span': {
                    const inner = inline(c);
                    for (const seg of inner) {
                        out.push('inline' in seg ? { inline: wrap(seg.inline, c.attrs['text:style-name']) } : seg);
                    }
                    break;
                }
                case 'text:a': {
                    const href = c.attrs['xlink:href'] || '';
                    const inner = inline(c);
                    const text = inner.map((s) => ('inline' in s ? s.inline : '')).join('');
                    out.push({ inline: /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}">${text}</a>` : text });
                    inner.filter((s) => 'block' in s).forEach((s) => out.push(s));
                    break;
                }
                case 'draw:frame': {
                    if (anchored(c)) {
                        frames.push(c);
                        break;
                    }
                    const img = image(c);
                    if (img !== null) {
                        if (img)
                            out.push({ inline: img });
                        break;
                    }
                    const box = elements(c).find((x) => x.name === 'draw:text-box');
                    if (box) {
                        const inner = textBox(c, box);
                        if (inner)
                            out.push({ block: inner });
                        break;
                    }
                    if (elements(c).some((x) => x.name === 'draw:image' || x.name === 'draw:object' || x.name === 'draw:object-ole')) {
                        skippedImages++;
                    }
                    break;
                }
                case 'draw:a':
                    inline(c).forEach((s) => out.push(s));
                    break;
                default:
                    if (DRAWINGS.has(c.name)) {
                        shapes.push(c);
                        break;
                    }
                    // Unbekanntes Inline-Element (Feld, Querverweis, Nummer): Text übernehmen.
                    inline(c).forEach((s) => out.push(s));
            }
        }
        // Zusammensetzen, wenn es Formen gibt oder Text auf/neben Bildern steht.
        const compose = shapes.length > 0 ||
            (frames.length > 1 && frames.some(isTextFrame) && frames.some(isImageFrame));
        if (compose) {
            const img = drawing([...frames, ...shapes]);
            if (img)
                out.push({ block: `<p>${img}</p>` });
            return out;
        }
        for (const f of frames) {
            const img = image(f);
            if (img !== null) {
                if (!img)
                    continue;
                const side = floatSide(f);
                if (side)
                    out.push({ float: img.replace('<img ', `<img class="ws-float-${side}" `) });
                else
                    out.push({ block: `<p>${img.replace('<img ', '<img class="ws-img-center" ')}</p>` });
                continue;
            }
            const box = elements(f).find((x) => x.name === 'draw:text-box');
            if (box) {
                const inner = textBox(f, box);
                if (inner)
                    out.push({ block: inner });
                continue;
            }
            if (elements(f).some((x) => x.name === 'draw:image' || x.name === 'draw:object' || x.name === 'draw:object-ole')) {
                skippedImages++;
            }
        }
        return out;
    };
    // ---- Blöcke ----
    /** Absatz oder Überschrift; Textrahmen darin brechen ihn auf. */
    const paragraph = (n, tag) => {
        const styleName = n.attrs['text:style-name'];
        const align = styles.prop(styleName, 'align');
        const alignAttr = align && align !== 'left' ? ` style="text-align:${align}"` : '';
        const isHeading = tag !== 'p';
        const parts = [];
        let buffer = '';
        const flush = () => {
            const html = buffer.replace(/^(\s|&nbsp;)+|(\s|&nbsp;)+$/g, '');
            const visible = html.replace(/<br>|&nbsp;|&emsp;|\s/g, '');
            if (visible) {
                parts.push(`<${tag}${alignAttr}>${wrap(html, styleName, isHeading)}</${tag}>`);
                if (isHeading)
                    stats.headings++;
                else
                    stats.paragraphs++;
            }
            else if (/<img/.test(html)) {
                parts.push(`<p${alignAttr}>${html}</p>`);
            }
            buffer = '';
        };
        for (const seg of inline(n)) {
            if ('inline' in seg)
                buffer += seg.inline;
            // Am Anfang des Absatzes, damit der ganze Absatz das Bild umfließt.
            else if ('float' in seg)
                buffer = seg.float + buffer;
            else {
                flush();
                parts.push(seg.block);
            }
        }
        flush();
        // Leere Absätze sind in Arbeitsblättern Platz zum Schreiben. Einer reicht
        // als Abstand; mehr fasst `blocks` ohnehin zusammen.
        return parts.length ? parts.join('') : '<p data-empty="1"><br></p>';
    };
    // Textrahmen: mit Rand ein Kasten, ohne Rand nur der Inhalt (wie odt.ts).
    const textBox = (frame, box) => {
        const inner = blocks(box);
        if (!inner.trim())
            return '';
        const html = styles.graphic(frame.attrs['draw:style-name'], 'border') === 'none' ? inner : `<div class="ws-box">${inner}</div>`;
        const width = toPx(frame.attrs['svg:width']) ?? 0;
        const beside = anchored(frame) && frame.attrs['svg:x'] !== undefined && width > 0 && width < 380;
        return beside ? `${BESIDE_OPEN}${html}${BESIDE_CLOSE}` : html;
    };
    const headingTag = (n) => {
        const level = Number(n.attrs['text:outline-level'] || 1);
        return `h${Math.min(4, Math.max(2, level + 1))}`;
    };
    // Punkte mit Überschriften (Gliederung) ohne Liste – wie odt.ts.
    // Überschrift in nummerierter Gliederung: Abschnitt, Aufgabe, Teilaufgabe (wie odt.ts).
    const numberedHeading = (c, tag) => {
        const html = paragraph(c, headingTag(c));
        if (tag !== 'ol')
            return html;
        const level = Number(c.attrs['text:outline-level'] || 1);
        const ds = level <= 1 ? 'section' : level === 2 ? 'task' : 'subtask';
        return html.replace(/<(h[2-6])(?=[ >])/, `<$1 data-ds="${ds}"`);
    };
    const hasHeading = (n) => elements(n).some((c) => c.name === 'text:h' || (c.name !== 'table:table' && hasHeading(c)));
    const list = (n, listStyle, depth) => {
        const styleName = n.attrs['text:style-name'] || listStyle;
        const tag = styles.listType(styleName, depth);
        let html = '';
        let open = '';
        for (const item of elements(n).filter((c) => c.name === 'text:list-item' || c.name === 'text:list-header')) {
            const inner = elements(item)
                .map((c) => c.name === 'text:list' ? list(c, styleName, depth + 1)
                : c.name === 'text:p' ? paragraph(c, 'p').replace(/^<p data-empty="1"><br><\/p>$/, '')
                    : c.name === 'text:h' ? numberedHeading(c, tag)
                        : blocks({ name: '#', attrs: {}, children: [c] }))
                .join('');
            if (hasHeading(item)) {
                if (open)
                    html += `<${tag}>${open}</${tag}>`;
                open = '';
                html += inner;
            }
            else
                open += `<li>${inner}</li>`;
        }
        return html + (open ? `<${tag}>${open}</${tag}>` : '');
    };
    // Spaltenbreiten und Zeilenhöhen (wie odt.ts in LearningModules).
    const columnWidths = (n) => {
        const out = [];
        const visit = (x) => {
            for (const c of elements(x)) {
                if (c.name === 'table:table-column') {
                    const repeat = Math.min(Number(c.attrs['table:number-columns-repeated'] || 1), 50);
                    const cm = lengthCm(styles.prop(c.attrs['table:style-name'], 'columnWidth'));
                    for (let i = 0; i < repeat; i++)
                        out.push(cm ? `${cm}cm` : '');
                }
                else if (['table:table-columns', 'table:table-header-columns', 'table:table-column-group'].includes(c.name))
                    visit(c);
            }
        };
        visit(n);
        return out;
    };
    const rowHeight = (row) => {
        const fixed = lengthCm(styles.prop(row.attrs['table:style-name'], 'rowHeight'));
        if (fixed && fixed >= 0.6)
            return `${fixed}cm`;
        let lines = 0;
        for (const cell of elements(row).filter((c) => c.name === 'table:table-cell')) {
            const kids = elements(cell);
            const empty = kids.length > 1 && kids.every((k) => k.name === 'text:p' && !textOf(k).trim() && !elements(k).length);
            if (empty)
                lines = Math.max(lines, kids.length);
        }
        return lines >= 2 ? `${Math.round(lines * 0.55 * 10) / 10}cm` : '';
    };
    // Layout-Tabelle (Tabelle in einer Zelle): je Zeile Spalten – wie odt.ts.
    const tableRowsOf = (n) => elements(n).flatMap((c) => (c.name === 'table:table-row' ? [c]
        : ['table:table-header-rows', 'table:table-rows', 'table:table-row-group'].includes(c.name) ? tableRowsOf(c) : []));
    const layoutTable = (n) => {
        const rows = tableRowsOf(n);
        const cellsOf = (r) => elements(r).filter((c) => c.name === 'table:table-cell');
        if (!rows.some((r) => cellsOf(r).length >= 2 && cellsOf(r).some((c) => elements(c).some((x) => x.name === 'table:table'))))
            return null;
        const widths = columnWidths(n);
        const cols = widths.length && widths.every(Boolean) ? `<colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup>` : '';
        return rows.map((r) => {
            const cells = cellsOf(r).map((c) => blocks(c).replace(/^<p data-empty="1"><br><\/p>$/, ''));
            if (cells.length < 2)
                return cells.join('');
            if (cells.every((c) => !c.replace(/<p data-empty="1"><br><\/p>/g, '').trim()))
                return '';
            return `<table class="ws-columns">${cols}<tbody><tr>${cells.map((c) => `<td>${c || '<p><br></p>'}</td>`).join('')}</tr></tbody></table>`;
        }).join('');
    };
    const table = (n) => {
        const layout = layoutTable(n);
        if (layout !== null)
            return layout;
        stats.tables++;
        const rowsHtml = (container, cellTag) => {
            let html = '';
            for (const c of elements(container)) {
                if (c.name === 'table:table-row') {
                    const repeat = Math.min(Number(c.attrs['table:number-rows-repeated'] || 1), 50);
                    const cells = elements(c)
                        .filter((cell) => cell.name === 'table:table-cell')
                        .map((cell) => {
                        const colspan = Number(cell.attrs['table:number-columns-spanned'] || 1);
                        const rowspan = Number(cell.attrs['table:number-rows-spanned'] || 1);
                        const repeatCols = Math.min(Number(cell.attrs['table:number-columns-repeated'] || 1), 50);
                        const inner = blocks(cell).replace(/^<p data-empty="1"><br><\/p>$/, '');
                        const attrs = `${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}`;
                        return `<${cellTag}${attrs}>${inner}</${cellTag}>`.repeat(repeatCols);
                    })
                        .join('');
                    const h = rowHeight(c);
                    html += `<tr${h ? ` style="height:${h}"` : ''}>${cells}</tr>`.repeat(repeat);
                }
                else if (c.name === 'table:table-rows' || c.name === 'table:table-row-group') {
                    html += rowsHtml(c, cellTag);
                }
            }
            return html;
        };
        const header = elements(n).find((c) => c.name === 'table:table-header-rows');
        const head = header ? `<thead>${rowsHtml(header, 'th')}</thead>` : '';
        const widths = columnWidths(n);
        const cols = widths.length && widths.every(Boolean) ? `<colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup>` : '';
        return `<table>${cols}${head}<tbody>${rowsHtml(n, 'td')}</tbody></table>`;
    };
    // ---- Abbildungen nebeneinander (wie odt.ts in LearningModules) ----
    // Jedes Bild am eigenen, sonst leeren Absatz, per Position nebeneinander,
    // darunter „Abbildung 1 ⇥ Abbildung 2 …“ → Tabelle ohne Linien.
    const framesOnly = (p) => {
        if (p.name !== 'text:p')
            return null;
        const frames = [];
        for (const c of p.children) {
            if (typeof c === 'string') {
                if (c.trim())
                    return null;
                continue;
            }
            if (SKIP.has(c.name) || c.name === 'text:soft-page-break' || c.name === 'text:bookmark')
                continue;
            if (c.name === 'draw:frame' && anchored(c) && isImageFrame(c) && !isTextFrame(c))
                frames.push(c);
            else
                return null;
        }
        return frames;
    };
    const tabText = (n) => typeof n === 'string' ? n : n.name === 'text:tab' ? '\t' : n.name === 'text:s' ? ' ' : n.children.map(tabText).join('');
    const figureRow = (list, start) => {
        const LINE = 19;
        const placed = [];
        let i = start;
        for (; i < list.length; i++) {
            const frames = framesOnly(list[i]);
            if (!frames)
                break;
            if (placed.length && (i - start) * LINE >= Math.max(...placed.map((p) => p.bottom)))
                break;
            for (const f of frames) {
                const top = (i - start) * LINE + (toPx(f.attrs['svg:y']) ?? 0);
                placed.push({ f, x: toPx(f.attrs['svg:x']) ?? 0, top, bottom: top + (toPx(f.attrs['svg:height']) ?? 0) });
            }
        }
        while (i > start && !framesOnly(list[i - 1])?.length)
            i--;
        if (placed.length < 2)
            return null;
        if (Math.max(...placed.map((p) => p.top)) >= Math.min(...placed.map((p) => p.bottom)))
            return null;
        placed.sort((a, b) => a.x - b.x);
        const cells = placed.map((p) => image(p.f)).filter((img) => !!img);
        if (cells.length < 2)
            return null;
        let j = i;
        while (j < list.length && list[j].name === 'text:p' && !textOf(list[j]).trim() && framesOnly(list[j])?.length === 0)
            j++;
        let captions = null;
        if (j < list.length && list[j].name === 'text:p') {
            const texts = tabText(list[j]).split('\t').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
            if (texts.length === cells.length) {
                const style = list[j].attrs['text:style-name'];
                captions = texts.map((t) => wrap(esc(t), style));
                j++;
            }
        }
        stats.tables++;
        const row = (items) => `<tr>${items.map((x) => `<td>${x}</td>`).join('')}</tr>`;
        return {
            html: `<table class="ws-table-plain"><tbody>${row(cells)}${captions ? row(captions) : ''}</tbody></table>`,
            used: (captions ? j : i) - start,
        };
    };
    function blocks(n) {
        const parts = [];
        const kids = elements(n);
        for (let k = 0; k < kids.length; k++) {
            const c = kids[k];
            if (SKIP.has(c.name))
                continue;
            const figures = c.name === 'text:p' ? figureRow(kids, k) : null;
            if (figures) {
                parts.push(figures.html);
                k += figures.used - 1;
                continue;
            }
            if (c.name === 'text:p' || c.name === 'text:h') {
                const tag = c.name === 'text:h' ? headingTag(c)
                    : styles.inherits(c.attrs['text:style-name'], /^Title$/i) ? 'h2'
                        : styles.inherits(c.attrs['text:style-name'], /^Subtitle$/i) ? 'h3' : 'p';
                const html = paragraph(c, tag);
                // Ausgeblendet (Lösung im Arbeitsblatt): bleibt verborgen – als Lösung, nicht als Text.
                if (styles.prop(c.attrs['text:style-name'], 'hidden')) {
                    if (!/^<p data-empty="1">/.test(html))
                        parts.push(`<div data-solution="1">${html}</div>`);
                }
                else
                    parts.push(html);
            }
            else if (c.name === 'text:list')
                parts.push(list(c, undefined, 1));
            else if (c.name === 'table:table')
                parts.push(table(c));
            else if (c.name === 'text:section' || c.name === 'text:index-body')
                parts.push(blocks(c));
            else if (c.name === 'draw:frame' || c.name === 'draw:a') {
                for (const seg of inline({ name: '#', attrs: {}, children: [c] })) {
                    parts.push('inline' in seg ? `<p>${seg.inline}</p>` : 'float' in seg ? `<p>${seg.float}</p>` : seg.block);
                }
            }
            else if (DRAWINGS.has(c.name)) {
                const img = drawing([c]);
                if (img)
                    parts.push(`<p>${img}</p>`);
            }
        }
        // Mehrere Leerabsätze hintereinander: einer genügt; am Anfang und Ende keiner.
        // Aufeinanderfolgende ausgeblendete Absätze sind eine Lösung.
        return parts
            .join('')
            .replace(/<\/div><div data-solution="1">/g, '')
            .replace(/(<p data-empty="1"><br><\/p>)+/g, '<p><br></p>')
            .replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    }
    const html = placeBeside(blocks(body));
    const meta = read('meta.xml');
    const metaTitle = meta ? textOf(find(parseXml(meta), 'dc:title') || '').trim() : '';
    const firstHeading = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/.exec(html)?.[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    const fromFile = basename(fileName || '', extname(fileName || '')).replace(/[_-]+/g, ' ').trim();
    const title = (usableTitle(metaTitle) ? metaTitle : '') || (firstHeading ? decodeHtml(firstHeading) : '') || fromFile || 'Arbeitsblatt';
    const warnings = [];
    if (stats.drawings) {
        warnings.push(`${stats.drawings} Zeichnung${stats.drawings === 1 ? '' : 'en'} als Bild übernommen – bitte kurz prüfen: Komplexe Formen werden vereinfacht, Schriften durch Arial ersetzt.`);
    }
    if (skippedDrawings) {
        warnings.push(`${skippedDrawings} Zeichnungselement${skippedDrawings === 1 ? '' : 'e'} nicht übernommen (z. B. Steuerelemente oder Maßlinien).`);
    }
    if (skippedImages) {
        warnings.push(`${skippedImages} Grafik${skippedImages === 1 ? '' : 'en'} in einem Fremdformat (z. B. SVM, WMF, eingebettetes Objekt) nicht übernommen – in LibreOffice als PNG einfügen, dann klappt es.`);
    }
    if (linkedImages) {
        warnings.push(`${linkedImages} Bild${linkedImages === 1 ? ' ist' : 'er sind'} nur verknüpft statt eingebettet – in LibreOffice unter Bearbeiten → Verknüpfungen „Lösen“, dann neu importieren.`);
    }
    if (skippedLarge) {
        warnings.push(`${skippedLarge} Bild${skippedLarge === 1 ? '' : 'er'} zu groß (über 4 MB je Bild bzw. 20 MB insgesamt) – bitte verkleinern.`);
    }
    if (!html.trim())
        warnings.push('Im Dokument wurde kein übertragbarer Inhalt gefunden.');
    return { title, html, warnings, stats };
}
function decodeHtml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
