import { describe, it, expect } from 'vitest';
import { CALL_SCRIPTS, OBJECTIONS, ratePrice, resolveScript, scriptText, ScriptContext } from './callScripts';
import { ServiceRate } from './types';

const book: ServiceRate[] = [
  // An old install still carries the wrong seeded night price — it must not leak into quotes.
  { id: 'r-comm-lockout', name: 'Commercial lockout', category: 'Lockout', price: 199, nightPrice: 269, type: 'service_call' },
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 139, nightPrice: 199, type: 'service_call' },
  { id: 'r-rekey', name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor' },
];
const day: ScriptContext = { priceBook: book, night: false, me: 'Anna' };
const night: ScriptContext = { ...day, night: true };

describe('ratePrice', () => {
  it('quotes the live price book by day', () => {
    expect(ratePrice({ id: 'r-comm-lockout', price: 1 }, book, false)).toBe(199);
  });

  it('adds $60 at night, whatever night price the book still holds', () => {
    expect(ratePrice({ id: 'r-comm-lockout', price: 1 }, book, true)).toBe(259);
    expect(ratePrice({ id: 'r-rekey', price: 1 }, book, true)).toBe(209);
  });

  it('falls back to the script number when the rate was removed from the book', () => {
    expect(ratePrice({ id: 'r-gone', price: 159 }, book, false)).toBe(159);
    expect(ratePrice({ id: 'r-gone', price: 159 }, book, true)).toBe(219);
  });
});

describe('resolveScript', () => {
  it('fills the manager name and the live price', () => {
    expect(scriptText('This is {me}. It is {price:r-car-lockout} total.', day)).toBe('This is Anna. It is $139 total.');
    expect(scriptText('It is {price:r-car-lockout} total.', night)).toBe('It is $199 total.');
  });

  it('prices a rate the scripts do not know straight from the book', () => {
    expect(scriptText('{price:r-rekey}', night)).toBe('$209');
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

  it('every emergency script asks the 911 question', () => {
    for (const s of Object.values(CALL_SCRIPTS).filter(s => s.emergency)) {
      expect(s.steps.some(st => st.call911), s.id).toBe(true);
    }
  });

  it('never claims a license, a long warranty, a guessed ETA or a made-up age', () => {
    const all = [
      ...Object.values(CALL_SCRIPTS).flatMap(s => s.steps.map(st => st.say)),
      ...Object.values(OBJECTIONS).map(o => o.say),
    ].join('\n').toLowerCase();
    expect(all).not.toMatch(/we're licensed|we are licensed|licensed locksmith|1-year|one year|lifetime|15 minutes|background-checked|since 20|years of experience/);
  });
});
