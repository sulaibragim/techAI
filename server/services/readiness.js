import bcrypt from 'bcryptjs';
import { db, dbReady } from '../db.js';
import { isProd, DEV_JWT_FALLBACK, jwtSecret } from '../config.js';
import { stripeConfigured, webhookConfigured, stripeMode } from './stripe.js';
import { emailConfigured } from './email.js';
import { pushConfigured } from './push.js';

// Live "are we ready to take real money and real clients" check. Every subsystem in this app
// degrades SILENTLY when its env var is missing — SMS vanishes, payments don't get recorded,
// the DB falls back to memory — so from the outside a half-configured deploy looks healthy.
// This endpoint is the one place that says so out loud.
//
// It reports only booleans and modes. No secret value is ever returned.

const PASSWORDS_TO_FLAG = ['1234', 'password', 'admin'];

// Does any account still use a password that's published in this repo's git history?
async function weakPasswordAccounts() {
  if (!dbReady()) return null;
  const { rows } = await db.query('SELECT email, password FROM users WHERE active = true');
  return rows
    .filter(r => PASSWORDS_TO_FLAG.some(p => { try { return bcrypt.compareSync(p, r.password); } catch { return false; } }))
    .map(r => r.email);
}

async function companyConfigured() {
  if (!dbReady()) return null;
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
  if (rows.length === 0) return { ok: false, name: '' };
  const c = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  const name = (c?.companyName || '').trim();
  // "Salem Locksmith" was the old hardcoded seed — if it's still there, nobody finished
  // onboarding and that address is printing on real invoices.
  const seeded = /salem locksmith/i.test(name) || /123 main street/i.test(c?.companyAddress || '');
  return { ok: !!name && !seeded && !!c?.onboardingComplete, name, seeded };
}

