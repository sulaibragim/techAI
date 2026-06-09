import { Router } from 'express';
import { db } from '../db.js';

export const settingsRouter = Router();

// Get all settings
settingsRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    if (rows.length === 0) return res.json({});
    res.json(JSON.parse(rows[0].value));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings (merge patch)
settingsRouter.put('/', async (req, res) => {
  try {
    const patch = req.body;
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    const current = rows.length > 0 ? JSON.parse(rows[0].value) : {};
    const merged = { ...current, ...patch };
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('company', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(merged)]
    );
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
