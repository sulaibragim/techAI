import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

// What the phone desk writes into the settings blob: lost-call notes (why a caller didn't
// book) and the owner's edits to the call script. Both arrive as deltas from several devices,
// so the merge is the part worth testing — against the real route, on an in-memory row.

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

const lost = (id, timestamp, reason = 'price') => ({ id, timestamp, reason });

describe('lost-call notes', () => {
  it('two managers marking calls at the same time both keep theirs, newest first', async () => {
    await put({ lostCalls: [lost('a', '2026-09-18T15:00:00.000Z')] }, 'manager');
    await put({ lostCalls: [lost('b', '2026-09-18T16:00:00.000Z', 'wait')] }, 'manager');
    expect(saved().lostCalls.map(l => l.id)).toEqual(['b', 'a']);
  });

  it('a removed note stays removed and the transport key is not stored', async () => {
    stored = JSON.stringify({ lostCalls: [lost('a', '2026-09-18T15:00:00.000Z'), lost('b', '2026-09-18T16:00:00.000Z')] });
    await put({ removedLostCallIds: ['a'] });
    expect(saved().lostCalls.map(l => l.id)).toEqual(['b']);
    expect(saved().removedLostCallIds).toBeUndefined();
  });

  it('technicians and the warehouse never receive them', async () => {
    stored = JSON.stringify({ companyName: 'TrustKey Locksmith', lostCalls: [lost('a', '2026-09-18T15:00:00.000Z')] });
    expect((await get('technician')).lostCalls).toBeUndefined();
    expect((await get('warehouse')).lostCalls).toBeUndefined();
    expect((await get('manager')).lostCalls).toHaveLength(1);
  });

  it('a technician cannot write one', async () => {
    expect((await put({ lostCalls: [lost('a', '2026-09-18T15:00:00.000Z')] }, 'technician')).status).toBe(403);
  });
});

describe('call-script edits', () => {
  it('two edits to different lines both survive; a reset line goes back to the built-in one', async () => {
    await put({ scriptOverrides: { 'car-lockout/Цена': { say: "It's {price:r-car-lockout} flat.", hint: '' } } });
    await put({ scriptOverrides: { 'answer/licensed': { say: 'Arizona has no locksmith license.', hint: '' } } }, 'manager');
    expect(Object.keys(saved().scriptOverrides).sort()).toEqual(['answer/licensed', 'car-lockout/Цена']);

    await put({ removedScriptOverrideIds: ['answer/licensed'] });
    expect(Object.keys(saved().scriptOverrides)).toEqual(['car-lockout/Цена']);
    expect(saved().removedScriptOverrideIds).toBeUndefined();
  });

  it('technicians never receive them', async () => {
    stored = JSON.stringify({ scriptOverrides: { 'rekey/Цена': { say: 'x' } } });
    expect((await get('technician')).scriptOverrides).toBeUndefined();
    expect((await get('owner')).scriptOverrides).toEqual({ 'rekey/Цена': { say: 'x' } });
  });
});

describe('training results', () => {
  it('each person writes only their own record; the owner reads everyone, a technician nobody', async () => {
    await put({ trainingResults: { 'u-anna': { attempts: 1, bestScore: 20, total: 21, lastAt: '2026-09-18T15:00:00.000Z' } } }, 'manager');
    await put({ trainingResults: { 'u-oleg': { attempts: 2, bestScore: 21, total: 21, lastAt: '2026-09-18T16:00:00.000Z', passedAt: '2026-09-18T16:00:00.000Z' } } }, 'manager');
    expect(Object.keys(saved().trainingResults).sort()).toEqual(['u-anna', 'u-oleg']);
    expect((await get('owner')).trainingResults['u-oleg'].passedAt).toBe('2026-09-18T16:00:00.000Z');
    expect((await get('technician')).trainingResults).toBeUndefined();
  });
});

describe('call reviews', () => {
  const review = (id, timestamp) => ({ id, timestamp, managerId: 'u-anna', scores: [2, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] });

  it('reviews from two devices both stay; a removed one goes; technicians never see them', async () => {
    await put({ callReviews: [review('r1', '2026-09-18T15:00:00.000Z')] });
    await put({ callReviews: [review('r2', '2026-09-18T16:00:00.000Z')] }, 'manager');
    expect(saved().callReviews.map(r => r.id)).toEqual(['r2', 'r1']);
    await put({ removedCallReviewIds: ['r1'] });
    expect(saved().callReviews.map(r => r.id)).toEqual(['r2']);
    expect(saved().removedCallReviewIds).toBeUndefined();
    expect((await get('technician')).callReviews).toBeUndefined();
  });
});
