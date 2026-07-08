import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSMS } from '../services/openphone.js';
import { sendPushToRoles } from '../services/push.js';
import { getClientLang, t, claimOnce } from '../services/messages.js';
import { sendEmail, emailConfigured } from '../services/email.js';
import { stripeConfigured, webhookConfigured, createCheckoutSession, createRefund, getSessionPayment, getPaymentFee, verifyStripeSignature, publicBase } from '../services/stripe.js';

export const paymentsRouter = Router();

const money = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;

const balanceOf = (j) => {
  const total = j.totalAmount || 0;
  const paid = j.paymentStatus === 'paid' ? total : j.paymentStatus === 'partial' ? (j.amountPaid || 0) : 0;
  return Math.max(0, total - paid);
};

// How much has actually been collected (refundable ceiling).
const paidOf = (j) => (j.paymentStatus === 'paid' ? (j.amountPaid ?? j.totalAmount ?? 0) : j.amountPaid || 0);

async function companyInfo() {
  const fallback = { companyName: 'Your locksmith' };
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    return rows[0] ? { ...fallback, ...JSON.parse(rows[0].value) } : fallback;
  } catch { return fallback; }
}

async function companyName() {
  return (await companyInfo()).companyName || 'Your locksmith';
}

// ─── Client receipt link ───────────────────────────────────────────────────────
// Stateless secret URL: HMAC of the job id, so no token storage and no way to
// enumerate other jobs' receipts. The page itself is public (the payer isn't a user).
const RECEIPT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const receiptSig = (jobId) => crypto.createHmac('sha256', RECEIPT_SECRET).update(`receipt:${jobId}`).digest('hex').slice(0, 20);
const receiptUrlFor = (base, jobId) => (base ? `${base}/pay/receipt/${encodeURIComponent(jobId)}/${receiptSig(jobId)}` : '');

