import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  saveSubscription,
  deleteSubscription,
  getPublicKey,
  pushConfigured,
  sendPushToUser,
} from '../services/push.js';

export const pushRouter = Router();

// Public — the VAPID public key is not a secret; the browser needs it to subscribe.
pushRouter.get('/public-key', (_req, res) => {
  res.json({ key: getPublicKey(), enabled: pushConfigured() });
});

// Register this device's push subscription for the logged-in user.
pushRouter.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body?.subscription || req.body;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await saveSubscription(req.user.id, sub);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] subscribe error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

pushRouter.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    if (req.body?.endpoint) await deleteSubscription(req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Let a user fire a test notification at their own devices to confirm setup works.
pushRouter.post('/test', requireAuth, async (req, res) => {
  try {
    await sendPushToUser(req.user.id, {
      title: 'TrustKey',
      body: 'Test notification — push is working ✅',
      tag: 'test',
      data: { url: '/' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
