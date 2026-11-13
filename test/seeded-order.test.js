import { describe, it, expect } from './expect.js';
import { seededOrder } from '../src/modules/seeded-order.js';

describe('Feste Mischung (Multiple Choice)', () => {
  it('jede Nummer genau einmal, bei gleichem Schlüssel gleich', () => {
    const a = seededOrder(5, 'q1|Frage');
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(seededOrder(5, 'q1|Frage')).toEqual(a);
  });

  it('die erste Antwort steht nicht immer vorn', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => seededOrder(4, `q${i}|Frage`).indexOf(0)));
    expect(firsts.size > 1).toBe(true);
  });
});
