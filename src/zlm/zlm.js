// ==================== .zlm LESEN UND SCHREIBEN ====================
//
// Eine .zlm ist ein ZIP: mimetype, manifest.json, document.json,
// modules/, media/, layers/ (docs/FORMAT.md). Hier wird nur ein- und
// ausgepackt und geprüft – was im Dokument steht, prüft docspec.
//
// Im Speicher sieht ein Dokument so aus:
//   { manifest, spec, modules: { id: modul }, media: { name: Uint8Array },
//     layers: { id: ebene }, preview: Uint8Array | null }

import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate/fflate.js';
import { newBlockId } from '../doc/ids.js';

export const ZLM_MIME = 'application/vnd.lm-editor.zlm+zip';
export const FORMAT_VERSION = 1;
export const KINDS = ['worksheet', 'exam', 'text'];

const LIMITS = { entries: 2000, entryBytes: 50e6, totalBytes: 200e6 };
// Name einer Datei in modules/, media/, layers/: keine Unterordner, kein „..“.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// Schon komprimiert – nochmal packen kostet nur Zeit.
const STORED_RE = /\.(png|jpe?g|gif|webp|mp3|m4a|ogg|webm|mp4)$/i;

export class ZlmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZlmError';
  }
}

/** Ein leeres Dokument. */
export function createZlm({ title = 'Neues Dokument', kind = 'worksheet', lang = 'de', now = new Date() } = {}) {
  const stamp = now.toISOString();
  return {
    manifest: { format: 'zlm', version: FORMAT_VERSION, id: newBlockId() + newBlockId(), title, kind, lang, created: stamp, modified: stamp },
    spec: { titel: title, content: [] },
    modules: {},
    media: {},
    layers: {},
    preview: null,
  };
}

/** Dokument → Bytes der .zlm. `generator`: Name und Version des Programms. */
export function writeZlm(doc, { generator = 'lm-editor', now = new Date() } = {}) {
  const manifest = { ...doc.manifest, format: 'zlm', version: FORMAT_VERSION, modified: now.toISOString(), generator };
  if (!KINDS.includes(manifest.kind)) throw new ZlmError(`Unbekannte Art „${manifest.kind}“.`);
  const json = (v) => strToU8(JSON.stringify(v, null, 1));
  // mimetype zuerst und unkomprimiert (wie ODF) – fflate hält die Reihenfolge der Schlüssel ein.
  const files = { mimetype: [strToU8(ZLM_MIME), { level: 0 }] };
  files['manifest.json'] = json(manifest);
  files['document.json'] = json({ spec: doc.spec });
  for (const [id, mod] of Object.entries(doc.modules || {})) files[`modules/${checkName(id, 'Modul')}.json`] = json(mod);
  for (const [name, bytes] of Object.entries(doc.media || {})) {
    files[`media/${checkName(name, 'Mediendatei')}`] = [bytes, { level: STORED_RE.test(name) ? 0 : 6 }];
  }
  for (const [id, layer] of Object.entries(doc.layers || {})) files[`layers/${checkName(id, 'Ebene')}.json`] = json(layer);
  if (doc.preview) files['preview.png'] = [doc.preview, { level: 0 }];
  return zipSync(files, { level: 6 });
}

