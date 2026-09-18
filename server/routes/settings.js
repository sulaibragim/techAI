import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { reviewLinksOf, cleanReviewLink, MAX_REVIEW_LINKS } from '../services/reviewLinks.js';

export const settingsRouter = Router();

// The settings blob mixes company info with business financials. Technicians only get
// what their UI actually needs (price book for invoices, client profiles for the job
// card, company identity) — the expense ledger, stock ledger, and revenue targets are
// the owner's books and must not ship to every tech's phone just because they hold a token.
// techHomes are where the team lives — only the people who dispatch need them.
const TECH_HIDDEN_KEYS = ['expenses', 'stockMovements', 'monthlyTargets', 'aiMemories', 'lostCalls', 'scriptOverrides', 'trainingResults', 'callReviews', 'techHomes'];

// The кладовщик works the shelf: he needs the stock ledger (it IS his work) but has no
// business holding the expense book, revenue targets, the customer base or home addresses.
const WAREHOUSE_HIDDEN_KEYS = ['expenses', 'monthlyTargets', 'techTargets', 'aiMemories', 'lostCalls', 'scriptOverrides', 'trainingResults', 'callReviews', 'techHomes'];

// Client profiles are keyed by the last 10 digits of the phone number.
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Everyone may take the training; a technician or the кладовщик reads back only their own record.
const ownTraining = (value, userId) => {
  const own = value.trainingResults?.[userId];
  return own ? { [userId]: own } : {};
};

/** Narrow the client-profile map to the customers on this technician's own jobs. */
async function profilesForTech(userId, profiles) {
  if (!profiles || typeof profiles !== 'object') return profiles;
  try {
    const { rows } = await db.query(
      "SELECT data->'client'->>'phone' AS phone FROM jobs WHERE data->>'assignedTo' = $1",
      [userId]
    );
    const mine = new Set(rows.map(r => last10(r.phone)).filter(Boolean));
    const out = {};
    for (const [key, profile] of Object.entries(profiles)) {
      if (mine.has(last10(key))) out[key] = profile;
    }
    return out;
  } catch (e) {
    // Can't prove which are theirs — send none rather than the whole book.
    console.error('[SETTINGS] client profile scoping failed:', e.message);
    return {};
  }
}

