import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const { Pool, Client } = pg;

// TLS is negotiated, not configured. It used to hang off NODE_ENV, which is unset on
// Railway — so the link ran in the clear while the readiness screen showed green, and
// nobody could safely flip it because turning SSL on against a server that doesn't offer
// it fails the connection, and a failed connection is a fatal boot. So: probe once at
// startup. Encrypted if the server will take it, plaintext if it won't, and say which in
// the log. PGSSLMODE=disable / =require forces the decision if you ever need to.
const SSL_ON = { rejectUnauthorized: false }; // Railway/Heroku-style certs aren't publicly chained
let pool = null;
let sslMode = 'unknown';

const forcedSsl = () => {
  const m = (process.env.PGSSLMODE || '').toLowerCase();
  if (m === 'disable') return false;
  if (m === 'require' || m === 'prefer' || m === 'verify-ca' || m === 'verify-full') return true;
  return null; // decide by probing
};

// Only these mean "this server genuinely cannot do TLS". Anything else (host down, DNS,
// timeout, bad password) is not evidence about encryption — and must NOT silently
// downgrade the link, or one hiccup at boot would leave the container in the clear
// until someone restarts it.
const SSL_UNSUPPORTED = /does not support SSL|server does not support ssl|sslmode|unsupported frontend protocol/i;

async function serverAcceptsTls() {
  const probe = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: SSL_ON,
    connectionTimeoutMillis: 8000,
  });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch (e) {
    try { await probe.end(); } catch { /* already down */ }
    if (SSL_UNSUPPORTED.test(e.message || '')) {
      console.warn('[DB] Server reports no SSL support — using an unencrypted link:', e.message);
      return false;
    }
    // Couldn't tell. Keep TLS on: if the DB is merely unreachable the pool will fail
    // loudly either way, and that is far better than quietly dropping encryption.
    console.warn('[DB] TLS probe inconclusive, keeping encryption on:', e.message);
    return true;
  }
}

async function buildPool() {
  const forced = forcedSsl();
  const useTls = forced === null ? await serverAcceptsTls() : forced;
  sslMode = useTls ? 'encrypted (TLS)' : 'plaintext';
  console.log(`[DB] Connection mode: ${sslMode}${forced === null ? ' (auto-detected)' : ' (forced by PGSSLMODE)'}`);
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: useTls ? SSL_ON : false });
}

let poolPromise = null;
function getPool() {
  if (pool) return Promise.resolve(pool);
  if (!poolPromise) poolPromise = buildPool().then(p => { pool = p; return p; });
  return poolPromise;
}

// Same surface the rest of the server already uses (query / connect / end), so the
// lazily-built pool is invisible to callers.
const dbFacade = {
  query: async (...args) => (await getPool()).query(...args),
  connect: async () => (await getPool()).connect(),
  end: async () => { if (pool) { const p = pool; pool = null; poolPromise = null; await p.end(); } },
};

/** How the DB link is actually secured — surfaced on the readiness screen. */
export const dbSslMode = () => sslMode;

// Whether initDB() actually completed. A failed connection used to be swallowed and the app
// kept serving from memory while /health still said ok, so every write vanished on restart.
// The readiness check reads this so the state is visible instead of silent.
let connected = false;
export const dbReady = () => connected;

export async function initDB() {
  const client = await dbFacade.connect();
  try {
    // Serialize schema setup across containers. Railway keeps the old instance serving
    // while the new one boots, so two initDB() runs can overlap — and concurrent
    // CREATE TABLE / ALTER TABLE is NOT race-safe in Postgres even with IF NOT EXISTS
    // (it raises duplicate-key on pg_type). Here that would be a fatal boot.
    await client.query('SELECT pg_advisory_lock(778901234)');
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
      -- The 15-minute scheduler and several routes filter on JSONB fields; expression
      -- indexes keep those from becoming full-table scans as the archive grows.
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs ((data->>'status'));
      CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs ((data->>'assignedTo'));

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
      -- Owner/manager who also works jobs and earns a technician-style commission.
      -- Pay/assignment only — never affects role or permissions (idempotent).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS field_tech BOOLEAN DEFAULT false;
      -- Which guided tours this person has finished and which tabs they've opened.
      -- Per-user (not the company settings blob) so a second device doesn't replay the
      -- tour, and so one teammate's progress never hides the tour from another.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_progress JSONB;

      -- Per-client SMS language preference, keyed by the last-10 digits of their phone
      -- so it follows the person across jobs. 'en' default; flips to 'es' when a client
      -- replies "SÍ" (or writes to us in Spanish).
      CREATE TABLE IF NOT EXISTS client_prefs (
        phone_key TEXT PRIMARY KEY,
        lang TEXT NOT NULL DEFAULT 'en',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Numbers that replied STOP. Carriers require a working opt-out on automated
      -- traffic; without this the carrier blocked the message, our send failed, and the
      -- scheduler retried the same number every 15 minutes indefinitely.
      CREATE TABLE IF NOT EXISTS sms_opt_outs (
        phone_key TEXT PRIMARY KEY,
        reason TEXT,
        at TIMESTAMPTZ DEFAULT NOW()
      );

      -- One-shot guard so a given automated SMS (e.g. a booking confirmation) fires once
      -- per job even if the job row is created/updated several times.
      CREATE TABLE IF NOT EXISTS sent_sms (
        job_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (job_id, kind)
      );

      -- Self-service password reset codes. One live code per user (a fresh request
      -- overwrites the previous one). Only the bcrypt HASH of the 6-digit code is
      -- stored, never the code itself; the row is deleted on use or expiry. Keyed by
      -- user_id with ON DELETE CASCADE so a removed user drops any pending reset.
      CREATE TABLE IF NOT EXISTS password_resets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed ONE owner account, never a shared password. The old seed gave all three roles the
    // password "1234" — a literal sitting in a public repo, i.e. anyone could log in as owner.
    // OWNER_INITIAL_PASSWORD sets it deliberately; otherwise generate a random one and print it
    // to the boot log exactly once, where only whoever can read the server logs will see it.
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const initial = (process.env.OWNER_INITIAL_PASSWORD || '').trim() || crypto.randomBytes(9).toString('base64url');
      // ON CONFLICT: two containers booting against an empty DB (the very first deploy)
      // both see COUNT = 0, and a bare INSERT makes the loser blow up the whole initDB
      // transaction — which is a fatal boot in production.
      await client.query(`
        INSERT INTO users (id, name, email, password, role, active, commission_rate)
        VALUES ('u-owner', 'Sultan', 'owner@trustkey.az', $1, 'owner', true, 0)
        ON CONFLICT (id) DO NOTHING
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
        ON CONFLICT (key) DO NOTHING
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
    await client.query('SELECT pg_advisory_unlock(778901234)').catch(() => {});
    client.release();
  }
}

export { dbFacade as db };