export async function buildReadiness() {
  const prod = isProd();
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  // ─── Core ───────────────────────────────────────────────────────────────────
  add('environment', 'Environment', prod ? 'ok' : 'fail',
    prod ? `Production (NODE_ENV=${process.env.NODE_ENV || 'unset'}, platform detected)`
         : 'Not detected as production — secrets fall back to insecure dev defaults');

  const usingDevSecret = jwtSecret() === DEV_JWT_FALLBACK;
  add('jwt', 'Login tokens (JWT_SECRET)', usingDevSecret ? 'fail' : 'ok',
    usingDevSecret ? 'Signing with the public dev fallback — anyone can forge an owner login'
                   : 'Signed with a private secret');

  add('database', 'Database', dbReady() ? 'ok' : 'fail',
    dbReady() ? 'Connected to PostgreSQL'
              : process.env.DATABASE_URL ? 'DATABASE_URL is set but the connection failed — data is in memory and will be lost'
                                         : 'No DATABASE_URL — data is in memory and will be lost on restart');

  const weak = await weakPasswordAccounts();
  add('passwords', 'Account passwords',
    weak === null ? 'warn' : weak.length > 0 ? 'fail' : 'ok',
    weak === null ? 'Cannot check without a database'
      : weak.length > 0 ? `Still using a default password: ${weak.join(', ')} — change immediately`
      : 'No account uses a known default password');

  const company = await companyConfigured();
  add('company', 'Company details on invoices',
    company === null ? 'warn' : company.ok ? 'ok' : 'fail',
    company === null ? 'Cannot check without a database'
      : company.seeded ? 'Still the demo company (Salem Locksmith / 123 Main Street) — this prints on client invoices'
      : !company.name ? 'Company name is empty — finish onboarding before invoicing'
      : !company.ok ? 'Onboarding not marked complete'
      : company.name);

  // ─── Money ──────────────────────────────────────────────────────────────────
  const mode = stripeMode();
  add('stripe', 'Stripe card payments',
    !stripeConfigured() ? 'fail' : mode === 'live' ? 'ok' : 'warn',
    !stripeConfigured() ? 'STRIPE_SECRET_KEY not set — no card payments'
      : mode === 'live' ? 'LIVE mode — real cards, real money'
      : 'TEST mode (sk_test_ key) — payments look successful but no money moves');

  add('stripe_webhook', 'Stripe webhook',
    !stripeConfigured() ? 'warn' : webhookConfigured() ? 'ok' : 'fail',
    !stripeConfigured() ? 'Not applicable until Stripe is configured'
      : webhookConfigured() ? 'Signed webhook verified — payments land in the CRM'
      : 'STRIPE_WEBHOOK_SECRET missing — clients can pay but the CRM will never mark the job paid');

  // ─── Client communication ───────────────────────────────────────────────────
  const smsOk = !!process.env.OPENPHONE_API_KEY && !!process.env.OPENPHONE_PHONE_NUMBER;
  add('sms', 'SMS (OpenPhone)', smsOk ? 'ok' : 'fail',
    smsOk ? `Sending from ${process.env.OPENPHONE_PHONE_NUMBER}`
          : 'OPENPHONE_API_KEY / OPENPHONE_PHONE_NUMBER missing — payment reminders, ETA texts and the evening digest all silently do nothing');

  add('email', 'Email receipts (SMTP)', emailConfigured() ? 'ok' : 'warn',
    emailConfigured() ? 'Configured' : 'SMTP not set — receipts can only go out by SMS');

  add('push', 'Push notifications', pushConfigured() ? 'ok' : 'warn',
    pushConfigured() ? 'VAPID keys configured' : 'VAPID keys not set — no push to the installed app');

  // ─── Webhooks in / security ─────────────────────────────────────────────────
  add('openphone_webhook', 'Inbound call/SMS webhook',
    process.env.OPENPHONE_WEBHOOK_SECRET ? 'ok' : 'fail',
    process.env.OPENPHONE_WEBHOOK_SECRET ? 'Signature verified'
      : 'OPENPHONE_WEBHOOK_SECRET missing — anyone can inject fake calls and messages');

  add('lead_webhook', 'Website lead intake',
    process.env.WEBSITE_WEBHOOK_SECRET ? 'ok' : 'fail',
    process.env.WEBSITE_WEBHOOK_SECRET ? 'Secret required on inbound leads'
      : 'WEBSITE_WEBHOOK_SECRET missing — anyone can create jobs through the public endpoint');

  add('cors', 'CORS origins',
    process.env.ALLOWED_ORIGINS ? 'ok' : 'warn',
    process.env.ALLOWED_ORIGINS || 'ALLOWED_ORIGINS not set — every origin is accepted');

  // ─── Optional ───────────────────────────────────────────────────────────────
  add('ai', 'AI assistant (Gemini)', process.env.GEMINI_API_KEY ? 'ok' : 'warn',
    process.env.GEMINI_API_KEY ? 'Key configured server-side' : 'GEMINI_API_KEY not set — chat, voice and invoice scanning are off');

  add('maps', 'Google Maps', process.env.GOOGLE_MAPS_API_KEY ? 'ok' : 'warn',
    process.env.GOOGLE_MAPS_API_KEY ? 'Google geocoding and traffic ETAs'
      : 'Falling back to free OpenStreetMap — addresses and ETAs are less accurate');

  const schedulerOff = process.env.SCHEDULER_DISABLED === 'true';
  add('scheduler', 'Reminders & daily digest',
    schedulerOff ? 'warn' : dbReady() ? 'ok' : 'fail',
    schedulerOff ? 'SCHEDULER_DISABLED=true — no reminders, no evening digest'
      : dbReady() ? `Running (${process.env.BUSINESS_TZ || 'America/Phoenix'}, digest at ${process.env.DIGEST_HOUR || 20}:00)`
                  : 'Not running — needs the database');

  const blockers = checks.filter(c => c.status === 'fail');
  return {
    ready: blockers.length === 0,
    blockers: blockers.length,
    warnings: checks.filter(c => c.status === 'warn').length,
    checks,
  };
}
