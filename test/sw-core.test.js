import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const core = sw.slice(sw.indexOf('const CORE = ['), sw.indexOf('];', sw.indexOf('const CORE = [')));

function importsOf(entry, seen = new Set()) {
  const file = resolve(root, entry);
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  if (!/\.m?js$/.test(file)) return seen;
  for (const m of readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) importsOf(join(dirname(file), m[1]), seen);
  return seen;
}

test('Offline: Text bearbeiten ist mit allen Dateien im Service Worker', () => {
  const files = new Set([...importsOf('src/app/text-editor.js'), ...importsOf('src/app/send-to-lm.js'), resolve(root, 'src/css/text-editor.css')]);
  assert.ok(files.size > 10);
  for (const f of files) assert.ok(core.includes(`'${relative(root, f)}'`), `fehlt in sw.js: ${relative(root, f)}`);
});
