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
  const putTraining = async (body, role) => fetch(`${base}/training`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-role': role },
    body: JSON.stringify(body),
  });
  const record = { attempts: 1, bestScore: 20, total: 21, lastAt: '2026-09-18T15:00:00.000Z' };

  it('records from two people both stay; the owner reads everyone', async () => {
    await put({ trainingResults: { 'u-anna': record } }, 'manager');
    await put({ trainingResults: { 'u-oleg': { ...record, attempts: 2, bestScore: 21, passedAt: '2026-09-18T16:00:00.000Z' } } }, 'manager');
    expect(Object.keys(saved().trainingResults).sort()).toEqual(['u-anna', 'u-oleg']);
    expect((await get('owner')).trainingResults['u-oleg'].passedAt).toBe('2026-09-18T16:00:00.000Z');
  });

  it('a technician saves their own record — whose it is comes from the token, not the body', async () => {
    stored = JSON.stringify({ trainingResults: { 'u-anna': record } });
    const res = await putTraining({ ...record, aboutReadAt: '2026-09-18T17:00:00.000Z', userId: 'u-anna', note: 'x'.repeat(5000) }, 'technician');
    expect(res.status).toBe(200);
    expect(saved().trainingResults['u-anna']).toEqual(record);
    expect(saved().trainingResults['u-1']).toEqual({ ...record, aboutReadAt: '2026-09-18T17:00:00.000Z' });
  });

  it('a technician or the кладовщик reads back only their own record', async () => {
    stored = JSON.stringify({ trainingResults: { 'u-anna': record, 'u-1': { ...record, bestScore: 21 } } });
    expect((await get('technician')).trainingResults).toEqual({ 'u-1': { ...record, bestScore: 21 } });
    expect((await get('warehouse')).trainingResults).toEqual({ 'u-1': { ...record, bestScore: 21 } });
    stored = JSON.stringify({ trainingResults: { 'u-anna': record } });
    expect((await get('technician')).trainingResults).toEqual({});
  });

  it('junk is refused', async () => {
    for (const bad of [[], { attempts: -1 }, { attempts: 'many' }, { lastAt: 'yesterday' }, { roleplays: { 'Bad Id': '2026-09-18T15:00:00.000Z' } }, { roleplays: ['dog-in-hot-car'] }]) {
      expect((await putTraining(bad, 'technician')).status, JSON.stringify(bad)).toBe(400);
    }
    expect(stored).toBeNull();
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
