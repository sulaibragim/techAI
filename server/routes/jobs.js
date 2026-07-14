import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendSMS } from '../services/openphone.js';
import { sendPushToUser } from '../services/push.js';
import { getClientLang, claimOnce, t, SPANISH_INVITE } from '../services/messages.js';

export const jobsRouter = Router();

const isTech = (req) => req.user.role === 'technician';

// SMS the technician a job was just assigned to. Best-effort; never blocks the request.
// Skips self-assignment (a tech picking up their own job shouldn't text themselves).
async function notifyAssignedTech(assigneeId, job, actingUserId) {
  if (!assigneeId || assigneeId === actingUserId) return;
  const c = job.client || {};
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const when = [job.scheduledDate, job.scheduledTime].filter(Boolean).join(' ');

  // Push to the tech's installed app — fires even if they have no phone on file.
  sendPushToUser(assigneeId, {
    title: 'New job assigned to you',
    body: [name && `Client: ${name}`, c.address, when && `When: ${when}`].filter(Boolean).join(' · ')
      || 'Open the app to view it.',
    tag: `job-${job.id || job.jobNumber || assigneeId}`,
    data: { type: 'assignment', jobId: job.id || null, url: '/' },
  }).catch(e => console.error('[JOBS] push error:', e));

  try {
    const { rows } = await db.query('SELECT name, phone FROM users WHERE id = $1', [assigneeId]);
    const tech = rows[0];
    if (!tech?.phone) {
      console.warn('[JOBS] assigned tech has no phone — skipping SMS', assigneeId);
      return;
    }
    const text = [
      'New job assigned to you',
      job.jobNumber && `Job #${job.jobNumber}`,
      name && `Client: ${name}`,
      c.phone && `Phone: ${c.phone}`,
      c.address && `Address: ${c.address}`,
      job.complaint && `Issue: ${job.complaint}`,
      when && `When: ${when}`,
      'Open the app and tap Accept to take this job.',
    ].filter(Boolean).join('\n');
    await sendSMS(tech.phone, text);
  } catch (err) {
    console.error('[JOBS] notify tech error:', err);
  }
}

// Look up a user's display name for notification text.
async function userName(id) {
  try {
    const { rows } = await db.query('SELECT name FROM users WHERE id = $1', [id]);
    return rows[0]?.name || 'A technician';
  } catch { return 'A technician'; }
}

// Company display name from the settings blob (for client-facing texts).
async function companyName() {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    return (rows[0] && JSON.parse(rows[0].value).companyName) || 'your locksmith';
  } catch { return 'your locksmith'; }
}

// "Your technician has arrived" — texts the CLIENT when the job first goes On Site.
// Lives on the server so it fires no matter where the status changed (job card,
// Kanban drag, tech's phone). Best-effort, never blocks the request.
async function notifyClientArrived(job, techId) {
  const phone = (job.client?.phone || '').trim();
  if (!phone) return;
  const lang = await getClientLang(phone);
  const first = (job.client?.firstName || '').trim() || (lang === 'es' ? 'hola' : 'there');
  const [tech, company] = await Promise.all([
    techId ? userName(techId) : Promise.resolve(lang === 'es' ? 'Su técnico' : 'Your technician'),
    companyName(),
  ]);
  await sendSMS(phone, t('arrived', lang, { name: first, tech, company }));
}

// Booking confirmation — texts the CLIENT once when a job scheduled for a future slot is
// created, so they know who's coming and when (ASAP jobs skip this: the tech's On My Way
// SMS covers them). Idempotent via claimOnce so it can't double-send.
async function notifyBookingConfirmed(job, jobId) {
  if (!job.scheduledAhead) return;
  const phone = (job.client?.phone || '').trim();
  if (!phone) return;
  if (!(await claimOnce(jobId, 'booking'))) return;

  const lang = await getClientLang(phone);
  const first = (job.client?.firstName || '').trim() || (lang === 'es' ? 'hola' : 'there');
  const [tech, company] = await Promise.all([
    job.assignedTo ? userName(job.assignedTo) : Promise.resolve(''),
    companyName(),
  ]);
  const when = [job.scheduledDate, job.scheduledTime].filter(Boolean).join(' ');
  let text = t('bookingScheduled', lang, { name: first, tech: tech || '', company, when });
  if (lang !== 'es') text += SPANISH_INVITE; // one-time Spanish invite while they're on English
  await sendSMS(phone, text);
  console.log('[JOBS] booking confirmation →', phone, lang);
}

