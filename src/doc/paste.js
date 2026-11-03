// ==================== EINFÜGEN AUS DER ZWISCHENABLAGE ====================
//
// Text, Markdown oder eine Webseite: Alles wird zu sauberem HTML und läuft
// durch dieselbe Umwandlung wie das Dokument selbst (HTML → Spec → Editor).
// So kommen keine fremden Stile ins Blatt – `white-space: nowrap` hielte Text
// in einer Zeile, ein kleiner `line-height` ließe Zeichen übereinanderliegen.

import MarkdownIt from '../vendor/markdown-it/markdown-it.mjs';
import { INLINE_MATH_SOURCE, validateDocSpec } from './docspec.js';
import { htmlToDocSpec, specToEditorHtml } from './docspec-html.js';
import { pmToSpec } from './pm-convert.js';
import { markdownToPm } from './pm-markdown.js';

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MD_BLOCK = /^(#{1,6}\s+\S|\s*[-*+]\s+\S|\s*\d+[.)]\s+\S|```|~~~|>\s|\|.*\|\s*$)/m;
const MD_INLINE = /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/;

/** Sieht der Text nach Markdown aus? Einzelne `*` zählen nicht – `8*7*3` bleibt eine Rechnung. */
export function looksLikeMarkdown(text) {
  return MD_BLOCK.test(text) || MD_INLINE.test(text);
}

// Eigene Schreibweise (docs/MARKDOWN.md): Behälter, Spans, Attribute an Überschriften, x^2^, CO~2~.
const DOC_MD = /^:::|\]\{[.#][^}\n]*\}|^#{1,6} .*\{[.#][^}\n]*\}\s*$|\w\^[^\s^]+\^|\w~[^\s~]+~/m;

/** Text in der Schreibweise des Dokuments? Dann liest ihn derselbe Parser wie den KI-Import. */
export function looksLikeDocMarkdown(text) {
  return DOC_MD.test(text);
}

const MATH_START = new RegExp(`^${INLINE_MATH_SOURCE}`);

// Zeilenumbrüche bleiben Zeilenumbrüche (breaks), HTML im Text bleibt Text.
const md = new MarkdownIt({ html: false, breaks: true, linkify: false });
// Formeln unangetastet lassen: `_` und `*` darin sind keine Auszeichnung.
md.inline.ruler.before('escape', 'ds_math', (state, silent) => {
  if (state.src[state.pos] !== '$') return false;
  const m = MATH_START.exec(state.src.slice(state.pos));
  if (!m) return false;
  if (!silent) state.push('ds_math', '', 0).content = m.groups.math;
  state.pos += m[0].length;
  return true;
});
md.renderer.rules.ds_math = (tokens, i) => `<span class="ds-math" data-tex="${escHtml(tokens[i].content).replace(/"/g, '&quot;')}"></span>`;

export function markdownToHtml(text) {
  // Nach <br> folgt ein Zeilenende – es würde zum Leerzeichen am Anfang der nächsten Zeile.
  return md.render(text).replace(/<br>\s+/g, '<br>');
}

/** Reiner Text: Leerzeile trennt Absätze, jede Zeile bleibt eine Zeile. */
export function plainToHtml(text) {
  return text.split(/\n[ \t]*\n\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split('\n').map(escHtml).join('<br>')}</p>`)
    .join('');
}

// Nur solche Auszeichnung ist Inhalt. Editoren wie VS Code liefern daneben bunte
// <div>/<span>-Zeilen – dann ist der reine Text die bessere Quelle.
const HTML_MEANING = /<(p|h[1-6]|ul|ol|li|table|strong|b|em|i|u|s|a|pre|blockquote|img|sup|sub)[\s>]/i;

/** Welche Fassung der Zwischenablage nehmen, und als HTML. Ohne Inhalt: ''. */
export function pasteSource({ text = '', html = '' }) {
  const plain = text.replace(/\r\n?/g, '\n');
  if (html && HTML_MEANING.test(html)) return { html, fromWeb: true };
  if (!plain.trim()) return { html: '', fromWeb: false };
  return { html: looksLikeMarkdown(plain) ? markdownToHtml(plain) : plainToHtml(plain), fromWeb: false };
}

const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'colspan', 'rowspan']);
const BLOCK_TAG = /^(P|H[1-6]|UL|OL|TABLE|DIV|FIGURE|PRE|HR)$/;

/** Text zwischen Absätzen eines Behälters in eigene Absätze fassen – sonst ginge er unterwegs verloren. */
function wrapLooseText(parent, doc) {
  const kids = [...parent.childNodes];
  if (!kids.some((n) => BLOCK_TAG.test(n.tagName || ''))) return;
  let run = null;
  for (const n of kids) {
    if (BLOCK_TAG.test(n.tagName || '')) { run = null; continue; }
    if (!run && n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
    if (!run) { run = doc.createElement('p'); n.before(run); }
    run.append(n);
  }
}

/** Behälter auflösen: Das Format kennt hier nur Absätze; Zitate werden zu gewöhnlichem Text. */
function flattenContainers(body, doc) {
  body.querySelectorAll('section, article, main, header, footer, aside, nav, center, blockquote, details, summary').forEach((el) => {
    const div = doc.createElement('div');
    div.append(...el.childNodes);
    el.replaceWith(div);
  });
  [...body.querySelectorAll('div')].reverse().forEach((div) => {
    if ([...div.children].some((c) => BLOCK_TAG.test(c.tagName))) {
      wrapLooseText(div, doc);
      div.replaceWith(...div.childNodes);
    } else {
      const p = doc.createElement('p');
      p.append(...div.childNodes);
      div.replaceWith(p);
    }
  });
  wrapLooseText(body, doc);
  // Ein einzelner Absatz in einem Listenpunkt oder einer Zelle (Google Docs, lockere Listen) ist nur Hülle.
  body.querySelectorAll('li > p:only-child, td > p:only-child, th > p:only-child').forEach((p) => {
    if ([...p.parentElement.childNodes].every((n) => n === p || (n.nodeType === 3 && !n.nodeValue.trim()))) p.replaceWith(...p.childNodes);
  });
}

/** Überschriften um eine Stufe tiefer: Im Blatt ist Ebene 1 ein <h2> – so bleiben # und ## verschieden. */
function shiftHeadings(body, doc) {
  [...body.querySelectorAll('h1, h2, h3')].forEach((h) => {
    const next = doc.createElement(`h${Number(h.tagName[1]) + 1}`);
    next.append(...h.childNodes);
    h.replaceWith(next);
  });
}

/** Fett, kursiv … stehen oft nur im Stil (Google Docs, Word): als Auszeichnung behalten, solange der Stil noch da ist. */
function marksOfStyle(el) {
  const s = el.style;
  const weight = s.fontWeight === 'bold' || Number(s.fontWeight) >= 600;
  const deco = `${s.textDecorationLine || ''} ${s.textDecoration || ''}`;
  return [weight && 'b', s.fontStyle === 'italic' && 'i', /underline/.test(deco) && 'u', /line-through/.test(deco) && 's',
    s.verticalAlign === 'super' && 'sup', s.verticalAlign === 'sub' && 'sub'].filter(Boolean);
}

/** Fremdes HTML auf den Inhalt reduzieren: alle Stile und Klassen weg, nur Bedeutung bleibt. */
export function cleanPastedHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { body } = doc;
  body.querySelectorAll('script, style, meta, link, title, xml, noscript, iframe, object, embed').forEach((n) => n.remove());
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  for (const el of [...body.querySelectorAll('*')]) {
    const tag = el.tagName;
    if (tag === 'SPAN' || tag === 'FONT') {
      const marks = marksOfStyle(el);
      if (marks.length) {
        const inner = doc.createElement(marks[0]);
        let last = inner;
        for (const m of marks.slice(1)) last = last.appendChild(doc.createElement(m));
        last.append(...el.childNodes);
        el.replaceWith(inner);
      } else if (el.classList.contains('ds-math')) continue; // Formel aus markdownToHtml
      else el.replaceWith(...el.childNodes);
      continue;
    }
    // Google Docs umschließt alles mit <b style="font-weight:normal">; Word bringt <o:p> mit.
    if ((tag === 'B' && el.style.fontWeight === 'normal') || tag.includes(':')) { el.replaceWith(...el.childNodes); continue; }
    for (const a of [...el.attributes]) if (!KEEP_ATTRS.has(a.name)) el.removeAttribute(a.name);
  }
  flattenContainers(body, doc);
  shiftHeadings(body, doc);
  body.querySelectorAll('p').forEach((n) => {
    if (!n.textContent.replace(/ /g, ' ').trim() && !n.querySelector('img, table, .ds-math')) n.remove();
  });
  return body.innerHTML;
}

/**
 * Zwischenablage → Einzufügendes. Ergebnis: { html, inline, warnings } oder null,
 * wenn nichts Brauchbares drin ist. `inline`: nur ein Stück Text – es fließt in
 * den Absatz an der Schreibmarke, statt ihn zu trennen.
 */
export function pasteToEditorHtml({ text, html }) {
  const plain = String(text || '').replace(/\r\n?/g, '\n');
  let spec;
  let warnings = [];
  if (looksLikeDocMarkdown(plain)) {
    spec = pmToSpec(markdownToPm(plain, { breaks: true, warnings }));
  } else {
    const source = pasteSource({ text, html });
    if (!source.html) return null;
    ({ spec, warnings } = htmlToDocSpec(cleanPastedHtml(source.html)));
  }
  if (!spec.content.length) return null;
  // Was das Format nicht kennt, kommt als reiner Text – lieber schlicht als gar nicht.
  const usable = validateDocSpec(spec).length ? htmlToDocSpec(plainToHtml(text || '')).spec : spec;
  if (!usable.content.length) return null;
  const out = specToEditorHtml(usable);
  const only = usable.content.length === 1 && usable.content[0];
  const inline = !!only && only.type === 'text' && !String(only.text).includes('\n\n');
  if (!inline) return { html: out, inline, warnings };
  // Leerzeichen am Rand des Stücks trennen es vom Text an der Schreibmarke.
  const edge = String(text || '').replace(/\r\n?/g, '\n');
  const lead = /^[ \t]+/.test(edge) ? ' ' : '';
  const trail = /[ \t]+$/.test(edge) ? ' ' : '';
  return { html: lead + out.replace(/^<p[^>]*>|<\/p>$/g, '') + trail, inline, warnings };
}
