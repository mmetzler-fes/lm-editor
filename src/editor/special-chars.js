/**
 * Sonderzeichen einfügen – wie „Einfügen → Sonderzeichen“ in LibreOffice: Gruppen,
 * Suche (deutsch, auch „e“ findet é, è, ê), zuletzt verwendete Zeichen und jedes
 * Zeichen über seinen Code (U+2126). Antippen fügt ein, der Dialog bleibt offen.
 */
import { escapeHtml } from '../util/dom.js';

const RECENT_KEY = 'lm_special_recent';
const RECENT_MAX = 24;

const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'My', 'Ny', 'Xi',
  'Omikron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Ypsilon', 'Phi', 'Chi', 'Psi', 'Omega'];

/** [Zeichen, Name] je Gruppe. Unsichtbares (Leerzeichen, Trennstrich) zeigt `shown`. */
const GROUPS = [
  ['Griechisch', [
    ...'αβγδεζηθικλμνξοπρστυφχψω'.split('').map((c, i) => [c, `${GREEK[i]} klein`]),
    ...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'.split('').map((c, i) => [c, `${GREEK[i]} groß`]),
    ['ϑ', 'Theta (Variante)'], ['ϕ', 'Phi (Variante)'], ['ε', 'Epsilon'], ['ϵ', 'Epsilon (Variante)'], ['ς', 'Sigma am Wortende'],
  ]],
  ['Mathematik', [
    ['±', 'Plus-Minus'], ['∓', 'Minus-Plus'], ['×', 'Mal (Kreuz)'], ['·', 'Mal (Punkt)'], ['÷', 'Geteilt'], ['−', 'Minus (echtes)'],
    ['≈', 'ungefähr gleich'], ['≠', 'ungleich'], ['≡', 'identisch'], ['≙', 'entspricht'], ['∼', 'proportional, Tilde'], ['∝', 'proportional zu'],
    ['≤', 'kleiner gleich'], ['≥', 'größer gleich'], ['≪', 'viel kleiner'], ['≫', 'viel größer'],
    ['∞', 'unendlich'], ['√', 'Wurzel'], ['∛', 'dritte Wurzel'], ['∑', 'Summe'], ['∏', 'Produkt'], ['∫', 'Integral'], ['∮', 'Ringintegral'],
    ['∂', 'partielle Ableitung'], ['∆', 'Delta, Differenz'], ['∇', 'Nabla'], ['′', 'Strich (Ableitung, Minute)'], ['″', 'Doppelstrich (Sekunde)'],
    ['∈', 'Element von'], ['∉', 'nicht Element von'], ['⊂', 'Teilmenge'], ['⊆', 'Teilmenge oder gleich'], ['∪', 'Vereinigung'], ['∩', 'Schnittmenge'],
    ['∅', 'leere Menge'], ['∀', 'für alle'], ['∃', 'es gibt'], ['ℕ', 'natürliche Zahlen'], ['ℤ', 'ganze Zahlen'], ['ℚ', 'rationale Zahlen'],
    ['ℝ', 'reelle Zahlen'], ['ℂ', 'komplexe Zahlen'], ['∠', 'Winkel'], ['⊥', 'senkrecht'], ['∥', 'parallel'], ['⌀', 'Durchmesser'],
    ['°', 'Grad'], ['%', 'Prozent'], ['‰', 'Promille'], ['½', 'ein Halb'], ['⅓', 'ein Drittel'], ['¼', 'ein Viertel'], ['¾', 'drei Viertel'],
    ['⅔', 'zwei Drittel'], ['⅛', 'ein Achtel'], ['⇒', 'daraus folgt'], ['⇔', 'genau dann, wenn'],
  ]],
  ['Hoch & tief', [
    ...'⁰¹²³⁴⁵⁶⁷⁸⁹'.split('').map((c, i) => [c, `hoch ${i}`]),
    ['⁺', 'hoch Plus'], ['⁻', 'hoch Minus'], ['⁼', 'hoch Gleich'], ['⁽', 'hoch Klammer auf'], ['⁾', 'hoch Klammer zu'], ['ⁿ', 'hoch n'],
    ...'₀₁₂₃₄₅₆₇₈₉'.split('').map((c, i) => [c, `tief ${i}`]),
    ['₊', 'tief Plus'], ['₋', 'tief Minus'], ['₌', 'tief Gleich'], ['₍', 'tief Klammer auf'], ['₎', 'tief Klammer zu'], ['ₓ', 'tief x'],
  ]],
  ['Elektrotechnik & Physik', [
    ['Ω', 'Ohm'], ['µ', 'Mikro'], ['°', 'Grad'], ['℃', 'Grad Celsius'], ['K', 'Kelvin'], ['Å', 'Ångström'], ['ħ', 'h quer (Planck)'],
    ['φ', 'Phi (Phasenwinkel)'], ['ω', 'Omega (Kreisfrequenz)'], ['τ', 'Tau (Zeitkonstante)'], ['η', 'Eta (Wirkungsgrad)'], ['ρ', 'Rho (spez. Widerstand)'],
    ['∆', 'Delta, Differenz'], ['≙', 'entspricht'], ['⏚', 'Erde, Masse'], ['⎓', 'Gleichstrom'], ['∿', 'Wechselstrom'], ['⚡', 'Blitz, Hochspannung'],
    ['⌁', 'elektrisch'], ['̅', 'Überstrich (für negierte Signale, z. B. Q̅ – nach dem Buchstaben)', '◌̅'],
    ['¬', 'nicht (Logik)'], ['∧', 'und (Logik)'], ['∨', 'oder (Logik)'], ['⊕', 'exklusiv-oder (XOR)'], ['⊼', 'NAND'], ['⊽', 'NOR'],
    ['↑', 'steigende Flanke'], ['↓', 'fallende Flanke'], ['⎍', 'Rechteckimpuls'], ['⌀', 'Durchmesser'],
  ]],
  ['Pfeile', [
    ['→', 'Pfeil rechts'], ['←', 'Pfeil links'], ['↑', 'Pfeil hoch'], ['↓', 'Pfeil runter'], ['↔', 'Pfeil links-rechts'], ['↕', 'Pfeil hoch-runter'],
    ['⇒', 'Doppelpfeil rechts (daraus folgt)'], ['⇐', 'Doppelpfeil links'], ['⇔', 'Doppelpfeil beidseitig'], ['⇑', 'Doppelpfeil hoch'], ['⇓', 'Doppelpfeil runter'],
    ['↗', 'Pfeil rechts oben'], ['↘', 'Pfeil rechts unten'], ['↙', 'Pfeil links unten'], ['↖', 'Pfeil links oben'],
    ['⟶', 'langer Pfeil rechts'], ['⟹', 'langer Doppelpfeil rechts'], ['⇌', 'Gleichgewicht (Chemie)'], ['↺', 'Kreispfeil gegen Uhrzeiger'],
    ['↻', 'Kreispfeil im Uhrzeiger'], ['➜', 'Pfeil fett'], ['↯', 'Blitzpfeil, Widerspruch'],
  ]],
  ['Satzzeichen & Leerraum', [
    ['–', 'Halbgeviertstrich (bis, Gedankenstrich)'], ['—', 'Geviertstrich'], ['…', 'Auslassungspunkte'], ['„', 'Anführung unten'], ['“', 'Anführung oben'],
    ['‚', 'einfache Anführung unten'], ['‘', 'einfache Anführung oben'], ['»', 'Guillemet rechts'], ['«', 'Guillemet links'], ['›', 'einfaches Guillemet rechts'],
    ['‹', 'einfaches Guillemet links'], ['•', 'Aufzählungspunkt'], ['·', 'Mittelpunkt'], ['§', 'Paragraf'], ['¶', 'Absatzzeichen'], ['†', 'Kreuz (gestorben)'],
    ['©', 'Copyright'], ['®', 'eingetragene Marke'], ['™', 'Marke'], ['¿', 'umgekehrtes Fragezeichen'], ['¡', 'umgekehrtes Ausrufezeichen'],
    [' ', 'geschütztes Leerzeichen (kein Umbruch)', '⍽'], [' ', 'schmales geschütztes Leerzeichen (z. B. 5 V)', '⍽ₛ'],
    ['­', 'bedingter Trennstrich', '-?'], ['‑', 'geschützter Bindestrich', '-⃠'],
  ]],
  ['Währung', [['€', 'Euro'], ['$', 'Dollar'], ['£', 'Pfund'], ['¥', 'Yen'], ['¢', 'Cent'], ['₣', 'Franken'], ['₿', 'Bitcoin']]],
  ['Symbole', [
    ['✓', 'Haken'], ['✔', 'Haken fett'], ['✗', 'Kreuz'], ['✘', 'Kreuz fett'], ['☐', 'Kästchen leer'], ['☑', 'Kästchen abgehakt'], ['☒', 'Kästchen gekreuzt'],
    ['★', 'Stern'], ['☆', 'Stern leer'], ['●', 'Kreis'], ['○', 'Kreis leer'], ['■', 'Quadrat'], ['□', 'Quadrat leer'], ['▲', 'Dreieck'], ['△', 'Dreieck leer'],
    ['▼', 'Dreieck unten'], ['▶', 'Dreieck rechts'], ['◆', 'Raute'], ['◇', 'Raute leer'], ['⚠', 'Warnung'], ['☎', 'Telefon'], ['✉', 'Brief'], ['✂', 'Schere'],
    ['✎', 'Stift'], ['⌛', 'Sanduhr'], ['♪', 'Note'], ['♥', 'Herz'], ['☺', 'Lächeln'], ['☹', 'traurig'], ['👍', 'Daumen hoch'], ['💡', 'Glühbirne, Tipp'],
  ]],
  ['Buchstaben', [
    ...'ÀÁÂÃÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕØŒÙÚÛÝŸàáâãåæçèéêëìíîïñòóôõøœùúûýÿ'.split('').map((c) => [c, '']),
    ...'ĆČĘŁŃŚŠŹŻŽćčęłńśšźżžĞğŞşİıŘřŮůĚěĎďŤťŇň'.split('').map((c) => [c, '']),
    ['ß', 'scharfes s'], ['ẞ', 'großes scharfes S'], ['Æ', 'AE-Ligatur'], ['Œ', 'OE-Ligatur'], ['Ð', 'Eth'], ['Þ', 'Thorn'],
  ]],
];

