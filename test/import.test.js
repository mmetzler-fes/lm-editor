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

test('.odt → HTML: Überschriften, Tabellen, Bild; Titel aus dem Dateinamen, ohne ihn aus den Metadaten', () => {
  const { title, html, stats, warnings } = odtToHtml(odt, 'erweitert.odt');
  assert.equal(title, 'erweitert');
  assert.equal(odtToHtml(odt, '').title, 'Erweiterte Blöcke');
  // Eine der vier Tabellen ist randlos mit Text neben dem Bild – die wird zu Spalten (wie auf dem Server).
  assert.deepEqual(stats, { headings: 2, paragraphs: 23, tables: 3, images: 1, drawings: 0, exported: 0 });
  assert.match(html, /<table class="ws-columns">/);
  // Nummerierte Gliederung (Druckvorlage von LearningModules): Abschnitt statt Überschrift –
  // der Listenkopf (text:is-list-header) bleibt eine Überschrift ohne Nummer.
  assert.match(html, /<h2 data-ds="section">Erster nummerierter Abschnitt/);
  assert.match(html, /<h2>Einleitung ohne Nummer/);
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

test('.odt: zugeschnittenes Bild (fo:clip) – nur der Ausschnitt, als SVG um das Bild', async () => {
  const { zipSync, strToU8 } = await import('../src/vendor/fflate/fflate.js');
  // PNG 200×100 px mit 96 dpi (ohne pHYs): 5,29 × 2,65 cm. Links 1,3229 cm = 50 px weg.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 200, 0, 0, 0, 100, 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const ns = 'xmlns:office="o" xmlns:draw="d" xmlns:text="t" xmlns:style="st" xmlns:svg="s" xmlns:fo="f" xmlns:xlink="x"';
  const bytes = zipSync({
    mimetype: strToU8('application/vnd.oasis.opendocument.text'),
    'Pictures/a.png': png,
    'content.xml': strToU8(`<office:document-content ${ns}><office:automatic-styles>`
      + '<style:style style:name="gr1" style:family="graphic"><style:graphic-properties fo:clip="rect(0cm, 0cm, 0cm, 1.3229cm)"/></style:style>'
      + '</office:automatic-styles><office:body><office:text><text:p>'
      + '<draw:frame draw:style-name="gr1" draw:name="Bild" text:anchor-type="as-char" svg:width="4cm" svg:height="2cm"><draw:image xlink:href="Pictures/a.png"/></draw:frame>'
      + '</text:p></office:text></office:body></office:document-content>'),
  }, { level: 0 });
  const { html } = odtToHtml(bytes, 'z.odt');
  const b64 = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)?.[1];
  assert.ok(b64, html.slice(0, 200));
  const svg = Buffer.from(b64, 'base64').toString('utf8');
  assert.match(svg, /viewBox="50 0 150 100"/);
  assert.match(svg, /<image width="200" height="100"/);
});
