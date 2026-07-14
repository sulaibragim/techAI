import crypto from 'node:crypto';

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

// Money back on a specific PaymentIntent. amountCents omitted → full refund.
export async function createRefund({ paymentIntent, amountCents }) {
  if (!SKEY) throw new Error('Stripe not configured');
  const body = new URLSearchParams({ payment_intent: paymentIntent });
  if (amountCents) body.set('amount', String(amountCents));
  const r = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  return { id: data.id, amount: data.amount, status: data.status };
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
