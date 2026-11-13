import { describe, it, expect } from './expect.js';
import { nestEmbedded, quizIdsOf, planRun, taskPointsOf, scoreRun } from '../src/doc/doc-quiz.js';

const doc = (id, content, topic = 't1') => ({ id, type: 'document', _topicId: topic, content: { spec: { content } } });
const quiz = (id, topic = 't1') => ({ id, type: 'multipleChoice', _topicId: topic, content: {} });

describe('Quiz im Dokument', () => {
  it('findet Quiz-Blöcke auch in Aufgaben und Kästen', () => {
    const d = doc('d', [{ type: 'quiz', module: 'q1' }, { type: 'task', title: 'A', blocks: [{ type: 'box', blocks: [{ type: 'quiz', module: 'q2' }] }] }]);
    expect(quizIdsOf(d)).toEqual(['q1', 'q2']);
    expect(quizIdsOf({ id: 'x', type: 'document', content: JSON.stringify(d.content) })).toEqual(['q1', 'q2']);
  });

  it('nimmt eingebettete Quizze aus den Schritten', () => {
    const { steps, embedded } = planRun([doc('d', [{ type: 'quiz', module: 'q1' }]), quiz('q1'), quiz('q2')]);
    expect(steps.map((m) => m.id)).toEqual(['d', 'q2']);
    expect([...embedded.keys()]).toEqual(['q1']);
  });

  it('bettet nichts aus einem anderen Lernthema, kein Dokument und kein fehlendes Modul ein', () => {
    const { steps, embedded } = planRun([doc('d', [{ type: 'quiz', module: 'q1' }, { type: 'quiz', module: 'd2' }, { type: 'quiz', module: 'weg' }]), quiz('q1', 't2'), doc('d2', [])]);
    expect(steps.map((m) => m.id)).toEqual(['d', 'q1', 'd2']);
    expect(embedded.size).toBe(0);
  });

  it('Lernbegleitung: jedes Quiz bleibt ein eigener Schritt', () => {
    const { steps, embedded } = planRun([doc('d', [{ type: 'quiz', module: 'q1' }]), quiz('q1')], { companion: true });
    expect(steps.map((m) => m.id)).toEqual(['d', 'q1']);
    expect(embedded.size).toBe(0);
  });

  it('QR-Code im Druck: nur dieses eine Modul', () => {
    const { steps } = planRun([doc('d', [{ type: 'quiz', module: 'q1' }]), quiz('q1')], { onlyModule: 'q1' });
    expect(steps.map((m) => m.id)).toEqual(['q1']);
    expect(planRun([quiz('q2')], { onlyModule: 'weg' }).steps.map((m) => m.id)).toEqual(['q2']);
  });

  it('Link auf ein Dokument (OneNote): seine Quizze laufen darin mit', () => {
    const { steps, embedded } = planRun([doc('d', [{ type: 'quiz', module: 'q1' }]), quiz('q1'), quiz('q2')], { onlyModule: 'd' });
    expect(steps.map((m) => m.id)).toEqual(['d']);
    expect([...embedded.keys()]).toEqual(['q1']);
  });

  it('Mehrere IDs mit Komma (Quiz-Seite aus OneNote): nur diese, in dieser Reihenfolge', () => {
    const mods = [doc('d', [{ type: 'quiz', module: 'q1' }]), quiz('q1'), quiz('q2'), quiz('q3')];
    expect(planRun(mods, { onlyModule: 'q3,q2' }).steps.map((m) => m.id)).toEqual(['q3', 'q2']);
    expect(planRun(mods, { onlyModule: 'q2,weg' }).steps.map((m) => m.id)).toEqual(['q2']);
  });
});

