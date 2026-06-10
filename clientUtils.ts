import { Job } from './types';

export interface ClientRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  jobs: Job[];
  totalSpend: number;
  lastJobDate: string;
}

// Digits-only phone, reduced to the last 10 so different formats of the same
// number match: "+1 (305) 555-0199", "305-555-0199" and "3055550199" are equal.
export function normalizePhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Build the client roster from job history. Clients are keyed by phone (falling
// back to email or name) so every job for the same person rolls up into one record.
export function buildClients(jobs: Job[]): ClientRecord[] {
  const map = new Map<string, ClientRecord>();
  jobs.forEach(j => {
    const key = j.client.phone || j.client.email || `${j.client.firstName}-${j.client.lastName}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        firstName: j.client.firstName,
        lastName: j.client.lastName,
        phone: j.client.phone,
        email: j.client.email || '',
        address: j.client.address || '',
        jobs: [],
        totalSpend: 0,
        lastJobDate: j.scheduledDate,
      });
    }
    const rec = map.get(key)!;
    rec.jobs.push(j);
    rec.totalSpend += j.totalAmount;
    if (j.scheduledDate > rec.lastJobDate) rec.lastJobDate = j.scheduledDate;
  });
  return Array.from(map.values()).sort((a, b) => b.lastJobDate.localeCompare(a.lastJobDate));
}

// Match an incoming/outgoing phone number to a known client. Requires at least 7
// digits to avoid false positives on short or malformed numbers.
export function findClientByPhone(clients: ClientRecord[], phone?: string): ClientRecord | undefined {
  const n = normalizePhone(phone);
  if (n.length < 7) return undefined;
  return clients.find(c => normalizePhone(c.phone) === n);
}