/** Bytes einer .zlm → Dokument. Wirft ZlmError mit einem lesbaren Satz. */
export function readZlm(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let count = 0;
  let total = 0;
  let entries;
  try {
    entries = unzipSync(data, {
      // Vor dem Auspacken: Anzahl und Größe begrenzen (ZIP-Bomben).
      filter(file) {
        count += 1;
        total += file.originalSize;
        if (count > LIMITS.entries) throw new ZlmError('Die Datei enthält zu viele Einträge.');
        if (file.originalSize > LIMITS.entryBytes) throw new ZlmError(`„${file.name}“ ist zu groß.`);
        if (total > LIMITS.totalBytes) throw new ZlmError('Die Datei ist ausgepackt zu groß.');
        return !file.name.endsWith('/');
      },
    });
  } catch (e) {
    if (e instanceof ZlmError) throw e;
    throw new ZlmError('Die Datei ist keine gültige .zlm (kein lesbares ZIP).');
  }

  const text = (name) => (entries[name] ? strFromU8(entries[name]) : null);
  const parse = (name) => {
    const raw = text(name);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (_) { throw new ZlmError(`${name} ist kein gültiges JSON.`); }
  };

  if (text('mimetype')?.trim() !== ZLM_MIME) throw new ZlmError('Die Datei ist keine .zlm (mimetype fehlt oder stimmt nicht).');
  const manifest = parse('manifest.json');
  if (!manifest || manifest.format !== 'zlm') throw new ZlmError('manifest.json fehlt oder ist keine .zlm-Beschreibung.');
  if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new ZlmError('manifest.json: version fehlt.');
  if (manifest.version > FORMAT_VERSION) {
    throw new ZlmError(`Die Datei hat Formatversion ${manifest.version}, dieses Programm kennt nur bis ${FORMAT_VERSION}. Bitte das Programm aktualisieren.`);
  }
  if (!KINDS.includes(manifest.kind)) manifest.kind = 'worksheet';
  // Ältere oder fremde Dateien ohne ID: eine neue (zum Wiedererkennen des Entwurfs).
  if (typeof manifest.id !== 'string' || !/^[a-z0-9]{8,64}$/.test(manifest.id)) manifest.id = newBlockId() + newBlockId();
  const document = parse('document.json');
  if (!document || typeof document.spec !== 'object' || document.spec === null || Array.isArray(document.spec)) {
    throw new ZlmError('document.json fehlt oder enthält kein Dokument.');
  }

  const doc = { manifest, spec: document.spec, modules: {}, media: {}, layers: {}, preview: entries['preview.png'] || null };
  for (const path of Object.keys(entries)) {
    if (path.includes('\\') || path.startsWith('/') || path.split('/').includes('..')) {
      throw new ZlmError(`Unzulässiger Pfad in der Datei: „${path}“.`);
    }
    const [dir, name, ...rest] = path.split('/');
    if (rest.length || !name) continue;
    if (!NAME_RE.test(name)) throw new ZlmError(`Unzulässiger Dateiname: „${path}“.`);
    if (dir === 'modules' && name.endsWith('.json')) doc.modules[name.slice(0, -5)] = parse(path);
    else if (dir === 'layers' && name.endsWith('.json')) doc.layers[name.slice(0, -5)] = parse(path);
    else if (dir === 'media') doc.media[name] = entries[path];
  }
  return doc;
}

// ---------- Anzeige ----------

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

function dataUrl(bytes, name) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** Spec zum Anzeigen: Bilder aus media/ als data:-Adresse (die Anzeige nimmt nur data: und https). */
export function specForView(doc) {
  const spec = structuredClone(doc.spec);
  const walk = (blocks) => (Array.isArray(blocks) ? blocks : []).forEach((b) => {
    if (b && typeof b === 'object') {
      const view = (it) => { if (typeof it?.src === 'string' && it.src.startsWith('media/') && doc.media[it.src.slice(6)]) it.src = dataUrl(doc.media[it.src.slice(6)], it.src); };
      if (b.type === 'image') view(b);
      if (b.type === 'group' && Array.isArray(b.items)) b.items.forEach(view);
      walk(b.blocks);
    }
  });
  walk(spec.content);
  return spec;
}

// ---------- Stift-Ebene ↔ Stand des Stift-Editors ----------
//
// In der Datei liegt die Ebene je Baustein (layers/<id>.json); der Editor
// arbeitet mit seinem Stand { v, bg, pages, layer, ruler }. Hintergrund,
// Geodreieck und die Seiten der übrigen Hintergründe (Karo, …) stehen in
// der Ebene unter `editor`.

/** Ebene aus der Datei → Stand für openInkEditor (null: noch nichts geschrieben). */
export function editorStateOf(layer) {
  if (!layer) return null;
  const e = layer.editor || {};
  const inserts = Array.isArray(layer.inserts) && layer.inserts.length ? { inserts: layer.inserts } : {};
  return { v: 1, bg: e.bg || 'paper', ruler: e.ruler, pages: e.pages || [{ items: [] }], layer: { blocks: layer.blocks || {}, ...inserts } };
}

/** Stand des Editors → Ebene für die Datei – mit den selbst eingefügten Schreibfeldern (⊕). */
export function layerOf(state, { id = 'teacher', role = 'teacher' } = {}) {
  const inserts = state.layer?.inserts?.length ? { inserts: state.layer.inserts } : {};
  return { id, role, blocks: state.layer?.blocks || {}, ...inserts, editor: { bg: state.bg, ruler: state.ruler, pages: state.pages } };
}

function checkName(name, what) {
  if (!NAME_RE.test(String(name))) throw new ZlmError(`${what}: unzulässiger Name „${name}“.`);
  return String(name);
}
