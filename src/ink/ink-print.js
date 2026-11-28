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

/** Maße eines Schreibfelds aus der Ebene übernehmen (Satzbreite = volle Breite: 16,5 cm, quer 25 cm). */
function applyField(block, { lines, width, pattern } = {}, fullCm = 16.5) {
  if (Number.isInteger(lines) && lines >= 1) block.lines = Math.min(60, lines);
  if (width) {
    if (width >= fullCm) delete block.width;
    else block.width = `${Math.round(width * 10) / 10}cm`;
  }
  if (pattern) {
    if (pattern === 'karo') delete block.pattern;
    else block.pattern = pattern;
  }
}

const inkOf = (o) => ({ svg: o.svg, x: o.x, y: o.y, w: o.w, h: o.h });

/**
 * Was Schüler (und die Lehrkraft in ihrer Ebene) selbst als Baustein einfügen dürfen – Text, Tabellen,
 * Bilder und Verwandtes; keine Quizze, Labore, Rohdaten. Bilder nur eingebettet (data:image/…), damit der
 * Renderer nichts von außen oder von der Platte liest.
 */
const INSERT_TYPES = new Set(['section', 'task', 'subtask', 'heading', 'text', 'list', 'code', 'image', 'table', 'formula', 'box', 'columns', 'column', 'note', 'karo']);
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_INSERT_CHARS = 3_000_000;

/** Eingefügte Bausteine prüfen: bereinigte Kopie oder null (dann fällt die Einfügung weg). */
export function safeInsertContent(content) {
  if (!Array.isArray(content) || !content.length) return null;
  if (JSON.stringify(content).length > MAX_INSERT_CHARS) return null;
  let ok = true;
  // Bild im Text `![alt](src)`: nur eingebettet, sonst bleibt die Beschreibung.
  const text = (v) => v.replace(/!\[([^\]]*)\]\(([^)\s]*)\)(\{[^}]*\})?/g, (m, alt, src) => (DATA_IMAGE.test(src) ? m : alt));
  const walk = (v) => {
    if (typeof v === 'string') return text(v);
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    if (typeof v.type === 'string' && !INSERT_TYPES.has(v.type)) ok = false;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'src' && !(typeof x === 'string' && DATA_IMAGE.test(x))) { ok = false; continue; }
      if (k === 'ink') continue;
      out[k] = walk(x);
    }
    return out;
  };
  const clean = walk(content);
  return ok ? clean : null;
}

/**
 * Dokument zum Drucken: `spec` mit den Änderungen aus dem Stift-Editor.
 * `karo`: [{ path, lines?, width?, pattern? }];
 * `overlays`: [{ path | insert, svg, x, y, w, h }];
 * `inserts`: [{ id, after: Pfad | null (an den Anfang) | 'end', pattern?, lines?, width? }] – Schreibfelder,
 *   oder mit `content` (DocSpec-Bausteine, safeInsertContent) eingefügte Textblöcke, Tabellen, Bilder.
 * Das Original bleibt unverändert.
 */
export function applyInkToSpec(spec, { karo = [], overlays = [], inserts = [] } = {}, { fullCm = spec?.orientation === 'landscape' ? 25 : 16.5 } = {}) {
  const out = structuredClone(spec && typeof spec === 'object' ? spec : { content: [] });
  if (!Array.isArray(out.content)) out.content = [];
  for (const k of karo) {
    const b = blockAt(out.content, k.path);
    if (b?.type === 'karo') applyField(b, k, fullCm);
  }
  for (const o of overlays) {
    if (o.insert) continue;
    const b = blockAt(out.content, o.path);
    if (b) b.ink = inkOf(o);
  }
  // Eingefügte Felder: Ziele zuerst bestimmen, dann von hinten einsetzen –
  // so verschieben frühere Einfügungen die späteren nicht.
  const targets = inserts.map((ins, n) => {
    let blocks;
    if (ins.content !== undefined) {
      blocks = safeInsertContent(ins.content);
      if (!blocks) return null;
    } else {
      const block = { type: 'karo', lines: 1 };
      applyField(block, ins, fullCm);
      blocks = [block];
    }
    // Striche auf dem Eingefügten hängen am ersten Baustein (y ab seiner Oberkante).
    const ink = overlays.find((o) => o.insert === ins.id);
    if (ink && blocks[0] && typeof blocks[0] === 'object') blocks[0].ink = inkOf(ink);
    if (ins.after === null) return { list: out.content, i: -1, n, blocks };
    const at = ins.after === 'end' ? null : locate(out.content, ins.after);
    return at ? { ...at, n, blocks } : { list: out.content, i: out.content.length - 1, n, blocks };
  }).filter(Boolean);
  const byList = new Map();
  for (const t of targets) byList.set(t.list, [...(byList.get(t.list) || []), t]);
  for (const [list, group] of byList) {
    group.sort((a, b) => b.i - a.i || b.n - a.n);
    for (const t of group) list.splice(t.i + 1, 0, ...t.blocks);
  }
  return out;
}
