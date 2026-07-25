import { describe, it, expect } from 'vitest';
import {
  collectedAmount,
  collectedCompanyAmount,
  refundedAmount,
  tipAmount,
  netRevenueAmount,
  billableAmount,
  outstandingAmount,
  accountingSummary,
  revenueByTechnician,
  accountsReceivable,
} from './financialUtils';
import { Job, LineItem, User } from './types';

// Money is the part of this app that fails silently — a wrong figure looks like a
// slow week, not a bug. These lock down the arithmetic the books are built on.

let seq = 0;
const li = (type: LineItem['type'], unitPrice: number, quantity = 1, unitCost?: number): LineItem => ({
  id: `li-${++seq}`, type, description: type, quantity, unitPrice, ...(unitCost !== undefined ? { unitCost } : {}),
});

/** A completed job. `completedAt` is a LOCAL wall-clock time, stored as a UTC instant. */
const job = (over: Partial<Job> & { lineItems?: LineItem[] } = {}): Job => {
  const items = over.lineItems ?? [li('labor', 100)];
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return {
    id: `j-${++seq}`,
    jobNumber: `LK-${seq}`,
    client: { id: `c-${seq}`, firstName: 'A', lastName: 'B', phone: '5551234567', email: '', address: '' },
    lockDetails: { type: 'Deadbolt' },
    complaint: '', diagnosisNotes: '',
    scheduledDate: '2026-06-15', scheduledTime: '10:00',
    status: 'completed',
    lineItems: items,
    totalAmount: total,
    paymentStatus: 'unpaid',
    photos: [], messages: [],
    completedAt: new Date(2026, 5, 15, 10, 0, 0).toISOString(),
    ...over,
  } as Job;
};

describe('collected vs the "paid" label', () => {
  it('trusts the recorded amount when an invoice is raised after payment', () => {
    // $200 job paid in full, then a forgotten $150 part is added. The label stays 'paid'.
    const j = job({ lineItems: [li('labor', 200), li('part', 150, 1, 60)], paymentStatus: 'paid', amountPaid: 200 });
    expect(j.totalAmount).toBe(350);
    expect(collectedAmount(j)).toBe(200);      // not 350 — the extra never arrived
    expect(outstandingAmount(j)).toBe(150);    // and it shows up as owed
  });

  it('falls back to the total for legacy rows that predate amountPaid', () => {
    const j = job({ paymentStatus: 'paid', amountPaid: undefined });
    expect(collectedAmount(j)).toBe(100);
  });

  it('reports partial payments from amountPaid', () => {
    const j = job({ lineItems: [li('labor', 500)], paymentStatus: 'partial', amountPaid: 200 });
    expect(collectedAmount(j)).toBe(200);
    expect(outstandingAmount(j)).toBe(300);
  });
});

describe('refunds', () => {
  const refunded = (amount: number) => ({
    id: 'r1', intent: 'pi_1', amount, at: new Date(2026, 5, 16).toISOString(), method: 'card' as const,
  });

  it('a fully refunded job is not revenue and is not a receivable', () => {
    const j = job({ lineItems: [li('labor', 500)], paymentStatus: 'unpaid', amountPaid: 0, refunds: [refunded(500)] });
    expect(refundedAmount(j)).toBe(500);
    expect(netRevenueAmount(j)).toBe(0);
    expect(outstandingAmount(j)).toBe(0);           // was 500 — a phantom invoice that auto-texted the client
    expect(accountsReceivable([j])).toHaveLength(0);
  });

  it('a partial refund reduces revenue by exactly the refund', () => {
    const j = job({ lineItems: [li('labor', 500)], paymentStatus: 'partial', amountPaid: 400, refunds: [refunded(100)] });
    expect(netRevenueAmount(j)).toBe(400);
    expect(outstandingAmount(j)).toBe(0);
  });
});

describe('tips are the technician\'s money, not the company\'s', () => {
  const tipped = () => job({
    lineItems: [li('labor', 300), li('tip', 60)],
    paymentStatus: 'paid', amountPaid: 360, assignedTo: 'u-tech',
  });

  it('the client owes the tip but the company does not earn it', () => {
    const j = tipped();
    expect(tipAmount(j)).toBe(60);
    expect(billableAmount(j)).toBe(360);   // the client agreed to pay it
    expect(netRevenueAmount(j)).toBe(300); // the company earned 300
    expect(collectedCompanyAmount(j)).toBe(300);
    expect(outstandingAmount(j)).toBe(0);
  });

  it('is not taxed and keeps collected + outstanding = gross revenue', () => {
    const s = accountingSummary([tipped()], 2026, 5, 8.25);
    expect(s.grossRevenue).toBe(300);
    expect(s.collected).toBe(300);
    expect(s.outstanding).toBe(0);
    expect(s.collected + s.outstanding).toBe(s.grossRevenue);
    expect(s.estimatedTax).toBeCloseTo(24.75, 2); // 8.25% of 300, NOT of 360
  });

  it('passes to the technician in full instead of at the commission rate', () => {
    const users = [{ id: 'u-tech', name: 'Tech', role: 'technician', commissionRate: 40 }] as User[];
    const [row] = revenueByTechnician([tipped()], 2026, 5, users);
    expect(row.revenue).toBe(300);
    expect(row.commission).toBe(120); // 40% of 300
    expect(row.tips).toBe(60);
    expect(row.payout).toBe(180);     // 120 + 60, not 40% of 360 = 144
  });
});

describe('revenue lands on the local calendar day, not the UTC one', () => {
  it('keeps an evening job in the month it was finished', () => {
    // 20:15 local on the last day of June. As a UTC instant this is 1 July in Arizona,
    // and slicing the ISO string used to move the money — and the commission — into July.
    const evening = job({
      lineItems: [li('labor', 850)],
      scheduledDate: '2026-06-30',
      completedAt: new Date(2026, 5, 30, 20, 15, 0).toISOString(),
      paymentStatus: 'paid', amountPaid: 850, assignedTo: 'u-tech',
    });
    expect(accountingSummary([evening], 2026, 5).grossRevenue).toBe(850); // June
    expect(accountingSummary([evening], 2026, 6).grossRevenue).toBe(0);   // not July

    const users = [{ id: 'u-tech', name: 'Tech', role: 'technician', commissionRate: 25 }] as User[];
    expect(revenueByTechnician([evening], 2026, 5, users)[0].commission).toBe(212.5);
    expect(revenueByTechnician([evening], 2026, 6, users)[0].commission).toBe(0);
  });
});

describe('accounting summary', () => {
  it('uses part cost, not price, for COGS', () => {
    const j = job({ lineItems: [li('labor', 200), li('part', 100, 2, 30)], paymentStatus: 'paid', amountPaid: 400 });
    const s = accountingSummary([j], 2026, 5);
    expect(s.grossRevenue).toBe(400);
    expect(s.partsCost).toBe(60);       // 2 × $30 cost, not 2 × $100 price
    expect(s.grossProfit).toBe(340);
  });

  it('ignores cancelled work', () => {
    const s = accountingSummary([job({ status: 'cancelled' })], 2026, 5);
    expect(s.grossRevenue).toBe(0);
    expect(s.jobCount).toBe(0);
  });
});
