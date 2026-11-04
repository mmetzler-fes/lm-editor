// ==================== TEXT BEARBEITEN (LM-EDITOR) ====================
//
// Dieselbe Tiptap-Fläche wie in LearningModules (editor/pm-toolbar.js) als eigene Seite über dem
// Dokument. Der Stand wird erst mit „Fertig“ übernommen; Bilder liegen beim Bearbeiten als data:-Adresse
// in der Spec und kommen danach zurück nach media/ (specFromView).

import { specForView, specFromView } from '../zlm/zlm.js';
import { stampBlockIds } from '../doc/ids.js';
import { escapeAttr } from '../util/dom.js';
import { mountTiptapSurface, openImageDialog } from '../editor/pm-toolbar.js';
import { askTable, openBlockDialog } from '../editor/block-dialog.js';
import { loadEditorStyles } from './editor-styles.js';

const fileToDataUrl = (file) => new Promise((ok, no) => {
  const reader = new FileReader();
  reader.onload = () => ok(String(reader.result));
  reader.onerror = () => no(reader.error);
  reader.readAsDataURL(file);
});

const imageBlock = async (file) => ({ type: 'image', src: await fileToDataUrl(file), width: '12cm', alt: (file.name || '').replace(/\.[^.]+$/, '') });

const pickImage = () => new Promise((resolve) => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
  input.onchange = () => (input.files?.[0] ? imageBlock(input.files[0]).then(resolve, () => resolve(null)) : resolve(null));
  input.addEventListener('cancel', () => resolve(null));
  input.click();
});

/** `doc` bearbeiten. `onDone(changed)`: danach; bei `true` stehen Titel, Spec und Medien schon im Dokument. */
export function openTextEditor(doc, { onDone }) {
  loadEditorStyles();
  const page = document.createElement('div');
  page.className = 'app-text-editor';
  page.innerHTML = `
    <header class="app-text-head">
      <input type="text" class="app-text-title" aria-label="Titel" value="${escapeAttr(doc.manifest.title)}">
      <span class="app-text-status" role="status"></span>
      <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
      <button type="button" class="btn btn-primary" data-done>✓ Fertig</button>
    </header>
    <div class="ds-pm-box app-text-box"></div>`;
  document.body.appendChild(page);
  const status = page.querySelector('.app-text-status');
  const title = page.querySelector('.app-text-title');
  let spec = specForView(doc);
  let changed = false;

  const editBlock = (block, apply) => {
    if (block.type === 'image') openImageDialog(block, { apply, remove: () => apply(null), storeImage: async (file) => ({ src: await fileToDataUrl(file) }) });
    else openBlockDialog(block, { apply, remove: () => apply(null) });
  };
  const insertEntries = (pm) => {
    const put = (blocks) => pm.insertBlocks(blocks);
    const putAndEdit = (block) => {
      put([block]);
      const sel = pm.selectedBlock();
      if (sel) editBlock(sel.block, sel.apply);
    };
    return [
      ...Object.values(doc.modules).filter((m) => m?.id).map((m) => ({ label: `🧩 ${m.title || m.type}`, onClick: () => put([{ type: 'quiz', module: m.id, title: m.title || 'Quiz' }]) })),
      { label: '¶ Textabsatz', onClick: () => put([{ type: 'text', text: '' }]) },
      { label: '▦ Schreibfeld (Karo, Linien)', onClick: () => putAndEdit({ type: 'karo', lines: 4 }) },
      { label: '💡 Lösung', onClick: () => put([{ type: 'solution', blocks: [{ type: 'text', text: 'Musterlösung' }] }]) },
      { label: '∑ Formel', onClick: () => putAndEdit({ type: 'formula', latex: 'U = R \\cdot I' }) },
      { label: '⌨ Code', onClick: () => put([{ type: 'code', code: '// Quelltext' }]) },
      { label: '▤ Tabelle…', onClick: async () => { const block = await askTable(); if (block) put([block]); } },
      { label: '▢ Kasten', onClick: () => put([{ type: 'box', title: 'Merke', blocks: [{ type: 'text', text: '…' }] }]) },
      { label: '▥ Spalten (nebeneinander)', onClick: () => put([{ type: 'columns', blocks: [{ type: 'column', blocks: [{ type: 'text', text: 'links …' }] }, { type: 'column', blocks: [{ type: 'text', text: 'rechts …' }] }] }]) },
      { label: '◌ Platz (unsichtbar)', onClick: () => putAndEdit({ type: 'karo', lines: 2, pattern: 'frei' }) },
      { label: '⤓ Seitenumbruch', onClick: () => put([{ type: 'pagebreak' }]) },
      { label: '🖼 Bild…', onClick: () => pickImage().then((b) => { if (b) put([b]); }) },
    ];
  };

  const pm = mountTiptapSurface(page.querySelector('.app-text-box'), {
    spec,
    hint: '',
    onChange: (next) => { spec = next; changed = true; },
    editBlock,
    insertEntries,
    fullWidthCm: () => (doc.spec.orientation === 'landscape' ? 25.5 : 16.5),
    status: (text) => { status.textContent = text; },
    imageFromFile: imageBlock,
  });
  pm.focus?.();
  title.addEventListener('input', () => { changed = true; });

  const leave = (result) => {
    pm.destroy?.();
    page.remove();
    onDone(result);
  };
  page.querySelector('[data-cancel]').addEventListener('click', () => {
    if (!changed || window.confirm('Änderungen am Text verwerfen?')) leave(false);
  });
  page.querySelector('[data-done]').addEventListener('click', () => {
    if (!changed) { leave(false); return; }
    doc.spec = specFromView(doc, spec);
    // Feste IDs für neue Bausteine, damit Striche auch nach weiteren Änderungen am richtigen Baustein bleiben.
    stampBlockIds(doc.spec);
    doc.manifest.title = title.value.trim() || doc.manifest.title;
    leave(true);
  });
}
