import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, requireAuth, requireRole } from '../middleware/auth.js';

export const authRouter = Router();

const looksHashed = (s) => typeof s === 'string' && s.startsWith('$2');

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
    const { name, email, password, role, phone, commissionRate, active, techStatus } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    if (role && !['owner', 'manager', 'technician', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hash = await bcrypt.hash(password || '1234', 10);
    await db.query(
      `INSERT INTO users (id, name, email, password, role, phone, commission_rate, active, tech_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, name, email, hash, role || 'technician', phone || null, commissionRate || 0, active !== false, techStatus || 'available']
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

    let { name, email, password, role, phone, commissionRate, active, techStatus, photo, lastLocation } = req.body;

    // Non-owners cannot change privileged fields (no role/commission/active escalation).
    if (!isOwner) {
      role = undefined;
      commissionRate = undefined;
      active = undefined;
      email = undefined;
    }
    if (role && !['owner', 'manager', 'technician', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
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
        last_location = COALESCE($11, last_location)
       WHERE id = $1`,
      [req.params.id, name, email, hashedPassword, role, phone, commissionRate, active, techStatus, photo, lastLocation ? JSON.stringify(lastLocation) : null]
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
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

// Master reset — owner only, requires authentication. Resets all passwords to a hashed default.
authRouter.post('/master-reset', requireAuth, requireRole('owner'), async (_req, res) => {
  try {
    const hash = await bcrypt.hash('1234', 10);
    await db.query('UPDATE users SET password = $1, active = true', [hash]);
    res.json({ ok: true });
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
    active: row.active,
    techStatus: row.tech_status || undefined,
    lastLocation: row.last_location || undefined,
    photo: row.photo || undefined,
    createdAt: row.created_at?.toISOString(),
  };
}
