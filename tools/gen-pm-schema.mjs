// docs/pm-doc.schema.json aus src/doc/pm-schema.js erzeugen: node tools/gen-pm-schema.mjs
import fs from 'node:fs';
import { PM_NODES, PM_MARKS, NODES_WITH_EXTRA } from '../src/doc/pm-schema.js';

const attrsOf = (names, extra) => ({
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries([...names, ...(extra ? ['extra'] : [])].map((n) => [n, {}])),
});
const node = (name, def) => {
  if (name === 'text') {
    return { type: 'object', required: ['type', 'text'], additionalProperties: false,
      properties: { type: { const: 'text' }, text: { type: 'string', minLength: 1 }, marks: { type: 'array', items: { $ref: '#/$defs/mark' } } } };
  }
  return {
    type: 'object',
    required: ['type'],
    additionalProperties: false,
    properties: {
      type: { const: name },
      ...(def.attrs ? { attrs: attrsOf(def.attrs, NODES_WITH_EXTRA.includes(name)) } : {}),
      ...(def.content ? { content: { type: 'array', items: { $ref: '#/$defs/node' } } } : {}),
      ...(def.inline ? { marks: { type: 'array', items: { $ref: '#/$defs/mark' } } } : {}),
    },
  };
};
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/mmetzler-fes/lm-editor/docs/pm-doc.schema.json',
  title: 'Dokument (ProseMirror-JSON) – siehe docs/SCHEMA.md',
  description: 'Erzeugt aus src/doc/pm-schema.js. Prüft Knoten, Felder und Auszeichnungen; welche Knoten worin stehen dürfen, regelt der content-Ausdruck des Schemas.',
  allOf: [{ $ref: '#/$defs/node' }, { properties: { type: { const: 'doc' } } }],
  $defs: {
    node: { oneOf: Object.keys(PM_NODES).map((n) => ({ $ref: `#/$defs/node_${n}` })) },
    mark: { oneOf: Object.entries(PM_MARKS).map(([name, def]) => ({
      type: 'object', required: ['type'], additionalProperties: false,
      properties: { type: { const: name }, ...(def.attrs ? { attrs: attrsOf(def.attrs, false) } : {}) },
    })) },
    ...Object.fromEntries(Object.entries(PM_NODES).map(([n, def]) => [`node_${n}`, node(n, def)])),
  },
};
fs.writeFileSync(new URL('../docs/pm-doc.schema.json', import.meta.url), `${JSON.stringify(schema, null, 2)}\n`);