/** Code eines Zeichens: „U+03A9“. */
export const codeOf = (ch) => [...ch].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

/** Zeichen zu „U+03A9“, „03A9“, „0x3a9“ – oder null. */
export function charFromCode(text) {
  const m = String(text || '').trim().match(/^(?:U\+|0x)?([0-9a-f]{2,6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  if (n < 0x20 || n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) return null;
  return String.fromCodePoint(n);
}

/** Ohne Akzente, klein: „É“ → „e“. */
const plain = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Alle Zeichen, jedes einmal, mit Namen und Gruppe. */
const ALL = (() => {
  const seen = new Map();
  for (const [group, list] of GROUPS) {
    for (const [ch, name, shown] of list) {
      // Dasselbe Zeichen in mehreren Gruppen (Ω: Omega, Ohm): alle Namen finden es.
      const had = seen.get(ch);
      if (!had) seen.set(ch, { ch, name, shown, group });
      else if (name && !had.name.split(', ').includes(name)) had.name = had.name ? `${had.name}, ${name}` : name;
    }
  }
  return [...seen.values()];
})();
const info = (ch) => ALL.find((x) => x.ch === ch) || { ch, name: '' };

/** Suche: im Namen, das Zeichen selbst, Buchstaben auch ohne Akzent, oder ein Code (U+…). */
export function searchChars(query) {
  const q = plain(String(query || '').trim());
  if (!q) return [];
  const byCode = charFromCode(query);
  const hits = ALL.filter((x) => x.ch === query.trim() || plain(x.name).includes(q)
    || (x.ch.length === 1 && /\p{L}/u.test(x.ch) && plain(x.ch) === q));
  // Zuerst, wessen Name mit dem Suchwort beginnt („pfeil“: erst „Pfeil rechts“, dann „Doppelpfeil …“).
  const starts = (x) => plain(x.name).split(', ').some((n) => n.startsWith(q));
  hits.sort((a, b) => Number(starts(b)) - Number(starts(a)));
  return byCode && !hits.some((x) => x.ch === byCode) ? [info(byCode), ...hits] : hits;
}

function recent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((c) => typeof c === 'string'); } catch (_) { return []; }
}
function remember(ch) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([ch, ...recent().filter((c) => c !== ch)].slice(0, RECENT_MAX))); } catch (_) { /* ohne Speicher */ }
}

