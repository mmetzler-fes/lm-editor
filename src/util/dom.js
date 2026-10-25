// ==================== HILFSFUNKTIONEN FÜR DIE ANZEIGE ====================
//
// Aus utils.js von LearningModules (die App reicht sie von dort weiter):
// Freigabelinks, Escapen, Farben, HTML bereinigen, Kontextmenü, Zoom,
// Ziehen per Pointer-Events.

/**
 * Freigabelinks auf die Datei selbst umbiegen. Ein Nextcloud-Link
 * ".../s/<Kürzel>" öffnet eine Webseite; erst ".../s/<Kürzel>/download"
 * liefert die Datei – ein <img> oder <audio> mit der Webseite bleibt leer.
 * (Kopie in hotspot-editor.js, das als klassisches Skript nicht importiert.)
 */
export function normalizeShareUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const m = /^(https?:\/\/[^?#]+?\/(?:index\.php\/)?s\/[A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(u);
  return m ? `${m[1]}/download` : u;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

export function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Mischt eine Farbe mit Weiss und liefert wieder einen vollen Hex-Wert.
 * Sieht aus wie dieselbe Farbe mit wenig Deckkraft auf weissem Grund, ist
 * aber undurchsichtig - was darunter liegt, bleibt damit verdeckt.
 *
 * `ratio` ist der Farbanteil: 0.25 entspricht optisch alpha 0.25.
 */
export function hexTint(hex, ratio) {
  const mix = (v) => Math.round(255 + (v - 255) * ratio);
  const r = mix(parseInt(hex.slice(1, 3), 16));
  const g = mix(parseInt(hex.slice(3, 5), 16));
  const b = mix(parseInt(hex.slice(5, 7), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

export function sanitizeModuleDescriptionHtml(html) {
  return sanitizeRichHtml(html, false);
}

/**
 * Inhalt eines Arbeitsblatts. Wie die Modulbeschreibung, zusätzlich Bilder
 * (nur als data:-Bild oder https), H4, Unter-/Hochstellung, Trennlinien und
 * Textrahmen (div.ws-box) – das, was der .odt-Import erzeugt.
 */
/** Erlaubte Klassen an Bildern im Arbeitsblatt (siehe .worksheet-content in styles.css). */
export const WORKSHEET_IMAGE_CLASSES = new Set(['ws-float-left', 'ws-float-right', 'ws-img-center', 'ws-img-border']);

export function sanitizeWorksheetHtml(html) {
  return sanitizeRichHtml(html, true);
}

function sanitizeRichHtml(html, worksheet) {
  const allowedTags = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI',
    'H1', 'H2', 'H3', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'SPAN', 'FONT']);
  if (worksheet) ['IMG', 'H4', 'SUB', 'SUP', 'HR', 'DIV'].forEach((t) => allowedTags.add(t));
  const template = document.createElement('template');
  template.innerHTML = html || '';

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const tag = node.tagName.toUpperCase();
    const fragment = document.createDocumentFragment();

    if (!allowedTags.has(tag)) {
      Array.from(node.childNodes).forEach((child) => {
        fragment.appendChild(sanitizeNode(child));
      });
      return fragment;
    }

    const clean = document.createElement(tag.toLowerCase());

    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:|mailto:|#)/i.test(href)) {
        clean.setAttribute('href', href);
        clean.setAttribute('target', '_blank');
        clean.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (tag === 'TH' || tag === 'TD') {
      const colspan = node.getAttribute('colspan');
      const rowspan = node.getAttribute('rowspan');
      if (colspan && /^\d+$/.test(colspan)) clean.setAttribute('colspan', colspan);
      if (rowspan && /^\d+$/.test(rowspan)) clean.setAttribute('rowspan', rowspan);
    }

    if (tag === 'IMG') {
      // Kein SVG als Adresse von außen und nichts außer Bildern: Ein
      // data:-Bild bzw. https-Bild führt im <img> kein Skript aus.
      const src = node.getAttribute('src') || '';
      if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src) && !/^https:\/\//i.test(src)) {
        return document.createDocumentFragment();
      }
      clean.setAttribute('src', src);
      const alt = node.getAttribute('alt');
      if (alt) clean.setAttribute('alt', alt);
      const width = node.getAttribute('width');
      if (width && /^\d{1,4}$/.test(width)) clean.setAttribute('width', width);
      // Lage und Rahmen eines Bildes – nur diese festen Klassen, kein freies CSS.
      const classes = (node.getAttribute('class') || '').split(/\s+/).filter((c) => WORKSHEET_IMAGE_CLASSES.has(c));
      if (worksheet && classes.length) clean.className = classes.join(' ');
    }

    if (tag === 'DIV' && node.classList.contains('ws-box')) clean.className = 'ws-box';

    if (tag === 'FONT') {
      const size = node.getAttribute('size');
      if (size && /^[1-7]$/.test(size)) clean.setAttribute('size', size);
    }

    const style = node.getAttribute('style') || '';
    const textAlignMatch = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    if (textAlignMatch && ['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'TH', 'TD', 'SPAN'].includes(tag)) {
      clean.style.textAlign = textAlignMatch[1].toLowerCase();
    }
    const marginBottomMatch = style.match(/margin-bottom\s*:\s*(\d+px)/i);
    if (marginBottomMatch && ['P', 'H1', 'H2', 'H3', 'DIV', 'LI', 'UL', 'OL'].includes(tag)) {
      clean.style.marginBottom = marginBottomMatch[1].toLowerCase();
    }

    Array.from(node.childNodes).forEach((child) => {
      clean.appendChild(sanitizeNode(child));
    });

    return clean;
  };

  const out = document.createElement('div');
  Array.from(template.content.childNodes).forEach((child) => {
    out.appendChild(sanitizeNode(child));
  });

  return out.innerHTML;
}

/**
 * Kleines Kontextmenue an der Zeigerposition. Schliesst bei Klick daneben,
 * Escape, Scrollen oder wenn ein Eintrag gewaehlt wurde.
 * items: [{ label, onClick, danger }]
 *
 * Gleiche Funktion wie in content-editors.js (klassisches Skript, kann nicht
 * importieren).
 */
export function showContextMenu(x, y, items) {
  document.querySelectorAll('.ctx-menu').forEach((m) => m._close());
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('blur', close);
  };
  const onOutside = (e) => { if (!menu.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  menu._close = close;
  items.forEach(({ label, onClick, danger }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctx-menu-item' + (danger ? ' danger' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { close(); onClick(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('blur', close);
}

/**
 * Ziehen per Pointer-Events statt nativem HTML5-Drag&Drop, damit Finger und
 * Stift ein Element sofort bewegen. Natives Drag&Drop startet auf dem iPad
 * erst nach langem Druecken. Vorbild ist pointerDrag.ts in LibreSpice.
 *
 * Waehrend des Ziehens folgt eine Kopie (Geist) dem Zeiger; das Original
 * bekommt die Klasse `dragging`. Losgelassen wird per elementFromPoint
 * ermittelt, worueber das Element liegt.
 *
 * Optionen:
 *  - onHover(target, info)  bei jeder Bewegung, am Ende mit null
 *  - onDrop(target, info)   beim Loslassen nach einer echten Bewegung
 *                           info = { x, y, rect, pointerType }: Zeigerposition
 *                           und Rechteck der mitgezogenen Kopie, damit der
 *                           Aufrufer auch knapp daneben noch einrasten kann
 *  - onLongPress(x, y)      Finger/Stift ruht LONG_PRESS_MS lang (Ersatz fuer
 *                           Rechtsklick, iPadOS kennt kein contextmenu)
 *  - canLongPress()         ob der lange Druck gerade etwas ausloesen soll
 *  - canDrag()              ob das Element gerade ziehbar ist (z. B. nur eine
 *                           gefuellte Luecke)
 *  - scrollContainer        wird am oberen/unteren Rand mitgescrollt
 *
 * Ein Tippen ohne Bewegung bleibt ein normaler click.
 */
// Ab dieser Bewegung wird gezogen. Fuer Finger groesser: Ein ruhig
// gehaltener Finger zittert, das darf den langen Druck nicht abbrechen.
const DRAG_THRESHOLD = { mouse: 4, pen: 6, touch: 10 };
const LONG_PRESS_MS = 500;

// Der click, den der Browser nach Ziehen bzw. langem Druck noch nachschiebt,
// darf nichts ausloesen (sonst wanderte das Element per Klick weiter). Ein
// Klick ins gerade geoeffnete Kontextmenue bleibt erlaubt.
function swallowNextClick() {
  const stop = (e) => {
    if (e.target.closest && e.target.closest('.ctx-menu')) return;
    e.stopPropagation(); e.preventDefault();
    window.removeEventListener('click', stop, true);
  };
  window.addEventListener('click', stop, true);
  setTimeout(() => window.removeEventListener('click', stop, true), 400);
}

/**
 * Wie stark ein Element insgesamt gezoomt ist (CSS `zoom` aller Vorfahren,
 * z. B. der Inhaltszoom aus der Seitenleiste). Koordinaten aus Maus- und
 * Zeigerereignissen und getBoundingClientRect() sind Bildschirm-Pixel;
 * Längen im Inneren gelten vor dem Zoom – geteilt durch diesen Faktor.
 */
export function effectiveZoom(el) {
  let z = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).zoom);
    if (v > 0) z *= v;
  }
  return z;
}

export function attachPointerDrag(el, { onHover, onDrop, onLongPress, canLongPress, canDrag, scrollContainer } = {}) {
  el.draggable = false;
  // Liegt das Element in markiertem Text, zöge der Browser sonst die
  // Markierung (dragstart) und bräche unser Ziehen ab (pointercancel) – das
  // Wort käme nie an, stattdessen wanderte der markierte Text mit.
  el.addEventListener('dragstart', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (canDrag && !canDrag()) return;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
    // Maus und Stift: keine neue Markierung und kein Ziehen des Browsers
    // beginnen. Beim Finger bleibt es, wie es ist (touch-action regelt das).
    if (e.pointerType !== 'touch') e.preventDefault();
    const id = e.pointerId;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, offX = 0, offY = 0, zoom = 1;
    let scrollSpeed = 0, scrollTimer = null;
    let pressTimer = null;

    if (onLongPress && e.pointerType !== 'mouse' && (!canLongPress || canLongPress())) {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        cleanup();
        swallowNextClick();
        onLongPress(x0, y0);
      }, LONG_PRESS_MS);
    }

    const hit = (ev) => document.elementFromPoint(ev.clientX, ev.clientY);
    const info = (ev) => ({
      x: ev.clientX, y: ev.clientY, pointerType: e.pointerType,
      rect: ghost ? ghost.getBoundingClientRect() : null,
    });

    const autoScroll = (ev) => {
      if (!scrollContainer) return;
      const r = scrollContainer.getBoundingClientRect();
      scrollSpeed = ev.clientY - r.top < 60 ? -15 : r.bottom - ev.clientY < 60 ? 15 : 0;
      if (scrollSpeed && !scrollTimer) {
        scrollTimer = setInterval(() => { scrollContainer.scrollTop += scrollSpeed; }, 20);
      } else if (!scrollSpeed && scrollTimer) {
        clearInterval(scrollTimer); scrollTimer = null;
      }
    };

    const move = (ev) => {
      if (ev.pointerId !== id) return;
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < (DRAG_THRESHOLD[e.pointerType] ?? 6)) return;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        const r = el.getBoundingClientRect();
        offX = x0 - r.left; offY = y0 - r.top;
        // Die Kopie hängt am body, außerhalb des gezoomten Inhalts – sie
        // bekommt denselben Zoom, damit sie so groß aussieht wie das Original.
        zoom = effectiveZoom(el);
        ghost = el.cloneNode(true);
        // Ohne id und data-*: Die Kopie soll fuer keine Auswertung wie ein
        // echtes Element aussehen.
        ghost.removeAttribute('id');
        Object.keys(ghost.dataset).forEach((k) => delete ghost.dataset[k]);
        ghost.classList.add('drag-ghost');
        Object.assign(ghost.style, {
          position: 'fixed', margin: '0', width: r.width / zoom + 'px',
          pointerEvents: 'none', zIndex: '10000', zoom: String(zoom),
        });
        document.body.appendChild(ghost);
        el.classList.add('dragging');
      }
      ev.preventDefault();
      ghost.style.left = (ev.clientX - offX) / zoom + 'px';
      ghost.style.top = (ev.clientY - offY) / zoom + 'px';
      if (onHover) onHover(hit(ev), info(ev));
      autoScroll(ev);
    };

    const end = (ev) => {
      if (ev.pointerId !== id) return;
      const dragged = !!ghost;
      // Ziel noch im Ziehzustand bestimmen (Zoneninhalte sind dann per CSS
      // nicht treffbar, es zaehlt die Zone selbst).
      const drop = dragged && ev.type === 'pointerup' ? { target: hit(ev), info: info(ev) } : null;
      cleanup();
      if (dragged) {
        swallowNextClick();
        if (drop && drop.target && onDrop) onDrop(drop.target, drop.info);
      }
    };

    function cleanup() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
      if (ghost) { ghost.remove(); ghost = null; }
      el.classList.remove('dragging');
      if (onHover) onHover(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
}
