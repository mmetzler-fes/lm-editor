# Dokumentmodell (ProseMirror-JSON)

So sieht ein Dokument künftig aus (Plan, Phase 9). Noch ist die heutige Spec
das Speicherformat; `src/doc/pm-convert.js` wandelt in beide Richtungen.

- Definition: `src/doc/pm-schema.js` (reine Daten, ohne Tiptap)
- Für den Editor: `src/doc/pm-tiptap.js` baut daraus die Tiptap-Extensions
- Zum Prüfen von außen: `docs/pm-doc.schema.json` (`node tools/gen-pm-schema.mjs`)

```js
import { specToPm, pmToSpec } from './src/doc/pm-convert.js';
const doc = specToPm(spec);     // Spec → JSON
const flat = pmToSpec(doc);     // JSON → Spec, immer flach
```

## Beispiel

```json
{
  "type": "doc",
  "attrs": { "meta": { "titel": "Das ohmsche Gesetz" } },
  "content": [
    { "type": "heading", "attrs": { "id": "a1b2c3d4", "role": "task" },
      "content": [{ "type": "text", "text": "Strom berechnen" }] },
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Es gilt " },
      { "type": "inlineMath", "attrs": { "latex": "I = U/R" } },
      { "type": "text", "text": " bei " },
      { "type": "text", "text": "konstantem", "marks": [{ "type": "bold" }] },
      { "type": "text", "text": " R." }
    ] },
    { "type": "karo", "attrs": { "lines": 6 } }
  ]
}
```

## Überschriften sind flach

Eine Aufgabe enthält ihre Bausteine nicht; sie folgen ihr. Wozu etwas gehört,
sagt die Reihenfolge – wie in Word. `{ type: task, title, text, blocks }` wird
beim Einlesen ausgepackt: Überschrift, Text als Absatz, dann die Bausteine.

## Knoten

| Knoten | Spec | Felder (`attrs`) | Inhalt |
|---|---|---|---|
| `doc` | Wurzel | `meta` (alles neben `content`: `titel` …) | Blöcke |
| `paragraph` | `text` | `id`, `joined`, `align`, `indent`, `firstLine`, `spaceBefore`, `spaceAfter`, `lineHeight` | Inline |
| `heading` | `section`, `task`, `subtask`, `heading` | `id`, `role` (`section`, `task`, `subtask`, `plain`), `level` | Inline |
| `note` | `note` | `id` | Inline |
| `bulletList`, `orderedList` | `list` | `id`, `marker`, `numbering`, `lineHeight`, `spaceBefore`, `spaceAfter` | `listItem` |
| `listItem` | Punkt | – | `paragraph`, darunter höchstens eine Liste |
| `codeBlock` | `code` | `id`, `caption`, `size`, `file` | Text ohne Auszeichnung |
| `box` | `box` | `id`, `title`, `shaded` | Blöcke |
| `solution` | `solution` | `id`, `title` | Blöcke |
| `columns`, `column` | `columns`, `column` | `id`; `width` bei `column` | `column` bzw. Blöcke |
| `table` | `table` | `id`, `caption`, `widths`, `heights`, `lineWidth`, `lineStyle`, `lineColor`, `width`, `position`, `spaceBefore`, `spaceAfter`, `padding`, `align`, `valign`, `border` | `tableRow` |
| `tableRow` | Zeile | `header` (Kopfzeile) | `tableCell` oder `tableHeader` |
| `tableCell`, `tableHeader` | Zelle | `colspan`, `rowspan`, `align`, `valign`, `background`, `images`, `beside` | `paragraph` (Text der Zelle), dann Blöcke |
| `image` | `image` | `id`, `src`, `file`, `alt`, `caption`, `width`, `float`, `align`, `border` | – |
| `group` | `group` (Zeichenrahmen) | `id`, `items`, `ratio`, `width`, `align`, `border`, `caption` | – |
| `formula` | `formula` | `id`, `latex`, `math` (StarMath, nur gelesen), `align` | – |
| `karo` | `karo` | `id`, `lines`, `width`, `pattern` | – |
| `spacer` | `spacer` | `id`, `lines` | – |
| `pagebreak` | `pagebreak` | `id` | – |
| `quiz` | `quiz` | `id`, `module`, `title`, `scale` | – |
| `rawBlock` | unbekannter Typ | `block` (unverändert) | – |
| `hardBreak` | `\` am Zeilenende | – | – |
| `inlineMath` | `$…$` | `latex` | – |

Was ein Baustein sonst noch mitbringt (z. B. `source` am Bild), steht unverändert
in `attrs.extra` und kommt beim Zurückwandeln wieder an seinen Platz.

`joined: true`: Eine Spec darf in einem `text`-Baustein mehrere Absätze haben
(Leerzeile). Im Modell sind das mehrere `paragraph`; die weiteren tragen `joined`
und gehören zur ID des ersten – so bleiben Stift-Striche beim richtigen Baustein.

## Auszeichnungen (`marks`)

| Mark | Spec | Felder |
|---|---|---|
| `link` | `[Text](https://…)` | `href` |
| `textStyle` | `[Text]{blau,14pt}` | `color` (Name), `fontSize` (pt) |
| `highlight` | `[Text]{hl-gelb}` | `color` (Name) |
| `bold`, `italic` | `**…**`, `*…*` | – |
| `underline`, `strike` | `++…++`, `~~…~~` | – |
| `code` | `` `…` `` | – |
| `superscript`, `subscript` | `^{…}`, `_{…}`, auch `U_R` | – |

Die Reihenfolge je Textstück folgt dem Schema (wie oben). Beim Zurückschreiben
werden Zeichen nur geschützt, wo sie sonst wirken würden: `8*7` bleibt `8*7`.

## Was sich beim Hin- und Rückweg ändert

Das Blatt sieht gleich aus, die Schreibweise wird einheitlich:

- verschachtelte Aufgaben werden flach
- `U_R` wird `U_{R}`, `<sub>e</sub><sub>1</sub>` wird `<sub>e1</sub>`
- einfache Umbrüche, die der Text ohnehin macht, werden ausdrücklich (`\`);
  solche, die er zusammenzieht, verschwinden
- `{ text }` in Kasten und Lösung wird ein Text-Baustein in `blocks`

## Prüfen

`node scripts/check-doc-pm.mjs <Ordner>` (LearningModules) prüft Dokumente aus
`.json`/`.yaml`: gleiches Aussehen, alle Felder erhalten, passt zum Schema,
zweiter Durchlauf gleich.

Nicht geprüft: der Druck über den Renderer (.odt/.pdf) – er liest bis Phase 9.6
die Spec; die flache Form erzeugt der Editor schon heute.

## Offen für Phase 9.5

Bausteine **ohne** `id` adressiert die Stift-Ebene über ihren Pfad (`p:2.0`).
Das Auspacken ändert diese Pfade. Die Migration muss deshalb zuerst IDs vergeben
und vorhandene Striche umhängen, bevor flach gespeichert wird.
