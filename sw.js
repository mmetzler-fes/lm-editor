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
  'src/vendor/temml/temml.mjs', 'src/vendor/temml/temml.css', 'src/vendor/markdown-it/markdown-it.mjs',
  // Text bearbeiten und In LearningModules öffnen (test/sw-core.test.js prüft, dass nichts fehlt).
  'src/app/editor-styles.js',
  'src/app/send-to-lm.js',
  'src/app/text-editor.js',
  'src/doc/docspec-html.js',
  'src/doc/docspec.js',
  'src/doc/ids.js',
  'src/doc/image-group.js',
  'src/doc/mathml-latex.js',
  'src/doc/paste.js',
  'src/doc/pm-convert.js',
  'src/doc/pm-markdown.js',
  'src/doc/pm-schema.js',
  'src/doc/pm-tiptap.js',
  'src/doc/symbol-font.js',
  'src/editor/block-dialog.js',
  'src/editor/paragraph-dialog.js',
  'src/editor/pm-editor.js',
  'src/editor/pm-ids.js',
  'src/editor/pm-toolbar.js',
  'src/editor/table-props.js',
  'src/util/dom.js',
  'src/vendor/fflate/fflate.js',
  'src/vendor/tiptap/tiptap.mjs',
  'src/zlm/zlm.js',
  'src/css/text-editor.css',
  // Schrift des Blatts, sonst springen offline die Zeilen.
  'src/fonts/LiberationMono-Bold.woff2',
  'src/fonts/LiberationMono-Regular.woff2',
  'src/fonts/LiberationSans-Bold.woff2',
  'src/fonts/LiberationSans-BoldItalic.woff2',
  'src/fonts/LiberationSans-Italic.woff2',
  'src/fonts/LiberationSans-Regular.woff2',
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