/**
 * Dialog öffnen. `insert(text)` fügt an der Schreibmarke ein (der Editor behält sie, solange
 * der Dialog offen ist); `onClose()` z. B. um den Editor wieder zu fokussieren.
 */
export function openSpecialCharDialog({ insert, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  const firstGroup = recent().length ? 'recent' : '0';
  overlay.innerHTML = `<div class="import-modules-card ds-chars-dialog" role="dialog" aria-modal="true" aria-label="Sonderzeichen">
      <h3>Ω Sonderzeichen</h3>
      <div class="ds-chars-bar">
        <select class="ds-chars-group" aria-label="Gruppe">
          <option value="recent">🕘 Zuletzt verwendet</option>
          ${GROUPS.map(([name], i) => `<option value="${i}">${escapeHtml(name)}</option>`).join('')}
        </select>
        <input type="search" class="ds-chars-search" placeholder="Suchen: ohm, pfeil, alpha, U+2126 …" aria-label="Zeichen suchen" autocomplete="off">
      </div>
      <div class="ds-chars-grid" role="listbox" aria-label="Zeichen"></div>
      <div class="ds-chars-info">
        <span class="ds-chars-big" aria-hidden="true"></span>
        <span class="ds-chars-name"></span>
      </div>
      <p class="hint">Antippen fügt ein – der Dialog bleibt offen. Im Text geht auch: Code tippen, z. B. <code>U+2126</code>, dann Enter.</p>
      <div class="confirm-actions"><button type="button" class="btn btn-primary" data-close>Fertig</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const grid = overlay.querySelector('.ds-chars-grid');
  const group = overlay.querySelector('.ds-chars-group');
  const search = overlay.querySelector('.ds-chars-search');
  const big = overlay.querySelector('.ds-chars-big');
  const nameEl = overlay.querySelector('.ds-chars-name');
  group.value = firstGroup;

  const show = (x) => {
    big.textContent = x ? (x.shown || x.ch) : '';
    nameEl.textContent = x ? `${x.name ? `${x.name} · ` : ''}${codeOf(x.ch)}` : '';
  };
  const paint = () => {
    const q = search.value.trim();
    const list = q ? searchChars(q)
      : group.value === 'recent' ? recent().map(info)
        : GROUPS[Number(group.value)][1].map(([ch, name, shown]) => ({ ch, name, shown }));
    grid.innerHTML = list.length
      ? list.map((x, i) => `<button type="button" class="ds-chars-cell${x.shown ? ' ds-chars-invisible' : ''}" data-i="${i}" role="option" title="${escapeHtml(`${x.name ? `${x.name} – ` : ''}${codeOf(x.ch)}`)}">${escapeHtml(x.shown || x.ch)}</button>`).join('')
      : `<p class="hint">${q ? 'Nichts gefunden.' : 'Noch keine – eingefügte Zeichen erscheinen hier.'}</p>`;
    grid._list = list;
    show(list[0] || null);
  };
  grid.addEventListener('mousedown', (e) => e.preventDefault()); // Schreibmarke im Editor nicht verlieren
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const x = grid._list[Number(cell.dataset.i)];
    insert?.(x.ch);
    remember(x.ch);
    show(x);
    cell.classList.add('ds-chars-done');
    setTimeout(() => cell.classList.remove('ds-chars-done'), 400);
  });
  grid.addEventListener('pointerover', (e) => {
    const cell = e.target.closest('[data-i]');
    if (cell) show(grid._list[Number(cell.dataset.i)]);
  });
  group.addEventListener('change', () => { search.value = ''; paint(); });
  search.addEventListener('input', paint);
  search.addEventListener('keydown', (e) => {
    // Enter fügt das erste Ergebnis ein (z. B. nach „U+2126“).
    if (e.key === 'Enter' && grid._list?.length) { e.preventDefault(); grid.querySelector('[data-i="0"]')?.click(); }
  });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  paint();
  // Auf dem iPad keine Tastatur aufklappen – dort tippt man meist nur ein Zeichen an.
  if (!matchMedia('(pointer: coarse)').matches) search.focus();
  return { close };
}
