import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { openphoneRouter, hydrateOpenPhoneStores } from './routes/openphone.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { aiRouter } from './routes/ai.js';
import { jobsRouter } from './routes/jobs.js';
import { inventoryRouter } from './routes/inventory.js';
import { adminRouter } from './routes/admin.js';
import { leadsRouter } from './routes/leads.js';
import { geocodeRouter } from './routes/geocode.js';
import { placesRouter } from './routes/places.js';
import { dispatchRouter } from './routes/dispatch.js';
import { pushRouter } from './routes/push.js';
import { paymentsRouter, payPagesRouter } from './routes/payments.js';
import { initDB, db } from './db.js';
import { startScheduler } from './services/scheduler.js';
import { isProd } from './config.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// In production, refuse to boot with insecure defaults / fail-open webhooks. These all
// have safe local fallbacks for dev, but if any is missing in prod the app is exploitable
// (forgeable tokens, unauthenticated webhooks), so crash loudly instead of running open.
if (isProd()) {
  const required = ['JWT_SECRET', 'OPENPHONE_WEBHOOK_SECRET', 'WEBSITE_WEBHOOK_SECRET'];
  // If card payments are on, the webhook secret is what records them. Without it Stripe
  // charges the client and the CRM never hears about it — the job stays unpaid forever
  // and the money is invisible. That's worse than having no payments at all, so gate on it.
  if (process.env.STRIPE_SECRET_KEY) required.push('STRIPE_WEBHOOK_SECRET');
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[BOOT] Refusing to start in production — missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!process.env.ALLOWED_ORIGINS) {
    console.warn('[BOOT] ALLOWED_ORIGINS not set in production — CORS reflects all origins. Set it to your frontend domain(s).');
  }
  if ((process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
    console.warn('[BOOT] Stripe is in TEST mode — card payments will not move real money.');
  }
}

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

// Railway terminates TLS at a single proxy hop; without this, every request looks like
// it comes from the proxy's IP, so per-IP rate limits (login brute-force guard, flood
// caps) share ONE bucket across the whole team — a few wrong passwords would lock
// everyone out, and a real attacker would never be isolated by their own IP.
app.set('trust proxy', 1);

app.use(helmet());

// CORS — lock to ALLOWED_ORIGINS if set, otherwise reflect origin (auth is token-based, not cookie-based).
const normalizeOrigin = (o) => o.trim().replace(/\/+$/, '');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  console.warn('[CORS] ALLOWED_ORIGINS not set — reflecting all origins. Set ALLOWED_ORIGINS in production.');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                 // non-browser / same-origin
    if (allowedOrigins.length === 0) return cb(null, true);
    // Tolerate trailing-slash mismatches between the env value and the browser Origin.
    cb(null, allowedOrigins.includes(normalizeOrigin(origin)));
  },
}));

// Stripe webhook needs the EXACT raw bytes for signature verification — mount its raw
// parser before the global JSON parser (body-parser skips a body that's already read).
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '5mb' }));

// Global rate limit — generous, just a flood guard.
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Strict rate limit on login to stop brute-force / credential stuffing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});
app.use('/api/auth/login', loginLimiter);

// Password reset is unauthenticated (you're locked out by definition), so cap it hard to
// stop code-guessing and SMS/email-bombing a victim's inbox. Covers both request-a-code
// and submit-a-code. Per-account throttles (5 wrong codes, single live code) live in the
// route; this is the per-IP flood guard.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts, try again later' },
});
app.use('/api/auth/forgot-password', resetLimiter);
app.use('/api/auth/reset-password', resetLimiter);

// Tighter limit on the public lead intake — it's unauthenticated, so cap the flood harder.
const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, try again later' },
});
app.use('/api/jobs/inbound', inboundLimiter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// The bare /openphone mount sits outside the /api flood guard above, so give it its own.
const openphoneLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/openphone', openphoneLimiter);

app.use('/openphone', openphoneRouter);
app.use('/api/openphone', openphoneRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/jobs/inbound', leadsRouter);   // public webhook — must precede the auth-guarded jobs router
app.use('/api/jobs', jobsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/admin', adminRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/places', placesRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/push', pushRouter);
app.use('/api/payments', paymentsRouter);
app.use('/pay', payPagesRouter); // client-facing thank-you pages after Stripe checkout

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      console.log('[DB] Connected to PostgreSQL');
      await hydrateOpenPhoneStores();
      startScheduler(); // payment reminders + evening digest (needs the DB)
    } catch (err) {
      console.error('[DB] Failed to connect:', err.message);
      // In production a swallowed DB failure is the worst outcome in this codebase: the app
      // keeps serving, /health still says ok, and every job, payment and message silently
      // evaporates on the next restart. Fail loudly so the deploy shows red instead.
      if (isProd()) {
        console.error('[BOOT] Refusing to serve production traffic without the database.');
        process.exit(1);
      }
      console.log('[DB] Running without database — data will be in-memory only');
    }
  } else {
    if (isProd()) {
      console.error('[BOOT] Refusing to start in production — DATABASE_URL is not set.');
      process.exit(1);
    }
    console.log('[DB] No DATABASE_URL — running without database');
  }

  const server = app.listen(PORT, () => {
    console.log(`TrustKey backend running on port ${PORT}`);
  });

  // Railway sends SIGTERM on every deploy. Without this, Node dies mid-request — and the
  // request most likely to be in flight during a redeploy is a Stripe webhook writing a
  // payment. Drain connections first, then close the pool.
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[BOOT] ${signal} received — draining connections`);
    server.close(async () => {
      try { await db.end(); } catch { /* pool already gone */ }
      process.exit(0);
    });
    // Don't hang forever on a stuck keep-alive socket.
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Without these, an unhandled rejection anywhere kills the process with no log line and
// the restart looks like a mystery crash. Log loudly; let the platform restart us.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

start();
