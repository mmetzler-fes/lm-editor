// Bild zuschneiden: Rahmen über dem Bild ziehen (Ecken, Kanten, ganze Auswahl verschieben),
// OK schneidet im Browser (Canvas) und liefert ein neues Bild. Das Original bleibt unberührt.

const MIN = 0.02; // kleinste Auswahl: 2 % der Bildseite

/** Bild laden (auch SVG, auch über /api/… derselben Seite). */
function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = /^https?:/.test(src) && !src.startsWith(location.origin) ? 'anonymous' : null;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild ließ sich nicht laden.'));
    img.src = src;
  });
}

/**
 * Ausschnitt als data:-URL. `rect` in Anteilen (0…1) des Bilds. SVG (auch zugeschnittene
 * Scans aus dem Import) wird höher aufgelöst gezeichnet, damit nichts unscharf wird.
 */
export async function cropImage(src, rect) {
  const img = await load(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Das Bild hat keine Größe.');
  const svg = /^data:image\/svg|\.svg(\?|$)/i.test(src);
  const cw = rect.w * w;
  const ch = rect.h * h;
  const scale = svg ? Math.max(1, Math.min(4, 2000 / Math.max(cw, ch))) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const ctx = canvas.getContext('2d');
  const jpeg = /^data:image\/jpeg|\.jpe?g(\?|$)/i.test(src);
  if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, rect.x * w, rect.y * h, cw, ch, 0, 0, canvas.width, canvas.height);
  try {
    return jpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  } catch (_) {
    throw new Error('Dieses Bild kommt von einer anderen Seite und lässt sich nicht zuschneiden – bitte erst hochladen.');
  }
}

/** data:-URL → Datei (für die Bildablage der App). */
export function dataUrlFile(dataUrl, name = 'zugeschnitten') {
  const [head, b64] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], `${name}.${type === 'image/jpeg' ? 'jpg' : 'png'}`, { type });
}

/**
 * Dialog: Auswahlrahmen über dem Bild. Liefert { src, fraction } (fraction = Anteil der
 * Breite, der bleibt – für die neue Breite in cm) oder null bei Abbrechen.
 */
export function openCropDialog(src) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="import-modules-card ds-crop-dialog" role="dialog" aria-modal="true">
        <h3>✂ Bild zuschneiden</h3>
        <p class="hint">Ecken und Kanten ziehen; die Auswahl selbst lässt sich verschieben.</p>
        <div class="ds-crop-stage"><img alt="" draggable="false"><div class="ds-crop-sel">
          ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((d) => `<span class="ds-crop-h ds-crop-${d}" data-d="${d}"></span>`).join('')}
        </div></div>
        <p class="hint ds-crop-size"></p>
        <p class="hint ds-para-error" hidden></p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary" data-a="reset">Alles</button>
          <button type="button" class="btn btn-secondary" data-a="cancel">Abbrechen</button>
          <button type="button" class="btn btn-primary" data-a="ok">Zuschneiden</button>
        </div></div>`;
    document.body.appendChild(overlay);
    const img = overlay.querySelector('img');
    const stage = overlay.querySelector('.ds-crop-stage');
    const sel = overlay.querySelector('.ds-crop-sel');
    const info = overlay.querySelector('.ds-crop-size');
    const error = overlay.querySelector('.ds-para-error');
    let r = { x: 0, y: 0, w: 1, h: 1 };
    const paint = () => {
      Object.assign(sel.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      info.textContent = nw ? `${Math.round(r.w * nw)} × ${Math.round(r.h * nh)} Pixel (${Math.round(r.w * 100)} % × ${Math.round(r.h * 100)} %)` : '';
    };
    img.onload = paint;
    img.src = src;
    paint();
    const done = (value) => { overlay.remove(); resolve(value); };

    stage.addEventListener('pointerdown', (e) => {
      const d = e.target.dataset?.d || (e.target === sel ? 'move' : null);
      if (!d) return;
      e.preventDefault();
      const box = img.getBoundingClientRect();
      const start = { ...r };
      const x0 = e.clientX;
      const y0 = e.clientY;
      e.target.setPointerCapture(e.pointerId);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const move = (ev) => {
        const dx = (ev.clientX - x0) / box.width;
        const dy = (ev.clientY - y0) / box.height;
        let { x, y, w, h } = start;
        if (d === 'move') {
          x = clamp(x + dx, 0, 1 - w);
          y = clamp(y + dy, 0, 1 - h);
        } else {
          if (d.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
          if (d.includes('e')) w = clamp(w + dx, MIN, 1 - x);
          if (d.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
          if (d.includes('s')) h = clamp(h + dy, MIN, 1 - y);
        }
        r = { x, y, w, h };
        paint();
      };
      const up = () => {
        e.target.removeEventListener('pointermove', move);
        e.target.removeEventListener('pointerup', up);
        e.target.removeEventListener('pointercancel', up);
      };
      e.target.addEventListener('pointermove', move);
      e.target.addEventListener('pointerup', up);
      e.target.addEventListener('pointercancel', up);
    });

    overlay.addEventListener('click', async (e) => {
      const what = e.target.dataset?.a;
      if (what === 'cancel') done(null);
      else if (what === 'reset') { r = { x: 0, y: 0, w: 1, h: 1 }; paint(); }
      else if (what === 'ok') {
        if (r.w > 0.995 && r.h > 0.995) { done(null); return; }
        try {
          done({ src: await cropImage(src, r), fraction: r.w });
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        }
      }
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
  });
}
