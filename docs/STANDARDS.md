# Plan: Dokumente auf Standards umstellen

Stand: 01.11.2026. Kurzfassung mit Haken in [PLAN.md](../PLAN.md), Phase 9.

## Ausgangslage

Ein Dokument ist heute eine **Spec** (YAML/JSON, Format aus
`worksheet-renderer/SPEC.md` in LearningModules): ein Baum von Bausteinen,
daraus entstehen Web-Ansicht, .odt und PDF. Das Konzept ist richtig – so
arbeiten auch ProseMirror, Pandoc und Word intern. Eigen sind nur das
**Schema** und die **Schreibweisen** im Text: `++unterstrichen++`, `x^{2}`,
`[Text]{blau,14pt}`, Formeln in StarMath.

KIs schreiben im Chat **Markdown** und Formeln in **LaTeX-Mathe-Syntax**
(`$…$`, `$$…$$`, im Browser mit KaTeX/MathJax gesetzt). Volles LaTeX als
Dokumentformat passt nicht: Es lässt sich im Browser nicht direkt anzeigen,
der Weg nach .odt (Schulvorlage) verliert viel, ein WYSIWYG-Editor kann es
kaum verlässlich lesen und schreiben, und Lehrkräfte schreiben es nicht.

## Ziel: drei Schichten

1. **Dokumentmodell:** ProseMirror-JSON mit eigenem Schema, beschrieben in
   `docs/SCHEMA.md` und als JSON Schema. Editor, Stift-Ebene (Block-IDs) und
   Druck arbeiten darauf.
2. **Text im Inneren** nach Standards: Formeln in LaTeX, Auszeichnung nach
   Pandoc-Markdown.
3. **Austauschformat Markdown** (Pandoc-Syntax mit fenced divs) in beide
   Richtungen – für KI-Prompts, Git, Weitergabe; über Pandoc auch LaTeX,
   .docx, HTML.

Der eigene ODT-Renderer bleibt: Der ODT-Writer von Pandoc ist bei Tabellen,
Karos und Schulvorlage deutlich schwächer.

## Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Formeln | LaTeX-Mathe-Syntax; Temml (MIT) wandelt in MathML | KI-Ausgaben und Formeln aus dem Netz direkt übernehmbar; MathML zeigen alle Browser an und LibreOffice liest es |
| StarMath | wird weiter gelesen; in LaTeX umgewandelt erst, wenn die Formel bearbeitet wird; was nicht sicher umzuwandeln ist, bleibt StarMath | kein Risiko für bestehende Dokumente |
| Editor | Tiptap v3 (nur MIT-Pakete, feste Version), einmal gebündelt nach `src/vendor/` – zur Laufzeit kein Build-Schritt | fertige Extensions für Schriftgröße, Farbe, Zeilenabstand, Ausrichtung, Tabellen, Ziehen, Block-IDs, Formeln; erprobter als Selbstgebautes |
| Nicht verwenden | Tiptap Cloud/Pro (Kollaboration in der Cloud, KI, DOCX-Konvertierung) | Lizenz, Abhängigkeit; gemeinsames Bearbeiten später mit Yjs |
| Knotennamen | Schreibweise von Tiptap (`bulletList`, `hardBreak`), festgelegt in `docs/SCHEMA.md` | ein Name überall |
| Überschriften | **flach**: Überschrift mit `role: section \| task \| subtask \| plain`, ihr Inhalt folgt | entspricht dem, was die Lehrkraft sieht (wie Word); Umwandeln, Löschen, Verschieben ohne unsichtbare Behälter; der visuelle Editor speichert heute schon so |
| Behälter | nur, was sichtbar einen Rand hat: Kasten, Lösung, Spalten, Tabellenzellen, Zeichenrahmen | |
| Nummerierung | 1. / 1.1 / 1.1.1 nicht gespeichert, per CSS-Zähler | wie heute |
| Konverter | reine Funktionen auf JSON, ohne Tiptap | Server, Renderer und Aufgabengenerator brauchen den Editor nicht; das Editor-Gerüst bleibt austauschbar |
| Speicherformat | wird **als Letztes** umgestellt; bis dahin wandeln Editor und Druck in die heutige Spec | jeder Schritt einzeln nutzbar und rücknehmbar |

