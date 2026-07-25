import { describe, it, expect } from 'vitest';
import { priorVisits, normalizePhone } from './clientUtils';
import { Job } from './types';

let seq = 0;
const job = (over: Partial<Job> = {}): Job => ({
  id: `j-${++seq}`,
  jobNumber: `LK-${seq}`,
  client: { id: `c-${seq}`, firstName: 'A', lastName: 'B', phone: '', email: '', address: '' },
  lockDetails: { type: 'Deadbolt' },
  complaint: '', diagnosisNotes: '',
  scheduledDate: '2026-06-01', scheduledTime: '10:00',
  status: 'completed', lineItems: [], totalAmount: 100,
  paymentStatus: 'paid', photos: [], messages: [],
  ...over,
} as Job);

const at = (address: string, over: Partial<Job> = {}) =>
  job({ ...over, client: { id: 'c', firstName: 'A', lastName: 'B', phone: '', email: '', address } as any });

describe('priorVisits', () => {
  it('matches the same customer by phone in any format', () => {
    const past = job({ client: { id: 'c', firstName: 'A', lastName: 'B', phone: '(602) 555-0199', email: '', address: 'x' } as any });
    const current = job({ client: { id: 'c2', firstName: 'A', lastName: 'B', phone: '+1 602 555 0199', email: '', address: 'y' } as any });
    expect(priorVisits([past, current], current).map(j => j.id)).toEqual([past.id]);
  });

  it('matches a second call to the same building, even booked by someone else', () => {
    const past = at('1600 Main St, Apt 4');
    const current = at('1600 Main St');
    expect(priorVisits([past, current], current)).toHaveLength(1);
  });

  it('does not match unrelated addresses', () => {
    const past = at('42 Oak Avenue');
    const current = at('1600 Main St');
    expect(priorVisits([past, current], current)).toHaveLength(0);
  });

  it('ignores a short or empty address so blank leads do not all match each other', () => {
    const a = at('');
    const b = at('');
    expect(priorVisits([a, b], b)).toHaveLength(0);
  });

  it('excludes the current job and anything cancelled, newest first', () => {
    const older = at('1600 Main St', { completedAt: '2026-01-05T18:00:00.000Z' });
    const newer = at('1600 Main St', { completedAt: '2026-05-05T18:00:00.000Z' });
    const voided = at('1600 Main St', { status: 'cancelled', completedAt: '2026-06-01T18:00:00.000Z' });
    const current = at('1600 Main St');
    const got = priorVisits([older, newer, voided, current], current);
    expect(got.map(j => j.id)).toEqual([newer.id, older.id]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 9 }, () => at('1600 Main St'));
    const current = at('1600 Main St');
    expect(priorVisits([...many, current], current)).toHaveLength(5);
  });
});

describe('normalizePhone', () => {
  it('reduces every US shape to the same 10 digits', () => {
    const keys = new Set(['(602) 555-0199', '602-555-0199', '6025550199', '+1 602 555 0199'].map(normalizePhone));
    expect(keys.size).toBe(1);
  });
});
