import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendSMS } from '../services/openphone.js';
import { sendPushToUser } from '../services/push.js';

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
        "SELECT id, data->>'assignedTo' AS assigned, data->>'updatedAt' AS updated FROM jobs WHERE id = ANY($1)",
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
    if (data.assignedTo) {
      notifyAssignedTech(data.assignedTo, { ...data, id: jobId }, req.user.id).catch(e => console.error('[JOBS] notify error:', e));
    }
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
      "SELECT data->>'assignedTo' AS assigned, data->>'status' AS status, data->>'acceptanceStatus' AS acceptance FROM jobs WHERE id = $1",
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Job not found' });
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
    const result = await db.query(
      'UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, JSON.stringify(data)]
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
