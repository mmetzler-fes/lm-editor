import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plantInit, plantStep, plantInputs, plantExample, plantInputNames } from '../src/labs/plant-core.js';

const run = (plant, world, out, seconds, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) plantStep(plant, world, out, dt); };

test('Anlage: Objekt fällt auf den Tisch und bleibt liegen', () => {
  const plant = { w: 20, h: 10, items: [
    { id: 't', type: 'object', x: 0, y: 8, w: 10, h: 1, fixed: true },
    { id: 'o', type: 'object', x: 2, y: 2, w: 1, h: 1 },
  ] };
  const w = plantInit(plant);
  run(plant, w, {}, 2);
  assert.equal(w.bodies.length, 1);
  assert.ok(Math.abs(w.bodies[0].y - 7) < 0.02, `y=${w.bodies[0].y}`);
  assert.ok(Math.abs(w.bodies[0].x - 2) < 1e-9);
});

test('Anlage: Band nimmt mit (vorwärts, rückwärts), aus = steht; Gestapeltes fährt mit', () => {
  const plant = { w: 30, h: 10, items: [
    { id: 'b', type: 'conveyor', x: 0, y: 8, w: 20, out: 'M1', rev: 'M2', speed: 2 },
    { id: 'o', type: 'object', x: 5, y: 7, w: 1, h: 1 },
    { id: 'o2', type: 'object', x: 5, y: 6, w: 1, h: 1 },
  ] };
  const w = plantInit(plant);
  run(plant, w, {}, 0.5);
  const x0 = w.bodies.map((b) => b.x);
  run(plant, w, { M1: 1 }, 1);
  w.bodies.forEach((b, i) => assert.ok(Math.abs(b.x - x0[i] - 2) < 0.1, `vorwärts: ${b.x}`));
  run(plant, w, {}, 1);
  const x1 = w.bodies.map((b) => b.x);
  run(plant, w, {}, 1);
  w.bodies.forEach((b, i) => assert.ok(Math.abs(b.x - x1[i]) < 1e-6, 'steht'));
  run(plant, w, { M2: 1 }, 1);
  w.bodies.forEach((b, i) => assert.ok(Math.abs(b.x - x1[i] + 2) < 0.1, `rückwärts: ${b.x}`));
});

test('Anlage: Objekt fährt am Bandende herunter in den Vernichter', () => {
  const plant = { w: 30, h: 14, items: [
    { id: 'b', type: 'conveyor', x: 0, y: 8, w: 10, out: 'M1', speed: 4 },
    { id: 'o', type: 'object', x: 7, y: 7, w: 1, h: 1 },
    { id: 'd', type: 'destroyer', x: 9, y: 10, w: 4, h: 3 },
  ] };
  const w = plantInit(plant);
  run(plant, w, { M1: 1 }, 3);
  assert.equal(w.bodies.length, 0);
});

test('Anlage: Zylinder schiebt, Endlagen; einfachwirkend fährt ohne Signal zurück', () => {
  const plant = plantExample();
  const w = plantInit(plant);
  run(plant, w, {}, 0.3);
  assert.deepEqual(plantInputs(plant, w), { B0: 1, B1: 0, B2: 1 });
  run(plant, w, { Y1: 1 }, 0.5);
  assert.deepEqual(plantInputs(plant, w), { B0: 0, B1: 0, B2: 1 }); // unterwegs, Teil noch in der Lichtschranke
  run(plant, w, { Y1: 1 }, 2);
  assert.deepEqual(plantInputs(plant, w), { B0: 0, B1: 1, B2: 0 });
  assert.equal(w.bodies.length, 0, 'vom Tisch in den Behälter');
  run(plant, w, {}, 2);
  assert.deepEqual(plantInputs(plant, w), { B0: 1, B1: 0, B2: 0 });
  assert.deepEqual([...plantInputNames(plant)].sort(), ['B0', 'B1', 'B2']);
});

test('Anlage: doppeltwirkender Zylinder hält ohne Signal seine Lage', () => {
  const plant = { w: 20, h: 10, items: [{ id: 'c', type: 'cylinder', x: 0, y: 0, dir: 'down', stroke: 2, speed: 4, out: 'A', ret: 'R', ext: 'E', home: 'H' }] };
  const w = plantInit(plant);
  run(plant, w, { A: 1 }, 0.25);
  const mid = w.cyl.c;
  assert.ok(mid > 0.5 && mid < 2);
  run(plant, w, {}, 1);
  assert.equal(w.cyl.c, mid);
  run(plant, w, { R: 1 }, 1);
  assert.deepEqual(plantInputs(plant, w), { H: 1, E: 0 });
});