### Flach statt verschachtelt – Beispiel

Die Spec erlaubt, dass eine Aufgabe ihre Bausteine enthält:

```yaml
- type: task
  title: Bedingung prüfen
  blocks:
    - type: subtask
      title: Was wird ausgegeben?
      blocks:
        - {type: karo, lines: 4}
```

Im Schema steht dasselbe flach; wozu etwas gehört, sagt die Reihenfolge:

```yaml
- {type: task, title: Bedingung prüfen}
- {type: subtask, title: Was wird ausgegeben?}
- {type: karo, lines: 4}
```

Verschachtelte Specs (Aufgabengenerator, ältere Dokumente) werden beim
Einlesen ausgepackt.

## Formeln: Weg und Prüfung

- **Browser:** Temml, LaTeX → MathML (MathML Core in Chrome, Safari, Firefox).
- **Server:** lädt `docspec.js` schon heute in Node – dieselbe Umwandlung.
- **.odt:** Der Druckauftrag trägt das MathML mit; der Renderer übersetzt es
  in StarMath (`tools/mathml_starmath.py`) und schreibt das Formelobjekt
  (`Object n/content.xml`), im Lösungsblatt mit `color red`. Grund (geprüft mit
  LibreOffice 26.2): Einfaches MathML setzt LibreOffice richtig, aber bei
  Akzenten (`\bar`, `\hat`, `\overline`), `\underbrace`, `\cancel`, `|x|`,
  `cases` und `aligned` liefert sein MathML-Import „¿“ oder lässt etwas weg –
  in StarMath gelingt all das, und die Formel bleibt in LibreOffice
  bearbeitbar. Was die Übersetzung nicht kennt, geht als MathML hinein.
- **Ohne Browser** (später Aufgabengenerator in Python): `latex2mathml` als
  Ausweg.
- **Gespeichert wird nur LaTeX**, MathML wird jedes Mal neu erzeugt (Anzeige,
  Druckauftrag). In der Spec heute `{type: formula, latex: …}`, im
  ProseMirror-JSON später die Knoten `blockMath` und `inlineMath` mit
  `attrs.latex` (Namen wie Tiptaps Mathematics-Extension, deren Darstellung
  auf Temml umgestellt wird).
- **Temml statt KaTeX/MathJax:** Temml stammt aus dem KaTeX-Umfeld und liest
  dieselbe Syntax, gibt aber reines MathML aus – genau das, was auch die .odt
  braucht. KaTeX baut HTML mit eigenen Schriften und legt MathML nur
  unsichtbar für Screenreader daneben, MathJax ist deutlich größer.
  Screenreader (NVDA, VoiceOver) lesen MathML direkt.

## Markdown – Beispiel

```markdown
# Verzweigungen {.section}

## Bedingung prüfen {.task}

Schreibe eine **if**-Anweisung, die prüft, ob $x^2 > 10$ ist.

::: {.karo lines=6 pattern=linien}
:::

::: loesung
`if x**2 > 10: …`
:::

::: {.box title="Merke" shaded=true}
Ein `else` gehört immer zum letzten `if`.
:::
```

| heute | Markdown/Pandoc |
|---|---|
| `x^{2}`, `CO_{2}` | `x^2^`, `CO~2~` |
| `++unterstrichen++` | `[unterstrichen]{.underline}` |
| `[Text]{blau,14pt}` | `[Text]{.blau size=14pt}` |
| StarMath `{a} over {b}` | `$\frac{a}{b}$` |

