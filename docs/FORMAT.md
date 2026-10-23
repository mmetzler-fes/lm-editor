# Das Format `.zlm`

Version 1 (Entwurf). Eine `.zlm` ist ein ZIP-Archiv:

```
mimetype            application/vnd.lm-editor.zlm+zip  (erster Eintrag, unkomprimiert)
manifest.json       Formatversion, Titel, Art, Zeitstempel
document.json       das Dokument (Spec, siehe unten)
modules/<id>.json   eingebettete Lernmodule
media/<name>        Bilder, Audio
layers/<id>.json    Stift-Ebenen
preview.png         optional: Vorschaubild der ersten Seite
```

Wie bei ODF steht `mimetype` vorne und unkomprimiert. So erkennt man die Datei
schon an den ersten Bytes.

## manifest.json

```json
{
  "format": "zlm",
  "version": 1,
  "id": "k3f9a2x1m8q4w7e2",
  "title": "Ohmsches Gesetz",
  "kind": "worksheet",
  "lang": "de",
  "created": "2026-10-23T10:00:00.000Z",
  "modified": "2026-10-23T10:30:00.000Z",
  "generator": "lm-editor 0.1.0"
}
```

`kind`: `worksheet` (Arbeitsblatt), `exam` (Klassenarbeit) oder `text`.
`id`: erkennt das Dokument wieder (z. B. seinen Entwurf im Browser); fehlt
sie, vergibt das Programm beim Öffnen eine.

Eine Datei mit höherer `version`, als das Programm kennt, wird abgelehnt –
mit dem Hinweis, das Programm zu aktualisieren.

## document.json

```json
{ "spec": { "titel": "…", "content": [ … ] } }
```

`spec` folgt dem Spec-Format der Arbeitsblätter
(`worksheet-renderer/SPEC.md` in LearningModules), mit drei Ergänzungen:

- **`id`** an jedem Baustein: kurz, eindeutig im Dokument, bleibt beim
  Verschieben und Bearbeiten gleich. Daran hängen die Stift-Striche. Fehlt sie,
  vergibt der Editor eine (`ensureBlockIds`).
- **`orientation`** auf oberster Ebene: `portrait` (A4 hoch, Vorgabe) oder
  `landscape` (A4 quer). Die Satzbreite ist dann 17 cm bzw. 25,7 cm.
- **Verweise ins Archiv**: `image.src: "media/schaltung.png"`,
  `quiz.module: "<id>"` → `modules/<id>.json`.

## modules/&lt;id&gt;.json

Ein Lernmodul wie in LearningModules:

```json
{ "id": "k3f9a2x1", "type": "multipleChoice", "title": "Kurzquiz Ohm", "content": { … } }
```

## layers/&lt;id&gt;.json

Eine Ebene mit Handschrift und Textfeldern, nach Bausteinen geordnet:

```json
{
  "id": "teacher",
  "role": "teacher",
  "blocks": {
    "b7k2m9qa": {
      "items": [
        { "id": "s1", "type": "stroke", "tool": "pen", "color": "#1e293b", "width": 1.9,
          "points": [[12.5, 30, 0.5], [14, 31.2, 0.6]] },
        { "id": "t1", "type": "text", "x": 40, "y": 8, "w": 160, "h": 18,
          "text": "R = U / I", "color": "#2563eb", "size": 13 }
      ],
      "karoLines": 10
    }
  }
}
```

- Koordinaten in **Punkten** (1/72 Zoll) relativ zur linken oberen Ecke des
  Bausteins, bei fester Satzbreite. Ein Strich gehört zum Baustein, in dem er
  beginnt, und darf über ihn hinausragen.
- `points`: `[x, y, Druck 0–1]`. Gerade Linien tragen zusätzlich `"line": true`.
- `karoLines`, `karoWidth`, `karoPattern`: In dieser Ebene ist das Schreibfeld
  anders als im Dokument – länger (nie kürzer), breiter oder schmaler (cm; 16,5
  = volle Breite), mit anderem Muster (`karo`, `linien`, `leer`). So kann ein
  Schüler sein Feld anpassen, ohne das Dokument der Lehrkraft zu ändern.
- `editor` (optional): Stand des Stift-Editors – Hintergrund (`bg`: `paper`
  = das Dokument, sonst `karo`, `linien`, `leer`, `file`), Geodreieck
  (`ruler`) und die Seiten der übrigen Hintergründe (`pages`, Koordinaten der
  Seite).
- `role`: `teacher` oder `student`. In LearningModules liegt jede
  Schüler-Abgabe als eigene Ebene vor; in einer Datei zum Weitergeben steht in
  der Regel nur die Ebene der Lehrkraft.

## Grenzen beim Lesen

Gegen kaputte und bösartige Dateien: höchstens 2000 Einträge, 50 MB je Eintrag,
200 MB ausgepackt insgesamt. Pfade mit `..`, `\` oder führendem `/` werden
abgelehnt.
