import { describe, it, expect } from 'vitest';
import { LostCall } from './types';
import { LOST_REASONS, lostBetween, lostInMonths, countByReason, callsRu } from './lostCalls';

const at = (iso: string, reason: LostCall['reason'], id = iso): LostCall => ({ id, timestamp: iso, reason });

const list: LostCall[] = [
  at('2026-09-10T15:00:00.000Z', 'price'),
  at('2026-09-12T18:30:00.000Z', 'wait'),
  at('2026-09-15T20:00:00.000Z', 'price'),
  at('2026-09-17T16:00:00.000Z', 'shopping'),
  at('2026-08-30T16:00:00.000Z', 'area'),
];

describe('lost calls', () => {
  it('every reason has a label', () => {
    expect(LOST_REASONS.map(r => r.id)).toEqual(['price', 'wait', 'shopping', 'self', 'area', 'notOurs', 'dealer', 'noId', 'other']);
    for (const r of LOST_REASONS) expect(r.label.length).toBeGreaterThan(0);
  });

  it('takes a window, newest first, end excluded', () => {
    const week = lostBetween(list, new Date('2026-09-11T00:00:00Z'), new Date('2026-09-17T16:00:00Z'));
    expect(week.map(l => l.reason)).toEqual(['price', 'wait']);
  });

  it('takes whole reporting months', () => {
    const sept = lostInMonths(list, [{ year: 2026, month: 8 }]);
    expect(sept).toHaveLength(4);
    expect(sept[0].reason).toBe('shopping');
  });

  it('says the count in proper Russian', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111, 104].map(callsRu)).toEqual([
      '1 звонок', '2 звонка', '5 звонков', '11 звонков', '12 звонков', '21 звонок', '22 звонка', '25 звонков', '111 звонков', '104 звонка',
    ]);
  });

  it('counts reasons, most frequent first, skipping the ones that never came up', () => {
    expect(countByReason(list)).toEqual([
      { reason: 'price', count: 2 },
      { reason: 'wait', count: 1 },
      { reason: 'shopping', count: 1 },
      { reason: 'area', count: 1 },
    ]);
    expect(countByReason([])).toEqual([]);
  });
});
