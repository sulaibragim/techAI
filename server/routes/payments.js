import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { jwtSecret } from '../config.js';
import { sendSMS } from '../services/openphone.js';
import { sendPushToRoles } from '../services/push.js';
import { getClientLang, t, claimOnce } from '../services/messages.js';
import { clientSmsEnabled, staffNotifyEnabled } from '../services/businessSettings.js';
import { sendEmail, emailConfigured } from '../services/email.js';
import { stripeConfigured, webhookConfigured, createCheckoutSession, createRefund, getSessionPayment, getPaymentFee, verifyStripeSignature, publicBase, expireCheckoutSession, getChargeIntent, paySig, payUrlFor } from '../services/stripe.js';

export const paymentsRouter = Router();

// Always two decimals — `toLocaleString` alone renders $1,234.50 as "$1,234.5" in the
// pay-link SMS and the owner's push notification.
const money = (n) =>
  `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const balanceOf = (j) => {
  // Net of refunds, and read off the collected amount rather than the 'paid' label —
  // otherwise a refunded job looks owing again and a raised invoice looks settled.
  const refunded = (j.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
  const total = Math.max(0, (j.totalAmount || 0) - refunded);
  const paid = j.paymentStatus === 'paid' ? (j.amountPaid ?? j.totalAmount ?? 0) : j.paymentStatus === 'partial' ? (j.amountPaid || 0) : 0;
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
// Deliberately its OWN secret, falling back to the JWT one only when unset. Sharing
// jwtSecret() meant rotating JWT_SECRET — the standard response to a leaked token —
// silently 404'd every receipt link already texted to a customer. Set RECEIPT_SECRET
// on Railway so the two can be rotated independently; leaving it unset keeps existing
// links working exactly as before.
const RECEIPT_SECRET = (process.env.RECEIPT_SECRET || '').trim() || jwtSecret();
const receiptSig = (jobId) => crypto.createHmac('sha256', RECEIPT_SECRET).update(`receipt:${jobId}`).digest('hex').slice(0, 20);
const receiptUrlFor = (base, jobId) => (base ? `${base}/pay/receipt/${encodeURIComponent(jobId)}/${receiptSig(jobId)}` : '');

// Checkout sessions we created and that may still be open. Kept so they can be killed
// the moment the job is settled some other way — otherwise the client pays cash at the
// door and then taps the still-live link that evening and pays a second time.
async function rememberOpenSession(jobId, sessionId) {
  try {
    await db.query(
      `UPDATE jobs SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{openSessions}',
         COALESCE(data->'openSessions', '[]'::jsonb) || to_jsonb($2::text))
       WHERE id = $1`,
      [jobId, sessionId]
    );
  } catch (e) { console.warn('[payments] could not record open session:', e.message); }
}

/** Expire every open checkout session on a job and clear the list. Best-effort. */
export async function voidOpenSessions(jobId, except) {
  if (!stripeConfigured()) return;
  let ids = [];
  try {
    const { rows } = await db.query("SELECT data->'openSessions' AS s FROM jobs WHERE id = $1", [jobId]);
    ids = Array.isArray(rows[0]?.s) ? rows[0].s : [];
  } catch { return; }
  const doomed = ids.filter(id => id && id !== except);
  for (const id of doomed) {
    try { await expireCheckoutSession(id); }
    catch (e) { console.warn('[payments] could not expire session', id, e.message); }
  }
  if (doomed.length === 0 && ids.length === 0) return;
  try {
    await db.query(
      `UPDATE jobs SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{openSessions}', $2::jsonb) WHERE id = $1`,
      [jobId, JSON.stringify(except ? [except] : [])]
    );
  } catch (e) { console.warn('[payments] could not clear open sessions:', e.message); }
}

// The Download-PDF/Print button can't use an inline onclick: helmet's default CSP ships
// script-src-attr 'none', which silently kills inline handlers (the "button does nothing"
// bug). Instead the page carries one <script> whose sha256 hash is allow-listed in a
// per-route CSP header — everything else stays as strict as helmet's defaults.
export const PRINT_SCRIPT = "document.getElementById('printBtn').addEventListener('click',function(){window.print()});";
const PRINT_SCRIPT_HASH = `'sha256-${crypto.createHash('sha256').update(PRINT_SCRIPT).digest('base64')}'`;
export const RECEIPT_CSP = [
  "default-src 'self'",
  'base-uri \'self\'',
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  `script-src ${PRINT_SCRIPT_HASH}`,
  "script-src-attr 'none'",
  "style-src 'self' https: 'unsafe-inline'",
].join(';');

