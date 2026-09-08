import { describe, it, expect } from 'vitest';
import { describeSmsFailure } from './smsService';

describe('describeSmsFailure', () => {
  it('blames billing only when OpenPhone actually said so', () => {
    expect(describeSmsFailure(402, 'Not Enough Credits')).toMatch(/prepaid SMS credits/);
    expect(describeSmsFailure(400, 'The organization does not have enough prepaid credits')).toMatch(/prepaid SMS credits/);
  });

  it('never invents a billing problem out of an ordinary rejection', () => {
    for (const [status, reason] of [
      [400, 'Invalid recipient phone number'],
      [401, ''],
      [403, 'You can only message clients on your own jobs'],
      [429, ''],
      [500, 'socket hang up'],
      [503, 'Texting is not configured on the server (OPENPHONE_API_KEY missing)'],
    ] as [number, string][]) {
      expect(describeSmsFailure(status, reason)).not.toMatch(/credit|billing|top up/i);
    }
  });

  it('repeats the server’s own words when it has them', () => {
    expect(describeSmsFailure(403, 'You can only message clients on your own jobs'))
      .toBe('You can only message clients on your own jobs');
    expect(describeSmsFailure(400, 'Invalid recipient phone number'))
      .toBe('Invalid recipient phone number');
  });

  it('still says something useful when the server said nothing', () => {
    expect(describeSmsFailure(400, '')).toMatch(/phone number/i);
    expect(describeSmsFailure(0, '')).toMatch(/not delivered/i);
  });
});
