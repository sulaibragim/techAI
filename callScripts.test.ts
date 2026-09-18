import { describe, it, expect } from 'vitest';
import { CALL_SCRIPTS, OBJECTIONS, ratePrice, resolveScript, scriptText, isNightInArizona, ScriptContext } from './callScripts';
import { ServiceRate } from './types';

const book: ServiceRate[] = [
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 139, nightPrice: 199, type: 'service_call' },
  { id: 'r-rekey', name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor' },
];
const day: ScriptContext = { priceBook: book, night: false, me: 'Anna' };
const night: ScriptContext = { ...day, night: true };

describe('ratePrice', () => {
  it('uses the live price book, day and night', () => {
    expect(ratePrice({ id: 'r-car-lockout', day: 1, night: 2 }, book, false)).toBe(139);
    expect(ratePrice({ id: 'r-car-lockout', day: 1, night: 2 }, book, true)).toBe(199);
  });

  it('adds the flat $60 at night when the book has no night price', () => {
    expect(ratePrice({ id: 'r-rekey', day: 1, night: 2 }, book, true)).toBe(209);
  });

  it('falls back to the script number when the rate was removed from the book', () => {
    expect(ratePrice({ id: 'r-gone', day: 159, night: 219 }, book, false)).toBe(159);
    expect(ratePrice({ id: 'r-gone', day: 159, night: 219 }, book, true)).toBe(219);
  });
});

describe('resolveScript', () => {
  it('fills the manager name and the live price', () => {
    expect(scriptText('This is {me}. It is {price:r-car-lockout} total.', day)).toBe('This is Anna. It is $139 total.');
    expect(scriptText('It is {price:r-car-lockout} total.', night)).toBe('It is $199 total.');
  });

  it('keeps [slots] for the manager to fill and marks prices', () => {
    const segs = resolveScript('[Tech] in [X–Y] min for {price:r-car-lockout}', day);
    expect(segs.filter(s => s.kind === 'slot').map(s => s.value)).toEqual(['[Tech]', '[X–Y]']);
    expect(segs.find(s => s.kind === 'price')?.value).toBe('$139');
  });

  it('never prints a blank for an unknown price id', () => {
    expect(scriptText('{price:r-nope}', day)).toBe('[price]');
  });

  it('shows a slot when the manager has no name yet', () => {
    expect(scriptText('this is {me}', { ...day, me: '' })).toBe('this is [your name]');
  });
});

describe('script data', () => {
  it('every objection a script lists exists', () => {
    for (const s of Object.values(CALL_SCRIPTS)) {
      for (const id of s.objections) expect(OBJECTIONS[id], `${s.id} → ${id}`).toBeDefined();
    }
  });

  it('every {price:} token points at a rate with a fallback number', () => {
    for (const s of Object.values(CALL_SCRIPTS)) {
      for (const st of s.steps) {
        for (const m of st.say.matchAll(/\{price:([a-z0-9-]+)\}/g)) {
          const segs = resolveScript(m[0], { ...day, priceBook: [] });
          expect(segs[0]?.kind, `${s.id}: ${m[0]}`).toBe('price');
        }
      }
    }
  });

  it('never claims a license, a long warranty or a guessed ETA', () => {
    const all = [
      ...Object.values(CALL_SCRIPTS).flatMap(s => s.steps.map(st => st.say)),
      ...Object.values(OBJECTIONS).map(o => o.say),
    ].join('\n').toLowerCase();
    expect(all).not.toMatch(/we're licensed|we are licensed|licensed locksmith|1-year|one year|lifetime|15 minutes|background-checked/);
  });
});

describe('isNightInArizona', () => {
  it('switches at 8PM and 7AM Phoenix time (UTC-7, no DST)', () => {
    expect(isNightInArizona(new Date('2026-09-18T02:59:00Z'))).toBe(false); // 7:59 PM
    expect(isNightInArizona(new Date('2026-09-18T03:00:00Z'))).toBe(true);  // 8:00 PM
    expect(isNightInArizona(new Date('2026-09-18T13:59:00Z'))).toBe(true);  // 6:59 AM
    expect(isNightInArizona(new Date('2026-09-18T14:00:00Z'))).toBe(false); // 7:00 AM
    expect(isNightInArizona(new Date('2026-01-15T07:30:00Z'))).toBe(true);  // 12:30 AM, winter
  });
});
