import { mountTiptapSurface } from '../editor/pm-toolbar.js';
import { askTable, openBlockDialog } from '../editor/block-dialog.js';
import { openTableProps } from '../editor/table-props.js';
import { pmToMarkdown, markdownToPm } from '../doc/pm-markdown.js';
import { pmToSpec, specToPm } from '../doc/pm-convert.js';
import { pasteAsMarkdown } from '../doc/paste.js';
import { stampBlockIds } from '../doc/ids.js';
import { loadEditorStyles } from '../app/editor-styles.js';

// ==================== TEXT IM STIFT-EDITOR BEARBEITEN ====================
//
// Dieselbe Tiptap-Fläche wie beim Dokument (editor/pm-toolbar.js), aber direkt auf dem Blatt: Die
// Schreibfläche kommt in `surfaceHost`, Formatleiste und ✓ Fertig in `barHost`. Der Stand gilt erst mit
// „Fertig“. Quizze, Schreibfelder und Umbrüche gibt es hier nicht; Formeln und Bilder gehören nicht in
// eine Textfläche (`formula`: nur im Baustein).

const empty = (spec) => !JSON.stringify(spec?.content || []).match(/"(text|code|latex)":"[^"]*\S/)
  && !(spec?.content || []).some((b) => b && typeof b === 'object' && ['table', 'formula', 'box'].includes(b.type));

