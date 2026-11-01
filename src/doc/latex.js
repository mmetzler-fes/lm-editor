// LaTeX-Formeln: meldet Temml (LaTeX → MathML) bei docspec.js an. Einmal
// importieren, wo Dokumente angezeigt werden (app.js); der Server meldet
// Temml selbst an (src/worksheets/docspec.ts in LearningModules).

import temml from '../vendor/temml/temml.mjs';
import { useTemml } from './docspec.js';

useTemml(temml);
