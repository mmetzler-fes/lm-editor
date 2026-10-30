// Kleiner Webserver für lm-editor (ohne Abhängigkeiten).
//
//   npm start               → http://localhost:5180 (nur dieser Rechner)
//   npm start -- --lan      → auch im Netz, z. B. fürs iPad: http://<IP>:5180
//   PORT=5200 npm start     → anderer Port
//
// Mit RENDERER_URL (und RENDERER_TOKEN) leitet er /renderer/health, /render
// und /convert-odt an den worksheet-renderer weiter – Drucken mit Vorlage und
// Word/PowerPoint übernehmen (docker-compose.yaml). Das Token bleibt hier.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5180;
const lan = process.argv.includes('--lan');
const renderer = (process.env.RENDERER_URL || '').replace(/\/+$/, '');
const rendererToken = process.env.RENDERER_TOKEN || '';
const RENDERER_PATHS = { '/renderer/health': ['GET', '/health'], '/renderer/render': ['POST', '/render'], '/renderer/convert-odt': ['POST', '/convert-odt'] };
const MAX_BODY = 80 * 1024 * 1024;

/** Auftrag an den Renderer weiterreichen; seine Antwort (JSON) unverändert zurück. */
async function proxy(req, res, [method, target]) {
  if (!renderer) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Kein Renderer eingerichtet"}'); return; }
  if (req.method !== method) { res.writeHead(405); res.end(); return; }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end('{"error":"Datei zu groß"}'); return; }
    chunks.push(c);
  }
  try {
    const r = await fetch(renderer + target, {
      method,
      headers: { 'Content-Type': 'application/json', ...(rendererToken ? { Authorization: `Bearer ${rendererToken}` } : {}) },
      ...(method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      signal: AbortSignal.timeout(300_000),
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (_) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"error":"Der Renderer ist nicht erreichbar"}');
  }
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.zlm': 'application/zip',
  '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (RENDERER_PATHS[path]) { await proxy(req, res, RENDERER_PATHS[path]); return; }
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    // Nur Dateien im Projekt, keine versteckten (.git).
    if (!file.startsWith(root + sep) || file.split(sep).some((p) => p.startsWith('.'))) throw Object.assign(new Error(), { code: 'ENOENT' });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error(), { code: 'ENOENT' });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err.code === 'ENOENT' ? 'Nicht gefunden' : 'Fehler');
  }
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`lm-editor: http://localhost:${port}${renderer ? ` (Renderer: ${renderer})` : ''}`);
  if (lan) {
    for (const list of Object.values(networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`           http://${a.address}:${port}`);
    }
  }
});
