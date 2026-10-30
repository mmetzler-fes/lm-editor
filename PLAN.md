# Arbeitsplan lm-editor

Stand: 23.10.2026. Abgehakte Punkte sind erledigt und im Repository.

## Ziel

Ein Dokument-Editor für Lehrkräfte: Arbeitsblätter, Klassenarbeiten und Texte
mit Karos, Bildern, Formeln, **eingebetteten Lernmodulen** (Quizze) und einer
**Stift-Ebene** (iPad, Finger, Maus). Gespeichert wird als `.zlm` (ZIP),
ausgegeben als .odt und PDF.

Der Editor ist ohne Konto und ohne Administration nützlich und lässt sich
deshalb leicht weitergeben. Dieselbe Einheit läuft in LearningModules
(Notizbuch-Vorschau, Schüler über den Link). Dort sehen Schüler die `.zlm`
nie, sie ist nur das Datenmodell darunter.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Zielgruppe | zuerst die Lehrkraft; Schüler nutzen die Einheit über LearningModules |
| Stift | direkt auf der HTML-Ansicht, kein PDF als Hintergrund |
| Lage der Striche | an Bausteinen verankert (feste Block-IDs), Koordinaten in Punkten relativ zum Baustein |
| Satzbreite | fest (A4-Satzspiegel, hoch oder quer umstellbar); auf schmalen Geräten wird verkleinert, nicht umbrochen – so liegen die Striche überall gleich |
| Karos | in der Höhe ziehbar, für Lehrkraft **und** Schüler |
| Code | reine ES-Module ohne Build-Schritt (wie der Renderer von LearningModules) |
| Betrieb | Webapp (offline), Docker (Webapp + worksheet-renderer), später Tauri mit Dateiverknüpfung |
| Druck (.odt/PDF) | über den worksheet-renderer, wenn erreichbar; sonst Browser-Druck |
| Renderer auf öffentlichem Server | nur über ein LearningModules-Konto; der App-Server leitet weiter und behält den Token |
| Dokumente auf dem Server | keine – die Dateien bleiben bei der Lehrkraft |
| Schriften | Liberation Sans, Serif, Mono (SIL OFL) – maßgleich mit Arial, Times New Roman, Courier New der Schulvorlage; mitgeliefert |
| Lizenz | AGPL-3.0-or-later (wie LearningModules, von dort wird Code übernommen) |

## Phasen

### 0 Grundlage
- [x] Repository, Lizenz, Arbeitsplan
- [x] Format `.zlm` beschreiben ([docs/FORMAT.md](docs/FORMAT.md))
- [x] `.zlm` lesen und schreiben (`src/zlm/zlm.js`), mit Prüfungen gegen kaputte und bösartige Dateien
- [x] feste Block-IDs (`src/doc/ids.js`)
- [x] Testlauf in GitHub Actions

### 1 Herauslösen aus LearningModules
- [x] `docspec.js` (Prüfen, Anzeige, StarMath → MathML) und `doc-quiz.js` übernehmen, mit Tests; LearningModules nutzt die Fassung von hier
- [x] Stift-Geometrie und Geodreieck übernehmen (`ink-geometry.js`, `ink-ruler.js`, mit Tests)
- [x] Modul-Anzeige (`h5p-renderer.js` und 7 Hilfsdateien) und die gemeinsamen Hilfsfunktionen (`src/util/dom.js`) übernehmen, mit Tests für Formeln und Rätsel
- [x] Gastgeber-Schnittstelle für die Anzeige ([docs/HOST.md](docs/HOST.md)): Weiter-Knopf, Knöpfe am Dokument, Abgabe von Aufnahmen
- [x] Einbindung in LearningModules: git submodule unter `src/renderer/lm-editor`, Docker-Build holt ihn mit; `js/lm-host.js` ist der Gastgeber
- [ ] Gastgeber-Schnittstelle erweitern: Speichern/Laden, Medien, Module, Renderer, Rechte (Lehrkraft/Schüler)
- [x] Stift-Editor (`src/ink/ink-editor.js`), pdf.js und seine Styles (`src/css/ink.css`) übernommen
- [x] geprüft: der worksheet-renderer übergeht `id` und `orientation` (.odt bis auf Bildnamen gleich)
- [x] Block-IDs auch in LearningModules: der Dokument-Editor vergibt sie beim Öffnen (nach der Position) und trägt sie als `data-id` durch seine HTML-Ansicht; der Server ergänzt fehlende beim Speichern

