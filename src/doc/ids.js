// ==================== BLOCK-IDS ====================
//
// Jeder Baustein eines Dokuments trägt eine feste `id`. Daran hängen die
// Stift-Striche (layers/…/blocks/<id>), damit sie beim Verschieben und
// Bearbeiten beim richtigen Baustein bleiben.
//
// Ohne import und DOM – läuft im Browser, unter Node und in LearningModules.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';  // ohne l, o, 0, 1
const ID_RE = /^[a-z0-9]{4,32}$/;

/** Neue ID, 8 Zeichen (32^8 ≈ 10^12 – Kollisionen im Dokument praktisch ausgeschlossen, aber geprüft). */
export function newBlockId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function walk(blocks, fn) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    fn(b);
    walk(b.blocks, fn);
  }
}

/**
 * Gibt jedem Baustein ohne gültige oder mit doppelter ID eine neue (die
 * zweite von zwei gleichen – etwa nach Kopieren). Ändert die Spec und
 * liefert die Zahl der vergebenen IDs.
 */
export function ensureBlockIds(spec) {
  const seen = new Set();
  const missing = [];
  walk(spec?.content, (b) => {
    if (typeof b.id === 'string' && ID_RE.test(b.id) && !seen.has(b.id)) seen.add(b.id);
    else missing.push(b);
  });
  for (const b of missing) {
    let id;
    do id = newBlockId(); while (seen.has(id));
    seen.add(id);
    b.id = id;
  }
  return missing.length;
}

/** id → Baustein. */
export function blockIndex(spec) {
  const map = new Map();
  walk(spec?.content, (b) => { if (b.id) map.set(b.id, b); });
  return map;
}

/**
 * Bausteine ohne feste ID bekommen ihre jetzige Position als ID: `pos3`
 * (content[3]), `pos2x0` (content[2].blocks[0]). Vor dem Einfügen eines
 * Bausteins nötig – Striche, die am Pfad hängen („p:3“), findet der
 * Stift-Editor über diese ID wieder, auch wenn sich die Positionen
 * verschieben. Liefert die Zahl der vergebenen IDs.
 */
export function assignPathIds(spec) {
  let n = 0;
  const go = (blocks, prefix) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((b, i) => {
      if (!b || typeof b !== 'object') return;
      const path = prefix ? `${prefix}x${i}` : String(i);
      if (!(typeof b.id === 'string' && ID_RE.test(b.id))) { b.id = `pos${path}`; n++; }
      go(b.blocks, path);
    });
  };
  go(spec?.content, '');
  return n;
}

/** ID, unter der ein Baustein mit dem Pfad „2.0“ nach assignPathIds steht. */
export function pathId(path) {
  return `pos${String(path).replace(/\./g, 'x')}`;
}
