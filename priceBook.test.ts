import { describe, it, expect } from 'vitest';
import { PRICE_BOOK_SEED, PRICE_BOOK_VERSION, planPriceBookUpgrade, applyPriceBookUpgrade, nightPriceOf, isNightInArizona } from './priceBook';
import { ServiceRate } from './types';

// The price book as it was seeded before version 2 — what live installs still hold.
const V1: ServiceRate[] = [
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 139, nightPrice: 199, type: 'service_call' },
  { id: 'r-comm-lockout', name: 'Commercial lockout', category: 'Lockout', price: 199, nightPrice: 269, type: 'service_call' },
  { id: 'r-car-key', name: 'Car key (standard)', category: 'Car Keys', price: 99, type: 'labor', note: 'from' },
  { id: 'r-fob-program', name: 'Key fob programming (OEM)', category: 'Car Keys', price: 99, nightPrice: 159, type: 'labor', note: 'customer-supplied' },
];

describe('night rule', () => {
  it('is +$60 on every price', () => {
    expect(nightPriceOf({ price: 139 })).toBe(199);
    expect(nightPriceOf({ price: 199 })).toBe(259);
  });

  it('switches at 8PM and 7AM Phoenix time (UTC-7, no DST)', () => {
    expect(isNightInArizona(new Date('2026-09-18T02:59:00Z'))).toBe(false); // 7:59 PM
    expect(isNightInArizona(new Date('2026-09-18T03:00:00Z'))).toBe(true);  // 8:00 PM
    expect(isNightInArizona(new Date('2026-09-18T13:59:00Z'))).toBe(true);  // 6:59 AM
    expect(isNightInArizona(new Date('2026-09-18T14:00:00Z'))).toBe(false); // 7:00 AM
    expect(isNightInArizona(new Date('2026-01-15T07:30:00Z'))).toBe(true);  // 12:30 AM, winter
  });
});

describe('planPriceBookUpgrade', () => {
  it('brings a v1 book to v2: no-chip key $149, extraction $169, no customer-fob programming', () => {
    const plan = planPriceBookUpgrade(V1, 0);
    expect(plan.update).toEqual([expect.objectContaining({ id: 'r-car-key', price: 149, name: 'Car key, no chip (cut only)' })]);
    expect(plan.update[0].note).toBeUndefined(); // the old "from" goes — this price is exact
    expect(plan.add).toEqual([expect.objectContaining({ id: 'r-key-extraction', price: 169 })]);
    expect(plan.remove).toEqual(['r-fob-program']);
  });

  it('leaves alone whatever the owner already changed by hand', () => {
    const edited = V1.map(r => r.id === 'r-car-key' ? { ...r, price: 129 } : r.id === 'r-fob-program' ? { ...r, price: 119 } : r);
    const ownExtraction: ServiceRate = { id: 'rate-1', name: 'Key extraction', category: 'Other', price: 150, type: 'labor' };
    const plan = planPriceBookUpgrade([...edited, ownExtraction], 0);
    expect(plan).toEqual({ add: [], update: [], remove: [] });
  });

  it('does nothing once the book is at the current version', () => {
    expect(planPriceBookUpgrade(V1, PRICE_BOOK_VERSION)).toEqual({ add: [], update: [], remove: [] });
  });

  it('finds nothing to do on a fresh seed', () => {
    expect(planPriceBookUpgrade(PRICE_BOOK_SEED, 0)).toEqual({ add: [], update: [], remove: [] });
  });

  it('applying it keeps the order, swaps the fixed rate, drops the removed one, appends the new', () => {
    const next = applyPriceBookUpgrade(V1, planPriceBookUpgrade(V1, 0));
    expect(next.map(r => `${r.id}:${r.price}`)).toEqual([
      'r-car-lockout:139', 'r-comm-lockout:199', 'r-car-key:149', 'r-key-extraction:169',
    ]);
  });

  it('the seed carries no night prices of its own', () => {
    expect(PRICE_BOOK_SEED.filter(r => r.nightPrice != null)).toEqual([]);
  });
});
