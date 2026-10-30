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
  assert.deepEqual(stats, { headings: 2, paragraphs: 23, tables: 4, images: 1, drawings: 0, exported: 0 });
  assert.match(html, /<h2/);
  assert.match(html, /<img src="data:image\/png;base64,/);
  assert.deepEqual(warnings, []);
});

test('kaputte Datei: lesbare Meldung', () => {
  assert.throws(() => odtToHtml(new TextEncoder().encode('kein zip')), /kein gültiges OpenDocument/);
});

test('.odt: ausgeblendeter Text (Lösung im Arbeitsblatt) bleibt verborgen', () => {
  const { html } = odtToHtml(odt, 'erweitert.odt');
  // Die Lösung steht in einer eigenen Hülle – htmlToDocSpec macht daraus einen Lösungs-Baustein.
  assert.match(html, /<div data-solution="1"><p><strong>Lösung:<\/strong><\/p><p><strong>Lösung im Kasten<\/strong><\/p><\/div>/);
  assert.equal((html.match(/Lösung im Kasten/g) || []).length, 1);
});

test('Folien (.odp/.odg) erkennt und liest derselbe Leser', async () => {
  const { zipSync, strToU8 } = await import('../src/vendor/fflate/fflate.js');
  const ns = 'xmlns:office="o" xmlns:draw="d" xmlns:text="t" xmlns:presentation="p" xmlns:svg="s"';
  const bytes = zipSync({
    mimetype: strToU8('application/vnd.oasis.opendocument.graphics'),
    'content.xml': strToU8(`<office:document-content ${ns}><office:body><office:drawing><draw:page>`
      + '<draw:frame presentation:class="title" svg:x="1cm" svg:y="1cm" svg:width="10cm" svg:height="1cm"><draw:text-box><text:p>Skizze</text:p></draw:text-box></draw:frame>'
      + '</draw:page></office:drawing></office:body></office:document-content>'),
  }, { level: 0 });
  assert.equal(sniff(bytes), 'odt');
  const { html } = odtToHtml(bytes, 'Skizze.odg');
  assert.equal(html, '<h2>Skizze</h2>');
});
