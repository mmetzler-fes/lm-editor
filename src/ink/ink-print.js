// ==================== DRUCK ÜBER DEN RENDERER ====================
//
// Der Stift-Editor druckt mit der Vorlage (Logo, Kopfzeile, Ränder), indem er
// dem Renderer ein Dokument schickt, das aussieht wie sein Blatt:
//
//   - Schreibfelder, die nur in der Ebene geändert wurden (Höhe, Breite,
//     Muster), bekommen diese Maße;
//   - selbst eingefügte Schreibfelder kommen als Karo-Bausteine hinzu;
//   - jeder Baustein mit Beschriftung bekommt `ink`: { svg, x, y, w, h } in
//     Punkt – x ab dem linken Rand des Satzspiegels, y ab seiner Oberkante.
//     Der Renderer setzt das SVG als Rahmen genau dorthin.
//
// Bausteine stehen hier über ihren Pfad im Dokument („2.1.0“ =
// content[2].blocks[1].blocks[0]), wie die Ansicht ihn zählt (data-bpath).
// Ohne DOM – testbar in Node (test/ink-print.test.js).

/** Liste und Stelle eines Bausteins zum Pfad – oder null. */
function locate(content, path) {
  const idx = String(path ?? '').split('.').filter((s) => s !== '').map(Number);
  if (!idx.length || idx.some((i) => !Number.isInteger(i) || i < 0)) return null;
  let list = content;
  for (let k = 0; k < idx.length; k++) {
    if (!Array.isArray(list) || idx[k] >= list.length) return null;
    if (k === idx.length - 1) return { list, i: idx[k] };
    const b = list[idx[k]];
    list = b && typeof b === 'object' ? b.blocks : null;
  }
  return null;
}

/** Baustein am Pfad als Objekt (ein bloßer Text wird zum Textbaustein) – oder null. */
function blockAt(content, path) {
  const at = locate(content, path);
  if (!at) return null;
  const b = at.list[at.i];
  if (typeof b === 'string' || typeof b === 'number') at.list[at.i] = { type: 'text', text: String(b) };
  return at.list[at.i] && typeof at.list[at.i] === 'object' ? at.list[at.i] : null;
}

/** Maße eines Schreibfelds aus der Ebene übernehmen (Breite 16,5 = volle Breite). */
function applyField(block, { lines, width, pattern } = {}) {
  if (Number.isInteger(lines) && lines >= 1) block.lines = Math.min(60, lines);
  if (width) {
    if (width >= 16.5) delete block.width;
    else block.width = `${Math.round(width * 10) / 10}cm`;
  }
  if (pattern) {
    if (pattern === 'karo') delete block.pattern;
    else block.pattern = pattern;
  }
}

const inkOf = (o) => ({ svg: o.svg, x: o.x, y: o.y, w: o.w, h: o.h });

/**
 * Dokument zum Drucken: `spec` mit den Änderungen aus dem Stift-Editor.
 * `karo`: [{ path, lines?, width?, pattern? }];
 * `overlays`: [{ path | insert, svg, x, y, w, h }];
 * `inserts`: [{ id, after: Pfad | null (an den Anfang) | 'end', pattern?, lines?, width? }].
 * Das Original bleibt unverändert.
 */
export function applyInkToSpec(spec, { karo = [], overlays = [], inserts = [] } = {}) {
  const out = structuredClone(spec && typeof spec === 'object' ? spec : { content: [] });
  if (!Array.isArray(out.content)) out.content = [];
  for (const k of karo) {
    const b = blockAt(out.content, k.path);
    if (b?.type === 'karo') applyField(b, k);
  }
  for (const o of overlays) {
    if (o.insert) continue;
    const b = blockAt(out.content, o.path);
    if (b) b.ink = inkOf(o);
  }
  // Eingefügte Felder: Ziele zuerst bestimmen, dann von hinten einsetzen –
  // so verschieben frühere Einfügungen die späteren nicht.
  const targets = inserts.map((ins, n) => {
    const block = { type: 'karo', lines: 1 };
    applyField(block, ins);
    const ink = overlays.find((o) => o.insert === ins.id);
    if (ink) block.ink = inkOf(ink);
    if (ins.after === null) return { list: out.content, i: -1, n, block };
    const at = ins.after === 'end' ? null : locate(out.content, ins.after);
    return at ? { ...at, n, block } : { list: out.content, i: out.content.length - 1, n, block };
  });
  const byList = new Map();
  for (const t of targets) byList.set(t.list, [...(byList.get(t.list) || []), t]);
  for (const [list, group] of byList) {
    group.sort((a, b) => b.i - a.i || b.n - a.n);
    for (const t of group) list.splice(t.i + 1, 0, t.block);
  }
  return out;
}
