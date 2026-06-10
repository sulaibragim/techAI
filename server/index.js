import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { openphoneRouter } from './routes/openphone.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { aiRouter } from './routes/ai.js';
import { jobsRouter } from './routes/jobs.js';
import { inventoryRouter } from './routes/inventory.js';
import { adminRouter } from './routes/admin.js';
import { leadsRouter } from './routes/leads.js';
import { initDB } from './db.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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

app.use('/openphone', openphoneRouter);
app.use('/api/openphone', openphoneRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/jobs/inbound', leadsRouter);   // public webhook — must precede the auth-guarded jobs router
app.use('/api/jobs', jobsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/admin', adminRouter);

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      console.log('[DB] Connected to PostgreSQL');
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
