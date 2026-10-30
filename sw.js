// Offline-Betrieb der installierten App: Online kommt immer der aktuelle
// Stand vom Server (und landet im Cache), ohne Netz der aus dem Cache. So
// braucht es keine Versionsnummer – ein Update ist da, sobald man online ist.
// Was nie geladen wurde (z. B. pdf.js vor dem ersten PDF), fehlt offline;
// darum holt `install` die Grundausstattung gleich mit.

const CACHE = 'lm-editor';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'icons/app-192.png',
  'src/app/app.js', 'src/app/app.css', 'src/css/modules.css', 'src/css/ink.css', 'src/css/paper.css',
  'src/vendor/pdfjs/pdf.min.mjs', 'src/vendor/pdfjs/pdf.worker.min.mjs', 'examples/ohm.json',
];

self.addEventListener('install', (e) => {
  // Einzeln, damit eine fehlende Datei nicht alles verhindert.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
