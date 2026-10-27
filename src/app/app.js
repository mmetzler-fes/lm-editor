// ==================== LM-EDITOR (STANDALONE) ====================
//
// Startseite: .zlm öffnen (oder .odt/.pdf übernehmen), Beispiel oder neues
// Karoblatt, zuletzt geöffnete Entwürfe. Ein Dokument öffnet im Stift-Editor auf dem Hintergrund
// „Dokument“; jede Änderung landet als Entwurf in diesem Browser (IndexedDB),
// „💾 Speichern“ schreibt die .zlm-Datei.

import { createZlm, readZlm, writeZlm, editorStateOf, layerOf, specForView, ZlmError } from '../zlm/zlm.js';
import { stampBlockIds } from '../doc/ids.js';
import { openInkEditor } from '../ink/ink-editor.js';
import { H5pRenderer } from '../modules/h5p-renderer.js';
import { sniff, importOdt, importPdfPages } from '../import/import.js';

const GENERATOR = 'lm-editor 0.1.0';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Entwürfe in diesem Browser ----------

const DB = 'lm-editor';
const DRAFTS = 'drafts';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DRAFTS, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function drafts(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFTS, mode);
    const req = fn(tx.objectStore(DRAFTS));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const listDrafts = () => drafts('readonly', (s) => s.getAll()).catch(() => []);
const deleteDraft = (id) => drafts('readwrite', (s) => s.delete(id)).catch(() => {});

async function saveDraft(session) {
  try {
    const bytes = writeZlm(session.doc, { generator: GENERATOR });
    await drafts('readwrite', (s) => s.put({ id: session.doc.manifest.id, title: session.doc.manifest.title, fileName: session.fileName, savedAt: Date.now(), bytes }));
    return true;
  } catch (_) { return false; }
}

// ---------- Dateien ----------

const ZLM_TYPES = [{ description: 'lm-editor-Dokument', accept: { 'application/zip': ['.zlm'] } }];
const OPEN_TYPES = [
  { description: 'lm-editor, Writer, PDF', accept: { 'application/zip': ['.zlm'], 'application/vnd.oasis.opendocument.text': ['.odt', '.ott'], 'application/pdf': ['.pdf'] } },
];
const fileNameOf = (title) => `${String(title || 'Dokument').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Dokument'}.zlm`;

