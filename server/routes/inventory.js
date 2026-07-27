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
    // Only prune server-side parts when the caller explicitly asks to REPLACE the whole
    // catalog (?replace=true). Default is merge/upsert — a stale client must not silently
    // delete parts another device just added. Single-part removal uses DELETE /:id.
    if (req.query.replace === 'true' && ids.length > 0) {
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

// Wipe the whole catalog — owner only, and never reachable by accident: the client must
// send ?confirm=WIPE. The stock ledger goes with it, because a movement log pointing at
// parts that no longer exist reads as history the shelf can't back up.
//
// This exists because the catalog could be poisoned from the outside: an old browser with
// demo parts in localStorage seeded them into this table (see syncInventory), and from then
// on every device downloaded invented stock as the truth. Deleting parts one at a time
// couldn't keep up with that.
inventoryRouter.delete('/', requireAuth, requireRole('owner'), async (req, res) => {
  if (req.query.confirm !== 'WIPE') {
    return res.status(400).json({ error: 'Refusing to wipe without ?confirm=WIPE' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM inventory');
    // Settings is a single JSON blob in a TEXT column — read, drop the ledger, write back.
    const { rows } = await client.query("SELECT value FROM settings WHERE key = 'company' FOR UPDATE");
    if (rows.length > 0) {
      const value = JSON.parse(rows[0].value);
      value.stockMovements = [];
      await client.query(
        "UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'company'",
        [JSON.stringify(value)]
      );
    }
    await client.query('COMMIT');
    console.log(`[INVENTORY] catalog wiped by ${req.user.email || req.user.id} — ${del.rowCount} parts removed`);
    res.json({ deleted: del.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[INVENTORY] wipe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Apply a signed stock DELTA. Two problems this solves:
//
//  1. A technician billing a part on their own job used to PUT the whole part, which is
//     owner/manager-only. The 403 was never read, so the shelf count dropped locally,
//     the client was invoiced, and the next login snapped stock back up. Inventory drifted
//     high forever and the reorder point never tripped.
//  2. Absolute writes clobber each other. Two people receiving stock from a stale screen
//     each wrote their own total, so one receipt vanished while the ledger kept both.
//     The arithmetic happens in SQL here, so concurrent movements add up.
//
// A technician may move stock in either direction — they consume a part on a job, or put
// an unused one back — but only against a job assigned to them, and every movement is
// recorded in the stock ledger with their name. Free-hand adjustments stay owner/manager.
inventoryRouter.post('/:id/movement', requireAuth, async (req, res) => {
  try {
    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'delta must be a non-zero number' });
    if (Math.abs(delta) > 10000) return res.status(400).json({ error: 'Implausible quantity' });

    if (req.user.role === 'technician') {
      const jobId = req.body?.jobId;
      if (!jobId) return res.status(403).json({ error: 'Technicians can only move stock against one of their jobs' });
      const { rows } = await db.query("SELECT data->>'assignedTo' AS assigned FROM jobs WHERE id = $1", [jobId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
      if (rows[0].assigned !== req.user.id) return res.status(403).json({ error: 'Not your job' });
    }

    const { rows } = await db.query(
      `UPDATE inventory
          SET data = jsonb_set(data, '{stock}',
                to_jsonb(GREATEST(0, COALESCE((data->>'stock')::numeric, 0) + $2::numeric))),
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, data`,
      [req.params.id, delta]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Part not found' });
    res.json({ id: rows[0].id, ...rows[0].data });
  } catch (err) {
    console.error('[INVENTORY] movement error:', err);
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
