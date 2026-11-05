import { mountTiptapSurface } from '../editor/pm-toolbar.js';
import { askTable, openBlockDialog } from '../editor/block-dialog.js';
import { openTableProps } from '../editor/table-props.js';
import { pmToMarkdown, markdownToPm } from '../doc/pm-markdown.js';
import { pmToSpec, specToPm } from '../doc/pm-convert.js';
import { stampBlockIds } from '../doc/ids.js';
import { loadEditorStyles } from '../app/editor-styles.js';

// ==================== TEXT IM STIFT-EDITOR BEARBEITEN ====================
//
// Dieselbe Tiptap-Fläche wie beim Dokument (app/text-editor.js) als eigene Seite über dem Blatt, für
// Textflächen und neue Textblöcke. Der Stand gilt erst mit „Fertig“. Quizze, Schreibfelder und Umbrüche
// gibt es hier nicht; Formeln und Bilder gehören nicht in eine Textfläche (`formula`: nur im Textblock).

const empty = (spec) => !JSON.stringify(spec?.content || []).match(/"(text|code|latex)":"[^"]*\S/)
  && !(spec?.content || []).some((b) => b && typeof b === 'object' && ['table', 'formula', 'box'].includes(b.type));

/** Ergebnis: die Spec – `null` bei „Abbrechen“. */
export function openRichEditor({ title = 'Text', spec, widthCm = 16.5, formula = false }) {
  loadEditorStyles();
  return new Promise((resolve) => {
    const page = document.createElement('div');
    page.className = 'ink-rich-editor';
    page.innerHTML = `
      <header class="ink-rich-head">
        <strong class="ink-rich-title"></strong>
        <div class="admin-tabs ink-rich-tabs" role="tablist">
          <button type="button" class="admin-tab active" data-mode="edit" role="tab">✏️ Bearbeiten</button>
          <button type="button" class="admin-tab" data-mode="markdown" role="tab">Ⓜ Markdown</button>
        </div>
        <span class="ink-rich-status" role="status"></span>
        <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
        <button type="button" class="btn btn-primary" data-done>✓ Fertig</button>
      </header>
      <div class="ds-pm-box ink-rich-box"></div>
      <textarea class="ink-rich-markdown" spellcheck="false" aria-label="Inhalt als Markdown" hidden></textarea>`;
    document.body.appendChild(page);
    page.querySelector('.ink-rich-title').textContent = title;
    const box = page.querySelector('.ink-rich-box');
    const markdown = page.querySelector('.ink-rich-markdown');
    const status = page.querySelector('.ink-rich-status');
    let current = spec && Array.isArray(spec.content) ? spec : { content: [] };
    let changed = false;

    const editBlock = (block, apply) => openBlockDialog(block, { apply, remove: () => apply(null) });
    const pm = mountTiptapSurface(box, {
      spec: current,
      hint: '',
      onChange: (next) => { current = next; changed = true; },
      editBlock,
      insertEntries: (surface) => [
        { label: '▤ Tabelle…', onClick: async () => { const block = await askTable(); if (block) surface.insertBlocks([block]); } },
        { label: '▢ Kasten', onClick: () => surface.insertBlocks([{ type: 'box', title: 'Merke', blocks: [{ type: 'text', text: '…' }] }]) },
        { label: '⌨ Code', onClick: () => surface.insertBlocks([{ type: 'code', code: '// Quelltext' }]) },
        ...(formula ? [{ label: '∑ Formel', onClick: () => surface.insertBlocks([{ type: 'formula', latex: 'U = R \\cdot I' }]) }] : []),
      ],
      fullWidthCm: () => widthCm,
      status: (text) => { status.textContent = text; },
      imageFromFile: async () => null,
      tableProps: (td) => openTableProps(td),
    });
    const surface = box.querySelector('.ds-pm-surface');
    surface.style.maxWidth = `${widthCm}cm`;
    surface.style.marginInline = 'auto';
    pm.focus?.();

    const fromMarkdown = () => {
      const warnings = [];
      current = { ...current, content: pmToSpec(markdownToPm(markdown.value, { warnings })).content };
      pm.setSpec(current);
      if (warnings.length) status.textContent = `⚠️ ${warnings.join(' · ')}`;
    };
    let mode = 'edit';
    page.querySelector('.ink-rich-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-mode]');
      if (!tab || tab.dataset.mode === mode) return;
      mode = tab.dataset.mode;
      page.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === tab));
      if (mode === 'markdown') markdown.value = pmToMarkdown(specToPm(current));
      else fromMarkdown();
      box.hidden = mode === 'markdown';
      markdown.hidden = mode !== 'markdown';
      if (mode === 'markdown') markdown.focus();
    });
    markdown.addEventListener('input', () => { changed = true; });

    const leave = (result) => {
      pm.destroy?.();
      page.remove();
      resolve(result);
    };
    page.querySelector('[data-cancel]').addEventListener('click', () => {
      if (!changed || window.confirm('Änderungen am Text verwerfen?')) leave(null);
    });
    page.querySelector('[data-done]').addEventListener('click', () => {
      if (mode === 'markdown') fromMarkdown();
      stampBlockIds(current);
      leave(empty(current) ? { content: [] } : current);
    });
  });
}
