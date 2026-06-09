import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const inventoryRouter = Router();

// List inventory — any authenticated user (technicians need to see stock).
inventoryRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT id, data FROM inventory ORDER BY id');
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    console.error('[INVENTORY] list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk sync — owner/manager only. Transactional. Replaces the full catalog (deletes removed items).
inventoryRouter.post('/sync', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of parts' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ids = items.map(i => i.id).filter(Boolean);
    for (const item of items) {
      const { id, ...data } = item;
      if (!id) continue;
      await client.query(
        `INSERT INTO inventory (id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );
    }
    // Remove parts no longer present in the client catalog.
    if (ids.length > 0) {
      await client.query('DELETE FROM inventory WHERE NOT (id = ANY($1))', [ids]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[INVENTORY] sync error:', err);
    client.release();
    return res.status(500).json({ error: 'Internal server error' });
  }
  client.release();

  try {
    const { rows } = await db.query('SELECT id, data FROM inventory ORDER BY id');
    res.json(rows.map(r => ({ id: r.id, ...r.data })));
  } catch (err) {
    console.error('[INVENTORY] sync read-back error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upsert a single part — owner/manager only.
inventoryRouter.put('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { id: _id, ...data } = req.body;
    await db.query(
      `INSERT INTO inventory (id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [req.params.id, JSON.stringify(data)]
    );
    res.json({ id: req.params.id, ...data });
  } catch (err) {
    console.error('[INVENTORY] upsert error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a part — owner/manager only.
inventoryRouter.delete('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Part not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('[INVENTORY] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