// Alert the dispatchers (active owners/managers with a phone, plus LEAD_NOTIFY_PHONE)
// about a tech lifecycle milestone. Best-effort SMS; skips the acting user so nobody
// texts themselves.
async function notifyDispatchers(text, excludeUserId) {
  try {
    const recipients = new Set();
    if (process.env.LEAD_NOTIFY_PHONE) recipients.add(process.env.LEAD_NOTIFY_PHONE.trim());
    const { rows } = await db.query(
      "SELECT id, phone FROM users WHERE role IN ('owner', 'manager') AND active = true AND phone IS NOT NULL AND phone <> ''"
    );
    for (const r of rows) { if (r.id !== excludeUserId) recipients.add(r.phone.trim()); }
    for (const to of recipients) await sendSMS(to, text);
  } catch (err) {
    console.error('[JOBS] dispatcher notify error:', err);
  }
}

// Payment truth lives on the server: the Stripe webhook and the refund route write the
// ledger (session ids, charges, refunds) straight into the row, but a client only ever
// PUTs the copy of the job it had in memory — which predates those writes and would wipe
// them (a refund then finds no charge to reverse, and settled money falls out of revenue).
// Every client write is merged through here so the ledger survives.
const REVENUE_STATUSES = new Set(['sold', 'completed']);

