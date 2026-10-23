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
- [ ] Styles der Modul-Anzeige aus `styles.css` von LearningModules herauslösen (`src/css/`), App bindet sie ein
- [ ] Gastgeber-Schnittstelle erweitern: Speichern/Laden, Medien, Module, Renderer, Rechte (Lehrkraft/Schüler)
- [ ] Block-IDs auch in LearningModules: beim Speichern vergeben; prüfen, dass der worksheet-renderer das Feld `id` übergeht

### 2 Stift auf der HTML-Ansicht
- [ ] Ansicht mit fester Satzbreite, Verkleinern statt Umbruch, eingebettete Schriften (gleiche Zeilenumbrüche auf allen Geräten)
- [ ] A4 hoch/quer umstellbar (`spec.orientation`); beim Umstellen behalten Striche auf Karos ihre Lage, auf Text nur ungefähr
- [ ] worksheet-renderer: Querformat (Seitenvorlage quer, Kopfzeile breiter)
- [ ] Stift-Ebene je Baustein (Werkzeuge aus dem bisherigen Stift-Editor: Stift, Textmarker, Radierer, Auswahl, Textfelder, gerade Linie, Geodreieck)
- [ ] Striche über Bausteingrenzen (gehören zum Baustein, in dem sie beginnen)
- [ ] Karos ziehbar (Anfasser unten); Schüler-Verlängerung liegt in ihrer Ebene, nicht im Dokument
- [ ] Schalter „Finger bedient / Stift schreibt“, damit eingebettete Quizze bedienbar bleiben
- [ ] in LearningModules: Notizbuch-Vorschau und Schüleransicht nutzen die neue Ebene; der PDF-Weg bleibt, bis alles läuft

### 3 Standalone-Webapp
- [ ] Startseite: neues Dokument, `.zlm` öffnen, zuletzt geöffnet (IndexedDB)
- [ ] Bearbeiten: Dokument-Editor aus LearningModules (`docspec-editor.js`, YAML-Ansicht) übernehmen
- [ ] Speichern: File System Access (Chrome/Edge), sonst Download; automatisches Zwischenspeichern
- [ ] offline über Service Worker, „Zum Home-Bildschirm“ (iPad)
- [ ] Browser-Druck mit Druck-CSS als Rückfall ohne Renderer

### 4 Docker
- [ ] Image `lm-editor`: liefert die Webapp aus, speichert in einem Ordner (`./dokumente`)
- [ ] `docker-compose.yaml` für den PC: lm-editor + worksheet-renderer, nur `localhost`
- [ ] Images auch für `linux/amd64` (Windows-PCs, Intel-Macs) – auch für den worksheet-renderer

### 5 Druck und Export
- [ ] `.zlm` → Renderer-Auftrag (Spec, Bilder, Stift-Ebene als SVG)
- [ ] eingebettete Quizze: Druckfassung je Typ (Multiple Choice, Lückentext, Zuordnen, Wahr/Falsch …), sonst Bild der Vorschau – statt QR-Code
- [ ] Renderer über LearningModules-Konto (Anmelden aus dem Editor, Weiterleitung durch den App-Server, Grenzen je Konto)
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