/** Ergebnis: die Spec – `null` bei „Abbrechen“. */
export function openRichEditor({ title = 'Text', spec, widthCm = 16.5, formula = false, surfaceHost, barHost }) {
  loadEditorStyles();
  return new Promise((resolve) => {
    const bar = document.createElement('div');
    bar.className = 'ink-rich-editor';
    bar.innerHTML = `
      <div class="ink-rich-head">
        <strong class="ink-rich-title"></strong>
        <button type="button" class="btn btn-secondary btn-sm ink-rich-md-open" title="Inhalt als Markdown ansehen und ändern">Ⓜ Markdown</button>
        <span class="ink-rich-status" role="status"></span>
        <button type="button" class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button type="button" class="btn btn-primary btn-sm" data-done>✓ Fertig</button>
      </div>`;
    barHost.appendChild(bar);
    bar.querySelector('.ink-rich-title').textContent = title;
    const status = bar.querySelector('.ink-rich-status');
    let current = spec && Array.isArray(spec.content) ? spec : { content: [] };
    let changed = false;

    const editBlock = (block, apply) => openBlockDialog(block, { apply, remove: () => apply(null) });
    // Die Fläche baut Leiste und Schreibfläche zusammen auf; danach kommt jedes an seinen Platz.
    const box = document.createElement('div');
    box.className = 'ds-pm-box';
    surfaceHost.appendChild(box);
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
    bar.appendChild(box.querySelector('.ds-pm-toolbar'));
    box.querySelector('.hint')?.remove();
    // Schreibmarke ans Ende des vorhandenen Texts.
    const editable = box.querySelector('.ProseMirror');
    editable?.focus({ preventScroll: true }); // sonst schiebt Safari die ganze Seite samt Leiste nach oben
    if (editable) {
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Der Stift schreibt hier nicht: Die Handschrifterkennung des iPads (Scribble) hält ink-editor an
    // (holdStylus). Damit auch die Berührung nichts mehr auslöst, setzt er die Marke und markiert hier selbst.
    const caretAt = (x, y) => {
      const r = document.caretRangeFromPoint?.(x, y);
      return r && editable?.contains(r.startContainer) ? r : null;
    };
    // Nur wo der Stift angehalten wird (Safari kennt touchType): Sonst erledigt der Browser all das selbst.
    const held = typeof Touch !== 'undefined' && 'touchType' in Touch.prototype;
    const CONTROL = 'button, a, [role="button"], .ds-karo-grip';
    let penAnchor = null;
    let penMoved = false;
    let penTarget = null;
    surfaceHost.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'pen' || !held) return;
      penMoved = false;
      penAnchor = null;
      penTarget = e.target;
      // Knöpfe und Bausteine in der Fläche behalten die Auswahl: Eine neue Marke nähme ihnen ihre Knöpfe weg.
      if (e.target.closest?.(`${CONTROL}, .ds-widget`)) return;
      penAnchor = caretAt(e.clientX, e.clientY);
      if (!penAnchor) return;
      editable.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(penAnchor);
    });
    surfaceHost.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'pen' || !held || !penAnchor || !e.buttons) return;
      const r = caretAt(e.clientX, e.clientY);
      if (!r) return;
      penMoved = true;
      window.getSelection().setBaseAndExtent(penAnchor.startContainer, penAnchor.startOffset, r.startContainer, r.startOffset);
    });
    surfaceHost.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'pen' || !held) return;
      const target = penTarget;
      penAnchor = null;
      penTarget = null;
      if (penMoved || !target) return;
      // Der angehaltene Tipp löst weder Klick noch Maus-Ereignisse aus: Knöpfe und Bausteine bekommen sie hier.
      const control = target.closest?.(CONTROL);
      if (control && !control.classList.contains('ds-karo-grip')) { control.click(); return; }
      if (target.closest?.('.ds-widget')) {
        const at = { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY, button: 0 };
        for (const type of ['mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(type, at));
      }
    });

    // Die Formatleiste bleibt sichtbar, auch wenn Safari die Seite für die Bildschirmtastatur verschiebt.
    const keepBar = () => {
      bar.style.top = `${Math.max(52, window.visualViewport?.offsetTop ?? 0)}px`;
    };
    window.visualViewport?.addEventListener('scroll', keepBar);
    window.visualViewport?.addEventListener('resize', keepBar);

    // Die Schreibmarke bleibt sichtbar, auch über der Bildschirmtastatur des iPads.
    const keepCaret = () => {
      const scroller = surfaceHost.closest('.ink-scroll');
      const sel = window.getSelection();
      if (!scroller || !sel?.rangeCount || !box.contains(sel.anchorNode)) return;
      const rect = sel.getRangeAt(0).getClientRects()[0];
      if (!rect) return;
      const top = bar.getBoundingClientRect().bottom + 8;
      const vv = window.visualViewport;
      const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 16;
      if (rect.bottom > bottom) scroller.scrollBy(0, rect.bottom - bottom);
      else if (rect.top < top) scroller.scrollBy(0, rect.top - top);
    };
    document.addEventListener('selectionchange', keepCaret);
    window.visualViewport?.addEventListener('resize', keepCaret);

    const openMarkdown = () => {
      const panel = document.createElement('div');
      panel.className = 'confirm-overlay ink-rich-md';
      panel.innerHTML = `<div class="import-modules-card">
          <h3>Ⓜ Markdown</h3>
          <textarea class="ink-rich-markdown" spellcheck="false" aria-label="Inhalt als Markdown"></textarea>
          <div class="confirm-actions">
            <button type="button" class="btn btn-primary" data-md-ok>Übernehmen</button>
            <button type="button" class="btn btn-secondary" data-md-cancel>Abbrechen</button>
          </div>
        </div>`;
      document.body.appendChild(panel);
      const area = panel.querySelector('textarea');
      area.value = pmToMarkdown(specToPm(current));
      area.focus();
      area.addEventListener('paste', (e) => {
        const md = pasteAsMarkdown({ text: e.clipboardData?.getData('text/plain') || '', html: e.clipboardData?.getData('text/html') || '' });
        if (md === null) return;
        e.preventDefault();
        area.setRangeText(md, area.selectionStart, area.selectionEnd, 'end');
      });
      panel.querySelector('[data-md-cancel]').addEventListener('click', () => panel.remove());
      panel.querySelector('[data-md-ok]').addEventListener('click', () => {
        const warnings = [];
        current = { ...current, content: pmToSpec(markdownToPm(area.value, { warnings })).content };
        pm.setSpec(current);
        changed = true;
        status.textContent = warnings.length ? `⚠️ ${warnings.join(' · ')}` : '';
        panel.remove();
      });
    };
    bar.querySelector('.ink-rich-md-open').addEventListener('click', openMarkdown);

    const leave = (result) => {
      document.removeEventListener('selectionchange', keepCaret);
      window.visualViewport?.removeEventListener('resize', keepCaret);
      window.visualViewport?.removeEventListener('scroll', keepBar);
      window.visualViewport?.removeEventListener('resize', keepBar);
      pm.destroy?.();
      bar.remove();
      box.remove();
      resolve(result);
    };
    bar.querySelector('[data-cancel]').addEventListener('click', () => {
      if (!changed || window.confirm('Änderungen am Text verwerfen?')) leave(null);
    });
    bar.querySelector('[data-done]').addEventListener('click', () => {
      stampBlockIds(current);
      leave(empty(current) ? { content: [] } : current);
    });
  });
}
