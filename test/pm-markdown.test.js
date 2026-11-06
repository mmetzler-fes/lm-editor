// Spec ⇄ Markdown: dieselbe Spec zurück, das Markdown bleibt lesbar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pmToMarkdown, markdownToPm, parseAttrs } from '../src/doc/pm-markdown.js';
import { specToPm, pmToSpec } from '../src/doc/pm-convert.js';
import { pmSchema } from '../src/doc/pm-tiptap.js';
import { validateDocSpec } from '../src/doc/docspec.js';
import { PmNode } from '../src/vendor/tiptap/tiptap.mjs';

const sorted = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const toSpec = (text, opts) => pmToSpec(markdownToPm(text, opts));

/** Spec → Markdown → Spec: dasselbe, stabil, und das Markdown passt zum Schema. */
function roundTrip(spec) {
  const pm = specToPm(spec);
  const text = pmToMarkdown(pm);
  const back = markdownToPm(text);
  assert.equal(sorted(pmToSpec(back)), sorted(pmToSpec(pm)), `Markdown war:\n${text}`);
  assert.equal(pmToMarkdown(back), text);
  PmNode.fromJSON(pmSchema(), back).check();
  return text;
}
const textOf = (t) => roundTrip({ content: [{ type: 'text', text: t }] });

test('Überschriften: # Abschnitt, ## Aufgabe, ### Teilaufgabe, sonst ohne Nummer', () => {
  const spec = toSpec('# A\n\n## B\n\n### C\n\n#### D\n\n## E {.plain}\n\n### F {.task #x1}\n');
  assert.deepEqual(spec.content, [
    { type: 'section', text: 'A' },
    { type: 'task', title: 'B' },
    { type: 'subtask', title: 'C' },
    { type: 'heading', level: 1, text: 'D' },
    { type: 'heading', level: 2, text: 'E' },
    { type: 'task', id: 'x1', title: 'F' },
  ]);
});

test('Auszeichnung nach Pandoc', () => {
  const [p] = toSpec('**f** *k* ~~d~~ `c` x^2^ CO~2~ [u]{.underline} [b]{.blau size=14pt} [h]{.hl-gelb} [L](https://a.de) $x^2$').content;
  assert.equal(p.text, '**f** *k* ~~d~~ `c` x^{2} CO_{2} ++u++ [b]{blau,14pt} [h]{hl-gelb} [L](https://a.de) $x^2$');
});

test('alte Schreibweise x^{2} und CO_{2} wird auch verstanden', () => {
  assert.equal(toSpec('x^{2} und CO_{2}').content[0].text, 'x^{2} und CO_{2}');
});

test('Rot gibt es nicht: unbekannte Farbe fällt weg, der Text bleibt', () => {
  assert.equal(toSpec('[Text]{.rot}').content[0].text, 'Text');
});

test('Baustein-Beispiel aus dem Plan', () => {
  const spec = toSpec(`# Verzweigungen

## Bedingung prüfen

Schreibe eine **if**-Anweisung, die prüft, ob $x^2 > 10$ ist.

::: {.karo lines=6 pattern=linien}
:::

::: loesung
\`if x**2 > 10: …\`
:::

::: {.box title="Merke" shaded=true}
Ein \`else\` gehört immer zum letzten \`if\`.
:::
`);
  assert.deepEqual(validateDocSpec(spec), []);
  assert.deepEqual(spec.content.map((b) => b.type), ['section', 'task', 'text', 'karo', 'solution', 'box']);
  assert.deepEqual(spec.content[3], { type: 'karo', lines: 6, pattern: 'linien' });
  assert.equal(spec.content[5].title, 'Merke');
  assert.equal(spec.content[5].shaded, true);
  assert.equal(spec.content[4].blocks[0].text, '`if x**2 > 10: …`');
});

test('Behälter dürfen ineinander stehen, Code darf ::: enthalten', () => {
  const spec = toSpec('::: {.box title=A}\n::: loesung\nx\n:::\n```\n:::\n```\n:::\n\nDanach');
  assert.equal(spec.content[0].blocks[0].type, 'solution');
  assert.equal(spec.content[0].blocks[1].code, ':::');
  assert.equal(spec.content[1].text, 'Danach');
});

