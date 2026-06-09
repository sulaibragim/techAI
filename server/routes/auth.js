import { Router } from 'express';
import { db } from '../db.js';

export const authRouter = Router();

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await db.query(
      'SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND password = $2 AND active = true',
      [email, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = mapUser(rows[0]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (owner only — no auth middleware yet, just returns all)
authRouter.get('/users', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY created_at');
    res.json(rows.map(mapUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single user
authRouter.get('/users/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(mapUser(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user
authRouter.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, phone, commissionRate, active, techStatus } = req.body;
    const id = `u-${Date.now()}`;
    await db.query(
      `INSERT INTO users (id, name, email, password, role, phone, commission_rate, active, tech_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, name, email, password || '1234', role || 'technician', phone || null, commissionRate || 0, active !== false, techStatus || 'available']
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    res.json(mapUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// Update user
authRouter.put('/users/:id', async (req, res) => {
  try {
    const { name, email, password, role, phone, commissionRate, active, techStatus, photo } = req.body;
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
        photo = COALESCE($10, photo)
       WHERE id = $1`,
      [req.params.id, name, email, password, role, phone, commissionRate, active, techStatus, photo]
    );
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(mapUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// Delete user
authRouter.delete('/users/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Master reset — set all passwords to 1234
authRouter.post('/master-reset', async (_req, res) => {
  try {
    await db.query("UPDATE users SET password = '1234', active = true");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    phone: row.phone || undefined,
    commissionRate: row.commission_rate || undefined,
    active: row.active,
    techStatus: row.tech_status || undefined,
    photo: row.photo || undefined,
    createdAt: row.created_at?.toISOString(),
  };
}
