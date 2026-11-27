// ==================== LABORE: IM BROWSER ====================
//
// Baustein { type: 'lab', lab: 'zeiger', preset } – docspec.js zeigt das Bild (lab-core.js), hier wird
// daraus das bedienbare Labor. Schnittstelle für weitere Labore (auch von außen, docs/LABS.md):
//
//   registerLab(name, () => import('./mein-labor.js'))
//   Modul: export function mount(el, { state, mode, onChange }) → { getState(), setState(s), destroy?() }
//     state  – wirksamer Stand (Vorgabe + Schülerstand, labMerge)
//     mode   – 'teacher' (Vorgabe bearbeiten, 🔒 festlegen) oder 'student'
//     onChange(state) – nach jeder Änderung; gespeichert wird hier (Gerät) bzw. im Stift-Editor (forms)
//
// Gespeichert wird der Stand je Gerät (localStorage) – im Stift-Editor zusätzlich mit der Beschriftung
// (form-state.js im Gastgeber holt ihn über el._lab.getState()).

import { LABS, labMerge, labPasted, labSvg } from './lab-core.js';

const LOADERS = {
  zeiger: () => import('./zeiger-ui.js'),
  bode: () => import('./curves-ui.js').then((m) => ({ mount: m.mountBode })),
  ortskurve: () => import('./curves-ui.js').then((m) => ({ mount: m.mountOrtskurve })),
  logik: () => import('./logik-ui.js'),
  sps: () => import('./sps-ui.js'),
};

/** Weiteres Labor anmelden (Name, Lader des Moduls mit mount()). */
export function registerLab(name, loader) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name) || typeof loader !== 'function') throw new Error('registerLab(name, loader)');
  LOADERS[name] = loader;
}
export function labInfo(name) {
  return LABS.find((l) => l.name === name) || { name, label: name, icon: '🧪' };
}

const STORE = 'lm_lab:';
const hash = (v) => {
  const s = JSON.stringify(v ?? null);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
};
function load(key) {
  try { return JSON.parse(localStorage.getItem(STORE + key) || 'null'); } catch (_) { return null; }
}
function save(key, record) {
  try { localStorage.setItem(STORE + key, JSON.stringify(record)); } catch (_) { /* voll oder gesperrt */ }
}
function forget(key) {
  try { localStorage.removeItem(STORE + key); } catch (_) { /* egal */ }
}

/** Kleiner Element-Baukasten für die Labor-Oberflächen. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

/** Punkt im SVG (viewBox-Einheiten, hier cm) unter dem Zeiger. */
export function svgPoint(svg, e) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return [vb.x + ((e.clientX - r.left) / r.width) * vb.width, vb.y + ((e.clientY - r.top) / r.height) * vb.height];
}

/** Eingabefeld, das erst beim Verlassen/Enter übernimmt (Tippen zerreißt nichts). */
export function field(value, onCommit, attrs = {}) {
  const el = h('input', { type: 'text', value: value ?? '', spellcheck: false, autocomplete: 'off', ...attrs });
  const commit = () => { if (el.value !== el.dataset.was) { el.dataset.was = el.value; onCommit(el.value, el); } };
  el.dataset.was = el.value;
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } e.stopPropagation(); });
  return el;
}

/** SVG-Text → PNG-Datei (für 📋 und ➕ Aufs Blatt). */
export async function svgToPng(svg, scale = 2.5) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const pxPerCm = 37.8 * scale;
  const w = Math.round((m ? Number(m[1]) : 16) * pxPerCm);
  const hgt = Math.round((m ? Number(m[2]) : 10) * pxPerCm);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/width="[\d.]+cm" height="[\d.]+cm"/, `width="${w}" height="${hgt}"`))}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, hgt);
  g.drawImage(img, 0, 0, w, hgt);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild ließ sich nicht umwandeln.'))), 'image/png'));
}