Was sich in Markdown schlecht schreibt (Zeichenrahmen mit Koordinaten), steht
als `::: zeichenrahmen` mit eingebettetem JSON. Markdown muss nicht alles
schön abbilden, aber verlustfrei hin und zurück.

## Phasen

### 9.1 Formeln in LaTeX
- Temml 0.14.0 unter `src/vendor/temml/` (mit LICENSE und CSS)
- Baustein `formula` mit `latex`; `math` (StarMath) wird weiter gelesen
- `docspec.js` setzt LaTeX über Temml, sonst StarMath wie bisher
- Druckauftrag (Server `prepare`, `src/print/render-job.js`) mit `mathml`;
  `make_worksheet.py` schreibt es ins Formelobjekt, Rot im Lösungsblatt,
  Ersatztext im Lösungsrahmen aus dem MathML
- Umwandler StarMath → LaTeX auf Basis des vorhandenen Parsers
- Formeldialog mit LaTeX-Eingabe und Live-Vorschau
- KI-Prompt und PDF-Import liefern LaTeX
- Tests, SPEC.md, dokumente.md
- danach: Inline-Formeln `$…$` im Fließtext (in der .odt als Objekt in der Zeile)

### 9.2 Schema und Konverter
- Schema als Tiptap-Extensions (`src/doc/pm-schema.js`); jeder Block-Knoten
  mit `attrs.id`
- `docs/SCHEMA.md`, daraus `pm-doc.schema.json`
- `specToPm()` / `pmToSpec()`; Hin- und Rückweg getestet über **alle**
  vorhandenen Dokumente (Datenbank von LearningModules, `examples/`, Tests)
- Tiptap v3 einmal mit esbuild gebündelt, eingecheckt

### 9.3 Markdown
- markdown-it mit Plugins für Container und Attribute; Markdown ⇄ JSON
- sofort nutzbar über Markdown → JSON → Spec → Renderer: „Aus Markdown
  einfügen“; der KI-Prompt liefert Markdown statt YAML
- `docs/MARKDOWN.md` mit Beispielen, zugleich Vorlage für KI-Prompts

### 9.4 Editor auf Tiptap
- eigene Freischaltung, alter Editor bleibt parallel
- NodeViews: Karo (ziehbar), Bild, Zeichenrahmen (Anordnen-Dialog), Quiz,
  Formel, Schreibfeld
- Tabellen über Tiptap Table (`prosemirror-tables`)
- Plugin für Block-IDs: neue IDs beim Verdoppeln/Einfügen, gleiche beim
  Verschieben
- Seitenumbrüche (`page-breaks.js`) und Stift-Editor weiter über `data-id`
- Leiste und Dialoge über Befehlsketten statt `execCommand`
- Markdown-Reiter statt YAML; Kopieren trägt JSON, HTML und Markdown
- Abnahme: jede Funktion aus `docs/dokumente.md` von LearningModules

### 9.5 Speicherformat
- `document.json`: `{ "schema": "lm-doc", "version": 2, "doc": { … } }`,
  `.zlm` Version 2; Version 1 wird beim Öffnen hochgestuft
- LearningModules: Migration mit Sicherung; Server-Prüfung, ID-Vergabe,
  GitHub-Backup, Importe (.odt, PDF, .pptx) liefern das neue Format
- alter Editor und YAML-Pfad entfallen

### 9.6 Renderer liest ProseMirror-JSON direkt
Bis dahin wandelt `pmToSpec` im Druckauftrag.

### 9.7 Aufgabengenerator (mmetzler1)
Markdown mit fenced divs als Eingabe; Pandoc liest die Syntax nativ
(`pandoc -t json`), ein Umwandler Pandoc-AST → ProseMirror-JSON schließt den
Kreis.

## Risiken

- 9.4 ist der größte Brocken (etwa so groß wie der heutige Editor mit seinen
  Dialogen).
- Die verlustfreie Umwandlung in 9.2 trägt alles Weitere – deshalb gegen alle
  echten Dokumente testen, bevor etwas darauf aufbaut.
