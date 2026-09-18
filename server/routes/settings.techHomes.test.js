import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

// Tech homes: where "who's closest" measures each drive from. Set by the owner from any
// device as per-tech deltas, cleared with null, and never shipped to the techs themselves.

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

const get = async (role = 'owner') => (await fetch(base, { headers: { 'x-role': role } })).json();
const put = async (body, role = 'owner') => fetch(base, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-role': role },
  body: JSON.stringify(body),
});
const saved = () => JSON.parse(stored);

const MESA = { address: '100 S Extension Rd, Mesa, AZ 85210', lat: 33.4133, lng: -111.8656 };
const PHOENIX = { address: '200 W Washington St, Phoenix, AZ 85003', lat: 33.4484, lng: -112.074 };

describe('tech homes', () => {
  it('homes set from two devices both stay', async () => {
    await put({ techHomes: { sultan: MESA } });
    await put({ techHomes: { alex: PHOENIX } });
    expect(saved().techHomes).toEqual({ sultan: MESA, alex: PHOENIX });
  });

  it('a null clears that one home and leaves the rest', async () => {
    stored = JSON.stringify({ techHomes: { sultan: MESA, kamill: MESA } });
    await put({ techHomes: { kamill: null } });
    expect(saved().techHomes).toEqual({ sultan: MESA });
  });

  it('a home without a usable pin is not kept', async () => {
    await put({ techHomes: {
      typed: { address: 'somewhere in Mesa' },
      nulls: { address: 'x', lat: null, lng: null },
      island: { address: 'x', lat: 0, lng: 0 },
      offMap: { address: 'x', lat: 123, lng: -111 },
      ok: MESA,
    } });
    expect(saved().techHomes).toEqual({ ok: MESA });
  });

  it('keeps only the address label and the pin', async () => {
    await put({ techHomes: { sultan: { ...MESA, address: `  ${MESA.address}  `, note: 'gate code 1234' } } });
    expect(saved().techHomes.sultan).toEqual(MESA);
  });

  it('owner and manager see the homes; technicians and the кладовщик do not', async () => {
    stored = JSON.stringify({ companyName: 'TrustKey', techHomes: { sultan: MESA } });
    expect((await get('owner')).techHomes).toEqual({ sultan: MESA });
    expect((await get('manager')).techHomes).toEqual({ sultan: MESA });
    const asTech = await get('technician');
    expect(asTech.companyName).toBe('TrustKey');
    expect(asTech.techHomes).toBeUndefined();
    expect((await get('warehouse')).techHomes).toBeUndefined();
  });

  it('a technician cannot write homes', async () => {
    const res = await put({ techHomes: { u1: MESA } }, 'technician');
    expect(res.status).toBe(403);
    expect(stored).toBeNull();
  });
});