test('Anlage: Sensor nur für einen Werkstoff, als Öffner', () => {
  const plant = { w: 20, h: 10, items: [
    { id: 't', type: 'object', x: 0, y: 8, w: 20, h: 1, fixed: true },
    { id: 'm', type: 'object', x: 1, y: 7, w: 1, h: 1, material: 'metal' },
    { id: 'k', type: 'object', x: 5, y: 7, w: 1, h: 1, material: 'plastic' },
    { id: 's1', type: 'sensor', x: 0.5, y: 7.5, w: 2, h: 0.2, in: 'IND1', material: 'metal' },
    { id: 's2', type: 'sensor', x: 4.5, y: 7.5, w: 2, h: 0.2, in: 'IND2', material: 'metal' },
    { id: 's3', type: 'sensor', x: 4.5, y: 7.5, w: 2, h: 0.2, in: 'LS', nc: true },
    { id: 's4', type: 'sensor', x: 10, y: 7.5, w: 2, h: 0.2, in: 'FREI', nc: true },
  ] };
  const w = plantInit(plant);
  run(plant, w, {}, 0.2);
  assert.deepEqual(plantInputs(plant, w), { IND1: 1, IND2: 0, LS: 0, FREI: 1 });
});

test('Anlage: Erzeuger bei steigender Flanke und im Takt, nur wenn Platz ist', () => {
  const plant = { w: 20, h: 12, items: [
    { id: 't', type: 'object', x: 0, y: 10, w: 20, h: 1, fixed: true },
    { id: 'c', type: 'creator', x: 1, y: 0, out: 'NEU', object: { w: 1, h: 1, material: 'metal' } },
    { id: 'c2', type: 'creator', x: 10, y: 0, every: 1, object: { w: 1, h: 1 } },
  ] };
  const w = plantInit(plant);
  run(plant, w, { NEU: 1 }, 0.5); // gehalten: nur ein Teil
  assert.equal(w.bodies.filter((b) => b.x < 5).length, 1);
  assert.equal(w.bodies.find((b) => b.x < 5).material, 'metal');
  run(plant, w, {}, 0.1);
  run(plant, w, { NEU: 1 }, 0.1); // zweite Flanke: ein weiteres (das erste ist schon gefallen)
  run(plant, w, {}, 3.4);
  assert.equal(w.bodies.filter((b) => b.x < 5).length, 2);
  assert.ok(w.bodies.filter((b) => b.x > 5).length >= 3, 'im Takt');
});

test('Biegewerkzeug: MM1 spannt (BG12), MM2 biegt das Blech an der Kante (BG22), Biegung bleibt', async () => {
  const { plantBending } = await import('../src/labs/plant-core.js');
  const plant = plantBending();
  const w = plantInit(plant);
  run(plant, w, {}, 0.3);
  assert.deepEqual(plantInputs(plant, w), { BG11: 1, BG12: 0, BG21: 1, BG22: 0 });
  run(plant, w, { QM11: 1 }, 2);
  assert.deepEqual(plantInputs(plant, w), { BG11: 0, BG12: 1, BG21: 1, BG22: 0 });
  const blech = w.bodies[0];
  const y0 = blech.y;
  run(plant, w, { QM21: 1 }, 2.5);
  assert.deepEqual(plantInputs(plant, w), { BG11: 0, BG12: 1, BG21: 0, BG22: 1 });
  assert.ok(Math.abs(blech.bend - blech.bendLen) < 0.05, `ganz gebogen: ${blech.bend}`);
  assert.equal(blech.bendEdge, 4);
  assert.equal(blech.y, y0, 'gespannt: das Blech bewegt sich nicht');
  run(plant, w, { QM12: 1 }, 2.5); // MM2 Feder zurück, MM1 ein
  assert.deepEqual(plantInputs(plant, w), { BG11: 1, BG12: 0, BG21: 1, BG22: 0 });
  assert.ok(blech.bend > 1.5, 'Biegung bleibt');
  assert.equal(blech.y, y0, 'Einfahren hebt das Blech nicht an');
  assert.equal(blech.x, 2.4);
});

test('Zylinder bleibt stehen, wenn er ein Teil gegen eine feste Fläche drückt', () => {
  const plant = { w: 20, h: 12, items: [
    { id: 't', type: 'object', x: 0, y: 10, w: 20, h: 1, fixed: true },
    { id: 'o', type: 'object', x: 1, y: 9, w: 2, h: 1 },
    { id: 'c', type: 'cylinder', x: 1.5, y: 0, dir: 'down', stroke: 8, speed: 4, out: 'A', ext: 'E' },
  ] };
  const w = plantInit(plant);
  run(plant, w, { A: 1 }, 3);
  assert.ok(Math.abs(w.cyl.c - 5.6) < 0.05, `Hub ${w.cyl.c}`); // 3 + 0,4 + 5,6 = 9 (Oberkante des Teils)
  assert.deepEqual(plantInputs(plant, w), { E: 0 });
});
