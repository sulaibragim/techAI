import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildReadiness } from '../services/readiness.js';

export const adminRouter = Router();

// Live launch-readiness report. Owner only — it names which subsystems are unconfigured,
// which is a map of where to attack an incomplete deploy. Returns statuses, never secrets.
adminRouter.get('/readiness', requireAuth, requireRole('owner'), async (_req, res) => {
  try {
    res.json(await buildReadiness());
  } catch (err) {
    console.error('[ADMIN] readiness error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const FRESH_SETTINGS = {
  technicianName: '',
  companyName: '',
  companyAddress: '',
  companyCity: '',
  companyPhone: '',
  companyEmail: '',
  licenseNumber: '',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
  monthlyTargets: {},
  taxRate: 0,
  geminiApiKey: '',
  onboardingComplete: false,
};

// Wipe all company data (jobs, inventory, team) and re-trigger onboarding.
// Keeps the requesting owner's account. Owner only.
adminRouter.post('/reset', requireAuth, requireRole('owner'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM jobs');
    await client.query('DELETE FROM job_tombstones');
    await client.query('DELETE FROM inventory');
    await client.query('DELETE FROM calls');
    await client.query('DELETE FROM messages');
    await client.query('DELETE FROM pending_jobs');
    await client.query('DELETE FROM users WHERE id <> $1', [req.user.id]);
    await client.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('company', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(FRESH_SETTINGS)]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ADMIN] reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});