### 2 Stift auf der HTML-Ansicht
- [x] Hintergrund „Dokument“: A4-Blatt mit Satzspiegel der Schulvorlage (`src/css/paper.css`), feste Breite, Verkleinern statt Umbruch, Liberation-Schriften mitgeliefert (`src/fonts/`, OFL)
- [x] Stift-Ebene je Baustein: alle Werkzeuge des bisherigen Editors; ein Strich gehört zum Baustein, in dem er beginnt; Lage wird neu gemessen, wenn sich das Blatt ändert (ResizeObserver)
- [x] Karos ziehbar (Anfasser unten, 0,5-cm-Schritte, nie kürzer als im Dokument); die Länge liegt in der Ebene, nicht im Dokument; Rückgängig inklusive
- [x] Werkzeug „Bedienen“; der Finger bedient, solange er nicht zeichnet – eingebettete Quizze bleiben benutzbar
- [x] in LearningModules: Notizbuch-Vorschau und Schüleransicht öffnen das Dokument; PDF bleibt als Hintergrund wählbar
- [x] A4 quer in der Ansicht (`spec.orientation: landscape`)
- [ ] A4 hoch/quer im Dokument-Editor umschalten
- [ ] worksheet-renderer: Querformat (Seitenvorlage quer, Kopfzeile breiter)
- [ ] Seitenumbrüche im Blatt anzeigen (wo der Druck umbricht)
- [x] Schreibfeld (Block `karo`): Breite (`width`) und Muster (`pattern`: Karo, Linien, leer) – im Renderer, in der Anzeige, im Dokument-Editor von LearningModules und im Stift-Editor (Anfasser rechts/Ecke, Umschalter beim Auswählen)
- [x] Auswahl: Kopieren, Ausschneiden, Einfügen, Duplizieren, Gruppieren/Aufheben – Tastenkürzel, Kontextmenü (Rechtsklick, langes Drücken, Knopf ⋯)
- [x] Werkzeug „Feld“: Rechteck aufziehen, deckt ab (Karo, Linien, weiß) – z. B. auf PDF-Seiten; Ecken ziehen, kopieren, gruppieren
- [x] Übernehmen: ausgeblendeter Text der .odt (Lösungen im Arbeitsblatt) wird ein Lösungs-Baustein statt sichtbarer Text – in `odt.ts` (LearningModules) und `src/import/odt.js` gleich, Abgleich mit `tools/sync-odt.sh`
- [x] Übernehmen: leere Tabellen (so schreibt der Renderer Karos in die .odt) werden wieder Schreibfelder, Tabellen mit einer Zelle wieder Kästen

