import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from '../src/vendor/markdown-it/markdown-it.mjs';
import { lenientStrong } from '../src/doc/md-lenient.js';

test('Markdown: **Titel:**Text aus KI-Chats wird fett, einzelne * bleiben streng', () => {
  const md = new MarkdownIt();
  lenientStrong(md);
  assert.equal(md.renderInline('**1.Lehrer-Pi feste IP geben:**Netzwerk-Einstellungen.'), '<strong>1.Lehrer-Pi feste IP geben:</strong>Netzwerk-Einstellungen.');
  assert.equal(md.renderInline('**Hinweis:**Wichtig und **noch:**mehr'), '<strong>Hinweis:</strong>Wichtig und <strong>noch:</strong>mehr');
  assert.equal(md.renderInline('unter **Einstellungen > System** die'), 'unter <strong>Einstellungen &gt; System</strong> die');
  assert.equal(md.renderInline('a**b ohne Partner'), 'a**b ohne Partner');
  assert.equal(md.renderInline('*Verification:*Der'), '*Verification:*Der');
});
