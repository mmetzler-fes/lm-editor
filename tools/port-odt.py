# .odt-Leser aus LearningModules übernehmen – nach jeder Änderung an
# src/core/interchange/odt/odt.ts dort:
#
#   tools/sync-odt.sh ../LearningModules
#
# Ersetzt adm-zip/path/Buffer durch fflate und kleine Helfer (für den Browser);
# tsc entfernt danach die Typen. Ergebnis: src/import/odt.js.
import sys,re
src, dst = sys.argv[1:3]
s=open(src).read()
def rep(old,new,cnt=1):
    global s
    n=s.count(old)
    assert n==cnt, (n, old[:70])
    s=s.replace(old,new)
rep("""import AdmZip from 'adm-zip';
import * as path from 'path';
""","""import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.js';

// Statt der Node-Module (adm-zip, path): fflate und kleine Helfer – so läuft
// der Leser im Browser wie unter Node.
const extname = (p: string) => /\\.[^./\\\\]*$/.exec(p)?.[0] ?? '';
const basename = (p: string, ext = '') => {
  const b = p.split(/[\\\\/]/).pop() ?? '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// Gegen ZIP-Bomben: höchstens so viel auspacken.
const MAX_ENTRIES = 5000;
const MAX_UNPACKED = 300 * 1024 * 1024;
""")
rep("""    return `<img src="data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}" alt="Zeichnung" width="${w}">`;""",
    """    return `<img src="data:image/svg+xml;base64,${b64(new TextEncoder().encode(svg))}" alt="Zeichnung" width="${w}">`;""")
rep("""export function odtToHtml(buffer: Buffer, fileName = ''): OdtResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('Die Datei ist kein gültiges OpenDocument (.odt).');
  }
  const read = (entry: string) => zip.getEntry(entry)?.getData().toString('utf8');""","""export function odtToHtml(buffer: Uint8Array, fileName = ''): OdtResult {
  let files: Record<string, Uint8Array>;
  try {
    let count = 0;
    let total = 0;
    files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), {
      filter(f: { name: string; originalSize: number }) {
        count++;
        total += f.originalSize;
        if (count > MAX_ENTRIES || total > MAX_UNPACKED) throw new Error('zu groß');
        return !f.name.endsWith('/');
      },
    });
  } catch {
    throw new Error('Die Datei ist kein gültiges OpenDocument (.odt).');
  }
  const zip = { getEntry: (name: string) => (files[name] ? { getData: () => files[name] } : null) };
  const read = (entry: string) => { const d = zip.getEntry(entry)?.getData(); return d ? strFromU8(d) : undefined; };""")
rep("path.extname(href)", "extname(href)", 2)
rep("""data:${type};base64,${data.toString('base64')}""", """data:${type};base64,${b64(data)}""", 2)
rep("""  const fromFile = path.basename(fileName || '', path.extname(fileName || '')).replace(/[_-]+/g, ' ').trim();""",
    """  const fromFile = basename(fileName || '', extname(fileName || '')).replace(/[_-]+/g, ' ').trim();""")
code='\n'.join(l for l in s.split('\n') if not l.strip().startswith('//'))
assert 'Buffer' not in code and 'AdmZip' not in code
open(dst,'w').write(s)
