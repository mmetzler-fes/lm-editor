// ==================== SEITENUMBRÜCHE IN DER VORSCHAU ====================
//
// Das Dokument steht auf einem A4-Blatt (paper.css, Ränder der Schulvorlage).
// Hier wird gemessen, wo eine Seite voll ist, und dort eine Linie gezogen –
// ungefähr wie im Druck: Bausteine (Schreibfeld, Bild, Formel, Tabellenzeile,
// Überschrift …) rutschen ganz auf die nächste Seite, Absätze brechen
// zwischen zwei Zeilen. Die Satzhöhe kommt vom Aufrufer (Seite der Vorlage
// samt Kopfzeile), sonst A4 nach paper.css.

const CM = 96 / 2.54;
// Satzhöhe ohne Angabe: Blatthöhe minus Rand oben (1,27 cm) und unten (1 cm).
const BODY_CM = { portrait: 29.7 - 2.27, landscape: 21 - 2.27 };

// Was nicht über eine Seite hinweg geteilt wird.
const ATOMIC = 'tr, img, svg, figure, pre, h1, h2, h3, h4, h5, h6, .ds-karo, .ds-formula, .ds-quiz, .ds-code, .ds-group-box, .ds-float, .ds-columns, .ds-spacer, .ds-pagebreak';
// Text, der zwischen zwei Zeilen bricht.
const LINES = 'p, li, blockquote';

/**
 * Seitenumbrüche in `sheet` (.lm-paper mit .docspec) messen und als Linien
 * einzeichnen. Das Blatt muss in natürlicher Größe (ohne zoom) auf der Seite
 * stehen. `bodyCm`: Satzhöhe einer Seite in cm (sonst A4 hoch bzw. quer).
 * Liefert die Zahl der Seiten.
 */
export function markPageBreaks(sheet, { landscape = false, bodyCm = 0 } = {}) {
  sheet.querySelectorAll(':scope > .ds-autobreak').forEach((m) => m.remove());
  const docEl = sheet.querySelector('.docspec');
  if (!docEl) return 1;
  const H = (bodyCm > 1 ? bodyCm : BODY_CM[landscape ? 'landscape' : 'portrait']) * CM;
  // Zoom der Seite (etwa der Inhaltsbereich der App): Die Rechtecke kommen
  // vergrößert, gerechnet und gezeichnet wird in Pixeln des Blatts.
  const z = sheet.getBoundingClientRect().width / (sheet.offsetWidth || 1) || 1;
  const origin = docEl.getBoundingClientRect().top;
  const top = (el) => (el.getBoundingClientRect().top - origin) / z;
  const bottom = (el) => (el.getBoundingClientRect().bottom - origin) / z;
  // Eingefügte Seitenumbrüche, wo immer sie stehen (auch in einer Aufgabe):
  // Dahinter beginnt eine neue Seite.
  const manual = [...docEl.querySelectorAll('.ds-pagebreak')].filter((el) => el.offsetHeight)
    .map((el) => ({ el, y: top(el), end: bottom(el) })).sort((a, b) => a.y - b.y);
  const pending = manual.slice();
  const breaks = [];
  let pageEnd = H;

  const visit = (el) => {
    if (!el.offsetHeight || el.matches('.ds-pagebreak')) return;
    const t = top(el);
    const b = bottom(el);
    // Liegt hinter einem eingefügten Umbruch: Die Seite beginnt dort neu.
    while (pending.length && t >= pending[0].end - 0.5) pageEnd = pending.shift().end + H;
    // Ein Seitenumbruch im Baustein (etwa in einer Aufgabe) zählt auch, wenn alles passt.
    const inner = !el.matches(ATOMIC) && el.querySelector('.ds-pagebreak');
    if (b <= pageEnd + 0.5 && !inner) return;
    // Liegt ganz hinter dem Seitenende (etwa im Abstand davor): Umbruch im Abstand.
    while (t >= pageEnd) { breaks.push(pageEnd); pageEnd += H; }
    if (b <= pageEnd + 0.5 && !inner) return;
    const kids = [...el.children].filter((k) => k.offsetHeight);
    // Nebeneinander (Spalten, Bildgruppen): als Ganzes.
    const sideBySide = kids.some((k, i) => i && Math.abs(top(k) - top(kids[i - 1])) < 1 && kids[i - 1].getBoundingClientRect().right <= k.getBoundingClientRect().left + 1);
    // Text mit Bild, Formel … (etwa ein Listenpunkt mit Bild): nicht zeilenweise.
    const lines = el.matches(LINES) && !el.querySelector(ATOMIC);
    if (inner || (kids.length > (el.matches(LINES) ? 1 : 0) && !el.matches(ATOMIC) && !lines && !sideBySide)) {
      kids.forEach(visit);
      return;
    }
    if (lines) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      while (b > pageEnd + 0.5) {
        const y = Math.max(t, t + Math.floor((pageEnd - t) / lh) * lh);
        breaks.push(y);
        pageEnd = y + H;
      }
      return;
    }
    while (b > pageEnd + 0.5) {
      // Passt der Baustein auf eine Seite, rutscht er ganz hinüber – sonst wird er geteilt.
      const y = t > pageEnd - H + 1 && b - t <= H ? t : pageEnd;
      breaks.push(y);
      pageEnd = y + H;
    }
  };
  [...docEl.children].forEach(visit);

  // Nummern in der Reihenfolge auf dem Blatt – eingefügte und berechnete Umbrüche zusammen.
  const offset = (docEl.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / z;
  const all = [...breaks.map((y) => ({ y })), ...manual].sort((a, b) => a.y - b.y);
  all.forEach((brk, i) => {
    const label = `Seite ${i + 2}`;
    if (brk.el) {
      const span = brk.el.querySelector('span');
      if (span) span.textContent = `Seitenumbruch · ${label}`;
      return;
    }
    const mark = document.createElement('div');
    mark.className = 'ds-autobreak';
    mark.style.top = `${offset + brk.y}px`;
    mark.innerHTML = `<span>${label}</span>`;
    sheet.appendChild(mark);
  });
  const pages = all.length + 1;
  return pages;
}
