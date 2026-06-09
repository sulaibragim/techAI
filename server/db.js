import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

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
    `);

    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const hash = bcrypt.hashSync('1234', 10);
      await client.query(`
        INSERT INTO users (id, name, email, password, role, active, commission_rate)
        VALUES
          ('u-owner', 'Sultan', 'owner@trustkey.az', $1, 'owner', true, 0),
          ('u-mgr', 'Manager', 'manager@trustkey.az', $1, 'manager', true, 0),
          ('u-tech', 'Technician', 'tech@trustkey.az', $1, 'technician', true, 30)
      `, [hash]);
      console.log('[DB] Seeded default users (hashed passwords)');
    }

    const settingsCheck = await client.query("SELECT COUNT(*) FROM settings WHERE key = 'company'");
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ('company', $1)
      `, [JSON.stringify({
        technicianName: 'Sultan',
        companyName: 'Salem Locksmith',
        companyAddress: '123 Main Street, Suite 100',
        companyCity: 'Portland, OR 97201',
        companyPhone: '(503) 555-0100',
        companyEmail: 'info@salemlocksmith.com',
        licenseNumber: 'LK-00000',
        profilePhoto: '',
        monthlyRevenueTarget: 5000,
        dailyRevenueTarget: 1500,
        monthlyTargets: {},
        geminiApiKey: '',
        onboardingComplete: false,
      })]);
      console.log('[DB] Seeded default settings');
    }

    console.log('[DB] Tables initialized');
  } finally {
    client.release();
  }
}

export { pool as db };
