import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const jobsRouter = Router();

const isTech = (req) => req.user.role === 'technician';

// Get jobs — technicians see only jobs assigned to them.
jobsRouter.get('/', requireAuth, async (req, res) => {
  try {
    let rows;
    if (isTech(req)) {
      ({ rows } = await db.query(
        "SELECT id, data FROM jobs WHERE data->>'assignedTo' = $1 ORDER BY created_at DESC",
        [req.user.id]
      ));
    } else {
      ({ rows } = await db.query('SELECT id, data FROM jobs ORDER BY created_at DESC'));
    }
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    console.error('[JOBS] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync jobs (bulk upsert) — wrapped in a transaction. Technicians may only sync their own jobs.
jobsRouter.post('/sync', requireAuth, async (req, res) => {
  const jobs = req.body;
  if (!Array.isArray(jobs)) return res.status(400).json({ error: 'Expected array of jobs' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const job of jobs) {
      const { id, ...data } = job;
      if (!id) continue;
      if (isTech(req) && data.assignedTo !== req.user.id) continue; // techs cannot write others' jobs
      await client.query(
        `INSERT INTO jobs (id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[JOBS] sync error:', err);
    client.release();
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  try {
    let rows;
    if (isTech(req)) {
      ({ rows } = await db.query(
        "SELECT id, data FROM jobs WHERE data->>'assignedTo' = $1 ORDER BY created_at DESC",
        [req.user.id]
      ));
    } else {
      ({ rows } = await db.query('SELECT id, data FROM jobs ORDER BY created_at DESC'));
    }
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    console.error('[JOBS] sync read-back error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create job — any authenticated user. Technicians may only create jobs assigned to themselves.
jobsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (isTech(req)) data.assignedTo = req.user.id;
    const jobId = id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.query(
      'INSERT INTO jobs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()',
      [jobId, JSON.stringify(data)]
    );
    res.json({ id: jobId, ...data });
  } catch (err) {
    console.error('[JOBS] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update job — technicians may only update jobs assigned to them.
jobsRouter.put('/:id', requireAuth, async (req, res) => {
  try {
    if (isTech(req)) {
      const { rows } = await db.query("SELECT data->>'assignedTo' AS assigned FROM jobs WHERE id = $1", [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
      if (rows[0].assigned !== req.user.id) return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const { id: _id, ...data } = req.body;
    const result = await db.query(
      'UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, JSON.stringify(data)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
    res.json({ id: req.params.id, ...data });
  } catch (err) {
    console.error('[JOBS] update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete job — owner only.
jobsRouter.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('[JOBS] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
