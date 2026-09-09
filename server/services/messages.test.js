import { describe, it, expect } from 'vitest';
import { isStopKeyword, isStartKeyword, last10, t, SPANISH_INVITE, OPT_OUT_NOTE } from './messages.js';
import { sanitizeSms, smsInfo } from './smsText.js';

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


// Every segment past the first is another cent on every job. These two templates each
// used to spill into a second (the reminder into a third), so pin the length: an edit
// that adds a friendly clause should fail here rather than on the bill.
describe('client template cost', () => {
  const PAY_URL = 'https://techai-production.up.railway.app/p/Ab3xK9qZ7mNp';
  const company = 'TrustKey Locksmith';
  const segments = (text) => smsInfo(sanitizeSms(text)).segments;

  it('keeps the booking confirmation to one segment, invite included', () => {
    for (const tech of ['Michael', '']) {
      const en = t('bookingScheduled', 'en', { name: 'Jessica', tech, company, when: 'Sep 12, 10:00' }) + SPANISH_INVITE;
      expect(segments(en), `tech="${tech}"`).toBe(1);
    }
    const es = t('bookingScheduled', 'es', { name: 'Jessica', tech: 'Michael', company, when: '12 sep, 10:00' });
    expect(segments(es)).toBe(1);
  });

  it('keeps the payment reminder to one segment, pay link and STOP notice included', () => {
    const en = t('paymentReminder', 'en', { name: 'Jessica', company, jobNo: '1042', balance: 249, payUrl: PAY_URL })
      + OPT_OUT_NOTE.en;
    expect(segments(en)).toBe(1);
  });

  it('never lets a template bill as UCS-2', () => {
    // One character outside GSM-7 re-prices the WHOLE message at 70 chars a segment.
    for (const lang of ['en', 'es']) {
      const booking = t('bookingScheduled', lang, { name: 'Jessica', tech: 'Michael', company, when: 'Sep 12, 10:00' });
      const reminder = t('paymentReminder', lang, { name: 'Jessica', company, jobNo: '1042', balance: 249, payUrl: PAY_URL });
      expect(smsInfo(sanitizeSms(booking)).encoding, lang).toBe('GSM-7');
      expect(smsInfo(sanitizeSms(reminder)).encoding, lang).toBe('GSM-7');
    }
  });
});
