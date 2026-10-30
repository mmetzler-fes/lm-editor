import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderJob, widthInCm, safeInkSvg } from '../src/print/render-job.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

test('Druckauftrag: Bilder aus media/ als Dateien, Quiz als Kasten, Beschriftung als SVG', () => {
  const spec = {
    titel: 'Alt',
    content: [
      { type: 'text', text: 'Hallo', ink: { svg: '<svg><path d="M0 0L1 1"/></svg>', x: 72, y: 0, w: 72, h: 36 } },
      { type: 'image', src: 'media/bild-1.png', width: '300px', alt: 'Foto' },
      { type: 'image', src: 'https://example.org/x.png', alt: 'Netz' },
      { type: 'quiz', module: 'q1' },
      { type: 'columns', blocks: [{ type: 'column', blocks: [{ type: 'image', src: 'media/bild-1.png' }] }] },
    ],
  };
  const { job, warnings } = renderJob(spec, { title: 'Ohm', media: { 'bild-1.png': png }, modules: { q1: { title: 'Widerstand' } }, outputs: ['loesung_pdf'] });
  assert.equal(job.spec.titel, 'Ohm');
  assert.equal(job.spec.meta.TITEL, 'Ohm');
  assert.deepEqual(job.outputs, ['loesung_pdf']);
  const [text, img, net, quiz, cols] = job.spec.content;
  assert.deepEqual(text.ink, { file: 'stift/stift-1.svg', x: 2.54, y: 0, width: 2.54, height: 1.27 });
  assert.equal(img.file, 'bilder/bild-1.png');
  assert.equal(img.width, '7.94cm');
  assert.equal(img.src, undefined);
  assert.equal(job.files['bilder/bild-1.png'], 'iVBORw==');
  assert.deepEqual(net, { type: 'note', text: '[Netz]' });
  assert.equal(quiz.type, 'box');
  assert.equal(quiz.title, 'Quiz: Widerstand');
  assert.equal(cols.blocks[0].blocks[0].file, 'bilder/bild-2.png');
  assert.equal(warnings.length, 2);
});

test('Breiten und erlaubte Beschriftung', () => {
  assert.equal(widthInCm('50%'), '8.25cm');
  assert.equal(widthInCm('90mm'), '9.00cm');
  assert.equal(widthInCm('auto'), null);
  assert.equal(safeInkSvg('<svg><g><path d="M0 0"/></g></svg>'), true);
  assert.equal(safeInkSvg('<svg><image href="x"/></svg>'), false);
});
