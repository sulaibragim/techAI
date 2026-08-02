import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { signToken, requireAuth, requireRole, invalidateUserCache } from '../middleware/auth.js';
import { fulfillEtaRequest } from '../services/etaRequests.js';
import { sendEmail, emailConfigured } from '../services/email.js';
import { sendSMS } from '../services/openphone.js';

export const authRouter = Router();

const looksHashed = (s) => typeof s === 'string' && s.startsWith('$2');

// The floor used to be 4, which permitted a genuinely guessable owner credential. The
// only guard against grinding one is a per-IP login limiter, so length is doing real
// work here. Applies to account creation, owner-set passwords and self-service changes
// alike; the seeded/generated ones are far longer.
const MIN_PASSWORD_LENGTH = 10;

// Login — verifies bcrypt hash, migrates legacy plaintext, issues a JWT.
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await db.query(
      'SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND active = true',
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const row = rows[0];
    let ok = false;
    if (looksHashed(row.password)) {
      ok = await bcrypt.compare(password, row.password);
    } else {
      // Legacy plaintext — verify then transparently upgrade to a hash.
      ok = row.password === password;
      if (ok) {
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, row.id]);
      }
    }
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const user = mapUser(row);
    const token = signToken(row);
    res.json({ user, token });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Self-service password reset — step 1. Anyone can hit it (you're locked out, by
// definition), so it must NOT reveal whether an email exists: it always returns the same
// { ok: true } whether or not there's a matching account. If there is one, a fresh 6-digit
// code is generated, its bcrypt hash stored (never the code), and the code delivered by
// email if SMTP is configured, otherwise by SMS to the phone on file. Rate-limited in
// index.js. This is the recovery path when no session exists anywhere and master-reset /
// Settings → Team (both of which need a login) are unreachable.
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { rows } = await db.query(
      'SELECT id, email, phone FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND active = true',
      [email]
    );
    // Same response no matter what — never an account-enumeration oracle.
    if (rows.length === 0) return res.json({ ok: true });
    const user = rows[0];

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    await db.query(
      `INSERT INTO password_resets (user_id, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, $3, 0, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = NOW()`,
      [user.id, codeHash, expiresAt]
    );

    const subject = 'TrustKey password reset code';
    const html = `<div style="font-family:system-ui,sans-serif;max-width:420px">
      <h2 style="margin:0 0 8px">Password reset</h2>
      <p style="color:#334155">Use this code to reset your TrustKey password. It expires in 15 minutes.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
      <p style="color:#64748b;font-size:12px">If you didn't request this, you can ignore this message — your password stays the same.</p>
    </div>`;

    let delivered = false;
    if (emailConfigured()) {
      delivered = await sendEmail({ to: user.email, subject, html });
    }
    if (!delivered && user.phone) {
      const r = await sendSMS(user.phone, `TrustKey password reset code: ${code}. Expires in 15 minutes.`);
      delivered = !!r;
    }
    if (!delivered) {
      console.warn(`[AUTH] reset code generated for ${user.id} but no channel delivered it (email not configured, no/invalid phone)`);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] forgot-password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Self-service password reset — step 2. Verifies the code and sets a new password.
// The code is single-use, expires, and locks after 5 wrong tries. All "no good code"
// paths return the same generic message so the endpoint reveals nothing.
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Email, code and new password are required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const { rows } = await db.query(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND active = true',
      [email]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired code' });
    const userId = rows[0].id;

    const { rows: pr } = await db.query(
      'SELECT code_hash, expires_at, attempts FROM password_resets WHERE user_id = $1',
      [userId]
    );
    if (pr.length === 0) return res.status(400).json({ error: 'Invalid or expired code' });
    const rec = pr[0];

    if (new Date(rec.expires_at).getTime() < Date.now()) {
      await db.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    if (rec.attempts >= 5) {
      await db.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
      return res.status(429).json({ error: 'Too many attempts — request a new code' });
    }

    const ok = await bcrypt.compare(String(code).trim(), rec.code_hash);
    if (!ok) {
      await db.query('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = $1', [userId]);
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Correct code — set the new password, consume the code, and drop any cached session
    // state so nothing rides the old credential.
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]);
    await db.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    invalidateUserCache(userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] reset-password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List users. Any authenticated user, but technicians get a minimal view (no PII/salary).
authRouter.get('/users', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY created_at');
    const lite = req.user.role === 'technician';
    res.json(rows.map(r => mapUser(r, { lite })));
  } catch (err) {
    console.error('[AUTH] list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user — owner/manager, or the user themselves.
authRouter.get('/users/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'technician' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(mapUser(rows[0]));
  } catch (err) {
    console.error('[AUTH] get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user — owner only.
authRouter.post('/users', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const { name, email, password, role, phone, commissionRate, fieldTech, active, techStatus, skills } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    // No silent default password — a missing/blank password used to become '1234',
    // which meant an account could exist with a guessable credential nobody chose.
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (role && !['owner', 'manager', 'technician', 'accountant', 'warehouse'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO users (id, name, email, password, role, phone, commission_rate, field_tech, active, tech_status, skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, name, email, hash, role || 'technician', phone || null, commissionRate || 0, fieldTech === true, active !== false, techStatus || 'available', Array.isArray(skills) ? JSON.stringify(skills) : null]
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    res.json(mapUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('[AUTH] create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user. Owner edits anyone; others may edit only themselves and only safe fields.
authRouter.put('/users/:id', requireAuth, async (req, res) => {
  try {
    const isOwner = req.user.role === 'owner';
    const isSelf = req.user.id === req.params.id;
    if (!isOwner && !isSelf) return res.status(403).json({ error: 'Insufficient permissions' });

    let { name, email, password, currentPassword, role, phone, commissionRate, fieldTech, active, techStatus, photo, lastLocation, skills, signature } = req.body;

    // Non-owners cannot change privileged fields (no role/commission/active escalation,
    // and no self-granting a paid field-tech flag).
    if (!isOwner) {
      role = undefined;
      commissionRate = undefined;
      fieldTech = undefined;
      active = undefined;
      email = undefined;
      skills = undefined;
    }
    if (role && !['owner', 'manager', 'technician', 'accountant', 'warehouse'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      // Changing your OWN password requires proving you know the current one. Without
      // this, anyone holding a borrowed phone or a lifted 30-day token could set a new
      // password and lock the real user out permanently — temporary access became
      // permanent takeover. The owner resetting someone else's password is a separate,
      // deliberate act and is exempt.
      if (isSelf) {
        const { rows: me } = await db.query('SELECT password FROM users WHERE id = $1', [req.params.id]);
        if (me.length === 0) return res.status(404).json({ error: 'User not found' });
        const stored = me[0].password || '';
        // Legacy rows may still hold a plaintext password (see the login upgrade path).
        const ok = typeof currentPassword === 'string' && currentPassword.length > 0 &&
          (stored.startsWith('$2') ? await bcrypt.compare(currentPassword, stored) : currentPassword === stored);
        if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
      }
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    await db.query(
      `UPDATE users SET
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        password = COALESCE($4, password),
        role = COALESCE($5, role),
        phone = COALESCE($6, phone),
        commission_rate = COALESCE($7, commission_rate),
        active = COALESCE($8, active),
        tech_status = COALESCE($9, tech_status),
        photo = COALESCE($10, photo),
        last_location = COALESCE($11, last_location),
        skills = COALESCE($12, skills),
        signature = COALESCE($13, signature),
        field_tech = COALESCE($14, field_tech)
       WHERE id = $1`,
      [req.params.id, name, email, hashedPassword, role, phone, commissionRate, active, techStatus, photo, lastLocation ? JSON.stringify(lastLocation) : null, skills !== undefined ? JSON.stringify(skills) : null, signature, fieldTech === undefined ? null : fieldTech]
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    // A fresh tech location just landed — if a client is waiting on this tech's ETA
    // (they texted "where are you?"), deliver it now. Fire-and-forget.
    if (lastLocation && typeof lastLocation.lat === 'number' && typeof lastLocation.lng === 'number') {
      fulfillEtaRequest(req.params.id, lastLocation).catch(e => console.error('[AUTH] eta fulfill error:', e.message));
    }

    res.json(mapUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('[AUTH] update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user — owner only.
authRouter.delete('/users/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const result = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.sendStatus(204);
  } catch (err) {
    console.error('[AUTH] delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Master reset — owner only, requires authentication. Resets EVERY password, so it's gated
// behind an explicit confirmation phrase in the body to make an accidental or scripted call
// impossible. POST { confirm: 'RESET-ALL-PASSWORDS' }. The new password is GENERATED and
// returned once, never a fixed literal: the old version reset everyone to "1234", which left
// production sitting on a password that is published in this repo's history.
authRouter.post('/master-reset', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    if (req.body?.confirm !== 'RESET-ALL-PASSWORDS') {
      return res.status(400).json({ error: "Confirmation required: send { confirm: 'RESET-ALL-PASSWORDS' }" });
    }
    // A DISTINCT password per account. One shared password meant every technician,
    // manager and accountant held the same credential — and so did owner@, so anyone
    // who was handed the reset password could sign in as the owner. Returned once,
    // keyed by email, for the owner to distribute individually.
    const { rows: users } = await db.query('SELECT id, email FROM users ORDER BY email');
    const issued = {};
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const u of users) {
        const password = crypto.randomBytes(9).toString('base64url');
        // Reset passwords ONLY — do not touch `active`, or this silently un-deactivates
        // (re-hires) anyone the owner has disabled.
        await client.query('UPDATE users SET password = $1 WHERE id = $2', [await bcrypt.hash(password, 10), u.id]);
        issued[u.email] = password;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    console.warn(`[AUTH] master reset: ${users.length} passwords regenerated by ${req.user.id}`);
    res.json({ ok: true, passwords: issued, count: users.length });
  } catch (err) {
    console.error('[AUTH] master reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password is NEVER serialized to clients. Technicians get a minimal view.
function mapUser(row, { lite = false } = {}) {
  if (lite) {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      active: row.active,
      techStatus: row.tech_status || undefined,
      photo: row.photo || undefined,
      createdAt: row.created_at?.toISOString(),
    };
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || undefined,
    commissionRate: row.commission_rate || undefined,
    fieldTech: row.field_tech || undefined,
    active: row.active,
    techStatus: row.tech_status || undefined,
    lastLocation: row.last_location || undefined,
    skills: row.skills || undefined,
    photo: row.photo || undefined,
    signature: row.signature || undefined,
    createdAt: row.created_at?.toISOString(),
  };
}
