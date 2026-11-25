// Link setzen (🔗): was mit der Auswahl from…to geschieht – ohne Editor, damit testbar.

/** Adresse ergänzen: „wokwi.com/…“ → „https://wokwi.com/…“; Mail-Adresse → mailto:. */
export function normalizeHref(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'https://' || s === 'http://') return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.startsWith('#')) return s;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s)) return `mailto:${s}`;
  return `https://${s}`;
}

/**
 * - `href` leer: Link auf der Markierung entfernen ('remove'; ohne Markierung nichts).
 * - Ohne Markierung: `text` bzw. die Adresse an der Schreibmarke einfügen ('insert').
 * - Mit Markierung: anderer `text` ersetzt sie ('insert'), sonst bekommt sie den Link ('mark').
 */
export function linkPlan(doc, from, to, href, text) {
  const empty = from === to;
  if (!href) return empty ? { kind: 'none' } : { kind: 'remove', from, to };
  const shown = text || (empty ? href : '');
  const current = empty ? '' : doc.textBetween(from, to, ' ');
  if (shown && shown !== current) return { kind: 'insert', from, to, text: shown };
  return { kind: 'mark', from, to };
}
