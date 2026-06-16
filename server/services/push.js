import webpush from 'web-push';
import { db } from '../db.js';

// Web Push (VAPID). Keys live in env so they can be rotated without a code change.
// Generate a pair with: npx web-push generate-vapid-keys
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:owner@trustkey.az';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
    console.log('[push] VAPID configured — web push enabled');
  } catch (e) {
    console.error('[push] invalid VAPID keys — push disabled:', e.message);
  }
} else {
  console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled');
}

export const pushConfigured = () => configured;
export const getPublicKey = () => PUBLIC_KEY;

const hasDB = () => !!process.env.DATABASE_URL;

// Upsert a browser push subscription, keyed by its unique endpoint and owned by a user.
export async function saveSubscription(userId, sub) {
  if (!hasDB() || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return;
  await db.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4`,
    [sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function deleteSubscription(endpoint) {
  if (!hasDB() || !endpoint) return;
  await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// Send to a set of subscription rows; prune any the push service reports as gone (404/410).
async function send(rows, payload) {
  if (!configured || !rows?.length) return;
  const body = JSON.stringify(payload);
  await Promise.all(rows.map(async (r) => {
    const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(subscription, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await deleteSubscription(r.endpoint).catch(() => {});
      } else {
        console.error('[push] send error', err.statusCode, err.body || err.message);
      }
    }
  }));
}

// Push to every device a single user has registered (e.g. the tech a job was assigned to).
export async function sendPushToUser(userId, payload) {
  if (!configured || !hasDB() || !userId) return;
  try {
    const { rows } = await db.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    await send(rows, payload);
  } catch (e) { console.error('[push] sendPushToUser', e.message); }
}

// Push to every active user holding one of the given roles, optionally skipping the actor.
export async function sendPushToRoles(roles, payload, excludeUserId) {
  if (!configured || !hasDB() || !roles?.length) return;
  try {
    const { rows } = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
        WHERE u.role = ANY($1) AND u.active = true
          AND ($2::text IS NULL OR ps.user_id <> $2)`,
      [roles, excludeUserId || null]
    );
    await send(rows, payload);
  } catch (e) { console.error('[push] sendPushToRoles', e.message); }
}
