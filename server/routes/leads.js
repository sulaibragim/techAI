import { Router } from 'express';
import express from 'express';
import { db } from '../db.js';
import { sendSMS, toE164 } from '../services/openphone.js';

export const leadsRouter = Router();

// Accept plain HTML form posts too (application/x-www-form-urlencoded), not just JSON.
leadsRouter.use(express.urlencoded({ extended: true }));

const WEBHOOK_SECRET = process.env.WEBSITE_WEBHOOK_SECRET || '';
if (!WEBHOOK_SECRET) {
  console.warn('[INBOUND] WEBSITE_WEBHOOK_SECRET not set — the public lead endpoint is OPEN. Set it in production.');
}

// ─── Public lead intake — the website form posts here ─────────────────────────
// No login: the site is unauthenticated. Guarded by a shared secret instead.
// Field names match the website contract: { name, phone, email, service, city, note, source }.
leadsRouter.post('/', async (req, res) => {
  if (WEBHOOK_SECRET) {
    // Prefer the header; body `secret` kept for the website's documented contract. Safe
    // here because the app logs no request bodies — revisit if a body logger is added.
    const provided = req.headers['x-webhook-secret'] || req.body?.secret || '';
    if (provided !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  const {
    name = '',
    phone = '',
    email = '',
    service = '',
    problem = '',
    city = '',
    address = '',
    note = '',
    source,
    channel: channelRaw,
    // Marketing attribution — the website form forwards whatever it captured from
    // the URL / referrer. All optional; absent on plain form posts.
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, referrer, landing_page, landingPage,
  } = req.body || {};

  if (!String(phone).trim() && !String(name).trim()) {
    return res.status(400).json({ error: 'name or phone is required' });
  }

  // Best-effort split of a single "name" field into first / last.
  const [firstName, ...rest] = String(name).trim().split(/\s+/).filter(Boolean);
  const lastName = rest.join(' ');

  // Map the site's free-form fields onto the CRM Job shape.
  const complaint = [String(service || problem).trim(), String(note).trim()].filter(Boolean).join(' - ');
  const addr = String(address || city).trim();

  const now = new Date();
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const jobNumber = `WEB-${now.getTime().toString().slice(-6)}`;

  // Keep only the tracking params the site actually sent, trimmed.
  const attribution = {};
  const put = (k, v) => { const s = String(v ?? '').trim(); if (s) attribution[k] = s.slice(0, 400); };
  put('utmSource', utm_source); put('utmMedium', utm_medium); put('utmCampaign', utm_campaign);
  put('utmTerm', utm_term); put('utmContent', utm_content);
  put('gclid', gclid); put('fbclid', fbclid);
  put('referrer', referrer); put('landingPage', landingPage || landing_page);

  const channel = deriveChannel({ channelRaw, attribution });

  const data = {
    jobNumber,
    createdAt: now.toISOString(),
    client: {
      id: `client-${Date.now()}`,
      firstName: firstName || 'Website',
      lastName: lastName || (firstName ? '' : 'Lead'),
      phone: toE164(String(phone).trim()) || String(phone).trim(),
      email: String(email).trim(),
      address: addr,
      notes: String(note).trim(),
      tags: ['Website'],
    },
    lockDetails: { type: 'Other', brand: '', modelOrYear: '' },
    complaint,
    diagnosisNotes: '',
    scheduledDate: now.toISOString().slice(0, 10),
    scheduledTime: '',
    status: 'scheduled',
    lineItems: [],
    paymentStatus: 'unpaid',
    totalAmount: 0,
    photos: [],
    source: source || 'web',
    channel,
    ...(Object.keys(attribution).length ? { attribution } : {}),
    isNewLead: true,
  };

  try {
    await db.query(
      'INSERT INTO jobs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [id, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('[LEADS] insert error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Notify dispatchers by SMS — fire-and-forget, never blocks the response to the site.
  notifyDispatchers(data).catch(err => console.error('[LEADS] notify error:', err));

  res.status(201).json({ ok: true, id, jobNumber });
});

const VALID_CHANNELS = new Set(['google_ads', 'facebook', 'instagram', 'google_maps', 'website', 'referral', 'repeat', 'other']);

// Turn whatever the site sent into one of our normalized LeadChannel values.
// Priority: an explicit, valid `channel` the site set → click ids → UTM → default
// to 'website' (it's a website lead by definition).
function deriveChannel({ channelRaw, attribution }) {
  const explicit = String(channelRaw || '').trim().toLowerCase();
  if (VALID_CHANNELS.has(explicit)) return explicit;

  const src = (attribution.utmSource || '').toLowerCase();
  const med = (attribution.utmMedium || '').toLowerCase();

  if (attribution.gclid) return 'google_ads';

  // Social — utm_source tells Instagram from Facebook; a bare Meta click id (fbclid)
  // can't, so default it to Facebook.
  if (src.includes('instagram') || src === 'ig') return 'instagram';
  if (src.includes('facebook') || src.includes('fb') || src === 'meta') return 'facebook';
  if (attribution.fbclid) return 'facebook';

  const paid = med.includes('cpc') || med.includes('ppc') || med.includes('paid');
  if (src.includes('google')) return paid ? 'google_ads' : 'google_maps';
  if (med.includes('referral')) return 'referral';
  if (src) return 'other';

  return 'website';
}

// A fresh lead isn't assigned to anyone yet, so it goes to whoever dispatches:
// every active owner/manager with a phone, plus an optional LEAD_NOTIFY_PHONE override.
async function notifyDispatchers(job) {
  const recipients = new Set();
  if (process.env.LEAD_NOTIFY_PHONE) recipients.add(process.env.LEAD_NOTIFY_PHONE.trim());
  try {
    const { rows } = await db.query(
      "SELECT phone FROM users WHERE role IN ('owner', 'manager') AND active = true AND phone IS NOT NULL AND phone <> ''"
    );
    for (const r of rows) recipients.add(r.phone.trim());
  } catch { /* DB optional — fall back to env only */ }

  if (recipients.size === 0) {
    console.warn('[LEADS] no owner/manager phone and no LEAD_NOTIFY_PHONE — skipping SMS notification');
    return;
  }

  const c = job.client;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const text = [
    'New website lead',
    fullName && `Name: ${fullName}`,
    c.phone && `Phone: ${c.phone}`,
    c.address && `Address: ${c.address}`,
    job.complaint && `Issue: ${job.complaint}`,
  ].filter(Boolean).join('\n');

  for (const to of recipients) {
    await sendSMS(to, text);
  }
}
