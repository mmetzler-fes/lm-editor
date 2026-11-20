// Löschen einer Auswahl, die nur scheinbar über das Zeilenende reicht.
//
// Zieht man mit der Maus bis ans Ende einer Zeile (oder über die „(6 P)“ einer Aufgabe, die kein
// Text ist), endet die Auswahl am Anfang des nächsten Absatzes. ProseMirror würde beim Löschen
// beide Absätze verbinden: Die Zeile darunter rutscht hoch und wird z. B. zur Überschrift.
// Gemeint ist aber nur das Markierte in dieser Zeile – wie in Word. Verbinden bleibt der
// Rücktaste am Zeilenanfang bzw. Entf am Zeilenende vorbehalten.

import { TextSelection } from '../vendor/tiptap/tiptap.mjs';

/**
 * Was Entf/Rücktaste bei der Auswahl from–to löschen sollen, wenn sie in einer Zeile beginnt und
 * genau am Anfang der nächsten endet: { from, to } nur bis zum Zeilenende, dazu pointsAt (Stelle
 * der Aufgaben-Überschrift), wenn deren Punkte mit markiert waren. Sonst null (normal löschen).
 */
export function inLineDeleteRange(doc, from, to) {
  if (!(from < to)) return null;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  if (!$from.parent.isTextblock || !$to.parent.isTextblock || $to.parentOffset !== 0 || $from.sameParent($to)) return null;
  const end = $from.end();
  // Dazwischen nur Blockgrenzen – kein weiterer Absatz, der mitgelöscht werden soll.
  const before = TextSelection.findFrom(doc.resolve($to.before()), -1, true);
  if (!before || before.from !== end) return null;
  const head = $from.parent;
  const pointsAt = head.type.name === 'heading' && Number(head.attrs.points) > 0 ? $from.before() : null;
  return { from, to: end, pointsAt };
}

/**
 * Aufgaben-Überschriften, deren „(6 P)“ im Browser sichtbar markiert ist. Die Punkte sind kein
 * Text: ProseMirror selbst sieht dann oft nur eine Schreibmarke am Ende der Überschrift.
 */
function markedPoints(view) {
  const sel = view.dom.ownerDocument.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
  const out = [];
  for (const el of view.dom.querySelectorAll('.ds-points')) {
    if (!el.textContent || !sel.containsNode(el, true) || !el.previousElementSibling) continue;
    try {
      const $p = view.state.doc.resolve(view.posAtDOM(el.previousElementSibling, 0));
      if ($p.parent.type.name === 'heading') out.push($p.before());
    } catch { /* nicht im Dokument */ }
  }
  return out;
}

/** Tastenbefehl für Entf und Rücktaste; false = ProseMirror macht weiter wie gewohnt. */
export function deleteInLine(editor) {
  const { state, view } = editor;
  const { selection } = state;
  const points = markedPoints(view);
  const r = selection instanceof TextSelection && !selection.empty ? inLineDeleteRange(state.doc, selection.from, selection.to) : null;
  if (!r && !points.length) return false;
  const tr = state.tr;
  if (r) {
    if (r.to > r.from) tr.delete(r.from, r.to);
    if (r.pointsAt != null) points.push(r.pointsAt);
  } else if (!selection.empty) {
    tr.deleteSelection();
  }
  for (const at of new Set(points)) {
    const pos = tr.mapping.map(at);
    const node = tr.doc.nodeAt(pos);
    if (node?.type.name === 'heading') tr.setNodeMarkup(pos, null, { ...node.attrs, points: null });
  }
  const cursor = r ? r.from : tr.mapping.map(selection.from);
  tr.setSelection(TextSelection.create(tr.doc, cursor));
  view.dispatch(tr.scrollIntoView());
  return true;
}
