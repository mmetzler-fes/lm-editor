// Labore: meldet Prüfen und Bild (lab-core.js) bei docspec.js an – wie src/doc/latex.js für Formeln.
// Einmal importieren, wo Dokumente angezeigt werden (app.js); der Server meldet lab-core.js selbst an.

import * as core from './lab-core.js';
import { useLabEngine } from '../doc/docspec.js';

useLabEngine(core);
