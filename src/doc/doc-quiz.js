// Quizze im Dokument (Block `quiz`): welche Module ein Dokument einbettet
// und wie ein Durchlauf daraus seine Schritte bildet.
//
// Ohne import und DOM – der Server lädt die Datei für die Tests
// (src/core/browser-module.ts in LearningModules).

/** Module-IDs der Quiz-Blöcke eines Dokuments – auch in Aufgaben, Kästen und Tabellenzellen. */
export function quizIdsOf(mod) {
  let content = mod.content || {};
  if (typeof content === 'string') { try { content = JSON.parse(content); } catch (_) { content = {}; } }
  const out = [];
  const walk = (blocks) => (Array.isArray(blocks) ? blocks : []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'quiz' && b.module) out.push(String(b.module));
    walk(b.blocks);
    if (b.type === 'table') for (const row of [b.header, ...(b.rows || [])]) if (Array.isArray(row)) row.forEach((c) => walk(c?.blocks));
  });
  walk(content.spec?.content);
  return out;
}

/**
 * Schritte eines Durchlaufs. Quizze, die ein Dokument einbettet, laufen dort
 * und nicht noch einmal als eigener Schritt – außer in der Lernbegleitung,
 * die jede Aufgabe einzeln begleitet. `onlyModule`: nur dieses eine Modul
 * (QR-Code eines Quiz im gedruckten Dokument).
 */
export function planRun(modules, { companion = false, onlyModule = null } = {}) {
  const only = onlyModule && modules.find((m) => m.id === onlyModule);
  if (companion && !only) return { steps: modules, embedded: new Map() };
  const byId = new Map(modules.map((m) => [m.id, m]));
  const embedded = new Map();
  // Ein einzelnes Dokument (Link aus OneNote) bringt seine Quizze mit.
  for (const doc of (only ? [only] : modules).filter((m) => m.type === 'document')) {
    for (const id of quizIdsOf(doc)) {
      const m = byId.get(id);
      if (m && m.id !== doc.id && m.type !== 'document' && (m._topicId ?? null) === (doc._topicId ?? null)) embedded.set(id, m);
    }
  }
  return { steps: only ? [only] : modules.filter((m) => !embedded.has(m.id)), embedded };
}

/**
 * Für den Baum eines Lernthemas: Welche Quizze liegen in welchen Dokumenten? `modules`:
 * Module einer Ebene, `idsOf(doc)`: die IDs seiner Quiz-Blöcke in Reihenfolge.
 * Ergebnis: `top` (alle, die in keinem Dokument liegen), `quizzesOf` (Dokument-ID → Module),
 * `docsOf` (Quiz-ID → Dokumente). Ein Quiz kann in mehreren Dokumenten stehen.
 */
export function nestEmbedded(modules, idsOf = (m) => m.quizIds || []) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const quizzesOf = new Map();
  const docsOf = new Map();
  for (const doc of modules.filter((m) => m.type === 'document')) {
    const quizzes = [...new Set(idsOf(doc))].map((id) => byId.get(id)).filter((m) => m && m.type !== 'document');
    if (!quizzes.length) continue;
    quizzesOf.set(doc.id, quizzes);
    for (const q of quizzes) docsOf.set(q.id, [...(docsOf.get(q.id) || []), doc]);
  }
  return { top: modules.filter((m) => !docsOf.has(m.id)), quizzesOf, docsOf };
}