// Itemized receipt HTML — served at the public receipt URL and reused as the email body.
export function receiptHtml(job, jobId, co) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const total = job.totalAmount || 0;
  const paid = paidOf(job);
  const refunded = (Array.isArray(job.refunds) ? job.refunds : []).reduce((s, r) => s + (r.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const status = paid < 0.01 && refunded > 0 ? 'REFUNDED' : job.paymentStatus === 'paid' ? 'PAID' : job.paymentStatus === 'partial' ? 'PARTIALLY PAID' : 'BALANCE DUE';
  const statusColor = status === 'PAID' ? '#22c55e' : status === 'REFUNDED' ? '#f59e0b' : status === 'PARTIALLY PAID' ? '#3b82f6' : '#ef4444';
  const when = job.paidAt ? new Date(job.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const items = (job.lineItems || []).map(li => `
    <tr>
      <td>${esc(li.description)}<span class="muted"> × ${li.quantity}</span></td>
      <td class="num">${money((li.unitPrice || 0) * (li.quantity || 1))}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt — ${esc(co.companyName)}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;display:flex;justify-content:center}
  .card{background:#1e293b;border:1px solid rgba(255,255,255,.08);border-radius:16px;max-width:460px;width:100%;padding:28px}
  h1{font-size:18px;margin:0;color:#e2e8f0}
  .muted{color:#94a3b8;font-size:12px}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#0f172a;background:${statusColor};margin-top:10px}
  table{width:100%;border-collapse:collapse;margin:18px 0}
  td{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px;color:#e2e8f0}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .totals td{border-bottom:none;padding:5px 0}
  .grand td{font-weight:800;font-size:16px;padding-top:10px}
  .foot{margin-top:20px;color:#64748b;font-size:11px;line-height:1.6;text-align:center}
</style></head><body><div class="card">
  <h1>${esc(co.companyName)}</h1>
  <div class="muted">${esc([co.companyAddress, co.companyCity].filter(Boolean).join(', '))}${co.companyPhone ? ' · ' + esc(co.companyPhone) : ''}${co.licenseNumber ? ' · Lic# ' + esc(co.licenseNumber) : ''}</div>
  <div class="badge">${status}</div>
  <table>
    <tr><td class="muted">Receipt</td><td class="num muted">Job #${esc(job.jobNumber || jobId)}</td></tr>
    <tr><td class="muted">Client</td><td class="num">${esc([job.client?.firstName, job.client?.lastName].filter(Boolean).join(' '))}</td></tr>
    ${when ? `<tr><td class="muted">Paid on</td><td class="num">${esc(when)}${job.paymentMethod ? ' · ' + esc(job.paymentMethod) : ''}</td></tr>` : ''}
  </table>
  <table>${items}
    <tr class="totals grand"><td>Total</td><td class="num">${money(total)}</td></tr>
    <tr class="totals"><td class="muted">Paid</td><td class="num" style="color:#22c55e">${money(paid + refunded)}</td></tr>
    ${refunded > 0 ? `<tr class="totals"><td class="muted">Refunded</td><td class="num" style="color:#f59e0b">−${money(refunded)}</td></tr>` : ''}
    ${balance > 0.01 ? `<tr class="totals"><td class="muted">Balance due</td><td class="num" style="color:#ef4444">${money(balance)}</td></tr>` : ''}
  </table>
  <div class="foot">Thank you for choosing ${esc(co.companyName)}!${co.companyEmail ? `<br>Questions? ${esc(co.companyEmail)}` : ''}</div>
</div></body></html>`;
}

// Thank-you + receipt SMS in the client's language. Fire-and-forget from callers.
async function sendReceiptSMS({ job, jobId, amount, balance, base }) {
  const phone = (job.client?.phone || '').trim();
  if (!phone) return false;
  const lang = await getClientLang(phone);
  const name = (job.client?.firstName || '').trim() || 'there';
  const company = await companyName();
  return !!(await sendSMS(phone, t('paymentReceived', lang, {
    name, company,
    jobNo: job.jobNumber || jobId,
    amount, balance,
    receiptUrl: receiptUrlFor(base, jobId),
  })));
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
      customerEmail: (job.client?.email || '').trim(), // Stripe emails its own receipt
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

// Send the client a receipt — SMS (thank-you + link), email (full itemized HTML), or
// both. The card flow texts automatically via the webhook; this covers cash/check/Zelle
// settles, re-sends, and the email channel.
paymentsRouter.post('/receipt', requireAuth, async (req, res) => {
  try {
    const { jobId, channels = ['sms'] } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const wants = Array.isArray(channels) ? channels : [channels];
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0].data;
    if (req.user.role === 'technician' && job.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const paid = paidOf(job);
    if (paid < 0.01) return res.status(400).json({ error: 'No payment recorded on this job' });

    const result = { smsSent: false, emailSent: false, emailConfigured: emailConfigured() };
    if (wants.includes('sms') && (job.client?.phone || '').trim()) {
      result.smsSent = await sendReceiptSMS({
        job, jobId,
        amount: paid,
        balance: Math.max(0, (job.totalAmount || 0) - paid),
        base: publicBase(req),
      });
    }
    if (wants.includes('email')) {
      const to = (job.client?.email || '').trim();
      if (to && emailConfigured()) {
        const co = await companyInfo();
        result.emailSent = await sendEmail({
          to,
          subject: `Receipt from ${co.companyName} — Job #${job.jobNumber || jobId}`,
          html: receiptHtml(job, jobId, co),
        });
      }
    }
    res.json({ ...result, receiptUrl: receiptUrlFor(publicBase(req), jobId) });
  } catch (err) {
    console.error('[payments] receipt error:', err.message);
    res.status(500).json({ error: 'Could not send receipt' });
  }
});

// ─── Refunds ───────────────────────────────────────────────────────────────────
// Owner/manager only. Card money goes back through Stripe against the recorded
// PaymentIntents (newest first); cash/check/Zelle is bookkeeping only. Optionally
// cancels the job so a voided service leaves the revenue books too.
paymentsRouter.post('/refund', requireAuth, async (req, res) => {
  if (req.user.role === 'technician') return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    const { jobId, amount, cancelJob = false } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const refundAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(refundAmount) || refundAmount < 0.01) return res.status(400).json({ error: 'Invalid amount' });

    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = rows[0].data;

    const paid = paidOf(job);
    if (refundAmount > paid + 0.005) {
      return res.status(400).json({ error: `Refund exceeds collected amount (${money(paid)})` });
    }

    // Card charges on file: recorded by the webhook, or recovered from legacy
    // session ids for jobs paid before stripePayments existed.
    let payments = Array.isArray(job.stripePayments) ? [...job.stripePayments] : [];
    if (payments.length === 0 && Array.isArray(job.stripeSessions) && job.stripeSessions.length > 0 && stripeConfigured()) {
      for (const sid of job.stripeSessions) {
        try {
          const p = await getSessionPayment(sid);
          if (p) payments.push(p);
        } catch (e) { console.warn('[payments] session lookup failed:', e.message); }
      }
    }

    // How much each intent can still give back (prior refunds subtracted).
    const priorRefunds = Array.isArray(job.refunds) ? job.refunds : [];
    const refundedByIntent = new Map();
    for (const r of priorRefunds) {
      if (r.intent) refundedByIntent.set(r.intent, (refundedByIntent.get(r.intent) || 0) + (r.amount || 0));
    }

    const now = new Date().toISOString();
    const newRefunds = [];
    let remaining = refundAmount;

    if (payments.length > 0) {
      if (!stripeConfigured()) return res.status(503).json({ error: 'Card payments not configured (STRIPE_SECRET_KEY)' });
      for (const p of payments.reverse()) { // newest charge first
        if (remaining < 0.01) break;
        const available = Math.max(0, (p.amount || 0) - (refundedByIntent.get(p.intent) || 0));
        if (available < 0.01) continue;
        const slice = Math.min(remaining, available);
        const r = await createRefund({ paymentIntent: p.intent, amountCents: Math.round(slice * 100) });
        newRefunds.push({ id: r.id, intent: p.intent, amount: slice, at: now, by: req.user.id, method: 'card' });
        remaining = Math.round((remaining - slice) * 100) / 100;
      }
      if (remaining >= 0.01) {
        // Card charges couldn't cover it (e.g. part was paid in cash) — the rest is
        // recorded as a manual refund the tech hands back outside Stripe.
        newRefunds.push({ id: `manual-${Date.now()}`, amount: remaining, at: now, by: req.user.id, method: 'manual' });
        remaining = 0;
      }
    } else {
      newRefunds.push({ id: `manual-${Date.now()}`, amount: refundAmount, at: now, by: req.user.id, method: 'manual' });
    }

    const newPaid = Math.max(0, Math.round((paid - refundAmount) * 100) / 100);
    const updated = {
      ...job,
      amountPaid: newPaid,
      paymentStatus: newPaid < 0.01 ? 'unpaid' : newPaid >= (job.totalAmount || 0) - 0.01 ? 'paid' : 'partial',
      refunds: [...priorRefunds, ...newRefunds],
      ...(cancelJob ? { status: 'cancelled' } : {}),
      updatedAt: now,
    };
    await db.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
    console.log(`[payments] refunded ${money(refundAmount)} on job ${job.jobNumber || jobId} (${newRefunds.map(r => r.method).join('+')})${cancelJob ? ' — job cancelled' : ''}`);

    // Tell the client (their language), tell the bosses (push).
    const phone = (job.client?.phone || '').trim();
    if (phone && newRefunds.some(r => r.method === 'card')) {
      const lang = await getClientLang(phone);
      const name = (job.client?.firstName || '').trim() || 'there';
      sendSMS(phone, t('refundIssued', lang, {
        name, company: await companyName(),
        jobNo: job.jobNumber || jobId,
        amount: newRefunds.filter(r => r.method === 'card').reduce((s, r) => s + r.amount, 0),
      })).catch(() => {});
    }
    const who = [job.client?.firstName, job.client?.lastName].filter(Boolean).join(' ');
    sendPushToRoles(['owner', 'manager'], {
      title: `Refund issued — ${money(refundAmount)}`,
      body: `Job #${job.jobNumber || jobId}${who ? ` · ${who}` : ''}${cancelJob ? ' (job cancelled)' : ''}.`,
      tag: `refund-${jobId}-${Date.now()}`,
      data: { type: 'refund', jobId, url: '/' },
    }).catch(() => {});

    res.json({
      refunded: refundAmount,
      refunds: updated.refunds,
      amountPaid: updated.amountPaid,
      paymentStatus: updated.paymentStatus,
      status: updated.status,
    });
  } catch (err) {
    console.error('[payments] refund error:', err.message);
    res.status(502).json({ error: err.message || 'Could not process refund' });
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
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    // Actual Stripe fee — makes the Accounting ledger match the bank to the cent.
    // Best-effort: a lookup failure just leaves the fee estimated client-side.
    let feeInfo = null;
    if (intentId) {
      try { feeInfo = await getPaymentFee(intentId); }
      catch (e) { console.warn('[payments] fee lookup failed:', e.message); }
    }

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
      // PaymentIntent + amount per charge — what /refund needs to send money back.
      stripePayments: [
        ...(Array.isArray(job.stripePayments) ? job.stripePayments : []),
        ...(intentId ? [{ intent: intentId, amount, ...(feeInfo ? { fee: feeInfo.fee, net: feeInfo.net } : {}), at: now }] : []),
      ],
      updatedAt: now,
    };
    await db.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
    console.log(`[payments] ${money(amount)} received on job ${job.jobNumber || jobId} (${fullyPaid ? 'paid in full' : `balance ${money(Math.max(0, total - newPaid))}`})`);

    // Thank-you + receipt link to the payer — once per checkout session even if
    // Stripe redelivers the event.
    if (await claimOnce(jobId, `receipt-${session.id}`)) {
      sendReceiptSMS({ job, jobId, amount, balance: Math.max(0, total - newPaid), base: publicBase(req) })
        .catch(e => console.error('[payments] receipt sms error:', e.message));
    }

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

// Full itemized receipt at an unguessable URL — texted to the client after payment.
// Public by design (the payer isn't a CRM user); the HMAC path segment is the auth.
payPagesRouter.get('/receipt/:jobId/:sig', async (req, res) => {
  const { jobId, sig } = req.params;
  const expected = receiptSig(jobId);
  const got = Buffer.from(String(sig));
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return res.sendStatus(404);

  try {
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) return res.sendStatus(404);
    const job = rows[0].data;
    const co = await companyInfo();
    res.type('html').send(receiptHtml(job, jobId, co));
  } catch (err) {
    console.error('[payments] receipt page error:', err.message);
    res.sendStatus(500);
  }
});
