import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const settingsRouter = Router();

// Get settings — any authenticated user. The Gemini key is withheld from technicians.
settingsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    if (rows.length === 0) return res.json({});
    const value = JSON.parse(rows[0].value);
    if (req.user.role === 'technician') delete value.geminiApiKey;
    res.json(value);
  } catch (err) {
    console.error('[SETTINGS] get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update settings (merge patch) — owner or manager only.
settingsRouter.put('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }
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
    console.error('[SETTINGS] update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
