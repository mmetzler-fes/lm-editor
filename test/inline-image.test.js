import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richText, inlineImageText } from '../src/doc/docspec.js';
import { specToPm, pmToSpec } from '../src/doc/pm-convert.js';
import { pmToMarkdown, markdownToPm } from '../src/doc/pm-markdown.js';

const TEXT = 'S1 ![Schließer](https://x.de/a.png){width=1.2cm} := **A ![](data:image/png;base64,AB++CD=)**';

test('Bild im Text: Anzeige als Zeichen, kein Link', () => {
  const html = richText(TEXT);
  assert.match(html, /<img class="ds-inline-img" src="https:\/\/x\.de\/a\.png" alt="Schließer" style="width:1\.2cm">/);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(richText('\\![kein](https://x.de/b.png)'), /ds-inline-img"[^>]*alt="kein"[^>]*>\)/);
  assert.equal(richText('![x](javascript:alert(1))').includes('<img'), false);
});

test('Bild im Text: Editor und Markdown hin und zurück', () => {
  const spec = { content: [{ type: 'text', id: 'a', text: TEXT }] };
  assert.equal(pmToSpec(specToPm(spec)).content[0].text, TEXT);
  const md = pmToMarkdown(specToPm(spec), { ids: false });
  assert.match(md, /\{\.inline width=1\.2cm\}/);
  assert.equal(pmToSpec(markdownToPm(md)).content[0].text, TEXT);
});

test('inlineImageText: Bildtext ohne Klammern, nur gültige Breiten', () => {
  assert.equal(inlineImageText({ src: 'https://x.de/a.png', alt: 'a]b', width: 'calc(1px)' }), '![a b](https://x.de/a.png)');
});
