import { Job, ClientProfile, ClientRating, NEGATIVE_TAGS } from './types';

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
  // Reputation (from the client profile) + auto-derived signals.
  rating?: ClientRating;
  tags: string[];          // manual flags
  autoTags: string[];      // system-derived (Frequent, Big ticket, Slow payer, …)
  notes?: string;
  favoriteTechId?: string;
  outstanding: number;     // unpaid balance across their jobs
  isStandalone: boolean;   // saved as a contact but no job yet
}

const REVENUE_STATUSES = new Set<Job['status']>(['completed', 'sold']);
const BIG_TICKET_LIFETIME = 1000;

// System-derived badges from a client's job history (not stored — always live).
function deriveAutoTags(jobs: Job[], totalSpend: number, outstanding: number): string[] {
  const out: string[] = [];
  if (jobs.length >= 3) out.push('Frequent');
  if (totalSpend >= BIG_TICKET_LIFETIME) out.push('Big ticket');
  if (outstanding > 0.01) out.push('Slow payer');
  if (jobs.some(j => j.status === 'coffee' || j.status === 'cancelled')) out.push('Cancel risk');
  if (jobs.length === 1) out.push('New');
  return out;
}

// Digits-only phone, reduced to the last 10 so different formats of the same
// number match: "+1 (305) 555-0199", "305-555-0199" and "3055550199" are equal.
export function normalizePhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Canonical US E.164 ("+1XXXXXXXXXX"). This is the ONE shape we store, so the same
// number is always recognized later no matter how it was typed. A bare 10-digit US
// number gets +1 automatically — the manager never has to type the country code.
// Mirrors the server's toE164 so client and backend agree on the canonical form.
export function toE164US(raw?: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return '+' + digits;                                // already international
  if (digits.length === 10) return '+1' + digits;                  // bare US local → add +1
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits; // 1 + 10 digits
  return '+' + digits;                                             // assume it carries a country code
}

// Human-friendly US display, e.g. "(602) 555-1234". Falls back to the raw value for
// anything that isn't a 10/11-digit US number.
export function formatPhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return raw || '';
}

// Build the client roster from job history, merged with saved reputation profiles.
// Clients are keyed by phone (falling back to email or name) so every job for the same
// person rolls up into one record, and the profile (rating/tags/notes) follows them.
export function buildClients(jobs: Job[], profiles?: Record<string, ClientProfile>): ClientRecord[] {
  const map = new Map<string, ClientRecord>();
  jobs.forEach(j => {
    // Key by the NORMALIZED phone so "(305) 555-0199" and "3055550199" are the same
    // person (was raw phone → split into two client records). Fall back to email/name.
    const key =
      normalizePhone(j.client.phone) ||
      (j.client.email || '').trim().toLowerCase() ||
      `${j.client.firstName}-${j.client.lastName}`.trim().toLowerCase();
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
        tags: [],
        autoTags: [],
        outstanding: 0,
        isStandalone: false,
      });
    }
    const rec = map.get(key)!;
    rec.jobs.push(j);
    rec.totalSpend += j.totalAmount;
    if (REVENUE_STATUSES.has(j.status) && j.paymentStatus !== 'paid') {
      rec.outstanding += Math.max(0, j.totalAmount - (j.amountPaid || 0));
    }
    if (j.scheduledDate > rec.lastJobDate) rec.lastJobDate = j.scheduledDate;
  });

  // Add saved clients that have no job yet (created via "Add client" / from a call).
  if (profiles) {
    for (const [key, p] of Object.entries(profiles)) {
      if (map.has(key) || !p.contact) continue;
      map.set(key, {
        id: key,
        firstName: p.contact.firstName,
        lastName: p.contact.lastName,
        phone: p.contact.phone,
        email: p.contact.email || '',
        address: p.contact.address || '',
        jobs: [],
        totalSpend: 0,
        lastJobDate: p.createdAt.slice(0, 10),
        tags: [],
        autoTags: [],
        outstanding: 0,
        isStandalone: true,
      });
    }
  }

  // Overlay profile reputation + compute auto-tags.
  for (const rec of map.values()) {
    const p = profiles?.[rec.id];
    if (p) {
      rec.rating = p.rating;
      rec.tags = p.tags || [];
      rec.notes = p.notes;
      rec.favoriteTechId = p.favoriteTechId;
    }
    rec.autoTags = deriveAutoTags(rec.jobs, rec.totalSpend, rec.outstanding);
  }

  return Array.from(map.values()).sort((a, b) => b.lastJobDate.localeCompare(a.lastJobDate));
}

