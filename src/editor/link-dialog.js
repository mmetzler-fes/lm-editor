// ==================== LINK (DIALOG) ====================
//
// Adresse und – wahlweise – der angezeigte Text. Ohne Text steht die Adresse
// selbst anklickbar im Dokument. Leere Adresse entfernt einen Link.

import { escapeAttr } from '../util/dom.js';
import { normalizeHref } from './pm-link.js';

/** Dialog öffnen; `onOk({ href, text })` mit bereinigter Adresse (leer = Link entfernen). */
export function openLinkDialog({ href = '', text = '', onOk, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<form class="import-modules-card ds-link-dialog" role="dialog" aria-modal="true">
      <h3>🔗 Link</h3>
      <label>Adresse (URL)<input type="text" name="href" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…" value="${escapeAttr(href)}"></label>
      <label>Angezeigter Text <span class="hint">(optional)</span><input type="text" name="text" autocomplete="off" placeholder="leer: die Adresse wird angezeigt" value="${escapeAttr(text)}"></label>
      <div class="confirm-actions">
        ${href ? '<button type="button" class="btn btn-secondary" data-remove>Link entfernen</button>' : ''}
        <button type="button" class="btn btn-secondary" data-x>Abbrechen</button>
        <button type="submit" class="btn btn-primary">OK</button>
      </div>
    </form>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  const close = () => { overlay.remove(); onClose?.(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  overlay.querySelector('[data-x]').addEventListener('click', close);
  overlay.querySelector('[data-remove]')?.addEventListener('click', () => { overlay.remove(); onOk({ href: '', text: '' }); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = { href: normalizeHref(form.elements.href.value), text: form.elements.text.value.trim() };
    overlay.remove();
    onOk(next);
  });
  const first = form.elements.href;
  first.focus();
  first.select();
}
