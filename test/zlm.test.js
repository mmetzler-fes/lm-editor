import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from '../src/vendor/fflate/fflate.js';
import { createZlm, writeZlm, readZlm, ZlmError, ZLM_MIME, FORMAT_VERSION } from '../src/zlm/zlm.js';

const now = new Date('2026-10-23T10:00:00Z');

function sample() {
  const doc = createZlm({ title: 'Ohm', now });
  doc.spec.content.push({ id: 'b7k2m9qa', type: 'karo', lines: 6 }, { id: 'q2w3e4r5', type: 'quiz', module: 'k3f9a2x1' });
  doc.modules.k3f9a2x1 = { id: 'k3f9a2x1', type: 'trueFalse', title: 'Kurzquiz', content: { question: 'R = U/I?', correct: true } };
  doc.media['schaltung.png'] = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  doc.layers.teacher = { id: 'teacher', role: 'teacher', blocks: { b7k2m9qa: { items: [], karoLines: 10 } } };
  return doc;
}

test('schreiben und wieder lesen ergibt dasselbe Dokument', () => {
  const doc = sample();
  const back = readZlm(writeZlm(doc, { now }));
  assert.deepEqual(back.spec, doc.spec);
  assert.deepEqual(back.modules, doc.modules);
  assert.deepEqual(back.layers, doc.layers);
  assert.deepEqual([...back.media['schaltung.png']], [...doc.media['schaltung.png']]);
  assert.equal(back.manifest.title, 'Ohm');
  assert.equal(back.manifest.version, FORMAT_VERSION);
});

test('mimetype steht vorne und unkomprimiert', () => {
  const bytes = writeZlm(sample(), { now });
  // Lokaler Kopf: Signatur, Methode an Byte 8 (0 = gespeichert), Name ab Byte 30.
  assert.equal(bytes[8], 0);
  const nameLen = bytes[26];
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 30 + nameLen)), 'mimetype');
  assert.equal(new TextDecoder().decode(bytes.subarray(30 + nameLen, 30 + nameLen + ZLM_MIME.length)), ZLM_MIME);
});

test('kein ZIP und falscher mimetype werden abgelehnt', () => {
  assert.throws(() => readZlm(strToU8('Hallo')), ZlmError);
  const other = zipSync({ mimetype: strToU8('application/zip'), 'manifest.json': strToU8('{}') });
  assert.throws(() => readZlm(other), /mimetype/);
});

test('neuere Formatversion wird mit Hinweis abgelehnt', () => {
  const bytes = zipSync({
    mimetype: strToU8(ZLM_MIME),
    'manifest.json': strToU8(JSON.stringify({ format: 'zlm', version: FORMAT_VERSION + 1, kind: 'worksheet' })),
    'document.json': strToU8('{"spec":{"content":[]}}'),
  });
  assert.throws(() => readZlm(bytes), /aktualisieren/);
});

test('Pfade mit .. werden abgelehnt', () => {
  const bytes = zipSync({
    mimetype: strToU8(ZLM_MIME),
    'manifest.json': strToU8(JSON.stringify({ format: 'zlm', version: 1, kind: 'worksheet' })),
    'document.json': strToU8('{"spec":{"content":[]}}'),
    'media/../../boese.sh': strToU8('rm -rf /'),
  });
  assert.throws(() => readZlm(bytes), /Unzulässiger Pfad/);
});

test('zu große Einträge werden vor dem Auspacken abgelehnt', () => {
  const bytes = zipSync({
    mimetype: strToU8(ZLM_MIME),
    'manifest.json': strToU8(JSON.stringify({ format: 'zlm', version: 1, kind: 'worksheet' })),
    'document.json': strToU8('{"spec":{"content":[]}}'),
    'media/gross.bin': new Uint8Array(51e6),
  });
  assert.throws(() => readZlm(bytes), /zu groß/);
});

test('unzulässige Namen beim Schreiben', () => {
  const doc = sample();
  doc.modules['../x'] = {};
  assert.throws(() => writeZlm(doc), ZlmError);
});

test('Stand des Stift-Editors ↔ Ebene der Datei', async () => {
  const { editorStateOf, layerOf } = await import('../src/zlm/zlm.js');
  assert.equal(editorStateOf(undefined), null);
  const state = { v: 1, bg: 'paper', ruler: { visible: false }, pages: [{ items: [] }], layer: { blocks: { b7k2m9qa: { items: [], karoLines: 10, at: 120 } } } };
  const layer = layerOf(state);
  assert.equal(layer.role, 'teacher');
  assert.deepEqual(layer.blocks, state.layer.blocks);
  assert.deepEqual(editorStateOf(layer), state);
  const doc = sample();
  doc.layers.teacher = layer;
  assert.deepEqual(readZlm(writeZlm(doc, { now })).layers.teacher, layer);
});

test('Dokument-ID: neu vergeben, fehlende beim Lesen ergänzt', () => {
  const doc = createZlm({ now });
  assert.match(doc.manifest.id, /^[a-z0-9]{16}$/);
  delete doc.manifest.id;
  assert.match(readZlm(writeZlm(doc, { now })).manifest.id, /^[a-z0-9]{16}$/);
});