// Full invoice HTML — a faithful copy of the in-app invoice sheet (letterhead, bill-to,
// line items, totals, terms, client signature). Served at the public receipt URL and
// reused as the email body. opts: { techName, print (Download-PDF button), viewUrl
// (email variant: "View invoice" button — email clients strip data-URI signatures). }
export function receiptHtml(job, jobId, co, opts = {}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const total = job.totalAmount || 0;
  const paid = paidOf(job);
  const refunded = (Array.isArray(job.refunds) ? job.refunds : []).reduce((s, r) => s + (r.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const status = paid < 0.01 && refunded > 0
    ? { label: 'Refunded', bg: '#fef3c7', fg: '#b45309' }
    : job.paymentStatus === 'paid' ? { label: '✓ Paid', bg: '#dcfce7', fg: '#15803d' }
    : job.paymentStatus === 'partial' ? { label: '◐ Partial', bg: '#dbeafe', fg: '#1d4ed8' }
    : { label: 'Payment Due', bg: '#fef3c7', fg: '#b45309' };
  const when = job.paidAt ? new Date(job.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const clientName = esc([job.client?.firstName, job.client?.lastName].filter(Boolean).join(' '));
  const lock = job.lockDetails || {};
  const signature = typeof job.signature === 'string' && job.signature.startsWith('data:image') ? job.signature : null;

  const rows = (job.lineItems || []).map((li, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td><div class="desc">${esc(li.description)}</div><div class="litype">${esc(String(li.type || '').replace('_', ' '))}</div></td>
      <td class="ctr">${li.quantity}</td>
      <td class="num">$${(li.unitPrice || 0).toFixed(2)}</td>
      <td class="num strong">$${((li.unitPrice || 0) * (li.quantity || 1)).toFixed(2)}</td>
    </tr>`).join('');
  // Long invoices tighten up so a typical job still fits one A4 page.
  const dense = (job.lineItems || []).length > 10;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice #${esc(job.jobNumber || jobId)} — ${esc(co.companyName)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#e8edf3;padding:16px;color:#0f172a}
  /* A4 sheet: 794×1123px @96dpi. Bottom block (terms/signatures) is pinned to the base
     so a short invoice still reads as a full document. */
  .sheet{background:#fff;max-width:794px;margin:0 auto;border-radius:12px;box-shadow:0 10px 40px rgba(2,6,23,.12);padding:44px 40px;display:flex;flex-direction:column}
  @media (min-width:600px){.sheet{min-height:1123px}}
  .bottom{margin-top:auto;padding-top:24px}
  .muted{color:#64748b;font-size:12px;line-height:1.7}
  .tiny{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
  /* Slim top bar: invoice number left, date/paid/status right */
  .invbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:3px solid #1d4ed8}
  .invbar .no{font-size:18px;font-weight:800;color:#1e293b}
  .invbar .no span{color:#94a3b8;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-right:8px}
  .invbar .right{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .chip{display:inline-block;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:${status.bg};color:${status.fg}}
  /* Mirrored parties: company left, client right */
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:22px 0;border-bottom:1px solid #f1f5f9}
  .parties p{margin:2px 0}
  .party.rt{text-align:right}
  .co{font-size:20px;font-weight:800;color:#1d4ed8;letter-spacing:-.02em;margin:0 0 6px}
  .name{font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.02em;margin:0 0 6px}
  .jobstrip{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #f1f5f9}
  .jobstrip b{color:#334155;font-size:13px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead td{padding:12px 6px 8px;border-bottom:2px solid #cbd5e1}
  tbody td{padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
  .idx{color:#94a3b8;font-size:12px;width:24px}
  .desc{font-weight:600;color:#1e293b}
  .litype{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(29,78,216,.6);margin-top:2px}
  .ctr{text-align:center;color:#475569;width:44px}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:#475569;width:84px}
  .strong{font-weight:700;color:#1e293b}
  .totals{margin-left:auto;width:240px;margin-top:14px}
  .totals .row{display:flex;justify-content:space-between;font-size:12px;color:#64748b;padding:3px 0}
  .totals .grand{border-top:1px solid #cbd5e1;margin-top:6px;padding-top:8px;align-items:baseline}
  .totals .grand span:first-child{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#1e293b}
  .totals .grand span:last-child{font-size:24px;font-weight:800;color:#0f172a}
  .green{color:#16a34a!important;font-weight:700}
  .amber{color:#d97706!important;font-weight:700}
  .red{color:#dc2626!important;font-weight:700}
  .meta-bar{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;padding:14px 0;margin-top:22px}
  .pill{display:inline-block;font-size:10px;font-weight:700;padding:2px 10px;border-radius:999px;border:1px solid #e2e8f0;color:#64748b;background:#f8fafc;margin-right:4px}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:26px}
  .sigline{height:44px;border-bottom:1px solid #cbd5e1;display:flex;align-items:flex-end}
  .sigline img{max-height:60px;margin-bottom:-8px}
  .sig-script{font-family:'Segoe Script','Brush Script MT',cursive;font-size:24px;color:#1e293b;margin-bottom:-2px;padding-left:6px}
  .diag{margin-top:20px;background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:14px 16px}
  .diag p{margin:6px 0 0;font-size:12.5px;color:#475569;line-height:1.65;white-space:pre-line}
  .foot{text-align:center;color:#94a3b8;font-size:11px;line-height:1.7;margin-top:28px}
  .btn{display:block;text-align:center;margin:18px auto 0;max-width:794px;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.05em;text-transform:uppercase;padding:14px;border-radius:12px;border:none;width:100%;cursor:pointer}
  /* Dense mode (10+ line items): everything tightens so up to ~20 rows still fit one A4. */
  .sheet.dense{padding:24px 32px}
  .dense .co,.dense .name{font-size:16px;margin-bottom:3px}
  .dense .invbar{padding-bottom:8px}
  .dense .invbar .no{font-size:15px}
  .dense .muted{font-size:11px;line-height:1.45}
  .dense .parties{padding:10px 0;gap:24px}
  .dense .jobstrip{padding:8px 0}
  .dense .diag{margin-top:10px;padding:8px 12px}
  .dense .diag p{font-size:11px}
  .dense thead td{padding:8px 6px 6px}
  .dense tbody td{padding:4px 6px;font-size:11.5px}
  .dense .litype{display:none}
  .dense .totals{margin-top:8px}
  .dense .totals .row{padding:2px 0;font-size:11px}
  .dense .totals .grand span:last-child{font-size:20px}
  .dense .meta-bar{padding:8px 0;margin-top:12px}
  .dense .sigs{margin-top:14px;gap:24px}
  .dense .sigline{height:30px}
  .dense .foot{margin-top:10px;font-size:10px}
  .dense .bottom{padding-top:10px}
  /* Print = real A4. Rows never split, the table header repeats on overflow pages,
     and the signature block never gets orphaned from the document. */
  @page{size:A4;margin:11mm}
  @media print{
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;border-radius:0;max-width:none;min-height:auto;padding:0}
    .btn{display:none}
    thead{display:table-header-group}
    tr,.meta-bar,.sigs,.totals{page-break-inside:avoid}
    .bottom{margin-top:16px}
  }
  @media (max-width:480px){.sheet{padding:24px 18px}.inv-meta{text-align:left}}
</style></head><body>
<div class="sheet${dense ? ' dense' : ''}">
  <div class="invbar">
    <div class="no"><span>Invoice</span>#${esc(job.jobNumber || jobId)}</div>
    <div class="right">
      <span class="muted">Date: ${esc(job.scheduledDate || '')}</span>
      ${when ? `<span class="muted">Paid: ${esc(when)}${job.paymentMethod ? ' · ' + esc(job.paymentMethod) : ''}</span>` : '<span class="muted">Due: Upon Receipt</span>'}
      <span class="chip">${status.label}</span>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <p class="tiny" style="margin:0 0 8px">From</p>
      <p class="co">${esc(co.companyName)}</p>
      ${co.companyAddress ? `<p class="muted">${esc(co.companyAddress)}</p>` : ''}
      ${co.companyCity ? `<p class="muted">${esc(co.companyCity)}</p>` : ''}
      ${co.companyPhone ? `<p class="muted">☎ ${esc(co.companyPhone)}</p>` : ''}
      ${co.companyEmail ? `<p class="muted">✉ ${esc(co.companyEmail)}</p>` : ''}
    </div>
    <div class="party rt">
      <p class="tiny" style="margin:0 0 8px">Bill To</p>
      <p class="name">${clientName || '—'}</p>
      ${job.client?.phone ? `<p class="muted">${esc(job.client.phone)}</p>` : ''}
      ${job.client?.email ? `<p class="muted">${esc(job.client.email)}</p>` : ''}
      ${job.client?.address ? `<p class="muted">${esc(job.client.address)}</p>` : ''}
    </div>
  </div>

  <div class="jobstrip">
    <div><span class="tiny" style="margin-right:8px">Job</span> <b>${esc(lock.type || '—')}</b>${lock.brand ? `<span class="muted"> · ${esc(lock.brand)}${lock.modelOrYear ? ' · ' + esc(lock.modelOrYear) : ''}</span>` : ''}</div>
    ${opts.techName ? `<div><span class="tiny" style="margin-right:8px">Technician</span> <b>${esc(opts.techName)}</b></div>` : ''}
  </div>

  <table>
    <thead><tr>
      <td class="tiny">#</td><td class="tiny">Description</td><td class="tiny" style="text-align:center">Qty</td><td class="tiny" style="text-align:right">Unit Price</td><td class="tiny" style="text-align:right">Amount</td>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#cbd5e1;font-style:italic;padding:20px">No line items</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>$${total.toFixed(2)}</span></div>
    <div class="row grand"><span>Total Due</span><span>$${total.toFixed(2)}</span></div>
    ${paid + refunded > 0.009 ? `<div class="row"><span class="green">Amount Paid</span><span class="green">— $${(paid + refunded).toFixed(2)}</span></div>` : ''}
    ${refunded > 0.009 ? `<div class="row"><span class="amber">Refunded</span><span class="amber">$${refunded.toFixed(2)}</span></div>` : ''}
    ${balance > 0.009 ? `<div class="row"><span class="red">Balance Due</span><span class="red">$${balance.toFixed(2)}</span></div>` : ''}
  </div>

  ${(job.diagnosisNotes || '').trim() ? `
  <div class="diag">
    <p class="tiny" style="margin:0">Diagnostic / Technician Notes</p>
    <p>${esc(job.diagnosisNotes.trim())}</p>
  </div>` : ''}

  <div class="bottom">
  <div class="meta-bar">
    <div>
      <p class="tiny" style="margin:0 0 6px">Accepted Payment</p>
      <span class="pill">Cash</span><span class="pill">Card</span><span class="pill">Check</span><span class="pill">Zelle</span>
    </div>
    <div style="text-align:right">
      <p class="tiny" style="margin:0 0 4px">Terms</p>
      <p class="muted" style="margin:0;font-weight:600;color:#475569">Due on Receipt</p>
      <p class="muted" style="margin:2px 0 0">Labor: 90-day warranty</p>
    </div>
  </div>

  <div class="sigs">
    <div>
      <p class="tiny" style="margin:0 0 14px">Technician</p>
      <div class="sigline">${
        typeof opts.techSignature === 'string' && opts.techSignature.startsWith('data:image')
          ? `<img src="${esc(opts.techSignature)}" alt="Technician signature">`
          : opts.techName ? `<span class="sig-script">${esc(opts.techName)}</span>` : ''
      }</div>
      <p class="muted" style="margin-top:4px">${esc(opts.techName || '')}</p>
    </div>
    <div>
      <p class="tiny" style="margin:0 0 14px">Client Authorization</p>
      <div class="sigline">${signature ? `<img src="${esc(signature)}" alt="Client signature">` : ''}</div>
      <p class="muted" style="margin-top:4px">${clientName}</p>
    </div>
  </div>

  <div class="foot">Thank you for choosing ${esc(co.companyName)}!${co.companyEmail ? `<br>Questions? ${esc(co.companyEmail)}` : ''}${co.companyPhone ? ` · ${esc(co.companyPhone)}` : ''}</div>
  </div>
</div>
${opts.viewUrl ? `<a class="btn" href="${esc(opts.viewUrl)}">View invoice online</a>` : ''}
${opts.print ? `<button class="btn" id="printBtn">Download PDF / Print</button><script>${PRINT_SCRIPT}</script>` : ''}
</body></html>`;
}

// Tech name + stored signature for the invoice — best-effort, blank when unassigned.
async function techInfoOf(job) {
  if (!job?.assignedTo) return { name: '', signature: null };
  try {
    const { rows } = await db.query('SELECT name, signature FROM users WHERE id = $1', [job.assignedTo]);
    return { name: rows[0]?.name || '', signature: rows[0]?.signature || null };
  } catch { return { name: '', signature: null }; }
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

// Signed public URL of a job's invoice page — the app's Print button opens this so
// print/PDF/share all go through the one branded invoice renderer.
paymentsRouter.get('/receipt-url/:jobId', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [req.params.jobId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    if (req.user.role === 'technician' && rows[0].data.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    res.json({ url: receiptUrlFor(publicBase(req), req.params.jobId) });
  } catch (err) {
    console.error('[payments] receipt-url error:', err.message);
    res.status(500).json({ error: 'Could not build receipt url' });
  }
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

    // Only the newest link stays live: an older one still open would let the client pay
    // the same balance twice.
    await rememberOpenSession(jobId, session.id);
    await voidOpenSessions(jobId, session.id);

    let smsSent = false;
    const phone = (job.client?.phone || '').trim();
    if (sms && phone) {
      const first = (job.client?.firstName || '').trim() || 'there';
      // Text the durable link, not the raw session URL — the text outlives the session.
      const link = payUrlFor(publicBase(req), jobId) || session.url;
      const ok = await sendSMS(phone, `Hi ${first}, you can pay your balance of ${money(charge)} for job #${job.jobNumber || jobId} securely by card here: ${link} — ${company}`);
      smsSent = !!ok;
    }
    // The QR/copy flow in the app still uses the direct session URL — it's scanned on the
    // spot, so freshness isn't a concern there.
    res.json({ url: session.url, payLink: payUrlFor(publicBase(req), jobId), balance, amount: charge, smsSent });
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
        const tech = await techInfoOf(job);
        result.emailSent = await sendEmail({
          to,
          subject: `Invoice #${job.jobNumber || jobId} from ${co.companyName}`,
          html: receiptHtml(job, jobId, co, {
            techName: tech.name,
            techSignature: tech.signature,
            viewUrl: receiptUrlFor(publicBase(req), jobId),
          }),
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
// Allowlist, not deny-technician: `accountant` is a real role and must not be able to
// push money back out through Stripe just by not being a tech.
paymentsRouter.post('/refund', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  // Concurrency here is guarded by an ADVISORY lock, not a row lock held across the
  // Stripe call. Two managers hitting Refund at the same moment must not both read
  // "collected $500", both pass the ceiling check, and send the customer $500 twice —
  // but the earlier fix (BEGIN … FOR UPDATE … Stripe … COMMIT) locked the job ROW for
  // the whole network round-trip, which also blocks the payment webhook and the tech's
  // job save on that same job. This key only ever contends with another refund on the
  // same job, holds no open transaction, and refuses rather than queues.
  const client = await db.connect();
  let updated, refundAmount, newRefunds, job, jobId, cancelJob, locked = false;
  try {
    ({ jobId, cancelJob = false } = req.body || {});
    const { amount } = req.body || {};
    // These return through the `finally` below, which releases the client — so they must
    // NOT release it themselves.
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    refundAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(refundAmount) || refundAmount < 0.01) return res.status(400).json({ error: 'Invalid amount' });

    // try_ rather than a blocking wait: if another refund on this job is mid-flight,
    // telling the operator to retry beats silently queueing behind a network call.
    const { rows: lockRows } = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS got', [`refund:${jobId}`]
    );
    if (!lockRows[0]?.got) {
      return res.status(409).json({ error: 'Another refund on this job is already being processed. Try again in a moment.' });
    }
    locked = true;

    const { rows } = await client.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) { throw Object.assign(new Error('Job not found'), { httpStatus: 404 }); }
    job = rows[0].data;

    const paid = paidOf(job);
    if (refundAmount > paid + 0.005) {
      throw Object.assign(new Error(`Refund exceeds collected amount (${money(paid)})`), { httpStatus: 400 });
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
    newRefunds = [];
    let remaining = refundAmount;

    if (payments.length > 0) {
      if (!stripeConfigured()) throw Object.assign(new Error('Card payments not configured (STRIPE_SECRET_KEY)'), { httpStatus: 503 });
      for (const p of payments.reverse()) { // newest charge first
        if (remaining < 0.01) break;
        const alreadyOnIntent = refundedByIntent.get(p.intent) || 0;
        const available = Math.max(0, (p.amount || 0) - alreadyOnIntent);
        if (available < 0.01) continue;
        const slice = Math.min(remaining, available);
        // Keyed to the ledger state this refund produces, so a retry after a crash (or a
        // duplicate delivery) collapses into the same refund, while a genuinely separate
        // refund later has a different cumulative total and therefore a different key.
        const idempotencyKey = `rf-${jobId}-${p.intent}-${Math.round((alreadyOnIntent + slice) * 100)}`;
        const r = await createRefund({ paymentIntent: p.intent, amountCents: Math.round(slice * 100), idempotencyKey });
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

    // Money has moved. Now write the ledger in a SHORT transaction, re-reading the row
    // first: the Stripe round-trip took real time, and a payment webhook or a tech's save
    // may have landed on this job meanwhile. Merging onto the fresh copy — rather than
    // writing back the snapshot we read before calling Stripe — keeps that work.
    await client.query('BEGIN');
    try {
      const { rows: freshRows } = await client.query('SELECT data FROM jobs WHERE id = $1 FOR UPDATE', [jobId]);
      const fresh = freshRows[0]?.data || job;
      const freshPaid = paidOf(fresh);
      const newPaid = Math.max(0, Math.round((freshPaid - refundAmount) * 100) / 100);
      updated = {
        ...fresh,
        amountPaid: newPaid,
        paymentStatus: newPaid < 0.01 ? 'unpaid' : newPaid >= (fresh.totalAmount || 0) - 0.01 ? 'paid' : 'partial',
        refunds: [...(Array.isArray(fresh.refunds) ? fresh.refunds : priorRefunds), ...newRefunds],
        ...(cancelJob ? { status: 'cancelled' } : {}),
        updatedAt: now,
      };
      await client.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      // The refund already went through at Stripe — say so loudly, because the books and
      // the processor now disagree and someone has to reconcile by hand.
      console.error('[payments] REFUND SENT BUT NOT RECORDED for job', jobId, '-', e.message);
      throw Object.assign(new Error('Refund was issued at Stripe but could not be recorded. Check the job before retrying.'), { httpStatus: 500 });
    }
  } catch (err) {
    console.error('[payments] refund error:', err.message);
    return res.status(err.httpStatus || 502).json({ error: err.message || 'Could not process refund' });
  } finally {
    // The advisory lock is session-scoped, so it lives on this pooled connection. If the
    // unlock fails we must DISCARD the connection rather than hand it back still holding
    // the lock — otherwise every future refund on this job would 409 forever.
    let unlocked = true;
    if (locked) {
      unlocked = await client
        .query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [`refund:${jobId}`])
        .then(() => true)
        .catch(() => false);
    }
    client.release(unlocked ? undefined : new Error('refund lock could not be released'));
  }

  try {
    console.log(`[payments] refunded ${money(refundAmount)} on job ${job.jobNumber || jobId} (${newRefunds.map(r => r.method).join('+')})${cancelJob ? ' — job cancelled' : ''}`);

    // Tell the client (their language), tell the bosses (push).
    const phone = (job.client?.phone || '').trim();
    if (phone && newRefunds.some(r => r.method === 'card') && await clientSmsEnabled('refund')) {
      const lang = await getClientLang(phone);
      const name = (job.client?.firstName || '').trim() || 'there';
      sendSMS(phone, t('refundIssued', lang, {
        name, company: await companyName(),
        jobNo: job.jobNumber || jobId,
        amount: newRefunds.filter(r => r.method === 'card').reduce((s, r) => s + r.amount, 0),
      })).catch(() => {});
    }
    const who = [job.client?.firstName, job.client?.lastName].filter(Boolean).join(' ');
    staffNotifyEnabled('refund').then(on => on && sendPushToRoles(['owner', 'manager'], {
      title: `Refund issued — ${money(refundAmount)}`,
      body: `Job #${job.jobNumber || jobId}${who ? ` · ${who}` : ''}${cancelJob ? ' (job cancelled)' : ''}.`,
      tag: `refund-${jobId}-${Date.now()}`,
      data: { type: 'refund', jobId, url: '/' },
    })).catch(() => {});

  } catch (err) {
    // Money already moved and the ledger already committed — only notifications failed.
    console.error('[payments] refund notify error:', err.message);
  }

  res.json({
    refunded: refundAmount,
    refunds: updated.refunds,
    amountPaid: updated.amountPaid,
    paymentStatus: updated.paymentStatus,
    status: updated.status,
  });
});

// A refund or dispute that happened OUTSIDE this app (Stripe dashboard, chargeback).
// Finds the job by the PaymentIntent recorded on it, then tops the ledger up to whatever
// Stripe says has been reversed. Idempotent by construction: we only ever write the
// difference between Stripe's total and ours, so a redelivered event is a no-op.
async function recordExternalReversal(event) {
  const obj = event.data?.object || {};
  const isDispute = event.type === 'charge.dispute.created';
  const chargeId = isDispute ? obj.charge : obj.id;
  const intentId = (typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id)
    || (await getChargeIntent(chargeId));
  if (!intentId) { console.warn('[payments] reversal with no resolvable PaymentIntent'); return; }

  // Stripe reports the CUMULATIVE amount refunded on a charge; a dispute reports its own.
  const reversedTotal = isDispute ? (obj.amount || 0) / 100 : (obj.amount_refunded || 0) / 100;
  if (reversedTotal <= 0) return;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      "SELECT id, data FROM jobs WHERE data->'stripePayments' @> $1::jsonb FOR UPDATE",
      [JSON.stringify([{ intent: intentId }])]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn('[payments] reversal for an intent not on any job:', intentId);
      return;
    }
    const jobId = rows[0].id;
    const job = rows[0].data;
    const prior = Array.isArray(job.refunds) ? job.refunds : [];

    // What we've already booked against THIS intent (from any source).
    const alreadyBooked = prior
      .filter(r => r.intent === intentId)
      .reduce((s, r) => s + (r.amount || 0), 0);
    const delta = Math.round((reversedTotal - alreadyBooked) * 100) / 100;
    if (delta <= 0.005) { await client.query('ROLLBACK'); return; } // already recorded

    const now = new Date().toISOString();
    const entry = {
      id: isDispute ? `dispute-${obj.id}` : `stripe-${chargeId}-${Math.round(reversedTotal * 100)}`,
      intent: intentId,
      amount: delta,
      at: now,
      by: isDispute ? 'chargeback' : 'stripe-dashboard',
      method: 'card',
    };
    const paidNow = Math.max(0, Math.round(((job.amountPaid ?? job.totalAmount ?? 0) - delta) * 100) / 100);
    const total = job.totalAmount || 0;
    const updated = {
      ...job,
      refunds: [...prior, entry],
      amountPaid: paidNow,
      paymentStatus: paidNow <= 0.005 ? 'unpaid' : paidNow >= total - 0.01 ? 'paid' : 'partial',
      updatedAt: now,
    };
    await client.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
    await client.query('COMMIT');

    console.log(`[payments] ${isDispute ? 'DISPUTE' : 'external refund'} ${money(delta)} on job ${job.jobNumber || jobId}`);
    staffNotifyEnabled('refund').then(on => on && sendPushToRoles(['owner', 'manager'], {
      title: isDispute ? `⚠ Chargeback — ${money(delta)}` : `Refund recorded — ${money(delta)}`,
      body: `Job #${job.jobNumber || jobId}${isDispute ? ' is being disputed by the cardholder.' : ' was refunded from the Stripe dashboard.'}`,
      tag: `rev-${entry.id}`,
      data: { type: 'refund', jobId, url: '/' },
    })).catch(() => {});
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

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

  // Money can also leave without anyone touching this app — the owner refunds from the
  // Stripe dashboard, or a customer wins a dispute. Those never reached the CRM, so the
  // job stayed 'paid' and the amount stayed in revenue and in the tech's commission base
  // forever. Mirror them into the ledger.
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    try {
      await recordExternalReversal(event);
      return res.sendStatus(200);
    } catch (err) {
      console.error('[payments] reversal processing error:', err.message);
      return res.status(500).json({ error: 'Could not record reversal' });
    }
  }

  // NOTE: we deliberately do NOT ack before doing the work. Acking first means a DB
  // blip loses the payment permanently — Stripe considers the event delivered and never
  // retries, leaving money collected with the job still marked unpaid. Returning 500 on
  // failure costs a retry; returning 200 early costs the record of a real payment.
  let job, jobId, amount, total, newPaid, fullyPaid, session;
  try {
    if (event.type !== 'checkout.session.completed') return res.sendStatus(200);
    session = event.data?.object;
    if (!session || session.payment_status !== 'paid') return res.sendStatus(200);
    jobId = session.metadata?.jobId || session.client_reference_id;
    if (!jobId) return res.sendStatus(200);

    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    // Actual Stripe fee — makes the Accounting ledger match the bank to the cent.
    // Best-effort: a lookup failure just leaves the fee estimated client-side. Fetched
    // BEFORE the row lock so an HTTP round-trip never holds the job row open.
    let feeInfo = null;
    if (intentId) {
      try { feeInfo = await getPaymentFee(intentId); }
      catch (e) { console.warn('[payments] fee lookup failed:', e.message); }
    }

    amount = (session.amount_total || 0) / 100;
    const now = new Date().toISOString();

    // SELECT ... FOR UPDATE: a concurrent client PUT (or a second webhook) must not
    // read-modify-write this row at the same time and drop the ledger it just wrote.
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT data FROM jobs WHERE id = $1 FOR UPDATE', [jobId]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        console.warn('[payments] webhook for unknown job', jobId);
        return res.sendStatus(200); // nothing to retry — don't make Stripe redeliver forever
      }
      job = rows[0].data;

      // Stripe redelivers events — the session id list makes reprocessing a no-op.
      const seen = Array.isArray(job.stripeSessions) ? job.stripeSessions : [];
      if (seen.includes(session.id)) {
        await client.query('ROLLBACK');
        return res.sendStatus(200);
      }

      total = job.totalAmount || 0;
      // Always ADD to what was already collected. Keying the base off `paymentStatus`
      // meant a second checkout on an already-'paid' job reset the total to zero, so a
      // customer charged twice showed one payment and could not be refunded in full.
      newPaid = Math.round(((job.amountPaid || 0) + amount) * 100) / 100;
      fullyPaid = newPaid >= total - 0.01;

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
      await client.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [jobId, JSON.stringify(updated)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    // 5xx → Stripe retries with backoff, so the payment is not lost.
    console.error('[payments] webhook processing error:', err.message);
    return res.status(500).json({ error: 'Could not record payment' });
  }

  res.sendStatus(200);

  try {
    console.log(`[payments] ${money(amount)} received on job ${job.jobNumber || jobId} (${fullyPaid ? 'paid in full' : `balance ${money(Math.max(0, total - newPaid))}`})`);

    // Settled in full — kill any other link still floating around in an old text so it
    // can't collect a second time.
    if (fullyPaid) voidOpenSessions(jobId).catch(() => {});

    // Thank-you + receipt link to the payer — once per checkout session even if
    // Stripe redelivers the event. Owner-controlled (on by default); the manual
    // "Text receipt" button stays unaffected — that's an explicit send.
    if (await clientSmsEnabled('receipt') && await claimOnce(jobId, `receipt-${session.id}`)) {
      sendReceiptSMS({ job, jobId, amount, balance: Math.max(0, total - newPaid), base: publicBase(req) })
        .catch(e => console.error('[payments] receipt sms error:', e.message));
    }

    const who = [job.client?.firstName, job.client?.lastName].filter(Boolean).join(' ');
    staffNotifyEnabled('paymentReceived').then(on => on && sendPushToRoles(['owner', 'manager'], {
      title: `Payment received — ${money(amount)}`,
      body: `Job #${job.jobNumber || jobId}${who ? ` · ${who}` : ''} paid by card${fullyPaid ? ' (settled in full)' : ''}.`,
      tag: `pay-${session.id}`,
      data: { type: 'payment', jobId, url: '/' },
    })).catch(() => {});
  } catch (err) {
    // The payment is already recorded and acked — only the notifications failed.
    console.error('[payments] webhook notification error:', err.message);
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

// Durable pay link. Texted to the client instead of a raw Stripe URL, because a checkout
// session expires in 24h and a reminder from Tuesday would be a dead end by Thursday.
// Tapping this mints a fresh session for whatever is still owed, right now, and forwards.
// Public by design; the HMAC path segment is the auth, and the amount is always recomputed
// server-side from the stored balance — the URL carries no amount to tamper with.
payPagesRouter.get('/j/:jobId/:sig', async (req, res) => {
  const { jobId, sig } = req.params;
  const expected = paySig(jobId);
  const got = Buffer.from(String(sig));
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return res.sendStatus(404);

  try {
    const { rows } = await db.query('SELECT data FROM jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) return res.sendStatus(404);
    const job = rows[0].data;

    const balance = balanceOf(job);
    if (balance < 1) {
      return res.type('html').send(page('✅', 'Nothing left to pay',
        'This invoice is already settled — no payment is needed. Thank you!'));
    }
    if (!stripeConfigured()) {
      return res.type('html').send(page('📞', 'Card payments unavailable',
        'We can’t take a card online right now. Please contact us and we’ll sort it out.'));
    }

    const session = await createCheckoutSession({
      jobId,
      jobNumber: job.jobNumber || jobId,
      amountCents: Math.round(balance * 100),
      companyName: await companyName(),
      base: publicBase(req),
      customerEmail: (job.client?.email || '').trim(),
    });
    await rememberOpenSession(jobId, session.id);
    await voidOpenSessions(jobId, session.id); // only the one they're about to use stays live
    res.redirect(303, session.url);
  } catch (err) {
    console.error('[payments] pay-link error:', err.message);
    res.type('html').status(502).send(page('⚠️', 'Something went wrong',
      'We couldn’t open the payment page. Please try again in a moment, or contact us.'));
  }
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
    const tech = await techInfoOf(job);
    res.setHeader('Content-Security-Policy', RECEIPT_CSP);
    res.type('html').send(receiptHtml(job, jobId, co, { techName: tech.name, techSignature: tech.signature, print: true }));
  } catch (err) {
    console.error('[payments] receipt page error:', err.message);
    res.sendStatus(500);
  }
});
