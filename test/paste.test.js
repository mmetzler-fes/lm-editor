// Einfügen aus der Zwischenablage: Quelle wählen, Markdown und reiner Text (ohne DOM).
import { describe, it, expect } from './expect.js';
import { looksLikeDocMarkdown, looksLikeMarkdown, markdownToHtml, plainToHtml, pasteSource, pasteToEditorHtml } from '../src/doc/paste.js';

describe('Einfügen: eigene Schreibweise (docs/MARKDOWN.md)', () => {
  it('Behälter, Spans, Attribute, x^2^, CO~2~ werden erkannt', () => {
    for (const t of ['::: {.karo lines=3}\n:::', 'Der [Text]{.blau}', '## Titel {.plain}', 'x^2^', 'CO~2~']) expect(looksLikeDocMarkdown(t)).toBe(true);
  });
  it('gewöhnlicher Text und übliches Markdown nicht', () => {
    for (const t of ['# Titel', 'Text [x] {y}', '10^9 und a~b', '**fett**', 'Mengen {.a}']) expect(looksLikeDocMarkdown(t)).toBe(false);
  });
  it('wird zu Bausteinen, ein Stück Text fließt in die Zeile', () => {
    const block = pasteToEditorHtml({ text: '::: {.karo lines=3}\n:::\n\nx^2^' });
    expect(block.inline).toBe(false);
    expect(block.html).toContain('ds-widget');
    expect(block.html).toContain('<sup>2</sup>');
    const piece = pasteToEditorHtml({ text: 'Der [Text]{.blau}' });
    expect(piece.inline).toBe(true);
    expect(piece.html).toContain('ds-color');
  });
});

describe('Einfügen: Markdown erkennen', () => {
  it('Überschrift, Liste, Code, Tabelle, Zitat, fett, Link', () => {
    for (const t of ['# Titel', 'Text\n- Punkt', '1. Eins', '```\nx\n```', '| a | b |', '> Zitat', 'ein **fetter** Text', 'siehe [hier](https://x.de)', 'der `code`']) {
      expect(looksLikeMarkdown(t)).toBe(true);
    }
  });
  it('gewöhnlicher Text und Rechnungen nicht', () => {
    for (const t of ['Zeile eins\nZeile zwei', '8*7*3 = 168', 'Preis: 5 - 3 Euro', '#hashtag', '3.5 Liter']) {
      expect(looksLikeMarkdown(t)).toBe(false);
    }
  });
});

describe('Einfügen: Umwandlung', () => {
  it('Markdown: Zeilenumbruch bleibt, HTML im Text bleibt Text', () => {
    const html = markdownToHtml('**fett**\nzweite <b>Zeile</b>');
    expect(html).toContain('<strong>fett</strong><br>');
    expect(html).toContain('&lt;b&gt;');
  });
  it('Markdown: Formeln bleiben unangetastet', () => {
    const html = markdownToHtml('- $a_b*c*d_e$ ist **gut**');
    expect(html).toContain('data-tex="a_b*c*d_e"');
    expect(html).toContain('<strong>gut</strong>');
  });
  it('reiner Text: Leerzeile trennt Absätze, Zeilen bleiben, Zeichen werden geschützt', () => {
    expect(plainToHtml('a\nb\n\n  \n<c>')).toBe('<p>a<br>b</p><p>&lt;c&gt;</p>');
  });
});

describe('Einfügen: Quelle', () => {
  it('HTML mit Bedeutung geht vor', () => {
    expect(pasteSource({ text: 'x', html: '<p>x</p>' }).fromWeb).toBe(true);
  });
  it('bunte Zeilen aus einem Code-Editor: der Text zählt, auch als Markdown', () => {
    const r = pasteSource({ text: '# Titel', html: '<div style="color:red"><span># Titel</span></div>' });
    expect(r.fromWeb).toBe(false);
    expect(r.html).toContain('<h1>Titel</h1>');
  });
  it('Windows-Zeilenenden, nichts drin', () => {
    expect(pasteSource({ text: 'a\r\nb' }).html).toBe('<p>a<br>b</p>');
    expect(pasteSource({ text: '  ' }).html).toBe('');
  });
});
