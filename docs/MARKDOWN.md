# Dokumente in Markdown

So sieht ein Dokument als Text aus: zum Schreiben von Hand, als Antwort einer KI,
für Git und zum Weitergeben. Die Schreibweise folgt
[Pandoc](https://pandoc.org/MANUAL.html#pandocs-markdown) (fenced divs, Spans,
`x^2^`, `$…$`). Ein Dokument geht ohne Verlust hin und zurück.

```js
import { pmToMarkdown, markdownToPm } from './src/doc/pm-markdown.js';
const text = pmToMarkdown(doc);                  // JSON → Markdown
const short = pmToMarkdown(doc, { ids: false }); // ohne Block-IDs, z. B. für einen KI-Prompt
const back = markdownToPm(text, { warnings });   // Markdown → JSON; Hinweise landen im Array
```

## Beispiel

````markdown
---
title: "Das ohmsche Gesetz"
---

# Spannung, Strom, Widerstand

Der **Widerstand** $R$ begrenzt den Strom. Es gilt:

$$I = \frac{U}{R}$$

## Strom berechnen

Berechne den Strom für $U = 12\,\text{V}$ und $R = 240\,\Omega$.

::: {.karo lines=4}
:::

::: loesung
$I = \frac{12\,\text{V}}{240\,\Omega} = 50\,\text{mA}$
:::

::: {.box title="Merke" shaded=true}
Doppelte Spannung heißt doppelter Strom.
:::
````

## Überschriften

| Schreibweise | Bedeutung |
|---|---|
| `# Titel` | Abschnitt (1., 2., …) |
| `## Titel` | Aufgabe (1.1 …) |
| `### Titel` | Teilaufgabe (1.1.1 …) |
| `#### Titel` | Überschrift ohne Nummer |
| `## Titel {.plain}` | Überschrift ohne Nummer, Stufe 2 |
| `### Titel {.task #a1b2}` | Rolle und ID ausdrücklich |

Aufgaben enthalten ihre Bausteine nicht, sie folgen ihnen ([SCHEMA.md](SCHEMA.md)).

## Text

