import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, strToU8 } from '../src/vendor/fflate/fflate.js';
import { readXopp, layerFromXopp } from '../src/import/xopp.js';

const XOPP = `<?xml version="1.0" standalone="no"?>
<xournal creator="xournalpp 1.3.5" fileversion="4"><title>x</title>
<page width="595.27" height="841.89"><background type="pdf" domain="absolute" filename="/home/u/Blatt &amp; Co.pdf" pageno="1"/>
<layer><stroke tool="pen" color="#ff0000ff" width="2 1 2 3">100 200 110 210 120 220 130 230</stroke>
<stroke tool="highlighter" color="#ffff0080" width="8">50 600 150 600</stroke>
<stroke tool="eraser" color="#ffffffff" width="5">1 1 2 2</stroke>
<text font="Sans" size="12" x="300" y="500" color="#000000ff">U = R &#183; I</text>
<image left="1" top="1" right="2" bottom="2">iVBOR</image></layer></page>
<page width="595.27" height="841.89"><background type="solid" color="#ffffffff" style="graph"/><layer>
<stroke tool="pen" color="#000000ff" width="1.4">10 10 20 20</stroke></layer></page>
</xournal>`;

test('.xopp lesen: Striche mit Druck, Textmarker, Text, PDF-Name; Radierer und Bilder fallen weg', () => {
  const x = readXopp(gzipSync(strToU8(XOPP)));
  assert.equal(x.pdfName, 'Blatt & Co.pdf');
  assert.equal(x.pages.length, 2);
  const [p1, p2] = x.pages;
  assert.equal(p1.pdfPage, 0);
  assert.equal(p2.pdfPage, null);
  const [pen, marker, text] = p1.items;
  assert.equal(pen.tool, 'pen');
  assert.equal(pen.color, '#ff0000');
  assert.equal(pen.points.length, 4);
  assert.ok(pen.points[2][2] > pen.points[0][2], 'mehr Breite → mehr Druck');
  assert.equal(marker.tool, 'marker');
  assert.equal(text.type, 'text');
  assert.equal(text.text, 'U = R · I');
  assert.equal(new Set(p1.items.map((i) => i.group)).size, 1, 'eine Gruppe je Seite');
  assert.match(x.warnings[0], /1 Bild/);
});

test('Ebene: an den Baustein darüber auf derselben PDF-Seite, Rest frei', () => {
  const x = readXopp(strToU8(XOPP));
  const layer = layerFromXopp(x, [{ bid: 'a', page: 0, top: 50 }, { bid: 'b', page: 0, top: 400 }]);
  assert.equal(layer.blocks.a.items.length, 1); // Strich bei y 200 → unter a
  assert.equal(layer.blocks.a.items[0].points[0][1], 150);
  assert.equal(layer.blocks.b.items.length, 2); // Textmarker (600) und Text (500) → unter b
  assert.equal(layer.blocks._.items.length, 1); // Seite 2 ohne PDF: frei
});