async function copyPng(svg, say, name) {
  const blob = svgToPng(svg);
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('📋 Kopiert – im Blatt mit „Einfügen“ (Strg+V) einsetzen.');
      return;
    } catch (_) { /* weiter: speichern */ }
  }
  const url = URL.createObjectURL(await blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.png` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  say('⬇ Kopieren geht hier nicht – das Bild wurde gespeichert.');
}

// ---------- Laborstand kopieren und einfügen (auch in ein anderes Arbeitsblatt) ----------
// Gemerkt auf dem Gerät (localStorage) und, wo es geht, als Text in der Zwischenablage – so kommt
// eine Lösung auch auf ein anderes Gerät. Eingefügt wird nur in ein Labor derselben Art.
const CLIP = 'lm_lab_clip';
const CLIP_MARK = 'lm-lab-state';

async function copyState(lab, state, say) {
  const rec = { [CLIP_MARK]: 1, lab, state, at: Date.now() };
  try { localStorage.setItem(CLIP, JSON.stringify(rec)); } catch (_) { /* nur Zwischenablage */ }
  try { await navigator.clipboard?.writeText(JSON.stringify(rec)); } catch (_) { /* nur auf dem Gerät */ }
  say('⧉ Kopiert – in einem anderen Labor dieser Art mit „📥 Einfügen“ übernehmen.');
}

async function pastedState(lab) {
  const parse = (txt) => {
    try {
      const r = JSON.parse(txt);
      return r && r[CLIP_MARK] && r.lab && r.state && typeof r.state === 'object' ? r : null;
    } catch (_) { return null; }
  };
  let rec = null;
  try { rec = parse(await navigator.clipboard?.readText?.()); } catch (_) { /* nicht erlaubt */ }
  if (!rec) { try { rec = parse(localStorage.getItem(CLIP)); } catch (_) { /* nichts */ } }
  if (!rec) return { error: 'Nichts kopiert – erst in einem Labor „⧉ Kopieren“ wählen.' };
  if (rec.lab !== lab) return { error: `Kopiert ist ein ${labInfo(rec.lab).label} – hier geht nur ${labInfo(lab).label}.` };
  return { state: rec.state };
}

/** Knöpfe ⧉ Kopieren / 📥 Einfügen; `get()` liefert den Stand, `set(state)` übernimmt ihn. */
function clipButtons(lab, get, set, say) {
  return [
    h('button', { type: 'button', class: 'lab-btn', title: 'Den ganzen Stand kopieren (z. B. eine Lösung), um ihn in ein anderes Arbeitsblatt einzufügen', onclick: () => copyState(lab, get(), say) }, '⧉ Kopieren'),
    h('button', { type: 'button', class: 'lab-btn', title: 'Einen kopierten Stand hier einsetzen (ersetzt den jetzigen)', onclick: async () => {
      const res = await pastedState(lab);
      if (res.error) { say(res.error); return; }
      if (!confirm('Den jetzigen Stand dieses Labors durch den kopierten ersetzen?')) return;
      set(res.state);
      say('📥 Eingefügt');
    } }, '📥 Einfügen'),
  ];
}

/**
 * Ein Labor in `host` aufbauen. `block`: { lab, preset }; `saved`: Schülerstand oder null.
 * Liefert { getState, setState, destroy } – oder null, wenn es das Labor nicht gibt.
 */
export async function mountLab(host, block, { mode = 'student', saved = null, onChange = () => {}, tools = true } = {}) {
  const loader = LOADERS[block?.lab];
  if (!loader) {
    host.replaceChildren(h('p', { class: 'lab-msg', text: `Labor „${block?.lab}“ gibt es hier nicht.` }));
    return null;
  }
  const mod = await loader();
  const info = labInfo(block.lab);
  host.classList.add('lab-live', `lab-${block.lab}`);
  host.replaceChildren();
  const status = h('span', { class: 'lab-status', role: 'status' });
  const say = (t) => {
    status.textContent = t;
    clearTimeout(say.timer);
    say.timer = setTimeout(() => { if (status.textContent === t) status.textContent = ''; }, 5000);
  };
  const body = h('div', { class: 'lab-body' });
  let api = null;
  const current = () => api?.getState() ?? labMerge(block.lab, block.preset, saved);
  if (tools) {
    const sheet = () => host.closest('[data-ink-figures]');
    const bar = h('div', { class: 'lab-bar' },
      h('span', { class: 'lab-title', text: `${info.icon} ${info.label}` }),
      mode === 'student' ? h('button', { type: 'button', class: 'lab-btn', title: 'Alles Eigene löschen und mit der Vorgabe neu beginnen', onclick: () => {
        if (!confirm('Eigene Änderungen in diesem Labor verwerfen und mit der Vorgabe neu beginnen?')) return;
        api.setState(labMerge(block.lab, block.preset, null));
        onChange(null);
        say('↺ Zurückgesetzt');
      } }, '↺ Neu') : null,
      ...clipButtons(block.lab, current, (st) => { api.setState(labPasted(block.lab, block.preset, st, mode === 'teacher')); onChange(api.getState()); }, say),
      h('button', { type: 'button', class: 'lab-btn', title: 'Bild kopieren (zum Einfügen in andere Programme)', onclick: () => copyPng(labSvg({ lab: block.lab, preset: current() }), say, info.label) }, '📋 Bild'),
      h('button', { type: 'button', class: 'lab-btn lab-to-sheet', title: 'Das Bild als freies Bild aufs Blatt legen (zum Beschriften)', hidden: true, onclick: async () => {
        const blob = await svgToPng(labSvg({ lab: block.lab, preset: current() }));
        const file = new File([blob], `${info.label}.png`, { type: 'image/png' });
        const taken = !host.dispatchEvent(new CustomEvent('lm-figure-to-sheet', { bubbles: true, cancelable: true, detail: { file } }));
        if (!taken) say('Aufs Blatt geht hier nicht – „📋 Bild“ kopieren und einfügen.');
      } }, '➕ Aufs Blatt'),
      status);
    host.append(bar);
    // ➕ nur im Stift-Editor (sein Blatt trägt data-ink-figures) – das Blatt entsteht erst nach dem Einhängen.
    requestAnimationFrame(() => { bar.querySelector('.lab-to-sheet').hidden = !sheet(); });
  }
  host.append(body);
  api = mod.mount(body, { state: labMerge(block.lab, block.preset, saved), mode, onChange, say });
  return api;
}

/**
 * Alle Labore in `root` beleben (Durchlauf, Vorschau, Notizbuch, Stift-Editor). `moduleId` trennt
 * die gemerkten Stände je Dokument; das Labor merkt sich seinen Baustein über die Block-ID.
 */
export function mountLabs(root, { moduleId = '', mode = 'student' } = {}) {
  root?.querySelectorAll('.ds-lab[data-block]:not(.lab-live)').forEach((el, i) => {
    let block;
    try { block = JSON.parse(decodeURIComponent(el.dataset.block)); } catch (_) { return; }
    const key = `${moduleId || 'doc'}:${el.closest('[data-bid]')?.dataset.bid || `n${i}`}`;
    el.dataset.labKey = key;
    const presetHash = hash(block.preset);
    // Vorgabe einstellen (Lehrkraft): Es gilt der Stand im Baustein, nichts wird auf dem Gerät gemerkt.
    const teacher = mode === 'teacher';
    const rec = teacher ? null : load(key);
    const saved = rec?.state ?? null;
    let timer = null;
    const persist = (state) => {
      if (teacher) return;
      clearTimeout(timer);
      if (state === null) { forget(key); return; }
      timer = setTimeout(() => save(key, { state, presetHash, at: Date.now() }), 400);
    };
    el.classList.add('lab-live');
    void mountLab(el, block, { mode, saved, onChange: (s) => { persist(s); el.dispatchEvent(new CustomEvent('lm-lab-change', { bubbles: true })); } })
      .then((api) => {
        if (!api) return;
        el._lab = {
          getState: () => api.getState(),
          setState: (s) => { api.setState(labMerge(block.lab, block.preset, s)); persist(s); },
        };
        // Stand, der vor dem Aufbau kam (Stift-Editor setzt gespeicherte Eingaben sofort).
        if (el._labPending !== undefined) { el._lab.setState(el._labPending); delete el._labPending; }
      })
      .catch((err) => el.replaceChildren(h('p', { class: 'lab-msg', text: `⚠️ Labor: ${err?.message || err}` })));
  });
}

/**
 * Vorgabe bearbeiten (Lehrkraft, Doppelklick im Editor): Labor im Dialog, „Übernehmen“ liefert den neuen
 * Baustein, „Abbrechen“ null. `extras`: weitere Knöpfe links [{ label, action, title, danger }] – sie
 * liefern { action, block } (block mit dem Stand im Dialog), z. B. „Entfernen“ oder „Als YAML“.
 */
export function openLabDialog(block, { extras = [] } = {}) {
  return new Promise((resolve) => {
    const info = labInfo(block.lab);
    const box = h('div', { class: 'lab-dialog' });
    const overlay = h('div', { class: 'lab-overlay', role: 'dialog', 'aria-modal': 'true' }, box);
    let api = null;
    const close = (result) => {
      api?.destroy?.();
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea, select')) { e.preventDefault(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    const host = h('div', { class: 'ds-lab' });
    const status = h('span', { class: 'lab-status', role: 'status' });
    const say = (t) => { status.textContent = t; };
    box.append(
      h('div', { class: 'lab-dialog-head' },
        h('strong', { text: `${info.icon} ${info.label} – Vorgabe` }),
        h('span', { class: 'lab-row' }, ...clipButtons(block.lab, () => (api ? api.getState() : labMerge(block.lab, block.preset, null)), (st) => api?.setState(labPasted(block.lab, block.preset, st, true)), say), status),
        h('span', { class: 'lab-hint', text: 'So sehen die Schüler das Labor zu Beginn. Mit 🔒 legst du einzelne Teile fest – Schüler können sie dann nicht ändern.' })),
      host,
      h('div', { class: 'lab-dialog-foot' },
        ...extras.map((x) => h('button', { type: 'button', class: `lab-btn${x.danger ? ' lab-btn-danger' : ''}`, title: x.title, onclick: () => close({ action: x.action, block: { ...block, preset: api ? api.getState() : block.preset } }) }, x.label)),
        h('span', { class: 'lab-dialog-gap' }),
        h('button', { type: 'button', class: 'lab-btn', onclick: () => close(null) }, 'Abbrechen'),
        h('button', { type: 'button', class: 'lab-btn lab-btn-primary', onclick: () => close({ ...block, preset: api ? api.getState() : block.preset }) }, 'Übernehmen')));
    document.body.append(overlay);
    void mountLab(host, block, { mode: 'teacher', saved: null, tools: false }).then((a) => { api = a; });
  });
}
