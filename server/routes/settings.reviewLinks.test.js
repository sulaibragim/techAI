import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';

// Review links ride the settings blob as deltas. These drive the real route against an
// in-memory settings row, because the subtle part is the merge: the old single Google
// link must survive the first edit, and must NOT come back after the owner deletes it.

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

const OLD = 'https://g.page/r/OLD123/review';
const yelp = { id: 'rev-y', platform: 'yelp', label: 'Yelp', url: 'https://www.yelp.com/writeareview/biz/abc' };

describe('review links in settings', () => {
  it('serves the old single Google link as the list', async () => {
    stored = JSON.stringify({ googleReviewUrl: OLD });
    const s = await get();
    expect(s.reviewLinks).toEqual([{ id: 'google-legacy', platform: 'google', label: 'Google', url: OLD }]);
  });

  it('keeps the old link when the first new one is added', async () => {
    stored = JSON.stringify({ googleReviewUrl: OLD });
    expect((await put({ reviewLinks: [yelp] })).status).toBe(200);
    expect(saved().reviewLinks.map(l => l.id)).toEqual(['google-legacy', 'rev-y']);
  });

  it('a deleted old link stays deleted', async () => {
    stored = JSON.stringify({ googleReviewUrl: OLD });
    await put({ removedReviewLinkIds: ['google-legacy'] });
    expect(saved().reviewLinks).toEqual([]);
    expect(saved().removedReviewLinkIds).toBeUndefined();
    expect((await get()).reviewLinks).toEqual([]);
  });

  it('edits replace by id and keep the order', async () => {
    stored = JSON.stringify({ reviewLinks: [{ id: 'g', platform: 'google', label: 'Google', url: OLD }, yelp] });
    await put({ reviewLinks: [{ id: 'g', platform: 'google', label: 'Google Mesa', url: 'https://g.page/r/NEW/review' }] });
    expect(saved().reviewLinks.map(l => l.label)).toEqual(['Google Mesa', 'Yelp']);
  });

  it('drops links a phone could not open', async () => {
    await put({ reviewLinks: [{ id: 'bad', platform: 'other', label: 'x', url: 'javascript:alert(1)' }, yelp] });
    expect(saved().reviewLinks).toEqual([yelp]);
  });

  it('an unrelated save does not freeze the old link into the list', async () => {
    stored = JSON.stringify({ googleReviewUrl: OLD });
    await put({ companyName: 'TrustKey' });
    expect(saved().reviewLinks).toBeUndefined();
    expect((await get()).reviewLinks).toHaveLength(1);
  });

  it('technicians get the links (they send the request from the job card)', async () => {
    stored = JSON.stringify({ reviewLinks: [yelp], expenses: [{ id: 'e' }] });
    const s = await get('technician');
    expect(s.reviewLinks).toEqual([yelp]);
    expect(s.expenses).toBeUndefined();
  });

  it('technicians cannot change them', async () => {
    expect((await put({ reviewLinks: [yelp] }, 'technician')).status).toBe(403);
  });
});
