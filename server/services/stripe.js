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
export async function createCheckoutSession({ jobId, jobNumber, amountCents, companyName, base }) {
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
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe http ${r.status}`);
  return { id: data.id, url: data.url };
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
