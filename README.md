# lm-editor

Dokument-Editor für Lehrkräfte: Arbeitsblätter, Klassenarbeiten und Texte mit
Karos, Bildern, Formeln, eingebetteten Lernmodulen (Quizze) und einer
Stift-Ebene für iPad, Finger und Maus. Gespeichert wird als **`.zlm`**,
ausgegeben als .odt und PDF.

Der Editor läuft ohne Konto und ohne Administration:

- als **Webapp**, auch offline,
- im **Docker**-Container auf dem PC, zusammen mit dem
  [worksheet-renderer](https://github.com/mmetzler-fes/LearningModules/tree/master/worksheet-renderer)
  für die Druckausgabe,
- später als **App** (Tauri) mit Dateiverknüpfung.

Dieselbe Einheit nutzt [LearningModules](https://github.com/mmetzler-fes/LearningModules)
in der Notizbuch-Vorschau und für Schüler über den Link.

> **Stand:** am Anfang. Was wann kommt, steht im [Arbeitsplan](PLAN.md),
> das Dateiformat in [docs/FORMAT.md](docs/FORMAT.md).

## Ausprobieren

Node 22 genügt, keine weiteren Pakete:

```sh
npm start              # http://localhost:5180
npm start -- --lan     # auch im Netz, z. B. fürs iPad: http://<IP des Rechners>:5180
```

Auf der Startseite: **✨ Beispiel** öffnet ein Arbeitsblatt mit Karos, Formel
und zwei Quizzen, **▦ Neues Karoblatt** ein leeres Blatt, **📂 .zlm öffnen**
eine Datei (oder sie auf die Seite ziehen): eine `.zlm`, ein Writer-Dokument
(`.odt`, wird zu Bausteinen) oder ein PDF (wird zu Bildern seiner Seiten) –
Übernommenes speichert der Editor als neue `.zlm`. Im Editor schreibt der Stift, der
Finger scrollt und bedient die Quizze; **💾 Speichern** schreibt die `.zlm`.
Jede Änderung bleibt außerdem als Entwurf im Browser (**Zuletzt geöffnet**).
**🖨** druckt das Blatt oder speichert es als PDF – Arbeits- oder Lösungsblatt,
mit oder ohne Beschriftung.

Das Dokument selbst bearbeiten (Text, Bausteine) geht noch nicht – das kommt
mit dem Dokument-Editor aus LearningModules.

## Entwickeln

Reine ES-Module ohne Build-Schritt. Tests mit Node 22:

```sh
npm test
npm run css            # src/css/modules.css aus styles.css von LearningModules neu erzeugen
```

`src/css/modules.css` ist erzeugt (Styles der Anzeige von Dokument und
Quizzen) – Änderungen in LearningModules machen und neu erzeugen.

## Lizenz

AGPL-3.0-or-later. Mitgeliefert: [fflate](https://github.com/101arrowz/fflate) (MIT),
`src/vendor/fflate/`.
