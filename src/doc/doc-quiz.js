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
 * (QR-Code eines Quiz im gedruckten Dokument) oder mehrere, mit Komma getrennt.
 */
export function planRun(modules, { companion = false, onlyModule = null } = {}) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  // `onlyModule` darf auch mehrere IDs mit Komma tragen (Quiz-Seite aus OneNote).
  const only = onlyModule ? String(onlyModule).split(',').map((id) => byId.get(id)).filter(Boolean) : [];
  if (companion && !only.length) return { steps: modules, embedded: new Map() };
  const embedded = new Map();
  // Ein einzelnes Dokument (Link aus OneNote) bringt seine Quizze mit.
  for (const doc of (only.length ? only : modules).filter((m) => m.type === 'document')) {
    for (const id of quizIdsOf(doc)) {
      const m = byId.get(id);
      if (m && m.id !== doc.id && m.type !== 'document' && (m._topicId ?? null) === (doc._topicId ?? null)) embedded.set(id, m);
    }
  }
  return { steps: (only.length ? only : modules).filter((m) => !embedded.has(m.id)), embedded };
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

const validPoints = (p) => (typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null);

/**
 * Punkte der Aufgaben eines Dokuments: `points` an task/subtask gilt für die Quizze der Aufgabe –
 * darin verschachtelt oder (wie nach dem Editor) als Geschwister bis zur nächsten Überschrift.
 * Eine Teilaufgabe mit eigenen Punkten hat ihre eigenen, sonst die der Aufgabe.
 * Ergebnis: `byModule` (Quiz-ID → { key, points }), `tasks` (nur Aufgaben mit Quiz).
 */
export function taskPointsOf(doc) {
  let content = doc?.content || {};
  if (typeof content === 'string') { try { content = JSON.parse(content); } catch (_) { content = {}; } }
  const byModule = new Map();
  const tasks = new Map();
  let n = 0;
  const own = (b) => {
    const points = validPoints(b.points);
    return points ? { key: `${doc?.id || ''}#${n++}`, points } : null;
  };
  const walk = (blocks, inherited, taskCtx) => {
    let local = inherited;
    let task = taskCtx;
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'section') { local = inherited; task = taskCtx; } else if (b.type === 'task') { task = own(b) || inherited; local = task; } else if (b.type === 'subtask') local = own(b) || task;
      if (b.type === 'quiz' && b.module && local) {
        byModule.set(String(b.module), local);
        tasks.set(local.key, local);
      }
      walk(b.blocks, local, task);
      if (b.type === 'table') for (const row of [b.header, ...(b.rows || [])]) if (Array.isArray(row)) row.forEach((c) => walk(c?.blocks, local, task));
    }
  };
  walk(content.spec?.content, null, null);
  return { byModule, tasks: [...tasks.values()] };
}

/**
 * Punkte eines Durchlaufs. `answers`: bewertete Antworten ({ moduleId, points? 0–1, isCorrect });
 * `docs`: Dokumente des Durchlaufs. Quizze in einer Aufgabe mit Punkten teilen sich deren Punkte
 * zu gleichen Teilen (z. B. jede Wahr/Falsch-Aussage), jedes übrige zählt 1. Je Aufgabe mit Punkten
 * wird auf halbe Punkte abgerundet (3,33 → 3).
 * → { score, total, each } (Punkte auf zwei Stellen gerundet); `each[i]`: { earned, max } der Antwort i –
 * bei einer Aufgabe mit mehreren Teilen ihr Anteil, ungerundet.
 */
export function scoreRun(answers, docs = []) {
  const byModule = new Map();
  const tasks = new Map();
  for (const d of docs) {
    const t = taskPointsOf(d);
    t.byModule.forEach((v, k) => byModule.set(k, v));
    t.tasks.forEach((v) => tasks.set(v.key, { ...v, values: [] }));
  }
  const round = (x) => Math.round(x * 100) / 100;
  let score = 0;
  let total = 0;
  const each = (answers || []).map((a) => {
    // „Wörter ziehen“ zählte früher nur ganz richtig (ohne `score`); sein Anteil (`percent`) stand aber schon im Ergebnis.
    const old = a?.moduleType === 'dragTheWords' && typeof a.percent === 'number' && a.score === undefined;
    const raw = old ? a.percent / 100 : a?.points ?? (a?.isCorrect ? 1 : 0);
    const v = Math.min(1, Math.max(0, raw));
    const task = a?.moduleId ? tasks.get(byModule.get(String(a.moduleId))?.key) : null;
    if (task) { task.values.push(v); return { task, v }; }
    score += v;
    total += 1;
    return { earned: round(v), max: 1 };
  });
  const halfDown = (x) => Math.floor(x * 2 + 1e-9) / 2;
  for (const t of tasks.values()) {
    total += t.points;
    if (t.values.length) score += halfDown(t.points * (t.values.reduce((s, v) => s + v, 0) / t.values.length));
  }
  return {
    score: round(score),
    total: round(total),
    each: each.map((e) => {
      if (!e.task) return e;
      // Ein Teil allein bekommt die gerundeten Punkte der Aufgabe, mehrere ihren Anteil.
      const n = e.task.values.length;
      return { earned: n === 1 ? halfDown(e.v * e.task.points) : round((e.v * e.task.points) / n), max: round(e.task.points / n) };
    }),
  };
}