function preservePaymentTruth(incoming, existing) {
  if (!existing) return incoming;
  const out = { ...incoming };

  for (const key of ['stripeSessions', 'stripePayments', 'refunds']) {
    if (existing[key] !== undefined) out[key] = existing[key];
  }

  // Collected money can only be reduced by the refund route (which writes the DB itself),
  // never by a client that simply hadn't seen the payment yet.
  const exPaid = existing.amountPaid || 0;
  if (exPaid > (incoming.amountPaid || 0) + 0.005) {
    out.amountPaid = existing.amountPaid;
    out.paymentStatus = existing.paymentStatus;
    if (existing.paymentMethod) out.paymentMethod = existing.paymentMethod;
  }
  if (!out.paidAt && existing.paidAt) out.paidAt = existing.paidAt;

  // A settled job must stay in a revenue status — a stale client copy can't drag it back
  // to en-route/on-site and drop the sale out of the books.
  const settled = (out.amountPaid || 0) > 0 || out.paymentStatus === 'paid' || out.paymentStatus === 'partial';
  if (settled && REVENUE_STATUSES.has(existing.status) && !REVENUE_STATUSES.has(out.status) && out.status !== 'cancelled') {
    out.status = existing.status;
  }
  return out;
}

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
    // Skip any job the user has deleted elsewhere — tombstones prevent resurrection on sync.
    const { rows: tombs } = await client.query('SELECT id FROM job_tombstones');
    const deleted = new Set(tombs.map(t => t.id));

    // Load the stored owner + freshness stamp for every incoming id in one query.
    // Owner gates a technician's writes (can't hijack a job by claiming assignedTo=self);
    // updatedAt gates EVERYONE's bulk sync — a device that sat offline for a week logs
    // in and pushes its whole local list, and without this check those stale copies
    // would overwrite every fresher edit a teammate made on the server since.
    const ids = jobs.map(j => j.id).filter(Boolean);
    const existing = new Map();
    if (ids.length > 0) {
      const { rows: existingRows } = await client.query(
        "SELECT id, data, data->>'assignedTo' AS assigned, data->>'updatedAt' AS updated FROM jobs WHERE id = ANY($1)",
        [ids]
      );
      for (const r of existingRows) existing.set(r.id, r);
    }

    for (const job of jobs) {
      const { id, ...data } = job;
      if (!id || deleted.has(id)) continue;
      const ex = existing.get(id);
      if (isTech(req)) {
        if (data.assignedTo !== req.user.id) continue;        // payload must assign to self
        if (ex && (ex.assigned || null) !== req.user.id) continue; // can't seize an existing job owned by someone else
      }
      if (ex) {
        // Bulk sync may only move a stored row FORWARD in time. An unstamped payload
        // can't prove freshness; an older/equal stamp means the server copy is newer
        // (or identical). Deliberate single edits go through PUT /:id, not here.
        if (!data.updatedAt) continue;
        if (ex.updated && data.updatedAt <= ex.updated) continue;
      }
      const merged = preservePaymentTruth(data, ex?.data);
      await client.query(
        `INSERT INTO jobs (id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(merged)]
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
    // POST doubles as an upsert (the client falls back to it when a PUT 404s), so the
    // ledger has to be protected here too.
    const { rows: prior } = await db.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    const merged = preservePaymentTruth(data, prior[0]?.data);
    await db.query(
      'INSERT INTO jobs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()',
      [jobId, JSON.stringify(merged)]
    );
    if (data.assignedTo) {
      notifyAssignedTech(data.assignedTo, { ...data, id: jobId }, req.user.id).catch(e => console.error('[JOBS] notify error:', e));
    }
    // Scheduled-for-later jobs get a client-facing booking confirmation (ASAP ones don't).
    notifyBookingConfirmed(data, jobId).catch(e => console.error('[JOBS] booking notify error:', e));
    res.json({ id: jobId, ...data });
  } catch (err) {
    console.error('[JOBS] create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update job — technicians may only update jobs assigned to them.
jobsRouter.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: existing } = await db.query(
      "SELECT data, data->>'assignedTo' AS assigned, data->>'status' AS status, data->>'acceptanceStatus' AS acceptance FROM jobs WHERE id = $1",
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Job not found' });
    const prevData = existing[0].data;
    const prevAssigned = existing[0].assigned || null;
    const prevStatus = existing[0].status || null;
    const prevAcceptance = existing[0].acceptance || null;

    if (isTech(req) && prevAssigned !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id: _id, ...data } = req.body;

    // A tech working their own job may bill it, change status, add notes/photos, or
    // decline (which clears the assignee) — but must not hand it to a DIFFERENT tech.
    if (isTech(req) && data.assignedTo && data.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Technicians cannot reassign a job to someone else' });
    }
    const merged = preservePaymentTruth(data, prevData);
    const result = await db.query(
      'UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, JSON.stringify(merged)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found' });

    // Newly assigned (or reassigned) to a different tech → text them.
    if (data.assignedTo && data.assignedTo !== prevAssigned) {
      notifyAssignedTech(data.assignedTo, { ...data, id: req.params.id }, req.user.id).catch(e => console.error('[JOBS] notify error:', e));
    }

    // Tech lifecycle milestones → alert the dispatchers (owner/manager) by SMS. "On My
    // Way" sets both enRoute and accepted at once, so prefer the stronger "on the way"
    // alert and skip the redundant "accepted". Fire-and-forget so the response isn't held.
    const wentEnRoute = data.status === 'enRoute' && prevStatus !== 'enRoute';
    const justAccepted = data.acceptanceStatus === 'accepted' && prevAcceptance !== 'accepted';
    const justDeclined = data.acceptanceStatus === 'declined' && prevAcceptance !== 'declined';

    // First transition to On Site → text the client their tech has arrived.
    if (data.status === 'onSite' && prevStatus !== 'onSite') {
      notifyClientArrived(data, data.assignedTo).catch(e => console.error('[JOBS] arrived notify error:', e));
    }
    if (wentEnRoute || justAccepted || justDeclined) {
      (async () => {
        const actor = await userName(req.user.id);
        const label = `#${data.jobNumber || req.params.id}`;
        const who = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(' ');
        const suffix = who ? ` — ${who}` : '';
        if (wentEnRoute) await notifyDispatchers(`${actor} is on the way to job ${label}${suffix}`, req.user.id);
        else if (justAccepted) await notifyDispatchers(`${actor} accepted job ${label}${suffix}`, req.user.id);
        if (justDeclined) await notifyDispatchers(`${actor} DECLINED job ${label}${suffix} — needs reassignment`, req.user.id);
      })().catch(e => console.error('[JOBS] lifecycle notify error:', e));
    }

    res.json({ id: req.params.id, ...data });
  } catch (err) {
    console.error('[JOBS] update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete job — owner only. Records a tombstone so the job cannot resurrect via sync.
jobsRouter.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    await db.query(
      'INSERT INTO job_tombstones (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET deleted_at = NOW()',
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('[JOBS] delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