### 3 Standalone-Webapp
- [x] Styles der Anzeige: `src/css/modules.css`, erzeugt aus `styles.css` von LearningModules (`npm run css`, Regeln in ihrer Reihenfolge); die App behält vorerst ihre `styles.css`
- [ ] Umdrehen: LearningModules bindet `modules.css` ein und streicht die Regeln aus `styles.css` (vorher/nachher per berechneter Styles vergleichen)
- [x] Startseite (`index.html`, `src/app/`): `.zlm` öffnen (auch per Ziehen), Beispiel, neues Karoblatt, zuletzt geöffnet (Entwürfe in IndexedDB)
- [x] Server ohne Abhängigkeiten: `npm start` → Port 5180, `--lan` fürs iPad
- [x] Speichern: File System Access (Chrome/Edge, gleiche Datei), sonst Download; jede Änderung als Entwurf im Browser
- [x] Stift-Editor: Optionen `store`, `actions`, `onClose`; Ebene in der Datei mit dem Stand des Editors (`editor`)
- [ ] Bearbeiten: Dokument-Editor aus LearningModules (`docspec-editor.js`, YAML-Ansicht) übernehmen
- [ ] Bilder aus `media/` einfügen (bisher nur anzeigen)
- [x] Übernehmen ohne Server: `.odt` (Leser aus LearningModules nach `src/import/odt.js` übertragen, gleiche Ergebnisse geprüft; `docspec-html.js` liegt jetzt hier) und `.pdf` als Bilder der Seiten (pdf.js, weißer Rand abgeschnitten); Bilder nach `media/`; Hinweise, was nicht mitkam; gespeichert wird als neue `.zlm`
- [ ] LearningModules liest `.odt` ebenfalls mit `src/import/odt.js` im Browser (der Server wandelt nur noch .docx um) – dann entfällt `odt.ts`
- [x] installierbare Web-App (manifest.webmanifest, „Öffnen mit“ für .zlm/.odt/.odp/.odg/.pdf über launchQueue), offline über Service Worker (sw.js: online immer aktuell, ohne Netz aus dem Cache), veröffentlicht über GitHub Pages (.github/workflows/pages.yml)
- [ ] Browser-Druck mit Druck-CSS als Rückfall ohne Renderer

### 4 Docker
- [ ] Image `lm-editor`: liefert die Webapp aus, speichert in einem Ordner (`./dokumente`)
- [ ] `docker-compose.yaml` für den PC: lm-editor + worksheet-renderer, nur `localhost`
- [ ] Images auch für `linux/amd64` (Windows-PCs, Intel-Macs) – auch für den worksheet-renderer

### 5 Druck und Export
- [x] Drucken/PDF im Browser (🖨): Arbeits- oder Lösungsblatt, mit oder ohne Beschriftung; Ränder wie die Schulvorlage auf jeder Seite, Seitenumbrüche aus dem Dokument, Felder/Bilder/Formeln werden nicht zerrissen, Beschriftung je Baustein als Vektorgrafik
- [ ] Druckfassung je Quiztyp (bisher: das Quiz, wie es gerade aussieht – bei Richtig/Falsch nur die erste Frage)
- [ ] `.zlm` → Renderer-Auftrag (Spec, Bilder, Stift-Ebene als SVG)
- [ ] eingebettete Quizze: Druckfassung je Typ (Multiple Choice, Lückentext, Zuordnen, Wahr/Falsch …), sonst Bild der Vorschau – statt QR-Code
- [ ] Renderer über LearningModules-Konto (Anmelden aus dem Editor, Weiterleitung durch den App-Server, Grenzen je Konto)
- [ ] Übernehmen mit Renderer: `.pdf` mit Text und Struktur (pdf_import.py, wahlweise KI-Erkennung) und `.docx` (LibreOffice) – dieselbe Auswahl wie in LearningModules
- [ ] Zwischenspeicher: gleicher Auftrag wird nicht zweimal gerendert

### 6 Lernmodule im Editor
- [ ] Modul-Editoren (`content-editors.js` u. a.) übernehmen
- [ ] Module aus `.h5p` und LearningModules-Export importieren
- [ ] Schülerfassung ohne Lösungen (für die Weitergabe als Datei)

### 7 Austausch mit LearningModules
- [ ] `.zlm` in LearningModules importieren (Dokument + Module ins Lernthema)
- [ ] Dokument aus LearningModules als `.zlm` exportieren

### 8 Tauri
- [ ] Hülle mit Dateiverknüpfung `.zlm` (Windows, macOS, Linux)
- [ ] prüfen: Stiftdruck unter Linux (WebKitGTK), iPad nur über App Store/MDM

## Offene Fragen

- Abgabe von Schülern außerhalb der App (Datei zurückgeben) – gewünscht oder nur über LearningModules?