/** Datei wählen – mit File System Access (Chrome/Edge) behält man den Ort zum Speichern. */
async function pickFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES });
      const file = await handle.getFile();
      return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle };
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zlm,.odt,.ott,.pdf,application/zip,application/vnd.oasis.opendocument.text,application/pdf';
    input.onchange = async () => {
      const file = input.files[0];
      resolve(file ? { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle: null } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** In die Datei schreiben (gewählter Ort) oder herunterladen. */
async function saveFile(session) {
  const bytes = writeZlm(session.doc, { generator: GENERATOR });
  const name = session.fileName || fileNameOf(session.doc.manifest.title);
  if (window.showSaveFilePicker) {
    try {
      if (!session.handle) session.handle = await window.showSaveFilePicker({ suggestedName: name, types: ZLM_TYPES });
      const w = await session.handle.createWritable();
      await w.write(bytes);
      await w.close();
      session.fileName = session.handle.name;
      toast(`💾 Gespeichert: ${session.fileName}`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      toast(`⚠️ Speichern nicht möglich: ${err.message}`, true);
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  session.fileName = name;
  toast(`⬇ Heruntergeladen: ${name}`);
}

function toast(text, error = false) {
  const el = document.createElement('div');
  el.className = `app-toast${error ? ' app-toast-error' : ''}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
  return el;
}

/** Hinweise nach dem Übernehmen – bleiben stehen, bis man sie wegklickt. */
function notice(title, lines) {
  if (!lines.length) return;
  document.querySelector('.app-notice')?.remove();
  const el = document.createElement('div');
  el.className = 'app-notice';
  el.setAttribute('role', 'status');
  el.innerHTML = `<strong>${esc(title)}</strong><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <button type="button" class="btn btn-secondary btn-sm">Verstanden</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

// ---------- Dokument öffnen ----------

async function openSession(doc, { fileName = null, handle = null } = {}) {
  // Feste IDs, damit die Striche auch nach Änderungen beim richtigen Baustein bleiben
  // (fehlende nach der Position, wie die Striche sie bisher kennen).
  stampBlockIds(doc.spec);
  const session = { doc, fileName, handle };
  const renderer = new H5pRenderer();
  const embedModule = (id) => doc.modules[id] || null;
  $('#start').hidden = true;
  await openInkEditor({
    title: doc.manifest.title,
    key: doc.manifest.id,
    solutions: true,
    paper: {
      landscape: doc.spec.orientation === 'landscape',
      mount(el, { solutions }) {
        el.appendChild(renderer.createTypePreview('document', { spec: specForView(doc), kind: doc.manifest.kind }, { blockIds: true, quizMode: true, embedModule }));
        if (solutions) el.querySelector('.docspec')?.classList.remove('ds-hide-solutions');
      },
    },
    store: {
      label: 'im Entwurf',
      load: async () => editorStateOf(doc.layers.teacher),
      async save(state) {
        doc.layers.teacher = layerOf(state);
        return saveDraft(session);
      },
    },
    actions: [{ label: '💾 Speichern', title: 'Als .zlm-Datei speichern', onClick: () => saveFile(session) }],
    onClose: () => showStart(),
  });
  await saveDraft(session);
}

/**
 * Datei öffnen: .zlm direkt, .odt und .pdf als neues Dokument. Übernommenes
 * wird als neue .zlm gespeichert – nie über das Original.
 */
async function openBytes(bytes, { fileName = '', handle = null } = {}) {
  const kind = sniff(bytes) || (/\.zlm$/i.test(fileName) ? 'zlm' : null);
  try {
    if (kind === 'zlm') { await openSession(readZlm(bytes), { fileName, handle }); return; }
    let result;
    if (kind === 'odt') result = importOdt(bytes, fileName);
    else if (kind === 'pdf') {
      const busy = toast('PDF wird übernommen …');
      try {
        result = await importPdfPages(bytes, fileName, { onProgress: (i, n) => { busy.textContent = `PDF wird übernommen: Seite ${i} von ${n} …`; } });
      } finally { busy.remove(); }
    } else throw new Error('Diese Datei kenne ich nicht – geöffnet werden .zlm, .odt und .pdf.');
    const name = `${(fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || result.doc.manifest.title)}.zlm`;
    await openSession(result.doc, { fileName: name });
    notice(`Übernommen aus ${fileName || 'der Datei'}`, result.warnings);
  } catch (err) {
    showStart();
    toast(err instanceof ZlmError ? `⚠️ ${err.message}` : `⚠️ Öffnen nicht möglich: ${err.message}`, true);
  }
}

async function openExample() {
  const ex = await (await fetch(new URL('../../examples/ohm.json', import.meta.url))).json();
  const doc = createZlm({ title: ex.title, kind: ex.kind });
  doc.spec = ex.spec;
  doc.modules = ex.modules;
  await openSession(doc);
}

function newKaroSheet() {
  const doc = createZlm({ title: 'Karoblatt' });
  doc.spec.content = [{ type: 'heading', level: 1, text: 'Karoblatt' }, { type: 'karo', lines: 50 }];
  return openSession(doc);
}

// ---------- Startseite ----------

async function showStart() {
  $('#start').hidden = false;
  const list = (await listDrafts()).sort((a, b) => b.savedAt - a.savedAt).slice(0, 12);
  const when = (t) => new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  $('#recent').innerHTML = list.length
    ? list.map((d) => `<li><button type="button" class="app-recent-open" data-id="${esc(d.id)}"><strong>${esc(d.title)}</strong>
        <span>${esc(d.fileName || 'noch nicht als Datei gespeichert')} · ${when(d.savedAt)}</span></button>
        <button type="button" class="app-recent-del" data-del="${esc(d.id)}" title="Entwurf löschen" aria-label="Entwurf löschen">✕</button></li>`).join('')
    : '<li class="app-empty">Noch nichts geöffnet.</li>';
}

$('#recent').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { await deleteDraft(del.dataset.del); showStart(); return; }
  const open = e.target.closest('[data-id]');
  if (!open) return;
  const d = (await listDrafts()).find((x) => x.id === open.dataset.id);
  if (d) await openBytes(d.bytes, { fileName: d.fileName });
});
$('#btnOpen').addEventListener('click', async () => {
  const f = await pickFile();
  // Den Ort zum Speichern merken – nur bei einer .zlm, nie bei .odt oder .pdf.
  if (f) await openBytes(f.bytes, { fileName: f.name, handle: sniff(f.bytes) === 'zlm' ? f.handle : null });
});
$('#btnExample').addEventListener('click', () => openExample());
$('#btnKaro').addEventListener('click', () => newKaroSheet());

// Datei auf die Seite ziehen.
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('app-drop'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('app-drop'); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('app-drop');
  const file = e.dataTransfer.files[0];
  if (file && !$('#start').hidden) await openBytes(new Uint8Array(await file.arrayBuffer()), { fileName: file.name });
});

showStart();
