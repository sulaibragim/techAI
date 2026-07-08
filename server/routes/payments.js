import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSMS } from '../services/openphone.js';
import { sendPushToRoles } from '../services/push.js';
import { stripeConfigured, webhookConfigured, createCheckoutSession, verifyStripeSignature, publicBase } from '../services/stripe.js';

export const paymentsRouter = Router();

const money = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;

const balanceOf = (j) => {
  const total = j.totalAmount || 0;
  const paid = j.paymentStatus === 'paid' ? total : j.paymentStatus === 'partial' ? (j.amountPaid || 0) : 0;
  return Math.max(0, total - paid);
};

async function companyName() {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    return (rows[0] && JSON.parse(rows[0].value).companyName) || 'Your locksmith';
  } catch { return 'Your locksmith'; }
}

// Is card payment available? Drives showing/hiding the "Text pay link" button.
paymentsRouter.get('/status', requireAuth, (_req, res) => {
  res.json({ enabled: stripeConfigured() });
});

// Create a checkout link for a job and (by default) text it to the client. Charges the
// outstanding balance unless `amount` asks for less (in-person deposits) — never more.
// Returns the URL either way so the UI can copy/share/QR it too.
paymentsRouter.post('/link', requireAuth, async (req, res) => {
  if (!stripeConfigured()) return res.status(503).json({ error: 'Card payments not configured (STRIPE_SECRET_KEY)' });
  try {
    const { jobId, sms = true, amount } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const { rows } = await db.query('SELECT id, data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0].data;

    // Technicians may only bill their own job.
    if (req.user.role === 'technician' && job.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const balance = balanceOf(job);
    if (balance < 1) return res.status(400).json({ error: 'No outstanding balance on this job' });

    let charge = balance;
    if (amount !== undefined) {
      const a = Number(amount);
      if (!Number.isFinite(a) || a < 1) return res.status(400).json({ error: 'Invalid amount' });
      charge = Math.min(Math.round(a * 100) / 100, balance);
    }

    const company = await companyName();
    const session = await createCheckoutSession({
      jobId,
      jobNumber: job.jobNumber || jobId,
      amountCents: Math.round(charge * 100),
      companyName: company,
      base: publicBase(req),
    });

    let smsSent = false;
    const phone = (job.client?.phone || '').trim();
    if (sms && phone) {
      const first = (job.client?.firstName || '').trim() || 'there';
      const ok = await sendSMS(phone, `Hi ${first}, you can pay your balance of ${money(charge)} for job #${job.jobNumber || jobId} securely by card here: ${session.url} — ${company}`);
      smsSent = !!ok;
    }
    res.json({ url: session.url, balance, amount: charge, smsSent });
  } catch (err) {
    console.error('[payments] link error:', err.message);
    res.status(502).json({ error: 'Could not create payment link' });
  }
});

// Lightweight payment-state poll for the in-person card flow: the JobDetail modal asks
// every few seconds whether the webhook has marked the job paid.
paymentsRouter.get('/job/:jobId/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [req.params.jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0].data;
    if (req.user.role === 'technician' && job.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    res.json({
      paymentStatus: job.paymentStatus || 'unpaid',
      amountPaid: job.amountPaid || 0,
      paidAt: job.paidAt || null,
      paymentMethod: job.paymentMethod || null,
    });
  } catch (err) {
    console.error('[payments] status error:', err.message);
    res.status(500).json({ error: 'Could not read payment status' });
  }
});

// ─── Stripe webhook ────────────────────────────────────────────────────────────
// Mounted with express.raw (see index.js) — signature verification needs the exact bytes.
// checkout.session.completed → mark the job paid/partial. Idempotent via session id.
paymentsRouter.post('/webhook', async (req, res) => {
  if (!webhookConfigured()) return res.status(503).json({ error: 'Webhook secret not configured' });
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  res.sendStatus(200); // ack fast; Stripe retries on non-2xx

  try {
    if (event.type !== 'checkout.session.completed') return;
    const session = event.data?.object;
    if (!session || session.payment_status !== 'paid') return;
    const jobId = session.metadata?.jobId || session.client_reference_id;
    if (!jobId) return;

    const { rows } = await db.query('SELECT id, data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) { console.warn('[payments] webhook for unknown job', jobId); return; }
    const job = rows[0].data;

    // Stripe redelivers events — the session id list makes reprocessing a no-op.
    const seen = Array.isArray(job.stripeSessions) ? job.stripeSessions : [];
    if (seen.includes(session.id)) return;

    const amount = (session.amount_total || 0) / 100;
    const now = new Date().toISOString();
    const total = job.totalAmount || 0;
    const newPaid = Math.round(((job.paymentStatus === 'partial' ? (job.amountPaid || 0) : 0) + amount) * 100) / 100;
    const fullyPaid = newPaid >= total - 0.01;

    const updated = {
      ...job,
      amountPaid: newPaid,
      paymentStatus: fullyPaid ? 'paid' : 'partial',
      paymentMethod: 'Card',
      paidAt: job.paidAt || now,
      // Collected money must count as revenue — mirror the manual collect flow: a job
      // still in a pre-sale status gets promoted to 'sold' so the payment shows up in
      // revenue/A-R/payroll instead of vanishing from the books.
      status: job.status === 'completed' || job.status === 'sold' ? job.status : 'sold',
      stripeSessions: [...seen, session.id],
      updatedAt: now,
    };
    await db.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
    console.log(`[payments] ${money(amount)} received on job ${job.jobNumber || jobId} (${fullyPaid ? 'paid in full' : `balance ${money(Math.max(0, total - newPaid))}`})`);

    const who = [job.client?.firstName, job.client?.lastName].filter(Boolean).join(' ');
    sendPushToRoles(['owner', 'manager'], {
      title: `Payment received — ${money(amount)}`,
      body: `Job #${job.jobNumber || jobId}${who ? ` · ${who}` : ''} paid by card${fullyPaid ? ' (settled in full)' : ''}.`,
      tag: `pay-${session.id}`,
      data: { type: 'payment', jobId, url: '/' },
    }).catch(() => {});
  } catch (err) {
    console.error('[payments] webhook processing error:', err.message);
  }
});

// ─── Client-facing landing pages after checkout ────────────────────────────────
// The payer is NOT a CRM user, so these render outside the app — tiny static pages.
export const payPagesRouter = Router();

const page = (emoji, title, body) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
.card{max-width:420px}.e{font-size:56px}h1{font-size:22px;margin:16px 0 8px}p{color:#94a3b8;font-size:15px;line-height:1.5;margin:0}</style>
</head><body><div class="card"><div class="e">${emoji}</div><h1>${title}</h1><p>${body}</p></div></body></html>`;

payPagesRouter.get('/success', (_req, res) => {
  res.type('html').send(page('✅', 'Payment received', 'Thank you! Your payment went through and your balance is settled. A receipt has been sent to you by Stripe.'));
});
payPagesRouter.get('/cancelled', (_req, res) => {
  res.type('html').send(page('↩️', 'Payment cancelled', 'No charge was made. You can use the payment link again anytime, or contact us to pay another way.'));
});