test('Pipe-Tabelle: Kopf, ohne Kopf, Spaltenausrichtung', () => {
  const [a] = toSpec('| A | B |\n|---|---|\n| 1 | 2 |').content;
  assert.deepEqual(a, { type: 'table', header: ['A', 'B'], rows: [['1', '2']] });
  const [b] = toSpec('|  |  |\n|---|---|\n| 1 | 2 |').content;
  assert.deepEqual(b, { type: 'table', rows: [['1', '2']] });
  const [c] = toSpec('| A |\n|:--:|\n| 1 |').content;
  assert.equal(c.rows[0][0].align, 'center');
});

test('verbundene Zellen und Bausteine in Zellen', () => {
  const text = roundTrip({ content: [{ type: 'table', header: [{ text: 'K', colspan: 2 }], rows: [[{ text: 'a', blocks: [{ type: 'karo', lines: 2 }] }, 'b'], [{ colspan: 2 }]] }] });
  assert.match(text, /::: \{\.kopfzelle colspan=2\}/);
});

test('Tabellen, die als Pipe gehen, stehen auch so da', () => {
  const text = roundTrip({ content: [{ type: 'table', id: 't', widths: [3, 5], header: ['A|B', 'c'], rows: [['`x|y`', 'zwei\\\nZeilen']] }] });
  assert.match(text, /^::: \{\.tabelle #t widths:json="\[3,5\]"\}\n\| A\\\|B \| c \|/);
  assert.match(text, /zwei\[\]\{\.br\}Zeilen/);
});

test('Bild, Formel, Code, Zeichenrahmen, Unbekanntes', () => {
  const text = roundTrip({ content: [
    { type: 'image', id: 'i', src: 'nc:A/b.png', caption: 'Bild', width: '8cm', source: { von: 'x' } },
    { type: 'image', src: 'hat leerzeichen.png', caption: 'a [b]' },
    { type: 'image', file: 'x.png' },
    { type: 'formula', id: 'f', latex: 'I = \\frac{U}{R}', align: 'left' },
    { type: 'formula', latex: 'a\n\nb' },
    { type: 'formula', math: '{a} over {b}' },
    { type: 'code', caption: 'a `b`', size: 9, code: '```\nx\n\n' },
    { type: 'code', file: 'a.py' },
    { type: 'group', id: 'g', ratio: 1.5, items: [{ x: 1, text: 'a' }] },
    { type: 'neuerTyp', irgendwas: [1, { a: 2 }] },
  ] });
  assert.match(text, /^!\[Bild\]\(nc:A\/b\.png\)\{#i width=8cm source:json=/);
  assert.match(text, /\$\$I = \\frac\{U\}\{R\}\$\$ \{#f align=left\}/);
  assert.match(text, /::: \{\.zeichenrahmen #g ratio=1\.5\}\n```json\n/);
  assert.match(text, /::: roh\n```json\n\{"type":"neuerTyp"/);
});

test('Bild mitten im Text wird ein eigener Baustein dahinter', () => {
  const { content } = toSpec('Text ![B](a.png){width=2cm} weiter');
  assert.deepEqual(content.map((b) => b.type), ['text', 'image']);
  assert.equal(content[1].width, '2cm');
});

test('Listen: Unterpunkte, Attribute, zwei Listen hintereinander', () => {
  const text = roundTrip({ content: [
    { type: 'list', items: ['a\\\nb', { text: '', items: ['c'] }, ''] },
    { type: 'list', items: ['zweite'] },
    { type: 'list', id: 'l', ordered: true, marker: 'a)', items: ['x', '1. y'] },
  ] });
  assert.match(text, /^- a\\\n  b\n- \[\]\{\}\n  - c/);
  assert.match(text, /::: liste\n- zweite\n:::/);
});

test('Liste ohne Punkte bleibt erhalten', () => {
  const pm = specToPm({ content: [{ type: 'list', id: 'l', ordered: true, items: [] }] });
  const text = pmToMarkdown(pm);
  assert.equal(text, '::: {.liste #l ordered=true}\n:::\n');
  assert.equal(sorted(pmToSpec(markdownToPm(text))), sorted(pmToSpec(pm)));
});

test('mehrere Absätze im Listenpunkt und Bausteine darin gehen nicht verloren', () => {
  const { content } = toSpec('- a\n\n  b\n\n  ```\n  code\n  ```\n- c\n');
  assert.deepEqual(content[0].items, ['a\\\nb', 'c']);
  assert.equal(content[1].code, 'code');
});

for (const [name, t] of Object.entries({
  'Stern und Unterstrich': '8*7*3 und 2 * 3 * 4, a_b_c, _x_, **',
  'Sonderzeichen': 'Preis [EUR] 5 $ und $6, a~b~c, x^2^, `, \\, &amp; <div> {x}',
  'am Zeilenanfang': '# kein Titel\\\n- kein Punkt\\\n1. keine Zahl\\\n> kein Zitat\\\n::: kein Behälter\\\n```\\\n---\\\n$$\\\n| a |\\\n|---|',
  'Leerraum am Rand': '  zwei vorn\\\nhinten  ',
  'fett bis an Satzzeichen': '**(a)**b und **Wert:**nächste, **a **b',
  'über Zeilen hinweg': 'COUNT(*) a\\\nFROM *\\\nb',
  'Backslash am Ende': 'Pfad C:\\\\',
  'Umbruch am Ende': 'a\\\n\\\n\\\nb\\\n',
  'Code mit Backticks': '`` a`b `` und ``` `` ```',
  'alles zugleich': '[***f*** ~~d~~]{blau,hl-gelb,14pt} ^{a b} _{c d} [L *k*](https://a.de/x_y(1))',
  'Zeichen wie Spans': 'text]{.blau} [x]',
  'Tabulator und NBSP': '\ta\u00a0b\u00a0',
})) {
  test(`Text bleibt: ${name}`, () => { textOf(t); });
}

test('Überschrift: } und # am Ende, Umbruch, leer', () => {
  roundTrip({ content: [
    { type: 'task', title: 'a [b]{12pt}' },
    { type: 'task', id: 'x', title: 'a [b]{12pt}' },
    { type: 'task', title: 'Menge {x}' },
    { type: 'section', text: 'C#' },
    { type: 'subtask', title: 'zwei\\\nZeilen' },
    { type: 'task', title: '' },
    { type: 'heading', text: 'ohne Stufe' },
    { type: 'heading', level: 3, text: 'd' },
    { type: 'task', title: 'mit leerem Text', text: '' },
  ] });
});

test('Felder: IDs, Zahl gegen Text, Unbekanntes bleibt', () => {
  const text = roundTrip({ meta: { a: 1 }, titel: 'T: "x"', 'selt sam': [1], content: [
    { type: 'text', id: 'a1', align: 'center', text: 'x\n\ny' },
    { type: 'text', text: '' },
    { type: 'karo', lines: '6', width: '8cm', neu: null, 'mit leer': true },
    { type: 'spacer', lines: 2 },
    { type: 'note', id: 'n', text: 'a\\\nb' },
    { type: 'columns', id: 'c', blocks: [{ type: 'column', width: '40%', blocks: [{ type: 'text', text: 'l' }] }, { type: 'column', blocks: [] }] },
    { type: 'quiz', module: 'm-1', scale: 0.8 },
    { type: 'pagebreak', id: 'p' },
  ] });
  assert.match(text, /^---\nmeta: \{"a":1\}\ntitel: "T: \\"x\\""\n"selt sam": \[1\]\n---\n/);
  assert.match(text, /\[\]\{#a1 align=center\}x/);
  assert.match(text, /\.karo lines="6"/);
  assert.match(text, /extra:json=/);
});

test('ohne IDs: kürzer für den KI-Prompt', () => {
  const pm = specToPm({ content: [{ type: 'section', id: 's', text: 'A' }, { type: 'text', id: 't', text: 'x\n\ny' }, { type: 'karo', id: 'k', lines: 2 }] });
  assert.equal(pmToMarkdown(pm, { ids: false }), '# A\n\nx\n\ny\n\n::: {.karo lines=2}\n:::\n');
});

test('Kopf der Datei: schlichte Werte und Fortsetzung; zwei Trennlinien sind keiner', () => {
  const { attrs } = markdownToPm('---\ntitle: Der Wandler: Teil 1\ndescription: "a"\nlang: \'de\'\nnote: eins\n  zwei\nn: 3\n---\n\nText');
  assert.deepEqual(attrs.meta, { title: 'Der Wandler: Teil 1', description: 'a', lang: 'de', note: 'eins zwei', n: 3 });
  assert.equal(markdownToPm('---\n\nText\n\n---\n').attrs, undefined);
});

test('einfacher Umbruch: Leerzeichen wie bei Pandoc, mit breaks eine Zeile', () => {
  assert.equal(toSpec('a\nb').content[0].text, 'a b');
  assert.equal(toSpec('a\nb', { breaks: true }).content[0].text, 'a\\\nb');
  assert.equal(toSpec('a\\\nb').content[0].text, 'a\\\nb');
});

test('Fehler melden, statt Inhalt zu verlieren', () => {
  const warnings = [];
  const spec = toSpec('::: warnung\nText\n:::\n\n:::\n\n::: box\noffen', { warnings });
  assert.equal(spec.content[0].text, 'Text');
  assert.equal(spec.content[1].blocks[0].text, 'offen');
  assert.equal(warnings.length, 3);
  const w2 = [];
  assert.deepEqual(toSpec('::: zeichenrahmen\n```json\n{kaputt\n```\n:::', { warnings: w2 }).content, [{ type: 'group' }]);
  assert.equal(w2.length, 1);
});

test('$$ ohne Ende und eingerückter Text bleiben Text; Zitat wird Kasten; Trennlinie fällt weg', () => {
  assert.equal(toSpec('$$ a').content[0].text, '$$ a');
  assert.equal(toSpec('    eingerückt').content[0].text, 'eingerückt');
  assert.deepEqual(toSpec('> a\n\n---\n\nb').content.map((x) => x.type), ['box', 'text']);
});

test('Attribute lesen', () => {
  const src = '{#i .k n=6 w=8cm b=true s="a \\"b\\"" j:json="[1,{\\"x\\":2}]"} Rest';
  const a = parseAttrs(src);
  assert.deepEqual(a.classes, ['k']);
  assert.deepEqual(a.fields, { id: 'i', n: 6, w: '8cm', b: true, s: 'a "b"', j: [1, { x: 2 }] });
  assert.equal(src.slice(a.end), ' Rest');
  for (const bad of ['{b}', '{.k', '{a=}', '{a="x}', '{j:json="{"}']) assert.equal(parseAttrs(bad), null, bad);
});

test('Beispiele überstehen den Weg', () => {
  for (const f of ['beispiel', 'erweitert']) {
    roundTrip(JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}.json`, import.meta.url), 'utf8')));
  }
});

test('Markdown: „##“ ohne Titel – der folgende kurze Absatz wird zum Titel („1.1 Welche …“ in einer Zeile)', () => {
  const spec = (text) => pmToSpec(markdownToPm(text)).content;
  assert.deepEqual(spec('##\n\nWelche Aufgaben hat ein ERD?\n\n## Strom\n\nBerechne I.\n'), [
    { type: 'task', title: 'Welche Aufgaben hat ein ERD?' },
    { type: 'task', title: 'Strom' },
    { type: 'text', text: 'Berechne I.' },
  ]);
  // nicht bei langem Text, Zeilenumbruch oder Überschrift ohne Nummer
  assert.deepEqual(spec(`##\n\n${'x'.repeat(301)}\n`).map((b) => b.type), ['task', 'text']);
  assert.deepEqual(spec('##\n\nZeile 1\\\nZeile 2\n').map((b) => b.type), ['task', 'text']);
  assert.deepEqual(spec('####\n\nText\n').map((b) => b.type), ['heading', 'text']);
});
