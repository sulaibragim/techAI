import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const settingsRouter = Router();

// The settings blob mixes company info with business financials. Technicians only get
// what their UI actually needs (price book for invoices, client profiles for the job
// card, company identity) — the expense ledger, stock ledger, and revenue targets are
// the owner's books and must not ship to every tech's phone just because they hold a token.
const TECH_HIDDEN_KEYS = ['expenses', 'stockMovements', 'monthlyTargets'];

// Get settings — any authenticated user. The Gemini key is never returned to any client;
// it lives only in the server env (GEMINI_API_KEY). Any legacy key still in the DB is stripped.
settingsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    if (rows.length === 0) return res.json({});
    const value = JSON.parse(rows[0].value);
    delete value.geminiApiKey;
    if (req.user.role === 'technician') {
      for (const k of TECH_HIDDEN_KEYS) delete value[k];
      // A tech may see their OWN personal goal, but not everyone else's.
      if (value.techTargets && typeof value.techTargets === 'object') {
        const own = value.techTargets[req.user.id];
        value.techTargets = own !== undefined ? { [req.user.id]: own } : {};
      }
    }
    res.json(value);
  } catch (err) {
    console.error('[SETTINGS] get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Merge helpers ─────────────────────────────────────────────────────────────
// Ledgers (expenses, stockMovements) and keyed maps (clientProfiles, targets) are edited
// from several devices at once. Clients therefore send DELTAS (just the new entry / the
// changed key), and the server unions them into what it already holds — a whole-array
// overwrite from device A used to silently drop whatever device B added a minute earlier.

const sortStamp = (x) => String(x?.timestamp || x?.date || '');

function unionById(current, incoming, cap) {
  const map = new Map();
  for (const item of [...(incoming || []), ...(current || [])]) {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  }
  const out = [...map.values()].sort((a, b) => sortStamp(b).localeCompare(sortStamp(a)));
  return cap ? out.slice(0, cap) : out;
}

const mergeMap = (current, incoming) => ({ ...(current || {}), ...(incoming || {}) });

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

    // replaceLedgers=true is the explicit "wipe" escape hatch (factory reset) — without
    // it, ledger/map fields always UNION so concurrent devices can't erase each other.
    if (!patch.replaceLedgers) {
      if (patch.expenses) merged.expenses = unionById(current.expenses, patch.expenses);
      if (patch.stockMovements) merged.stockMovements = unionById(current.stockMovements, patch.stockMovements, 2000);
      if (patch.clientProfiles) merged.clientProfiles = mergeMap(current.clientProfiles, patch.clientProfiles);
      if (patch.monthlyTargets) merged.monthlyTargets = mergeMap(current.monthlyTargets, patch.monthlyTargets);
      if (patch.techTargets) merged.techTargets = mergeMap(current.techTargets, patch.techTargets);
    }

    // Deletions arrive as explicit ops (an id list / a zeroed key), not as an absent
    // element — absence is indistinguishable from "this device just hasn't seen it yet".
    if (Array.isArray(patch.removedExpenseIds) && merged.expenses) {
      const gone = new Set(patch.removedExpenseIds);
      merged.expenses = merged.expenses.filter((e) => !gone.has(e?.id));
    }
    if (merged.techTargets && typeof merged.techTargets === 'object') {
      for (const [k, v] of Object.entries(merged.techTargets)) {
        if (!(Number(v) > 0)) delete merged.techTargets[k];
      }
    }
    delete merged.removedExpenseIds; // transport-only keys — never persisted
    delete merged.replaceLedgers;

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
