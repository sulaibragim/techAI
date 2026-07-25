import crypto from 'node:crypto';
import { jwtSecret } from '../config.js';

// Stripe via plain REST — no SDK dependency. Two things live here:
//   • createCheckoutSession — a one-off hosted card-payment page for a job's balance
//   • verifyStripeSignature — HMAC check for the /webhook endpoint
// Everything no-ops cleanly when STRIPE_SECRET_KEY isn't set, so the app runs fine
// without payments configured (the UI hides the button, reminders send without a link).

const SKEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const WHSEC = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();

export const stripeConfigured = () => !!SKEY;
export const webhookConfigured = () => !!WHSEC;

// 'live' | 'test' | null. Nothing in the app behaved differently between a test key and a
// live one, so a forgotten sk_test_ key would take payments that never move real money and
// look identical in the UI. The readiness check surfaces this.
export const stripeMode = () => (!SKEY ? null : SKEY.startsWith('sk_live_') ? 'live' : 'test');

// Public base URL for the success/cancel landing pages. Railway injects
// RAILWAY_PUBLIC_DOMAIN; PUBLIC_BASE_URL wins if set explicitly.
export function publicBase(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return req ? `${req.protocol}://${req.get('host')}` : null;
}

// Durable, unguessable pay address for a job: /pay/j/<jobId>/<sig>. Lives here (not in
// the payments route) so the scheduler can build the same link without importing a route.
// The route behind it recomputes the balance and mints a fresh checkout session on each
// visit, so a link inside an old SMS keeps working long after any session has expired.
export const paySig = (jobId) =>
  crypto.createHmac('sha256', jwtSecret()).update(`pay:${jobId}`).digest('hex').slice(0, 20);
export const payUrlFor = (base, jobId) =>
  (base ? `${base}/pay/j/${encodeURIComponent(jobId)}/${paySig(jobId)}` : '');

// Hosted checkout page charging the job's outstanding balance. Expires in 24h so a
// stale link from an old reminder can't collect after the balance was settled in cash.
// customerEmail (when the client has one) makes Stripe email its own receipt on success.
export async function createCheckoutSession({ jobId, jobNumber, amountCents, companyName, base, customerEmail }) {
  if (!SKEY) throw new Error('Stripe not configured');
  if (!base) throw new Error('No public base URL for redirect pages');
  const body = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': `${companyName} — Job #${jobNumber}`,
    success_url: `${base}/pay/success`,
    cancel_url: `${base}/pay/cancelled`,
    client_reference_id: jobId,
    'metadata[jobId]': jobId,
    expires_at: String(Math.floor(Date.now() / 1000) + 24 * 3600),
  });
  if (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    body.set('customer_email', customerEmail);
  }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  return { id: data.id, url: data.url };
}

// Kill a checkout session that is still open. Used when the job gets settled another way
// (cash at the door) so the client can't tap a live link that evening and pay twice.
// Best-effort: an already-paid or already-expired session just reports not-open.
export async function expireCheckoutSession(sessionId) {
  if (!SKEY || !sessionId) return false;
  const r = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    { method: 'POST', headers: { Authorization: `Bearer ${SKEY}` } }
  );
  if (r.ok) return true;
  const data = await r.json().catch(() => ({}));
  // "not in the `open` state" means it was already paid or expired — nothing to do.
  if (/not in the .?open.? state|No such checkout.session/i.test(data?.error?.message || '')) return false;
  throw new Error(data?.error?.message || `stripe http ${r.status}`);
}

// Money back on a specific PaymentIntent. amountCents omitted → full refund.
// idempotencyKey is REQUIRED by callers that can race (two managers hitting Refund at
// once): Stripe collapses retries with the same key into one refund instead of sending
// the customer their money twice.
export async function createRefund({ paymentIntent, amountCents, idempotencyKey }) {
  if (!SKEY) throw new Error('Stripe not configured');
  const body = new URLSearchParams({ payment_intent: paymentIntent });
  if (amountCents) body.set('amount', String(amountCents));
  const headers = { Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await fetch('https://api.stripe.com/v1/refunds', { method: 'POST', headers, body });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  return { id: data.id, amount: data.amount, status: data.status };
}

// The PaymentIntent behind a charge id — dashboard refunds and disputes arrive keyed by
// charge, but our ledger is keyed by intent.
export async function getChargeIntent(chargeId) {
  if (!SKEY || !chargeId) return null;
  const r = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: `Bearer ${SKEY}` },
  });
  const data = await r.json();
  if (!r.ok) return null;
  return typeof data.payment_intent === 'string' ? data.payment_intent : data.payment_intent?.id || null;
}

// Actual processing fee for a PaymentIntent, from its charge's balance transaction.
// Returns dollars; null when the transaction isn't available yet.
export async function getPaymentFee(paymentIntent) {
  if (!SKEY) return null;
  const r = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntent)}?expand[]=latest_charge.balance_transaction`,
    { headers: { Authorization: `Bearer ${SKEY}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  const bt = data.latest_charge?.balance_transaction;
  return bt && typeof bt === 'object' ? { fee: (bt.fee || 0) / 100, net: (bt.net || 0) / 100 } : null;
}

// PaymentIntent id + amount for a checkout session — used for jobs paid before we
// started recording stripePayments on the webhook.
export async function getSessionPayment(sessionId) {
  if (!SKEY) throw new Error('Stripe not configured');
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${SKEY}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  const intent = typeof data.payment_intent === 'string' ? data.payment_intent : data.payment_intent?.id;
  return intent ? { intent, amount: (data.amount_total || 0) / 100 } : null;
}

// Stripe-Signature: t=<ts>,v1=<hmac>[,v1=<hmac>...] — HMAC-SHA256 of "<ts>.<rawBody>".
// 5-minute tolerance guards against replay of a captured payload.
export function verifyStripeSignature(rawBody, sigHeader) {
  if (!WHSEC) return false;
  const pairs = String(sigHeader || '').split(',').map(s => s.split('='));
  const t = pairs.find(([k]) => k === 't')?.[1];
  const sigs = pairs.filter(([k]) => k === 'v1').map(([, v]) => v).filter(Boolean);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', WHSEC).update(`${t}.${rawBody}`).digest('hex');
  const exp = Buffer.from(expected);
  return sigs.some(s => {
    const got = Buffer.from(s);
    return got.length === exp.length && crypto.timingSafeEqual(got, exp);
  });
}
