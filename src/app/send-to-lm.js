// ==================== IN LEARNINGMODULES ÖFFNEN ====================
//
// Die .zlm geht direkt von Fenster zu Fenster (postMessage), nicht über einen Server des Editors: LearningModules
// öffnet sich mit ?zlm=empfang, meldet sich bereit und bekommt die Datei. Dort entscheidet die Lehrkraft, ob sie
// sie ablegt (views/zlm-receive.js). Der Editor braucht dafür keine Anmeldung und keine Freigabe des Servers.

import { loadEditorStyles } from './editor-styles.js';

const SERVER_KEY = 'lm_editor_server';
const WAIT_MS = 60_000;

/** Eingegebene Adresse → Origin (`https://lernen.schule.de`), sonst null. Ohne Angabe gilt https. */
export function serverOrigin(text) {
  const typed = String(text || '').trim();
  // Browser sind bei Leerzeichen im Namen des Servers großzügiger als der Standard.
  if (!typed || /\s/.test(typed)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch (_) {
    return null;
  }
}

const remembered = () => { try { return localStorage.getItem(SERVER_KEY); } catch (_) { return null; } };
const remember = (origin) => { try { if (origin) localStorage.setItem(SERVER_KEY, origin); else localStorage.removeItem(SERVER_KEY); } catch (_) { /* dann fragt er wieder */ } };

/** Läuft der Editor auf einem LearningModules-Server (/lm-editor/)? Dort liegt auch dessen App. */
async function sameServer() {
  try {
    const res = await fetch(`${location.origin}/js/docspec-editor.js`, { method: 'HEAD', cache: 'no-store' });
    return res.ok ? location.origin : null;
  } catch (_) {
    return null;
  }
}

function askServer(toast) {
  loadEditorStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay app-send-dialog';
    overlay.innerHTML = `<form class="import-modules-card ds-widget-dialog">
        <h3>📓 In LearningModules öffnen</h3>
        <p>Adresse deines LearningModules-Servers, also die Seite, auf der du dich sonst anmeldest:</p>
        <input type="text" name="server" required placeholder="https://lernen.meine-schule.de" autocomplete="url" spellcheck="false">
        <div class="confirm-actions">
          <button type="submit" class="btn btn-primary">Öffnen</button>
          <button type="button" class="btn btn-secondary" data-cancel>Abbrechen</button>
        </div></form>`;
    document.body.appendChild(overlay);
    const done = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    const form = overlay.querySelector('form');
    form.elements.server.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const origin = serverOrigin(form.elements.server.value);
      if (origin) done(origin); else toast('⚠️ Das ist keine gültige Adresse.', true);
    });
  });
}

/** Datei zu LearningModules schicken. `bytes`: die fertige .zlm. */
export async function sendToLearningModules({ bytes, fileName, toast }) {
  const saved = remembered();
  const server = saved || await sameServer() || await askServer(toast);
  if (!server) return;
  const win = window.open(`${server}/?zlm=empfang`, '_blank');
  if (!win) { toast('⚠️ Der Browser hat das Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.', true); return; }
  const timer = setTimeout(() => {
    window.removeEventListener('message', onReady);
    // Falsche Adresse? Beim nächsten Mal wieder fragen.
    remember(null);
    toast(`⚠️ Keine Antwort von ${server}. Stimmt die Adresse?`, true);
  }, WAIT_MS);
  function onReady(e) {
    if (e.source !== win || e.origin !== server || e.data?.type !== 'lm-zlm-ready') return;
    window.removeEventListener('message', onReady);
    clearTimeout(timer);
    remember(server);
    const copy = bytes.slice().buffer;
    win.postMessage({ type: 'lm-zlm', name: fileName, bytes: copy }, server, [copy]);
  }
  window.addEventListener('message', onReady);
}