// Get settings — any authenticated user. The Gemini key is never returned to any client;
// it lives only in the server env (GEMINI_API_KEY). Any legacy key still in the DB is stripped.
settingsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    if (rows.length === 0) return res.json({});
    const value = JSON.parse(rows[0].value);
    delete value.geminiApiKey;
    value.reviewLinks = reviewLinksOf(value);
    if (req.user.role === 'technician') {
      const training = ownTraining(value, req.user.id);
      for (const k of TECH_HIDDEN_KEYS) delete value[k];
      value.trainingResults = training;
      // A tech may see their OWN personal goal, but not everyone else's.
      if (value.techTargets && typeof value.techTargets === 'object') {
        const own = value.techTargets[req.user.id];
        value.techTargets = own !== undefined ? { [req.user.id]: own } : {};
      }
      // Client profiles carry reputation tags and a field documented as a "private
      // manager note" — for the WHOLE customer base. A technician needs the profile of
      // the people they are actually visiting, not everyone the company has ever served.
      value.clientProfiles = await profilesForTech(req.user.id, value.clientProfiles);
    }
    if (req.user.role === 'warehouse') {
      const training = ownTraining(value, req.user.id);
      for (const k of WAREHOUSE_HIDDEN_KEYS) delete value[k];
      value.trainingResults = training;
      value.clientProfiles = {};
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

// A tech's home: the label the owner sees and the pin the drive to a client starts from.
// Without real coordinates it can't measure anything, so it isn't kept.
function cleanTechHome(v) {
  if (!v || typeof v !== 'object') return null;
  const { lat, lng } = v;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { address: typeof v.address === 'string' ? v.address.trim().slice(0, 200) : '', lat, lng };
}

// Order-preserving union for display lists (price book): keep the current order,
// swap in updated entries by id, append genuinely new ones at the end.
function unionKeepOrder(current, incoming) {
  const byId = new Map((incoming || []).filter(x => x?.id).map(x => [x.id, x]));
  const out = (current || []).map(x => (x?.id && byId.has(x.id) ? byId.get(x.id) : x));
  const have = new Set(out.map(x => x?.id));
  for (const item of incoming || []) if (item?.id && !have.has(item.id)) out.push(item);
  return out;
}

// A training record is small and shaped: counts, dates, practised role-plays. Anything else
// is dropped, anything malformed refused — this route is open to every role.
function cleanTrainingResult(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const isDate = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
  const out = {};
  for (const k of ['attempts', 'bestScore', 'total']) {
    const n = Number(body[k] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return null;
    out[k] = n;
  }
  for (const k of ['lastAt', 'passedAt', 'aboutReadAt']) {
    if (body[k] == null) continue;
    if (!isDate(body[k])) return null;
    out[k] = body[k];
  }
  if (body.roleplays != null) {
    if (typeof body.roleplays !== 'object' || Array.isArray(body.roleplays)) return null;
    const entries = Object.entries(body.roleplays);
    if (entries.length > 50) return null;
    out.roleplays = {};
    for (const [id, at] of entries) {
      if (!/^[a-z0-9-]{1,60}$/.test(id) || !isDate(at)) return null;
      out.roleplays[id] = at;
    }
  }
  return out;
}

// Anyone signed in keeps their own training record (the test, practice calls, "about us" read).
// Only their own: whose record it is comes from the token, never from the body.
settingsRouter.put('/training', requireAuth, async (req, res) => {
  try {
    const result = cleanTrainingResult(req.body);
    if (!result) return res.status(400).json({ error: 'Invalid training result' });
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    const current = rows.length > 0 ? JSON.parse(rows[0].value) : {};
    current.trainingResults = { ...(current.trainingResults || {}), [req.user.id]: result };
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('company', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(current)]
    );
    res.json({ trainingResults: { [req.user.id]: result } });
  } catch (err) {
    console.error('[SETTINGS] training save error:', err);
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

    // replaceLedgers=true is the explicit "wipe" escape hatch (factory reset) — without
    // it, ledger/map fields always UNION so concurrent devices can't erase each other.
    if (!patch.replaceLedgers) {
      if (patch.expenses) merged.expenses = unionById(current.expenses, patch.expenses);
      if (patch.stockMovements) merged.stockMovements = unionById(current.stockMovements, patch.stockMovements, 2000);
      if (patch.priceBook) merged.priceBook = unionKeepOrder(current.priceBook, patch.priceBook);
      if (patch.aiMemories) merged.aiMemories = unionById(current.aiMemories, patch.aiMemories, 100);
      if (patch.lostCalls) merged.lostCalls = unionById(current.lostCalls, patch.lostCalls, 1000);
      if (patch.callReviews) merged.callReviews = unionById(current.callReviews, patch.callReviews, 500);
      if (patch.clientProfiles) merged.clientProfiles = mergeMap(current.clientProfiles, patch.clientProfiles);
      if (patch.monthlyTargets) merged.monthlyTargets = mergeMap(current.monthlyTargets, patch.monthlyTargets);
      if (patch.techTargets) merged.techTargets = mergeMap(current.techTargets, patch.techTargets);
      if (patch.techHomes) merged.techHomes = mergeMap(current.techHomes, patch.techHomes);
      if (patch.supplierAliases) merged.supplierAliases = mergeMap(current.supplierAliases, patch.supplierAliases);
      if (patch.smsTemplates) merged.smsTemplates = mergeMap(current.smsTemplates, patch.smsTemplates);
      if (patch.scriptOverrides) merged.scriptOverrides = mergeMap(current.scriptOverrides, patch.scriptOverrides);
      if (patch.trainingResults) merged.trainingResults = mergeMap(current.trainingResults, patch.trainingResults);
      if (patch.reviewLinks) {
        const incoming = (Array.isArray(patch.reviewLinks) ? patch.reviewLinks : []).map(cleanReviewLink).filter(Boolean);
        merged.reviewLinks = unionKeepOrder(reviewLinksOf(current), incoming);
      }
      if (patch.importedInvoices) {
        // String set with newest-first order, capped — the duplicate-invoice guard.
        merged.importedInvoices = [...new Set([...(patch.importedInvoices || []), ...(current.importedInvoices || [])])].slice(0, 200);
      }
    }

    // Deletions arrive as explicit ops (an id list / a zeroed key), not as an absent
    // element — absence is indistinguishable from "this device just hasn't seen it yet".
    if (Array.isArray(patch.removedExpenseIds) && merged.expenses) {
      const gone = new Set(patch.removedExpenseIds);
      merged.expenses = merged.expenses.filter((e) => !gone.has(e?.id));
    }
    if (Array.isArray(patch.removedServiceRateIds) && merged.priceBook) {
      const gone = new Set(patch.removedServiceRateIds);
      merged.priceBook = merged.priceBook.filter((r) => !gone.has(r?.id));
    }
    if (Array.isArray(patch.removedCallReviewIds) && merged.callReviews) {
      const gone = new Set(patch.removedCallReviewIds);
      merged.callReviews = merged.callReviews.filter((r) => !gone.has(r?.id));
    }
    if (Array.isArray(patch.removedLostCallIds) && merged.lostCalls) {
      const gone = new Set(patch.removedLostCallIds);
      merged.lostCalls = merged.lostCalls.filter((l) => !gone.has(l?.id));
    }
    if (Array.isArray(patch.removedAiMemoryIds) && merged.aiMemories) {
      const gone = new Set(patch.removedAiMemoryIds);
      merged.aiMemories = merged.aiMemories.filter((m) => !gone.has(m?.id));
    }
    if (Array.isArray(patch.removedSmsTemplateIds) && merged.smsTemplates) {
      for (const id of patch.removedSmsTemplateIds) delete merged.smsTemplates[id];
    }
    if (Array.isArray(patch.removedScriptOverrideIds) && merged.scriptOverrides) {
      for (const key of patch.removedScriptOverrideIds) delete merged.scriptOverrides[key];
    }
    if (Array.isArray(patch.removedReviewLinkIds)) {
      const gone = new Set(patch.removedReviewLinkIds);
      const base = Array.isArray(merged.reviewLinks) ? merged.reviewLinks : reviewLinksOf(current);
      merged.reviewLinks = base.filter((l) => !gone.has(l?.id));
    }
    // Only links a phone can open go out in a client text; never let the list grow unbounded.
    if (Array.isArray(merged.reviewLinks)) {
      merged.reviewLinks = merged.reviewLinks.map(cleanReviewLink).filter(Boolean).slice(0, MAX_REVIEW_LINKS);
    }
    if (merged.techTargets && typeof merged.techTargets === 'object') {
      for (const [k, v] of Object.entries(merged.techTargets)) {
        if (!(Number(v) > 0)) delete merged.techTargets[k];
      }
    }
    // A null home is how a device clears one; anything without a usable pin goes too.
    if (merged.techHomes !== undefined) {
      const homes = {};
      if (merged.techHomes && typeof merged.techHomes === 'object' && !Array.isArray(merged.techHomes)) {
        for (const [k, v] of Object.entries(merged.techHomes)) {
          const home = cleanTechHome(v);
          if (home) homes[k] = home;
        }
      }
      merged.techHomes = homes;
    }
    delete merged.removedExpenseIds; // transport-only keys — never persisted
    delete merged.removedServiceRateIds;
    delete merged.removedAiMemoryIds;
    delete merged.removedLostCallIds;
    delete merged.removedCallReviewIds;
    delete merged.removedScriptOverrideIds;
    delete merged.removedSmsTemplateIds;
    delete merged.removedReviewLinkIds;
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
