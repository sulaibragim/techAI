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
import { dispatchRouter } from './routes/dispatch.js';
import { pushRouter } from './routes/push.js';
import { initDB } from './db.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// In production, refuse to boot with insecure defaults / fail-open webhooks. These all
// have safe local fallbacks for dev, but if any is missing in prod the app is exploitable
// (forgeable tokens, unauthenticated webhooks), so crash loudly instead of running open.
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'OPENPHONE_WEBHOOK_SECRET', 'WEBSITE_WEBHOOK_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[BOOT] Refusing to start in production — missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!process.env.ALLOWED_ORIGINS) {
    console.warn('[BOOT] ALLOWED_ORIGINS not set in production — CORS reflects all origins. Set it to your frontend domain(s).');
  }
}

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

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
app.use('/api/dispatch', dispatchRouter);
app.use('/api/push', pushRouter);

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      console.log('[DB] Connected to PostgreSQL');
      await hydrateOpenPhoneStores();
    } catch (err) {
      console.error('[DB] Failed to connect:', err.message);
      console.log('[DB] Running without database — data will be in-memory only');
    }
  } else {
    console.log('[DB] No DATABASE_URL — running without database');
  }

  app.listen(PORT, () => {
    console.log(`TrustKey backend running on port ${PORT}`);
  });
}

start();
