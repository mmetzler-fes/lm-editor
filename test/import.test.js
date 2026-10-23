import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sniff } from '../src/import/import.js';
import { odtToHtml } from '../src/import/odt.js';
import { createZlm, writeZlm } from '../src/zlm/zlm.js';

// Vom worksheet-renderer aus seiner Test-Spec (tests/erweitert.yaml) erzeugt.
const odt = new Uint8Array(readFileSync(new URL('./fixtures/erweitert.odt', import.meta.url)));

test('Art der Datei am Inhalt', () => {
  assert.equal(sniff(odt), 'odt');
  assert.equal(sniff(writeZlm(createZlm())), 'zlm');
  assert.equal(sniff(new TextEncoder().encode('%PDF-1.7\n…')), 'pdf');
  assert.equal(sniff(new TextEncoder().encode('Hallo')), null);
});

test('.odt → HTML: Überschriften, Tabellen, Bild, Titel aus den Metadaten', () => {
  const { title, html, stats, warnings } = odtToHtml(odt, 'erweitert.odt');
  assert.equal(title, 'Erweiterte Blöcke');
  assert.deepEqual(stats, { headings: 2, paragraphs: 23, tables: 4, images: 1, drawings: 0 });
  assert.match(html, /<h2/);
  assert.match(html, /<img src="data:image\/png;base64,/);
  assert.deepEqual(warnings, []);
});

test('kaputte Datei: lesbare Meldung', () => {
  assert.throws(() => odtToHtml(new TextEncoder().encode('kein zip')), /kein gültiges OpenDocument/);
});