| Schreibweise | Ergebnis |
|---|---|
| `**fett**`, `*kursiv*`, `~~durchgestrichen~~` | wie üblich |
| `[Text]{.underline}` | unterstrichen |
| `` `code` `` | Code im Text |
| `x^2^`, `CO~2~` | hoch- und tiefgestellt (ohne Leerzeichen; `x^{2}`, `CO_{2}` gelten auch) |
| `[Text](https://…)` | Link |
| `[Text]{.blau size=14pt}` | Farbe: `blau`, `gruen`, `orange`, `lila`, `grau`; Größe in pt |
| `[Text]{.hl-gelb}` | Hervorhebung: `hl-gelb`, `hl-gruen`, `hl-blau`, `hl-rosa` |
| `$x^2$` | Formel im Satz (LaTeX) |
| `\` am Zeilenende | Zeilenumbruch |
| `\*` | das Zeichen selbst |

Ein einfacher Zeilenumbruch ist ein Leerzeichen, eine Leerzeile trennt Absätze.
`U_R` bleibt also `U_R`, tiefgestellt ist `U~R~`.

## Bausteine

| Schreibweise | Baustein |
|---|---|
| `- Punkt`, `1. Punkt` | Liste, Unterpunkte eingerückt |
| ` ```{caption=a.py size=9} ` | Code; Sprachangaben wie ` ```python ` werden überlesen |
| `$$I = \frac{U}{R}$$` | Formel als eigener Absatz, auch über mehrere Zeilen; dahinter z. B. `{align=left}` |
| `![Unterschrift](bild.png){width=8cm}` | Bild |
| `\| a \| b \|` | Tabelle (siehe unten) |
| `> Text` | wird ein Kasten |
| `---` | Trennlinie gibt es nicht, sie fällt weg |

Alles andere steht zwischen `:::`-Zeilen. Eine Zeile mit Klasse oder `{…}` öffnet,
ein bloßes `:::` schließt; Behälter dürfen ineinander stehen.

| Klasse | Baustein | Felder |
|---|---|---|
| `box` | Kasten | `title`, `shaded` |
| `loesung` | Lösung | `title` |
| `hinweis` | kursiver Hinweis | |
| `karo` | Karo, Linien … | `lines`, `width`, `pattern` |
| `abstand` | Abstand | `lines` |
| `seitenumbruch` | Seitenumbruch | |
| `quiz` | eingebettetes Quiz | `module`, `title`, `scale` |
| `spalten`, darin `spalte` | Spalten | `width` an der Spalte |
| `liste` | Liste mit Feldern | `marker`, `numbering`, … |
| `tabelle` | Tabelle mit Feldern | `caption`, `widths`, … |
| `bild`, `formel` | Bild bzw. Formel, wenn die Kurzform nicht reicht | wie der Baustein |
| `zeichenrahmen` | Zeichenrahmen; die Elemente als ```` ```json ```` darin | `ratio`, `width`, … |
| `roh` | unbekannter Baustein (neuere Datei), als ```` ```json ```` | |

Es gelten auch die Namen des Modells (`solution`, `note`, `spacer` …). Ein unbekannter
Behälter ist nur eine Hülle: Sein Inhalt bleibt, `warnings` nennt ihn.

## Tabellen

```markdown
| Kopf | Kopf |
|------|------|
| a    | b    |
```

Eine leere Kopfzeile heißt: Die Tabelle hat keine. Doppelpunkte in der Trennzeile
(`|:--:|`) richten die Spalte aus, `[]{.br}` bricht in der Zelle um. Felder der
Tabelle: `::: {.tabelle widths:json="[3,5]"}` um die Tabelle herum.

Verbundene Zellen und Bausteine in Zellen gehen nur in der langen Form:

```markdown
::: tabelle
::: {.zeile header=true}
::: {.kopfzelle colspan=2}
Kopf
:::
:::
::: zeile
::: zelle
a
:::
::: zelle
b

::: {.karo lines=2}
:::
:::
:::
:::
```

## Felder

`{#id .klasse lines=6 width=8cm title="mit Leerzeichen" shaded=true widths:json="[3,5]"}`

- Zahlen und `true`/`false` ohne Anführungszeichen sind Zahlen und Wahrheitswerte;
  `lines="6"` ist Text.
- `name:json="…"` nimmt beliebiges JSON auf.
- Felder, die das Modell nicht kennt, bleiben erhalten (`attrs.extra`).
- Am Absatz stehen sie in einem leeren Span vorn: `[]{#a1b2 align=center}Text`.
  `[]{}` allein ist ein leerer Absatz.
- Oben in der Datei stehen die Felder des Dokuments (`titel` …) als `key: Wert`,
  je Zeile einer – eine Teilmenge von YAML.

## Wie geschrieben wird

`pmToMarkdown` nimmt die schlichteste Form, die beim Wiederlesen dasselbe ergibt:
erst ohne Schutz, dann mit `\` vor Sonderzeichen (`8\*7\*3`), zuletzt mit einem Span je
Textstück (`[Wert: ]{.bold}nächste`, für Fälle wie Fett mit Leerzeichen am Rand).

Pandoc liest die Dateien ebenfalls (`pandoc -f markdown -t json`, einmal über das
Lehrer-Backup probiert), kennt aber unsere Klassen und Felder nicht und liest Zeilen
wie `a) Text` als Liste, wo bei uns Text steht.

## Prüfen

`node scripts/check-doc-pm.mjs <Ordner>` (LearningModules) prüft zu jedem Dokument
auch Markdown: Die Spec kommt unverändert zurück, ein zweiter Durchlauf schreibt
denselben Text, das Ergebnis passt zum Schema. Geprüft gegen das Lehrer-Backup (509
Dokumente): alle gleich. Weil die Spec identisch ist, gilt auch der Druckvergleich
aus [SCHEMA.md](SCHEMA.md) weiter.
