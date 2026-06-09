import { Router } from 'express';
import { db } from '../db.js';

export const jobsRouter = Router();

// Get all jobs
jobsRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT id, data FROM jobs ORDER BY created_at DESC');
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync jobs (bulk upsert from client)
jobsRouter.post('/sync', async (req, res) => {
  try {
    const jobs = req.body;
    if (!Array.isArray(jobs)) return res.status(400).json({ error: 'Expected array of jobs' });

    for (const job of jobs) {
      const { id, ...data } = job;
      await db.query(
        `INSERT INTO jobs (id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );
    }

    const { rows } = await db.query('SELECT id, data FROM jobs ORDER BY created_at DESC');
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create job
jobsRouter.post('/', async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const jobId = id || `job-${Date.now()}`;
    await db.query(
      'INSERT INTO jobs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()',
      [jobId, JSON.stringify(data)]
    );
    res.json({ id: jobId, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update job
jobsRouter.put('/:id', async (req, res) => {
  try {
    const { id: _id, ...data } = req.body;
    await db.query(
      'UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, JSON.stringify(data)]
    );
    res.json({ id: req.params.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete job
jobsRouter.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
