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

## Entwickeln

Reine ES-Module ohne Build-Schritt. Tests mit Node 22:

```sh
npm test
```

## Lizenz

AGPL-3.0-or-later. Mitgeliefert: [fflate](https://github.com/101arrowz/fflate) (MIT),
`src/vendor/fflate/`.
