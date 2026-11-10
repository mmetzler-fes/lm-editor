// ==================== .odt LESEN (Browser) ====================
//
// Packt das .odt/.odp/.odg mit fflate aus und übergibt es an den gemeinsamen
// Kern src/import/odt-core.js – denselben, den LearningModules auf dem Server
// lädt. Hier steht nur das Auspacken; der Import selbst gehört in den Kern.

import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.js';
import { odtPackageToHtml, wrapLine, usableTitle } from './odt-core.js';

export { wrapLine, usableTitle };

// Gegen ZIP-Bomben: höchstens so viel auspacken.
const MAX_ENTRIES = 5000;
const MAX_UNPACKED = 300 * 1024 * 1024;

function b64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

/**
 * .odt (auch .odp/.odg) → { title, html, warnings, stats }.
 * opts.drawings: Name → { svg (Uint8Array) | svgBase64, widthMm }, opts.stored: Name → { url, source }.
 */
export function odtToHtml(buffer, fileName = '', opts = {}) {
    let files;
    try {
        let count = 0;
        let total = 0;
        files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), {
            filter(f) {
                count++;
                total += f.originalSize;
                if (count > MAX_ENTRIES || total > MAX_UNPACKED) throw new Error('zu groß');
                return !f.name.endsWith('/');
            },
        });
    } catch {
        throw new Error('Die Datei ist kein gültiges OpenDocument (.odt).');
    }
    const pkg = {
        text: (name) => (files[name] ? strFromU8(files[name]) : undefined),
        file: (name) => (files[name] ? { size: files[name].length, get base64() { return b64(files[name]); } } : undefined),
    };
    let drawings = opts.drawings;
    if (drawings) {
        drawings = new Map([...drawings].map(([k, d]) => [k, { widthMm: d.widthMm, svgBase64: d.svgBase64 ?? b64(d.svg) }]));
    }
    return odtPackageToHtml(pkg, fileName, { ...opts, drawings });
}
