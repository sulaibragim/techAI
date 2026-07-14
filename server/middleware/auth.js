import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { jwtSecret } from '../config.js';

const JWT_SECRET = jwtSecret();
const TOKEN_TTL = '30d';

if (!process.env.JWT_SECRET) {
  console.warn('[AUTH] JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET in production env.');
}

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Short-lived cache of users' active state so a valid token is re-validated against
// the DB without a query on every single request. A deactivated/deleted user loses
// access within ACTIVE_CACHE_TTL_MS even though their 30-day JWT is still unexpired.
const ACTIVE_CACHE_TTL_MS = 30 * 1000;
const activeCache = new Map(); // id -> { active: boolean, ts: number }

async function userIsActive(id) {
  const hit = activeCache.get(id);
  if (hit && Date.now() - hit.ts < ACTIVE_CACHE_TTL_MS) return hit.active;
  try {
    const { rows } = await db.query('SELECT active FROM users WHERE id = $1', [id]);
    const active = rows.length > 0 && rows[0].active === true;
    activeCache.set(id, { active, ts: Date.now() });
    return active;
  } catch {
    // DB hiccup — don't lock everyone out over a transient infra error; the token
    // itself is still cryptographically valid. Revocation resumes once the DB is back.
    return true;
  }
}

// Require a valid Bearer token AND a still-active user. Attaches { id, role } to req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (!(await userIsActive(payload.id))) {
    return res.status(401).json({ error: 'Account deactivated' });
  }
  req.user = payload;
  next();
}

// Require the authenticated user to hold one of the given roles.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
