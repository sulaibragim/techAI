import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { isProd } from './config.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd() ? { rejectUnauthorized: false } : false,
});

// Whether initDB() actually completed. A failed connection used to be swallowed and the app
// kept serving from memory while /health still said ok, so every write vanished on restart.
// The readiness check reads this so the state is visible instead of silent.
let connected = false;
export const dbReady = () => connected;

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'technician',
        phone TEXT,
        commission_rate INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT true,
        tech_status TEXT DEFAULT 'available',
        photo TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pending_jobs (
        call_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS job_tombstones (
        id TEXT PRIMARY KEY,
        deleted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Browser push subscriptions, keyed by unique endpoint, owned by a user.
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

      -- Live technician location for proximity-based dispatch (added later; idempotent).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location JSONB;
      -- Technician specialties for smart assignment (idempotent).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB;
      -- Hand-drawn signature (data URL) stamped onto the tech line of invoices.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT;

      -- Per-client SMS language preference, keyed by the last-10 digits of their phone
      -- so it follows the person across jobs. 'en' default; flips to 'es' when a client
      -- replies "SÍ" (or writes to us in Spanish).
      CREATE TABLE IF NOT EXISTS client_prefs (
        phone_key TEXT PRIMARY KEY,
        lang TEXT NOT NULL DEFAULT 'en',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- One-shot guard so a given automated SMS (e.g. a booking confirmation) fires once
      -- per job even if the job row is created/updated several times.
      CREATE TABLE IF NOT EXISTS sent_sms (
        job_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (job_id, kind)
      );
    `);

    // Seed ONE owner account, never a shared password. The old seed gave all three roles the
    // password "1234" — a literal sitting in a public repo, i.e. anyone could log in as owner.
    // OWNER_INITIAL_PASSWORD sets it deliberately; otherwise generate a random one and print it
    // to the boot log exactly once, where only whoever can read the server logs will see it.
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const initial = (process.env.OWNER_INITIAL_PASSWORD || '').trim() || crypto.randomBytes(9).toString('base64url');
      await client.query(`
        INSERT INTO users (id, name, email, password, role, active, commission_rate)
        VALUES ('u-owner', 'Sultan', 'owner@trustkey.az', $1, 'owner', true, 0)
      `, [bcrypt.hashSync(initial, 10)]);
      if (process.env.OWNER_INITIAL_PASSWORD) {
        console.log('[DB] Seeded owner account owner@trustkey.az with OWNER_INITIAL_PASSWORD');
      } else {
        console.log(`[DB] Seeded owner account owner@trustkey.az — one-time password: ${initial}`);
        console.log('[DB] Log in and change it now; it will not be shown again.');
      }
    }

    // No company seed. It used to plant "Salem Locksmith, 123 Main Street, Portland OR" which
    // then printed on real client invoices until someone finished onboarding. An empty company
    // makes the onboarding wizard the only way to fill it, and the readiness check flags it.
    const settingsCheck = await client.query("SELECT COUNT(*) FROM settings WHERE key = 'company'");
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ('company', $1)
      `, [JSON.stringify({
        technicianName: '',
        companyName: '',
        companyAddress: '',
        companyCity: '',
        companyPhone: '',
        companyEmail: '',
        licenseNumber: '',
        profilePhoto: '',
        monthlyRevenueTarget: 5000,
        dailyRevenueTarget: 1500,
        monthlyTargets: {},
        geminiApiKey: '',
        onboardingComplete: false,
      })]);
      console.log('[DB] Seeded empty company settings — complete onboarding to fill them');
    }

    connected = true;
    console.log('[DB] Tables initialized');
  } finally {
    client.release();
  }
}

export { pool as db };
