// ==================== MODUL-EDITOR: (+) UND ⠿ AM RAND ====================
//
// Wie im Stift-Editor: Fährt die Maus über einen Baustein, erscheinen links daneben
// ⠿ (ziehen = verschieben) und (+) (einfügen). Obere Hälfte des Bausteins: davor,
// untere Hälfte: danach – eine Linie zeigt die Stelle, solange (+) unter der Maus ist.
// Nur die Bausteine der obersten Ebene; in Kästen, Spalten und Tabellen bleibt die
// Schreibmarke mit ➕ in der Leiste.

import { NodeSelection } from '../vendor/tiptap/tiptap.mjs';

const GUTTER_PX = 46; // Abstand der Leiste links vom Text

/**
 * Am Rand der Fläche `scroller` (scrollt, enthält die ProseMirror-Fläche von `pm`).
 * `openMenu(x, y)`: Einfügen-Menü öffnen – `pm.setInsertTarget` ist dann schon gesetzt.
 */
export function mountBlockGutter(scroller, pm, openMenu) {
  const { view } = pm.editor;
  if (getComputedStyle(scroller).position === 'static') scroller.style.position = 'relative';
  const bar = document.createElement('div');
  bar.className = 'ds-pm-gutter';
  bar.contentEditable = 'false';
  bar.hidden = true;
  const grip = document.createElement('span');
  grip.className = 'ds-pm-grip';
  grip.textContent = '⠿';
  grip.title = 'Ziehen: Baustein verschieben · Antippen: Baustein wählen';
  grip.draggable = true;
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'ds-pm-gplus';
  plus.textContent = '+';
  bar.append(grip, plus);
  const line = document.createElement('div');
  line.className = 'ds-pm-gline';
  line.hidden = true;
  scroller.append(bar, line);

  let cur = null; // { pos, node, dom, before }
  let dragging = false;

  const blocks = () => {
    const out = [];
    view.state.doc.forEach((node, pos) => {
      const dom = view.nodeDOM(pos);
      if (dom?.getBoundingClientRect) out.push({ pos, node, dom });
    });
    return out;
  };
  /** Baustein auf Höhe `y` (Bildschirm) – auch knapp daneben, z. B. im Abstand zwischen zweien. */
  const hit = (y) => {
    let best = null;
    let bd = Infinity;
    for (const b of blocks()) {
      const r = b.dom.getBoundingClientRect();
      if (!r.height) continue;
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < bd) { bd = d; best = { ...b, r }; }
    }
    return bd < 24 ? best : null;
  };
  const contentLeft = () => {
    const vr = view.dom.getBoundingClientRect();
    const k = view.dom.offsetWidth ? vr.width / view.dom.offsetWidth || 1 : 1;
    return vr.left + (parseFloat(getComputedStyle(view.dom).paddingLeft) || 0) * k;
  };
  const place = () => {
    if (!cur) return;
    const sr = scroller.getBoundingClientRect();
    // Das Blatt kann verkleinert sein (CSS zoom): Bildschirm-Pixel → Pixel im Blatt.
    const k = scroller.offsetWidth ? sr.width / scroller.offsetWidth || 1 : 1;
    const x = (cx) => (cx - sr.left - scroller.clientLeft * k) / k + scroller.scrollLeft;
    const y = (cy) => (cy - sr.top - scroller.clientTop * k) / k + scroller.scrollTop;
    const r = cur.dom.getBoundingClientRect();
    const left = x(contentLeft());
    const pr = (parseFloat(getComputedStyle(view.dom).paddingRight) || 0) * k;
    bar.style.left = `${Math.max(0, left - GUTTER_PX)}px`;
    bar.style.top = `${y(r.top)}px`;
    bar.hidden = false;
    plus.title = cur.before ? 'Davor einfügen' : 'Danach einfügen';
    line.style.left = `${left}px`;
    line.style.width = `${Math.max(40, x(view.dom.getBoundingClientRect().right - pr) - left)}px`;
    line.style.top = `${y(cur.before ? r.top : r.bottom)}px`;
  };
  const hide = () => { bar.hidden = true; line.hidden = true; cur = null; };

  scroller.addEventListener('pointermove', (e) => {
    if (dragging || e.pointerType === 'touch' || !view.editable) return;
    if (bar.contains(e.target)) return; // über der Leiste: Baustein und Hälfte bleiben
    const b = hit(e.clientY);
    if (!b) { hide(); return; }
    cur = { ...b, before: e.clientY < b.r.top + b.r.height / 2 };
    place();
  });
  scroller.addEventListener('pointerleave', (e) => { if (!dragging && !bar.contains(e.relatedTarget)) hide(); });
  scroller.addEventListener('scroll', () => { if (!dragging) hide(); }, { passive: true });

  plus.addEventListener('pointerenter', () => { if (cur) line.hidden = false; });
  plus.addEventListener('pointerleave', () => { line.hidden = true; });
  plus.addEventListener('mousedown', (e) => e.preventDefault()); // Schreibmarke bleibt, wo sie war
  plus.addEventListener('click', (e) => {
    e.preventDefault();
    if (!cur) return;
    const { pos, node, before } = cur;
    // Baustein wählen (zeigt, wo es hinkommt), dann die Stelle merken – die Auswahl löscht sie sonst.
    if (NodeSelection.isSelectable(node)) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    pm.setInsertTarget(before ? pos : pos + node.nodeSize);
    const r = plus.getBoundingClientRect();
    line.hidden = true;
    openMenu(r.right + 4, r.top);
  });

  grip.addEventListener('mousedown', (e) => e.stopPropagation());
  grip.addEventListener('click', () => {
    if (!cur || !NodeSelection.isSelectable(cur.node)) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, cur.pos)));
    view.focus();
  });
  // Ziehen wie bei einem gewählten Baustein: ProseMirror verschiebt beim Loslassen (drop).
  grip.addEventListener('dragstart', (e) => {
    if (!cur || !NodeSelection.isSelectable(cur.node)) { e.preventDefault(); return; }
    const sel = NodeSelection.create(view.state.doc, cur.pos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = view.state.selection.content();
    dragging = true;
    e.dataTransfer.clearData();
    e.dataTransfer.setData('text/plain', cur.node.textContent.slice(0, 200));
    e.dataTransfer.effectAllowed = 'copyMove';
    try { e.dataTransfer.setDragImage(cur.dom, 0, 0); } catch (_) { /* ohne Vorschau */ }
    const drag = { slice, move: true, node: view.state.selection };
    view.dragging = drag;
    // Daneben losgelassen: Der Zug gilt nicht mehr (sonst nähme ihn ein späteres Hineinziehen).
    grip.addEventListener('dragend', () => {
      dragging = false;
      hide();
      setTimeout(() => { if (view.dragging === drag) view.dragging = null; }, 50);
    }, { once: true });
  });

  return { hide, destroy: () => { bar.remove(); line.remove(); } };
}