describe('Quizze im Baum (nestEmbedded)', () => {
  const m = (id, type = 'multipleChoice', quizIds) => ({ id, type, ...(quizIds ? { quizIds } : {}) });
  it('rückt eingebettete unter ihr Dokument, in dessen Reihenfolge; der Rest bleibt', () => {
    const { top, quizzesOf, docsOf } = nestEmbedded([m('a'), m('d', 'document', ['c', 'a']), m('b'), m('c')]);
    expect(top.map((x) => x.id)).toEqual(['d', 'b']);
    expect(quizzesOf.get('d').map((x) => x.id)).toEqual(['c', 'a']);
    expect(docsOf.get('a').map((x) => x.id)).toEqual(['d']);
  });
  it('ein Quiz in zwei Dokumenten steht unter beiden, doppelte Blöcke einmal', () => {
    const { top, quizzesOf, docsOf } = nestEmbedded([m('d1', 'document', ['q', 'q']), m('d2', 'document', ['q']), m('q')]);
    expect(top.map((x) => x.id)).toEqual(['d1', 'd2']);
    expect(quizzesOf.get('d1').length).toBe(1);
    expect(docsOf.get('q').map((x) => x.id)).toEqual(['d1', 'd2']);
  });
  it('fehlende Module, Dokumente im Dokument und Selbstverweise bleiben außen vor', () => {
    const { top, quizzesOf } = nestEmbedded([m('d', 'document', ['weg', 'd', 'e']), m('e', 'document', [])]);
    expect(top.map((x) => x.id)).toEqual(['d', 'e']);
    expect(quizzesOf.size).toBe(0);
  });
  it('findet Quizze auch in Tabellenzellen', () => {
    const d = doc('d', [{ type: 'table', header: [{ text: 'k', blocks: [{ type: 'quiz', module: 'q1' }] }], rows: [['a', { blocks: [{ type: 'quiz', module: 'q2' }] }]] }]);
    expect(quizIdsOf(d)).toEqual(['q1', 'q2']);
  });
});

describe('Punkte der Aufgaben (scoreRun)', () => {
  const ka = doc('ka', [
    { type: 'task', title: 'A', points: 6, blocks: [{ type: 'quiz', module: 'q1' }] },
    { type: 'task', title: 'B', points: 2 },
    { type: 'quiz', module: 'tf' },
    { type: 'subtask', title: 'B1', points: 3 },
    { type: 'quiz', module: 'q3' },
    { type: 'section', title: 'Ohne' },
    { type: 'quiz', module: 'q4' },
  ]);

  it('Aufgabenpunkte, auch nach Überschrift; Teilaufgabe mit eigenen; ohne Aufgabe zählt 1', () => {
    const { byModule } = taskPointsOf(ka);
    expect(byModule.get('q1').points).toBe(6);
    expect(byModule.get('tf').points).toBe(2);
    expect(byModule.get('q3').points).toBe(3);
    expect(byModule.has('q4')).toBe(false);
  });

  it('Teile teilen sich die Punkte, Teilpunkte zählen anteilig', () => {
    const answers = [
      { moduleId: 'q1', points: 0.5 },
      { moduleId: 'tf', isCorrect: true }, { moduleId: 'tf', isCorrect: false }, { moduleId: 'tf', isCorrect: true }, { moduleId: 'tf', isCorrect: true },
      { moduleId: 'q3', isCorrect: true },
      { moduleId: 'q4', isCorrect: true },
    ];
    expect(scoreRun(answers, [ka])).toEqual({ score: 3 + 1.5 + 3 + 1, total: 6 + 2 + 3 + 1 });
  });

  it('fehlende Antwort: Punkte zählen zur Höchstzahl; ohne Punkte wie bisher je Frage 1', () => {
    expect(scoreRun([{ moduleId: 'q1', isCorrect: true }], [ka])).toEqual({ score: 6, total: 11 });
    expect(scoreRun([{ moduleId: 'x', isCorrect: true }, { moduleId: 'y', points: 0.25 }])).toEqual({ score: 1.25, total: 2 });
  });
});