// Match an incoming/outgoing phone number to a known client. Requires at least 7
// digits to avoid false positives on short or malformed numbers.
export function findClientByPhone(clients: ClientRecord[], phone?: string): ClientRecord | undefined {
  const n = normalizePhone(phone);
  if (n.length < 7) return undefined;
  return clients.find(c => normalizePhone(c.phone) === n);
}

export type ClientTier = 'Gold' | 'Silver' | 'Bronze' | 'New' | 'Watch' | 'Blocked';

export interface ClientScore {
  score: number;       // 0–100 value/loyalty score
  tier: ClientTier;
  reasons: string[];   // short human reasons, best first
}

// One number that captures a client's worth + standing, blended from everything we
// track: job count, lifetime spend, rating, flags and payment behaviour.
export function clientScore(rec: {
  jobs: { length: number };
  totalSpend: number;
  outstanding: number;
  rating?: ClientRating;
  tags?: string[];
  autoTags?: string[];
}): ClientScore {
  const tags = new Set<string>([...(rec.tags || []), ...(rec.autoTags || [])]);
  if (tags.has('Do not service')) return { score: 0, tier: 'Blocked', reasons: ['Flagged do-not-service'] };

  const jobsN = rec.jobs.length;
  let score = 40;
  const reasons: string[] = [];

  const jobPts = Math.min(25, jobsN * 5);
  if (jobPts > 0) { score += jobPts; if (jobsN >= 3) reasons.push(`${jobsN} jobs`); }

  const spendPts = Math.min(20, Math.round(rec.totalSpend / 100));
  if (spendPts > 0) { score += spendPts; if (rec.totalSpend >= 1000) reasons.push(`$${Math.round(rec.totalSpend).toLocaleString()} lifetime`); }

  if (rec.rating === 'good') { score += 15; reasons.push('Rated good'); }
  if (rec.rating === 'difficult') score -= 30;
  if (tags.has('VIP')) { score += 15; reasons.push('VIP'); }
  if (tags.has('Referrer')) { score += 10; reasons.push('Sent referrals'); }
  if (rec.outstanding > 0.01 || tags.has('Slow payer')) { score -= 15; reasons.push('Unpaid balance'); }
  if (tags.has('Cancel risk')) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: ClientTier;
  if (rec.rating === 'difficult' || (tags.has('Difficult') && score < 55)) tier = 'Watch';
  else if (jobsN === 0) tier = 'New';
  else if (score >= 78) tier = 'Gold';
  else if (score >= 58) tier = 'Silver';
  else tier = 'Bronze';

  return { score, tier, reasons: reasons.slice(0, 3) };
}

export const TIER_STYLE: Record<ClientTier, string> = {
  Gold: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Silver: 'bg-slate-300/15 text-slate-200 border-slate-300/30',
  Bronze: 'bg-orange-700/20 text-orange-300 border-orange-600/40',
  New: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Watch: 'bg-red-500/15 text-red-300 border-red-500/40',
  Blocked: 'bg-red-600/20 text-red-200 border-red-600/50',
};

export interface ClientFlags {
  allTags: string[];   // manual + auto, deduped (manual first)
  hasNegative: boolean;
  isVip: boolean;
  doNotService: boolean;
  rating?: ClientRating;
  // 'danger' = treat with care (difficult/negative), 'vip' = treat well, else undefined.
  tone: 'danger' | 'vip' | undefined;
}

// One place that decides how a client should read on the caller ID / cards.
export function clientFlags(rec: { tags?: string[]; autoTags?: string[]; rating?: ClientRating }): ClientFlags {
  const allTags = Array.from(new Set([...(rec.tags || []), ...(rec.autoTags || [])]));
  const doNotService = allTags.includes('Do not service');
  const hasNegative = rec.rating === 'difficult' || allTags.some(t => NEGATIVE_TAGS.has(t));
  const isVip = allTags.includes('VIP');
  const tone: ClientFlags['tone'] = hasNegative ? 'danger' : isVip ? 'vip' : undefined;
  return { allTags, hasNegative, isVip, doNotService, rating: rec.rating, tone };
}
