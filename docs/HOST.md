# Gastgeber-Schnittstelle

Die Anzeige der Lernmodule (`src/modules/h5p-renderer.js`) kennt keinen
Server. Was nur der Gastgeber kann, gibt er beim Anlegen mit:

```js
import { H5pRenderer } from './src/modules/h5p-renderer.js';

const renderer = new H5pRenderer({ host });
renderer.renderPreview(mod, typeDef, container, options);
```

Alles in `host` ist freiwillig. Fehlt etwas, entfällt der Knopf bzw. die
Abgabe – so läuft die Anzeige auch ganz ohne Gastgeber (standalone).

`options` reicht der Renderer unverändert an den Gastgeber weiter. Die
Bedeutung von Feldern wie `upload` (Zugang der Schüler) oder `inkEdit`
legt der Gastgeber fest.

## nextButton()

```js
nextButton: () => HTMLButtonElement | null
```

Weiter bzw. Prüfen des Durchlaufs. Der Renderer sperrt ihn, solange eine
Aufgabe unvollständig ist (Karteikarten, Folien, Kopfrechnen), und klickt
ihn bei „Weiter“ im Zuordnen an.

## documentActions(ctx)

```js
documentActions: ({ moduleId, title, content, options }) => Array<{
  label: string,         // Beschriftung, z. B. '⬇ Als PDF'
  title?: string,        // Tooltip
  className?: string,    // zusätzliche Klasse
  primary?: boolean,     // vorne und hervorgehoben
  onClick: () => Promise<void> | void,
}>
```

Knöpfe über einem Dokument. Wirft `onClick` einen Fehler, zeigt der Knopf
„⚠️ Meldung“. `onClick` läuft bis zum ersten `await` noch im Klick und darf
dort ein Fenster öffnen (Popup-Sperre, iPad).

## recording(ctx)

```js
recording: ({ content, moduleId, title, options }) => null | {
  mode: 'run' | 'preview',          // Schüler gibt ab | Probe der Lehrkraft
  upload: (blob) => Promise<{ fileName: string }>,
}
```

Abgabe einer Aufnahme (Modultyp „Audio-Aufnahme“). `null`: Es kann nicht
abgegeben werden, der Knopf meldet das. `upload` wirft bei Fehlern eine
lesbare Meldung.

## In LearningModules

`src/renderer/js/lm-host.js`.
