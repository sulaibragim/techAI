import { describe, it, expect } from 'vitest';
import { SCORECARD, scoreCall, reviewComplete, deskTrend, reviewsRu, Score } from './scorecard';

const all = (s: Score) => SCORECARD.map(() => s);
const safety = SCORECARD.findIndex(i => i.id === 'safety');
const price = SCORECARD.findIndex(i => i.id === 'price');

describe('scoreCall', () => {
  it('a clean call passes at 100%', () => {
    expect(scoreCall(all(2))).toEqual({ points: 24, max: 24, pct: 100, criticalMisses: [], passed: true });
  });

  it('a point that did not apply is left out of the maximum', () => {
    const s = all(2); s[safety] = null;
    expect(scoreCall(s)).toMatchObject({ points: 22, max: 22, pct: 100, passed: true });
  });

  it('a missed critical point fails the call however good the rest was', () => {
    const s = all(2); s[price] = 0;
    const r = scoreCall(s);
    expect(r.pct).toBe(92);
    expect(r.criticalMisses).toEqual(['Цена']);
    expect(r.passed).toBe(false);
  });

  it('below 85% fails even with no critical miss', () => {
    const s = all(1);
    expect(scoreCall(s)).toMatchObject({ pct: 50, passed: false, criticalMisses: [] });
  });
});

describe('reviewComplete', () => {
  it('needs every point scored; only the safety check may be marked as not applying', () => {
    const s: (Score | undefined)[] = all(2);
    expect(reviewComplete(s)).toBe(true);
    s[safety] = null;
    expect(reviewComplete(s)).toBe(true);
    s[price] = null;
    expect(reviewComplete(s)).toBe(false);
    s[price] = 1; s[0] = undefined;
    expect(reviewComplete(s)).toBe(false);
  });
});

describe('deskTrend', () => {
  const review = (managerId: string, scores: Score[]) => ({ managerId, scores });

  it('says nothing about someone who has not been reviewed', () => {
    expect(deskTrend([review('bob', all(2))], 'ann')).toEqual({ count: 0, avg: null, weakest: null });
  });

  it('averages the last five and names the point to coach', () => {
    const missedPrice = all(2); missedPrice[price] = 0;
    const r = deskTrend([review('ann', missedPrice), review('ann', all(2)), review('bob', all(0))], 'ann');
    expect(r).toEqual({ count: 2, avg: 96, weakest: 'Цена' });
  });

  it('counts every review but only averages the recent ones', () => {
    const reviews = [...Array(5)].map(() => review('ann', all(2))).concat([review('ann', all(0))]);
    expect(deskTrend(reviews, 'ann')).toEqual({ count: 6, avg: 100, weakest: null });
  });
});

it('counts reviews in Russian', () => {
  expect([1, 2, 5, 11, 21, 22].map(reviewsRu)).toEqual(['1 разбор', '2 разбора', '5 разборов', '11 разборов', '21 разбор', '22 разбора']);
});
