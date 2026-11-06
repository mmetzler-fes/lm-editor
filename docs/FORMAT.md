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

`kind`: `worksheet` (Arbeitsblatt), `exam` (Klassenarbeit), `text` oder `module`
(ein Lernmodul ohne Dokument, siehe unten). Programme, die eine Art nicht kennen, lesen
sie als `worksheet`.
`variant` (optional): `student` bei einer Schülerfassung. Sie enthält keine Lösungen und keine Stift-Ebenen,
und das Programm zeigt dafür keine Lampe. Quizze prüfen selbst und haben ihre Antworten weiter in der Datei.
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
  vergibt der Editor eine (`stampBlockIds`): zuerst die Position (`pos3`,
  `pos2x0` für `content[2].blocks[0]`), unter der ältere Striche als `p:3`
  bzw. `p:2.0` gespeichert sind, sonst eine neue zufällige.
- **`orientation`** auf oberster Ebene: `portrait` (A4 hoch, Vorgabe) oder
  `landscape` (A4 quer). Die Satzbreite ist dann 16,5 cm bzw. 25,2 cm.
  Im Dokument-Editor von LearningModules setzt die gewählte Druckvorlage das Feld.
- **Verweise ins Archiv**: `image.src: "media/schaltung.png"` (ebenso
  `group.items[].src` einer Bildgruppe),
  `quiz.module: "<id>"` → `modules/<id>.json`.

## modules/&lt;id&gt;.json

Ein Lernmodul wie in LearningModules:

```json
{ "id": "k3f9a2x1", "type": "multipleChoice", "title": "Kurzquiz Ohm", "content": { … } }
```

## Art `module`: Quiz oder HTML-App ohne Dokument

Ein einzelnes Lernmodul – ein Quiz, eine Übung oder eine HTML-App – lässt sich ohne Dokument als `.zlm`
speichern, z. B. für die Sicherung eines Lernthemas oder zum Weitergeben.

```json
{ "format": "zlm", "version": 1, "kind": "module", "module": "k3f9a2x1", "title": "Kurzquiz Ohm", … }
```

- `manifest.module` nennt das Modul; es liegt wie sonst in `modules/<id>.json`, seine Untermodule
  (`parentId`) daneben. Fehlt es, wird die Datei abgelehnt.
- `document.json` enthält nur den Quiz-Baustein dieses Moduls
  (`{ "spec": { "titel": "…", "content": [{ "type": "quiz", "module": "k3f9a2x1" }] } }`). Ein Programm,
  das die Art nicht kennt, zeigt die Datei so als Dokument mit diesem Quiz.
- **HTML-App:** Die Datei der App liegt in `media/` (z. B. `media/app-3f2a9c1e.html`), im Modul steht statt
  der Kennung auf dem Server `content.app.file: "media/app-3f2a9c1e.html"`.
- Bilder in Quizzen stehen wie bei eingebetteten Modulen als `data:`-Adresse im Modul.

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
- `type: "field"` – ein Feld, das abdeckt, was darunter liegt:
  `{ "type": "field", "x": 300, "y": 120, "w": 160, "h": 90, "pattern": "karo" }`
  (`karo` 5 mm, `linien` 10 mm, `leer` = weiß). Es liegt unter den Strichen.
- `type: "image"` – freies Bild: `{ "type": "image", "x": 40, "y": 20, "w": 200, "h": 100, "src": "data:image/jpeg;base64,…" }`.
- `type: "text"` mit `content` – Textfläche: `{ "type": "text", "x": 40, "y": 20, "w": 300, "h": 120, "content": [Bausteine wie in der Spec] }`.
  Ohne `content` ist es eine kurze Beschriftung mit `text`, `size`, `color`.
- `group` (optional): Elemente mit derselben Kennung bilden eine Gruppe. Eine
  Gruppe gehört als Ganzes zum Baustein, in dem ihr erstes Element beginnt.
- `karoLines`, `karoWidth`, `karoPattern`: In dieser Ebene ist das Schreibfeld
  anders als im Dokument – länger (nie kürzer), breiter oder schmaler (cm; 16,5
  = volle Breite), mit anderem Muster (`karo`, `linien`, `leer`, `frei` = unsichtbar). So kann ein
  Schüler sein Feld anpassen, ohne das Dokument der Lehrkraft zu ändern.
- `inserts` (optional, neben `blocks` in der Ebene): selbst eingefügte
  Schreibfelder (⊕) – `[{ "id": "ins…", "after": "<Baustein> | null", "pattern": "frei" }]`.
  `after: null` = vor dem ersten Baustein. Das Feld ist ein Baustein der Ebene
  mit seiner `id`; Höhe, Breite und Muster stehen wie oben unter `blocks[id]`.
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
