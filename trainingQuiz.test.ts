import { describe, it, expect } from 'vitest';
import { buildQuiz, priceQuestion, rekeyQuestion, zoneQuestion, quotedRates, QUIZ_SHAPE, RuleQ } from './trainingQuiz';
import { CALL_SCRIPTS } from './callScripts';
import { ServiceRate } from './types';

// A repeatable "random" so a failing quiz can be replayed.
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const book: ServiceRate[] = [
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 150, type: 'service_call' },
  { id: 'r-rekey', name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor' },
];
const carLockout = CALL_SCRIPTS['car-lockout'].rates[0];
const transponder = CALL_SCRIPTS['car-key'].rates.find(r => r.id === 'r-transponder')!;

const rules: RuleQ[] = Array.from({ length: 16 }, (_, i) => ({
  id: `rule-${i}`, q: `Question ${i}?`, options: [`right ${i}`, `wrong a${i}`, `wrong b${i}`, `wrong c${i}`], correct: 0, why: 'because',
}));

describe('price questions', () => {
  it('quote the live price book, by day and after 8PM', () => {
    const d = priceQuestion(carLockout, book, false, seeded(1));
    expect(d.options[d.correct]).toBe('$150');
    const n = priceQuestion(carLockout, book, true, seeded(2));
    expect(n.options[n.correct]).toBe('$210');
    expect(n.options).toContain('$150'); // the day/night mix-up is always on offer
  });

  it('say "from" for starting prices', () => {
    const q = priceQuestion(transponder, [], false, seeded(3));
    expect(q.options[q.correct]).toBe('from $149');
  });

  it('count rekey doors, with the night surcharge once per order', () => {
    const d = rekeyQuestion(book, 3, false, seeded(4));
    expect(d.options[d.correct]).toBe('$247');
    const n = rekeyQuestion(book, 3, true, seeded(5));
    expect(n.options[n.correct]).toBe('$307');
  });
});

describe('zone questions', () => {
  it('go in our cities, check the 30-minute rule elsewhere', () => {
    const inside = zoneQuestion('Gilbert', seeded(6));
    expect(inside.options[inside.correct]).toMatch(/^Едем/);
    const outside = zoneQuestion('Glendale', seeded(7));
    expect(outside.options[outside.correct]).toMatch(/30 минут/);
  });
});

describe('buildQuiz', () => {
  it('has the agreed shape, four distinct answers each, the right one marked', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const quiz = buildQuiz(book, rules, seeded(seed));
      expect(quiz).toHaveLength(QUIZ_SHAPE.prices + QUIZ_SHAPE.rekey + QUIZ_SHAPE.inArea + QUIZ_SHAPE.outOfArea + QUIZ_SHAPE.rules);
      expect(new Set(quiz.map(q => q.id)).size, `seed ${seed}`).toBe(quiz.length);
      for (const q of quiz) {
        expect(q.options.length, q.id).toBe(4);
        expect(new Set(q.options).size, q.id).toBe(4);
        expect(q.correct, q.id).toBeGreaterThanOrEqual(0);
      }
      for (const q of quiz.filter(q => q.kind === 'rule')) expect(q.options[q.correct]).toMatch(/^right/);
    }
  });

  it('draws from every rate the scripts quote', () => {
    expect(quotedRates().map(r => r.id)).toEqual(expect.arrayContaining(['r-car-lockout', 'r-car-key', 'r-key-extraction', 'r-all-keys-lost']));
  });
});
