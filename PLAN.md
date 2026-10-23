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
| Satzbreite | fest (A4-Satzspiegel); auf schmalen Geräten wird verkleinert, nicht umbrochen – so liegen die Striche überall gleich |
| Karos | in der Höhe ziehbar, für Lehrkraft **und** Schüler |
| Code | reine ES-Module ohne Build-Schritt (wie der Renderer von LearningModules) |
| Betrieb | Webapp (offline), Docker (Webapp + worksheet-renderer), später Tauri mit Dateiverknüpfung |
| Druck (.odt/PDF) | über den worksheet-renderer, wenn erreichbar; sonst Browser-Druck |
| Renderer auf öffentlichem Server | nur über ein LearningModules-Konto; der App-Server leitet weiter und behält den Token |
| Dokumente auf dem Server | keine – die Dateien bleiben bei der Lehrkraft |
| Lizenz | AGPL-3.0-or-later (wie LearningModules, von dort wird Code übernommen) |

## Phasen

### 0 Grundlage
- [x] Repository, Lizenz, Arbeitsplan
- [x] Format `.zlm` beschreiben ([docs/FORMAT.md](docs/FORMAT.md))
- [x] `.zlm` lesen und schreiben (`src/zlm/zlm.js`), mit Prüfungen gegen kaputte und bösartige Dateien
- [x] feste Block-IDs (`src/doc/ids.js`)
- [x] Testlauf in GitHub Actions

### 1 Herauslösen aus LearningModules
- [ ] `docspec.js` (Prüfen, Anzeige, StarMath → MathML) übernehmen; LearningModules nutzt danach die Fassung von hier
- [ ] Stift-Geometrie und Geodreieck übernehmen (`ink-geometry.js`, `ink-ruler.js`, mit Tests)
- [ ] Modul-Anzeige (`h5p-renderer.js` und Hilfsdateien) übernehmen; Server-Aufrufe (Audio, Diktat, PDF) laufen über die **Gastgeber-Schnittstelle**
- [ ] Gastgeber-Schnittstelle festlegen: Speichern/Laden, Medien, Module, Renderer, Rechte (Lehrkraft/Schüler)
- [ ] Einbindung in LearningModules (Vorschlag: git submodule unter `src/renderer/lm-editor`, Docker-Build holt ihn mit)
- [ ] Block-IDs auch in LearningModules: beim Speichern vergeben; prüfen, dass der worksheet-renderer das Feld `id` übergeht

### 2 Stift auf der HTML-Ansicht
- [ ] Ansicht mit fester Satzbreite, Verkleinern statt Umbruch, eingebettete Schriften (gleiche Zeilenumbrüche auf allen Geräten)
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

- Schriften: welche frei lizenzierten Schriften passen zur Schulvorlage (Arial → Liberation Sans)?
- Abgabe von Schülern außerhalb der App (Datei zurückgeben) – gewünscht oder nur über LearningModules?
