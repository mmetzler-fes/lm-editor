// Block-IDs im Editor: Jeder Baustein auf oberster Ebene und in Kasten, Lösung und Spalten
// trägt eine feste ID, an der die Stift-Striche hängen. Beim Teilen, Verdoppeln oder
// Einfügen entstehen fehlende oder doppelte IDs – die zweite bekommt eine neue, das
// Verschieben ändert nichts. Ohne Tiptap und DOM, damit es sich unter Node prüfen lässt.

import { isBlockId, newBlockId } from '../doc/ids.js';

const WITH_IDS = new Set(['doc', 'box', 'solution', 'columns', 'column']);

/**
 * Fehlende und doppelte IDs finden. `doc` braucht nur descendants() wie ein
 * ProseMirror-Knoten. Liefert [{ pos, node, id }] für die nötigen Änderungen.
 */
export function missingIds(doc) {
  const seen = new Set();
  const changes = [];
  doc.descendants((node, pos, parent) => {
    if (!WITH_IDS.has(parent?.type.name) || !('id' in node.attrs)) return true;
    const { id, joined } = node.attrs;
    // Weitere Absätze eines Text-Bausteins teilen sich dessen ID.
    if (joined && isBlockId(id)) return true;
    if (isBlockId(id) && !seen.has(id)) { seen.add(id); return true; }
    changes.push({ pos, node });
    return true;
  });
  return changes.map((c) => {
    let id;
    do id = newBlockId(); while (seen.has(id));
    seen.add(id);
    return { ...c, id };
  });
}
