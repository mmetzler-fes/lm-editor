// ==================== SEITENUMBRÜCHE IN DER VORSCHAU ====================
//
// Das Dokument steht auf einem A4-Blatt (paper.css, Ränder der Schulvorlage).
// Hier wird gemessen, wo eine Seite voll ist, und dort eine Linie gezogen –
// ungefähr wie im Druck: Bausteine (Schreibfeld, Bild, Formel, Tabellenzeile,
// Überschrift …) rutschen ganz auf die nächste Seite, Absätze brechen
// zwischen zwei Zeilen. Die Kopfzeile der Vorlage bleibt unberücksichtigt.

const CM = 96 / 2.54;
// Satzhöhe: Blatthöhe minus Rand oben (1,27 cm) und unten (1 cm).
const BODY_CM = { portrait: 29.7 - 2.27, landscape: 21 - 2.27 };

// Was nicht über eine Seite hinweg geteilt wird.
const ATOMIC = 'tr, img, svg, figure, pre, h1, h2, h3, h4, h5, h6, .ds-karo, .ds-formula, .ds-quiz, .ds-code, .ds-group-box, .ds-float, .ds-columns, .ds-spacer, .ds-pagebreak';
// Text, der zwischen zwei Zeilen bricht.
const LINES = 'p, li, blockquote';

/**
 * Seitenumbrüche in `sheet` (.lm-paper mit .docspec) messen und als Linien
 * einzeichnen. Das Blatt muss in natürlicher Größe (ohne zoom) auf der Seite
 * stehen. Liefert die Zahl der Seiten.
 */
export function markPageBreaks(sheet, { landscape = false } = {}) {
  sheet.querySelectorAll(':scope > .ds-autobreak').forEach((m) => m.remove());
  const docEl = sheet.querySelector('.docspec');
  if (!docEl) return 1;
  const H = BODY_CM[landscape ? 'landscape' : 'portrait'] * CM;
  const origin = docEl.getBoundingClientRect().top;
  const top = (el) => el.getBoundingClientRect().top - origin;
  const bottom = (el) => el.getBoundingClientRect().bottom - origin;
  const breaks = [];
  let pageEnd = H;
  let pages = 1;

  const visit = (el) => {
    if (!el.offsetHeight) return;
    const t = top(el);
    const b = bottom(el);
    if (el.matches('.ds-pagebreak')) {
      pages += 1;
      pageEnd = b + H;
      return;
    }
    // Ein Seitenumbruch im Baustein (etwa in einer Aufgabe) zählt auch, wenn alles passt.
    const inner = !el.matches(ATOMIC) && el.querySelector('.ds-pagebreak');
    if (b <= pageEnd + 0.5 && !inner) return;
    // Liegt ganz hinter dem Seitenende (etwa im Abstand davor): Umbruch im Abstand.
    while (t >= pageEnd) { breaks.push({ y: pageEnd, page: ++pages }); pageEnd += H; }
    if (b <= pageEnd + 0.5 && !inner) return;
    const kids = [...el.children].filter((k) => k.offsetHeight);
    // Nebeneinander (Spalten, Bildgruppen): als Ganzes.
    const sideBySide = kids.some((k, i) => i && Math.abs(top(k) - top(kids[i - 1])) < 1 && kids[i - 1].getBoundingClientRect().right <= k.getBoundingClientRect().left + 1);
    if (kids.length && !el.matches(ATOMIC) && !el.matches(LINES) && !sideBySide) {
      kids.forEach(visit);
      return;
    }
    if (el.matches(LINES)) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      while (b > pageEnd + 0.5) {
        const y = Math.max(t, t + Math.floor((pageEnd - t) / lh) * lh);
        breaks.push({ y, page: ++pages });
        pageEnd = y + H;
      }
      return;
    }
    while (b > pageEnd + 0.5) {
      // Passt der Baustein auf eine Seite, rutscht er ganz hinüber – sonst wird er geteilt.
      const y = t > pageEnd - H + 1 && b - t <= H ? t : pageEnd;
      breaks.push({ y, page: ++pages });
      pageEnd = y + H;
    }
  };
  [...docEl.children].forEach(visit);

  const offset = docEl.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  for (const { y, page } of breaks) {
    const mark = document.createElement('div');
    mark.className = 'ds-autobreak';
    mark.style.top = `${offset + y}px`;
    mark.innerHTML = `<span>Seite ${page}</span>`;
    sheet.appendChild(mark);
  }
  return pages;
}
