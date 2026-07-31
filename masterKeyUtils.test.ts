import { describe, it, expect } from 'vitest';
import {
  calcPinning, classifyMaster, macsViolations, workingKeysFor,
  findInterchange, presetFor, formatBitting, suggestBitting, pinSummary,
} from './masterKeyUtils';

const KW = presetFor('kwikset-kw1');
const SC = presetFor('schlage-sc1');

const pins = (m: number[], c: number[], p = KW) =>
  calcPinning(m, c, p).positions.map(x => [x.bottomPin, x.masterWafer]);

describe('pinning maths', () => {
  // Worked example straight out of the Kwikset master keying manual.
  it('matches the manufacturer worked example (random master)', () => {
    const master = [3, 4, 2, 5, 2];
    const change = [5, 4, 6, 3, 5];
    expect(pins(master, change)).toEqual([[3, 2], [4, 0], [2, 4], [3, 2], [2, 3]]);
  });

  it('deep master: bottom pins equal the tenant cuts', () => {
    const master = [6, 7, 7, 6, 6];
    const change = [3, 5, 4, 4, 4];
    const r = calcPinning(master, change, KW);
    expect(r.positions.map(p => p.bottomPin)).toEqual(change);
    expect(r.positions.map(p => p.masterWafer)).toEqual([3, 2, 3, 2, 2]);
    expect(r.masterType).toBe('deep');
  });

  it('shallow master: bottom pins equal the master cuts', () => {
    const master = [1, 2, 2, 1, 2];
    const change = [3, 5, 4, 4, 4];
    const r = calcPinning(master, change, KW);
    expect(r.positions.map(p => p.bottomPin)).toEqual(master);
    expect(r.positions.map(p => p.masterWafer)).toEqual([2, 3, 2, 3, 2]);
    expect(r.masterType).toBe('shallow');
  });

  it('wafer is symmetric — swapping the two keys changes nothing physical', () => {
    const a = pins([3, 4, 2, 5, 2], [5, 4, 6, 3, 5]);
    const b = pins([5, 4, 6, 3, 5], [3, 4, 2, 5, 2]);
    expect(a).toEqual(b);
  });

  it('identical keys are keyed-alike, not a master system', () => {
    const r = calcPinning([3, 4, 2, 5, 2], [3, 4, 2, 5, 2], KW);
    expect(r.masterType).toBe('identical');
    expect(r.waferCount).toBe(0);
    expect(r.workingKeys).toBe(1);
    expect(r.phantomKeys).toBe(0);
  });
});

describe('phantom keys', () => {
  it('counts 2^wafers and subtracts the two real keys', () => {
    const r = calcPinning([3, 4, 2, 5, 2], [5, 4, 6, 3, 5], KW);
    expect(r.waferCount).toBe(4);
    expect(r.workingKeys).toBe(16);
    expect(r.phantomKeys).toBe(14);
  });

  it('enumerates exactly the working set, master and change included', () => {
    const keys = workingKeysFor([1, 1, 1], [2, 2, 1]);
    expect(keys).toHaveLength(4);
    expect(keys).toContainEqual([1, 1, 1]);
    expect(keys).toContainEqual([2, 2, 1]);
    expect(keys).toContainEqual([1, 2, 1]);
    expect(keys).toContainEqual([2, 1, 1]);
  });
});

describe('MACS', () => {
  it('flags an adjacent jump over the brand limit', () => {
    expect(macsViolations([1, 6, 1, 1, 1], KW)).toEqual([
      { a: 1, b: 2, diff: 5 }, { a: 2, b: 3, diff: 5 },
    ]);
  });

  it('is brand specific — the same key passes on Schlage and fails on Kwikset', () => {
    const bitting = [1, 6, 1, 6, 1, 6];
    expect(macsViolations(bitting, KW).length).toBeGreaterThan(0);
    expect(macsViolations(bitting, SC)).toEqual([]);
  });

  it('ignores unfilled positions', () => {
    expect(macsViolations([1, null, 9], KW)).toEqual([]);
  });
});

describe('warnings', () => {
  it('rejects a 1-step difference on Schlage — no #1 master pin exists', () => {
    const r = calcPinning([3, 3, 3, 3, 3, 3], [4, 3, 3, 3, 3, 3], SC);
    expect(r.warnings.some(w => w.level === 'error' && w.title.includes('Шайбы'))).toBe(true);
  });

  it('accepts that same 1-step difference on Kwikset', () => {
    const r = calcPinning([3, 3, 3, 3, 3], [4, 3, 3, 3, 3], KW);
    expect(r.warnings.some(w => w.level === 'error')).toBe(false);
  });

  it('warns that a random master must be built without a key in the plug', () => {
    const r = calcPinning([3, 4, 2, 5, 2], [5, 4, 6, 3, 5], KW);
    expect(r.masterType).toBe('random');
    expect(r.warnings.some(w => w.title.includes('случайный'))).toBe(true);
  });

  it('holds off until both bittings are complete', () => {
    const r = calcPinning([3, 4, null, 5, 2], [5, 4, 6, 3, 5], KW);
    expect(r.workingKeys).toBe(0);
    expect(r.warnings.some(w => w.title.includes('Заполни'))).toBe(true);
  });
});

