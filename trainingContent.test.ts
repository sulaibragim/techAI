import { describe, it, expect } from 'vitest';
import { RULE_QUESTIONS, ROLE_PLAYS } from './trainingContent';
import { CALL_SCRIPTS, honestyWarnings } from './callScripts';
import { QUIZ_SHAPE } from './trainingQuiz';

describe('rule questions', () => {
  it('are enough for a fresh draw each attempt, with unique ids', () => {
    expect(RULE_QUESTIONS.length).toBeGreaterThanOrEqual(QUIZ_SHAPE.rules);
    expect(new Set(RULE_QUESTIONS.map(q => q.id)).size).toBe(RULE_QUESTIONS.length);
  });

  it('each has 3–4 distinct answers, one marked right, and says why', () => {
    for (const q of RULE_QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(q.options.length, q.id).toBeLessThanOrEqual(4);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
      expect(q.options[q.correct], q.id).toBeDefined();
      expect(q.why.length, q.id).toBeGreaterThan(10);
    }
  });

  it('the right answer never makes a claim we never make', () => {
    for (const q of RULE_QUESTIONS) expect(honestyWarnings(q.options[q.correct]), `${q.id}: ${q.options[q.correct]}`).toEqual([]);
  });

  it('the right answer is not always in the same place', () => {
    expect(new Set(RULE_QUESTIONS.map(q => q.correct)).size).toBeGreaterThan(1);
  });
});

describe('role-play calls', () => {
  it('there are ten, each on a real script', () => {
    expect(ROLE_PLAYS).toHaveLength(10);
    expect(new Set(ROLE_PLAYS.map(r => r.id)).size).toBe(10);
    for (const r of ROLE_PLAYS) expect(CALL_SCRIPTS[r.script], `${r.id} → ${r.script}`).toBeDefined();
  });

  it('each gives the "client" something to say and the manager a checklist', () => {
    for (const r of ROLE_PLAYS) {
      expect(r.opening.length, r.id).toBeGreaterThan(5);
      expect(r.twists.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.mustDo.length, r.id).toBeGreaterThanOrEqual(4);
      expect(r.traps.length, r.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('nothing the manager is told to do breaks the honesty rules', () => {
    for (const r of ROLE_PLAYS) for (const m of r.mustDo) expect(honestyWarnings(m), `${r.id}: ${m}`).toEqual([]);
  });
});
