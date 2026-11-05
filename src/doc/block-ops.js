import { stampBlockIds } from './ids.js';

// ==================== BAUSTEINE EINES DOKUMENTS ÄNDERN ====================
//
// Für den Stift-Editor (paper.insertBlocks, paper.blockOps): einfügen, verschieben, entfernen, ersetzen –
// auf der obersten Ebene, wo der Editor Bausteine wählt. Jeder Baustein behält seine ID, daran hängen
// die Striche (auch die der Schüler). Neue bekommen eine eigene. Reine Funktionen, ohne DOM.

/** `{ list, index, block }` zur ID – oder null. */
export function findBlock(spec, bid) {
  let found = null;
  const go = (list) => {
    if (!Array.isArray(list) || found) return;
    list.forEach((b, index) => {
      if (found || !b || typeof b !== 'object') return;
      if (b.id === bid) found = { list, index, block: b };
      else go(b.blocks);
    });
  };
  go(spec?.content);
  return found;
}

const withoutIds = (blocks) => JSON.parse(JSON.stringify(blocks, (k, v) => (k === 'id' ? undefined : v)));

/** Hinter `after` einfügen (null = an den Anfang, unbekannt = ans Ende). Ändert `spec`. */
export function insertBlocks(spec, after, blocks) {
  stampBlockIds(spec);
  const fresh = withoutIds(blocks);
  const ref = after ? findBlock(spec, after) : null;
  if (!after) spec.content.unshift(...fresh);
  else if (ref) ref.list.splice(ref.index + 1, 0, ...fresh);
  else spec.content.push(...fresh);
  stampBlockIds(spec);
  return spec;
}

export function removeBlocks(spec, bids) {
  for (const bid of bids) {
    const ref = findBlock(spec, bid);
    if (ref) ref.list.splice(ref.index, 1);
  }
  return spec;
}

/** Bausteine der obersten Ebene zusammen hinter `after` (null = an den Anfang), in ihrer Reihenfolge. */
export function moveBlocks(spec, bids, after) {
  const blocks = spec.content.filter((b) => b && typeof b === 'object' && bids.includes(b.id));
  const anchor = after ? spec.content.find((b) => b && b.id === after) : null;
  spec.content = spec.content.filter((b) => !blocks.includes(b));
  spec.content.splice(anchor ? spec.content.indexOf(anchor) + 1 : 0, 0, ...blocks);
  return spec;
}

/** Baustein durch `blocks` ersetzen; der erste behält die ID. */
export function replaceBlock(spec, bid, blocks) {
  const ref = findBlock(spec, bid);
  if (!ref) throw new Error('Baustein nicht gefunden.');
  const fresh = withoutIds(blocks);
  if (fresh[0] && typeof fresh[0] === 'object') fresh[0].id = bid;
  ref.list.splice(ref.index, 1, ...fresh);
  stampBlockIds(spec);
  return spec;
}
