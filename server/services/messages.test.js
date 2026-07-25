import { describe, it, expect } from 'vitest';
import { isStopKeyword, isStartKeyword, last10 } from './messages.js';

// A false positive here silences a paying customer's job notifications; a false negative
// keeps texting someone who told us to stop. Both are expensive, so pin the matching.

describe('SMS opt-out keywords', () => {
  it('matches the carrier keywords in any case, with trailing punctuation', () => {
    for (const s of ['STOP', 'stop', ' Stop ', 'STOP.', 'stop!', 'UNSUBSCRIBE', 'stopall', 'END', 'QUIT', 'CANCEL', 'opt out']) {
      expect(isStopKeyword(s), s).toBe(true);
    }
  });

  it('matches the Spanish keywords our clients actually send', () => {
    for (const s of ['BAJA', 'baja', 'parar', 'Detener']) {
      expect(isStopKeyword(s), s).toBe(true);
    }
  });

  it('does NOT treat a sentence containing the word as an opt-out', () => {
    // The one that would really hurt: rescheduling is not unsubscribing.
    for (const s of [
      'cancel my appointment',
      'can you cancel tomorrow?',
      'please stop by at 5',
      'I need to end my service contract',
      'stopped by but nobody was home',
      'Quit charging me twice',
    ]) {
      expect(isStopKeyword(s), s).toBe(false);
    }
  });

  it('handles empty and junk input', () => {
    for (const s of ['', '   ', null, undefined, '???']) {
      expect(isStopKeyword(s)).toBe(false);
      expect(isStartKeyword(s)).toBe(false);
    }
  });

  it('recognises the re-subscribe keywords', () => {
    for (const s of ['START', 'start', 'unstop', 'RESUME', 'alta']) {
      expect(isStartKeyword(s), s).toBe(true);
    }
    expect(isStartKeyword('start the job at 9')).toBe(false);
  });
});

describe('phone key', () => {
  it('canonicalises every shape of the same US number to the same key', () => {
    const shapes = ['(602) 555-0199', '602-555-0199', '6025550199', '+1 602 555 0199', '1-602-555-0199'];
    const keys = new Set(shapes.map(last10));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('6025550199');
  });
});
