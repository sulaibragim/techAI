import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { planPriceBookUpgrade, applyPriceBookUpgrade, priceBookUpgradePatch, PRICE_BOOK_VERSION } from '../../priceBook';

// The one-time price-book upgrade is sent by the app as a settings write. This drives the
// real route with exactly what the app sends, against an in-memory settings row: whatever
// the server held, it must end with the same book the device shows.

let stored = null; // the settings row's JSON text

vi.mock('../db.js', () => ({
  db: {
    query: vi.fn(async (sql, params) => {
      if (/SELECT value FROM settings/.test(sql)) return { rows: stored ? [{ value: stored }] : [] };
      if (/INSERT INTO settings/.test(sql)) { stored = params[0]; return { rows: [] }; }
      return { rows: [] };
    }),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u-1', role: req.headers['x-role'] || 'owner' }; next(); },
  requireRole: (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden' })),
}));

const { settingsRouter } = await import('./settings.js');

let server;
let base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/settings`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => { stored = null; });

const put = async (body, role = 'owner') => fetch(base, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-role': role },
  body: JSON.stringify(body),
});
const saved = () => JSON.parse(stored);

// What live installs were seeded with before version 2.
const V1 = [
  { id: 'r-car-lockout', name: 'Car lockout', category: 'Lockout', price: 139, nightPrice: 199, type: 'service_call' },
  { id: 'r-comm-lockout', name: 'Commercial lockout', category: 'Lockout', price: 199, nightPrice: 269, type: 'service_call' },
  { id: 'r-rekey', name: 'Lock rekey (1st door)', category: 'Rekey & Install', price: 149, type: 'labor' },
  { id: 'r-car-key', name: 'Car key (standard)', category: 'Car Keys', price: 99, type: 'labor', note: 'from' },
  { id: 'r-fob-program', name: 'Key fob programming (OEM)', category: 'Car Keys', price: 99, nightPrice: 159, type: 'labor', note: 'customer-supplied' },
];

const upgrade = (deviceBook, serverHasPriceBook) => {
  const plan = planPriceBookUpgrade(deviceBook, 0);
  const next = applyPriceBookUpgrade(deviceBook, plan);
  return { next, patch: priceBookUpgradePatch(plan, next, serverHasPriceBook) };
};

describe('price book upgrade through the settings route', () => {
  it('a server that already holds the book gets only the changes and ends where the device does', async () => {
    stored = JSON.stringify({ companyName: 'TrustKey Locksmith', priceBook: V1 });
    const { next, patch } = upgrade(V1, true);
    expect(patch.priceBook).toHaveLength(2); // the fixed no-chip key + the new extraction rate
    expect((await put(patch)).status).toBe(200);
    expect(saved().priceBook).toEqual(next);
    expect(saved().priceBookVersion).toBe(PRICE_BOOK_VERSION);
    expect(saved().removedServiceRateIds).toBeUndefined();
    expect(saved().companyName).toBe('TrustKey Locksmith');
  });

  it('a server that never held a price book gets the whole book, not two rates', async () => {
    stored = JSON.stringify({ companyName: 'TrustKey Locksmith' });
    const { next, patch } = upgrade(V1, false);
    expect((await put(patch)).status).toBe(200);
    expect(saved().priceBook).toEqual(next);
    expect(saved().priceBook.map(r => r.id)).not.toContain('r-fob-program');
  });

  it('a technician cannot send it', async () => {
    stored = JSON.stringify({ priceBook: V1 });
    expect((await put(upgrade(V1, true).patch, 'technician')).status).toBe(403);
    expect(saved().priceBook).toEqual(V1);
  });
});