describe('classifyMaster', () => {
  it('treats a single reversed chamber as random', () => {
    expect(classifyMaster([1, 1, 1, 9, 1], [2, 2, 2, 2, 2])).toBe('random');
  });
  it('ignores equal chambers when deciding direction', () => {
    expect(classifyMaster([1, 5, 1], [3, 5, 3])).toBe('shallow');
  });
});

describe('interchange between doors', () => {
  const master = [3, 4, 2, 5, 2];

  it('finds a phantom of one door that opens another', () => {
    // Door B is itself a phantom of door A: every cut is either master or A's cut.
    const found = findInterchange(master, [
      { id: 'a', name: 'Кв. 1', bitting: [5, 4, 6, 3, 5] },
      { id: 'b', name: 'Кв. 2', bitting: [5, 4, 2, 3, 2] },
    ]);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].kind).toBe('real-key');
  });

  it('stays quiet when doors share only the master', () => {
    const found = findInterchange([1, 1, 1, 1, 1], [
      { id: 'a', name: 'Кв. 1', bitting: [3, 1, 1, 1, 1] },
      { id: 'b', name: 'Кв. 2', bitting: [1, 1, 1, 1, 3] },
    ]);
    expect(found).toEqual([]);
  });

  it('skips doors that are not filled in yet', () => {
    const found = findInterchange(master, [
      { id: 'a', name: 'Кв. 1', bitting: [5, 4, 6, 3, 5] },
      { id: 'b', name: 'Кв. 2', bitting: [5, null, 2, 3, 2] },
    ]);
    expect(found).toEqual([]);
  });
});

describe('suggestBitting', () => {
  const master = [3, 4, 2, 5, 2];
  const doors = [{ id: 'a', name: 'Кв. 1', bitting: [5, 4, 6, 3, 5] as (number | null)[] }];

  it('always yields a legal, interchange-free bitting', () => {
    // Property check over many runs — the generator is random inside.
    for (let run = 0; run < 25; run++) {
      const cand = suggestBitting(master, doors, KW);
      expect(cand).not.toBeNull();
      const r = calcPinning(master, cand!, KW);
      expect(r.warnings.some(w => w.level === 'error')).toBe(false);
      expect(cand!.filter((d, i) => d !== master[i]).length).toBeGreaterThanOrEqual(2);
      const clash = findInterchange(master, [...doors, { id: 'n', name: 'n', bitting: cand! }])
        .filter(f => f.doorA === 'n' || f.doorB === 'n');
      expect(clash).toEqual([]);
    }
  });

  it('never repeats the master or an existing door', () => {
    for (let run = 0; run < 25; run++) {
      const cand = suggestBitting(master, doors, KW)!;
      expect(cand.join('')).not.toBe(master.join(''));
      expect(cand.join('')).not.toBe('54635');
    }
  });

  it('respects Schlage: no 1-step wafers in suggestions', () => {
    const m = [3, 3, 3, 3, 3, 3];
    for (let run = 0; run < 25; run++) {
      const cand = suggestBitting(m, [], SC)!;
      for (let i = 0; i < 6; i++) {
        const wafer = Math.abs(cand[i] - m[i]);
        expect(wafer === 0 || wafer >= 2).toBe(true);
      }
    }
  });
});

describe('pinSummary', () => {
  it('counts bottoms and wafers across complete doors, skipping half-typed ones', () => {
    const master = [3, 4, 2, 5, 2];
    const s = pinSummary(master, [
      { bitting: [5, 4, 6, 3, 5] },
      { bitting: [5, null, 6, 3, 5] }, // ignored
    ], KW);
    // Door 1 alone: bottoms 3,4,2,3,2 → #2×2 #3×2 #4×1; wafers 2,4,2,3 → #2×2 #3×1 #4×1
    expect(s.bottoms).toEqual([[2, 2], [3, 2], [4, 1]]);
    expect(s.wafers).toEqual([[2, 2], [3, 1], [4, 1]]);
  });
});

describe('formatBitting', () => {
  it('marks gaps so a half-typed key is obvious', () => {
    expect(formatBitting([3, 4, null, 5, 2])).toBe('34·52');
  });
});
