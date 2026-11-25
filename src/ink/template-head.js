// ==================== KOPFZEILE DER VORLAGE (VORSCHAU) ====================
//
// Der Renderer setzt ein Blatt ohne Inhalt mit der Vorlage eines Dokuments;
// von Seite 1 bleibt der Streifen bis zum Ende der Kopfzeile. Stift-Editor und
// Modul-Editor setzen ihn oben aufs Blatt – nur zur Ansicht.

let pdfjs = null;
async function pdfLib() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Streifen aus dem PDF (ArrayBuffer): { src, cm } – Höhe in cm ab der Blattkante. */
export async function headStripFromPdf(data) {
  const lib = await pdfLib();
  const pdf = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await pdf.getPage(1);
  const scale = 2;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  // Von oben: erste Zeile mit Inhalt, dann bis zur ersten Lücke von 1 cm (danach käme nur noch die Fußzeile).
  const pxPerCm = canvas.height / (vp.height / scale / 72 * 2.54);
  const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const inked = (y) => {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) return true;
    }
    return false;
  };
  let y = 0;
  while (y < canvas.height && !inked(y)) y++;
  let last = y;
  for (; y < canvas.height && y - last < pxPerCm; y++) if (inked(y)) last = y;
  if (last <= 0 || last >= canvas.height) throw new Error('Die Vorlage hat keine Kopfzeile.');
  const cut = Math.min(canvas.height, last + Math.round(pxPerCm * 0.3));
  const strip = document.createElement('canvas');
  strip.width = canvas.width;
  strip.height = cut;
  strip.getContext('2d').drawImage(canvas, 0, 0);
  return { src: strip.toDataURL('image/png'), cm: cut / pxPerCm };
}
