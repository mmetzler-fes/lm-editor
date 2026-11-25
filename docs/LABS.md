# Labore im Dokument

Ein Labor ist ein Baustein im Dokument, in dem Schüler selbst etwas aufbauen:

```json
{ "type": "lab", "lab": "zeiger", "preset": { … } }
```

Ohne `preset` gilt die Grundeinstellung des Labors. Ein Eintrag mit `locked: true` ist für Schüler fest.
Im Druck erscheint das Bild der Vorgabe.

| `lab`       | Was                                   | Vorgabe (Auszug) |
|-------------|---------------------------------------|------------------|
| `zeiger`    | Zeigerdiagramm mit komplexen Zahlen   | `items: [{ id, name, unit, value: [re, im] \| expr, x0, y0 \| anchor, color, width: f\|m\|d, show }]`, `scales: { V: 2 }` (Wert je cm), `xmin … ymax` (cm) |
| `bode`      | Amplituden- und Phasengang            | `params: [{ name, value }]`, `curves: [{ name, expr }]`, `fmin`, `fmax`, `dbmin`, `dbmax`, `phase` |
| `ortskurve` | Ortskurve in der komplexen Ebene      | `params`, `curves`, `var` (Laufparameter), `from`, `to`, `log`, `unit`, `cursor` |
| `logik`     | Logikschaltung nach DIN EN 60617      | `parts: [{ id, type: in\|out\|and\|or\|not\|nand\|nor\|xor\|xnor, x, y, n, label }]`, `wires: [{ from, to, pin }]`, `lockAll` |

Formeln (alle Labore): `3 + j4`, `5∠30°`, `10k`, `4,7µ`, `R || X` (parallel), `abs`, `arg` (Grad), `conj`,
`re`, `im`, `sqrt`, `exp`, `ln`, `lg`, `sin`/`cos`/`tan` (Grad), `polar(r; φ)`, `par(a; b)`, `db(x)`;
Bode/Ortskurve zusätzlich `f`, `w` (= ω) und `s` (= jω).

## Dateien

- `src/labs/lab-core.js` – Rechnen und Zeichnen (SVG), **ohne import und ohne DOM**: Der Server von
  LearningModules lädt dieselbe Datei für Prüfung und Druck (`src/worksheets/docspec.ts`).
- `src/labs/labs.js` – Anmeldung, Aufbau im Blatt (`mountLabs`), Stand je Gerät, Vorgabe-Dialog (`openLabDialog`).
- `src/labs/zeiger-ui.js`, `curves-ui.js` (Bode, Ortskurve), `logik-ui.js` – die Bedienung.
- `src/labs/register.js` – meldet `lab-core.js` bei `docspec.js` an (wie `src/doc/latex.js`).

## Ein weiteres Labor anmelden

```js
import { registerLab } from './src/labs/labs.js';
registerLab('mein-labor', () => import('./mein-labor.js'));
```

Das Modul exportiert:

```js
export function mount(el, { state, mode, onChange, say }) {
  // state:   wirksamer Stand (Vorgabe + Schülerstand)
  // mode:    'teacher' (Vorgabe bearbeiten, 🔒 festlegen) oder 'student'
  // onChange(state) nach jeder Änderung – gespeichert wird außerhalb
  // say(text): kurze Meldung in der Labor-Leiste
  return { getState() { … }, setState(s) { … }, destroy() { … } };
}
```

Für Druck und Prüfung braucht ein neues Labor außerdem einen Eintrag in `lab-core.js` (`LABS`, `labDefault`,
`labSvg`, `labValidate`). Fremder Code von außen gehört künftig in einen abgeschotteten Rahmen (wie HTML-Apps)
mit derselben Schnittstelle über Nachrichten – noch nicht gebaut.

## Speichern

- Durchlauf, Vorschau, Notizbuch: je Gerät (`localStorage`, Schlüssel `lm_lab:<Modul>:<Block-ID>`).
- Stift-Editor: mit der Beschriftung (`forms["lab:<Schlüssel>"]`, `form-state.js` in LearningModules) – also
  bei der Lehrkraft, wenn der Schüler über seinen Link arbeitet.
- `➕ Aufs Blatt` (nur im Stift-Editor) legt das aktuelle Bild als freies Bild aufs Blatt.
