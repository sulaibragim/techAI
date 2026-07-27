import { describe, it, expect } from 'vitest';
import { nextHeldFor, shelfQty, heldTotal } from './types';
import type { Part } from './types';

// Handing parts to technicians moves stock without changing how much we own. Both clamps
// below protect a real mistake made in a hurry at the shelf: giving away units that aren't
// there, and "returning" more than the tech actually has.

const part = (stock: number, held: Record<string, number> = {}): Part => ({
  id: 'p1', name: 'TOY44H-PT Transponder Key', sku: '2811', category: 'транспондер',
  stock, reorderPoint: 5, price: 0, cost: 4.89, held,
});

describe('shelf vs vans', () => {
  it('counts what is left on the shelf after handouts', () => {
    expect(shelfQty(part(10, { t1: 3, t2: 2 }))).toBe(5);
    expect(heldTotal(part(10, { t1: 3, t2: 2 }))).toBe(5);
    expect(shelfQty(part(10))).toBe(10);
  });

  it('never reports a negative shelf, even if the data is inconsistent', () => {
    expect(shelfQty(part(2, { t1: 5 }))).toBe(0);
  });
});

describe('nextHeldFor', () => {
  it('hands out what is available', () => {
    expect(nextHeldFor(part(10), 't1', 3)).toBe(3);
    expect(nextHeldFor(part(10, { t1: 3 }), 't1', 2)).toBe(5);
  });

  it('will not hand out more than is on the shelf', () => {
    // 10 total, 8 already in other vans → only 2 left to give.
    expect(nextHeldFor(part(10, { t2: 8 }), 't1', 5)).toBe(2);
    expect(nextHeldFor(part(10, { t1: 4, t2: 6 }), 't1', 3)).toBe(4); // shelf empty: unchanged
  });

  it('takes stock back but never below zero', () => {
    expect(nextHeldFor(part(10, { t1: 3 }), 't1', -2)).toBe(1);
    expect(nextHeldFor(part(10, { t1: 3 }), 't1', -9)).toBe(0);
    expect(nextHeldFor(part(10), 't1', -1)).toBe(0);
  });

  it('leaves the other technicians alone', () => {
    const p = part(10, { t1: 3, t2: 2 });
    expect(nextHeldFor(p, 't1', 4)).toBe(7);   // 10 − 2 (t2) = 8 available to t1
    expect(p.held).toEqual({ t1: 3, t2: 2 }); // pure: nothing mutated
  });
});
