// Block-IDs im Editor: gleicher Stand wie ensureBlockIds, nur auf dem Dokument des Editors.
import { describe, it, expect } from './expect.js';
import { missingIds } from '../src/editor/pm-ids.js';
import { specToPm } from '../src/doc/pm-convert.js';
import { pmSchema } from '../src/doc/pm-tiptap.js';
import { PmNode } from '../src/vendor/tiptap/tiptap.mjs';

const doc = (content) => PmNode.fromJSON(pmSchema(), specToPm({ content }));
const named = (spec) => missingIds(doc(spec)).map((c) => c.node.type.name);

describe('missingIds', () => {
  it('gültige, verschiedene IDs bleiben', () => {
    expect(named([{ type: 'section', id: 'aaaa1', text: 'A' }, { type: 'text', id: 'bbbb2', text: 'x' }])).toEqual([]);
  });
  it('fehlend und doppelt: neue ID; die erste von zweien behält ihre', () => {
    const d = doc([{ type: 'text', id: 'aaaa1', text: 'x' }, { type: 'text', id: 'aaaa1', text: 'y' }, { type: 'karo', lines: 2 }]);
    const ch = missingIds(d);
    expect(ch.map((c) => c.pos)).toEqual([3, 6]);
    expect(new Set(ch.map((c) => c.id)).size).toBe(2);
  });
  it('weitere Absätze eines Text-Bausteins teilen sich die ID', () => {
    expect(named([{ type: 'text', id: 'aaaa1', text: 'x\n\ny' }])).toEqual([]);
  });
  it('Kasten und Spalten: auch innen; Listenpunkte und Zellen nicht', () => {
    expect(named([
      { type: 'box', id: 'aaaa1', blocks: [{ type: 'text', text: 'x' }] },
      { type: 'list', id: 'bbbb2', items: ['a'] },
      { type: 'table', id: 'cccc3', rows: [[{ text: 'z', blocks: [{ type: 'text', id: 'dddd4', text: 'i' }] }]] },
      { type: 'columns', id: 'eeee5', blocks: [{ type: 'column', id: 'ffff6', blocks: [{ type: 'karo' }] }] },
    ])).toEqual(['paragraph', 'karo']);
  });
});
