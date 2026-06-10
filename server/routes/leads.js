import { Router } from 'express';
import express from 'express';
import { db } from '../db.js';
import { sendSMS } from '../services/openphone.js';

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
  } = req.body || {};

  if (!String(phone).trim() && !String(name).trim()) {
    return res.status(400).json({ error: 'name or phone is required' });
  }

  // Best-effort split of a single "name" field into first / last.
  const [firstName, ...rest] = String(name).trim().split(/\s+/).filter(Boolean);
  const lastName = rest.join(' ');

  // Map the site's free-form fields onto the CRM Job shape.
  const complaint = [String(service || problem).trim(), String(note).trim()].filter(Boolean).join(' — ');
  const addr = String(address || city).trim();

  const now = new Date();
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const jobNumber = `WEB-${now.getTime().toString().slice(-6)}`;

  const data = {
    jobNumber,
    createdAt: now.toISOString(),
    client: {
      id: `client-${Date.now()}`,
      firstName: firstName || 'Заявка',
      lastName,
      phone: String(phone).trim(),
      email: String(email).trim(),
      address: addr,
      notes: String(note).trim(),
      tags: ['Сайт'],
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
    '🔔 Новая заявка с сайта',
    fullName && `Имя: ${fullName}`,
    c.phone && `Тел: ${c.phone}`,
    c.address && `Адрес: ${c.address}`,
    job.complaint && `Проблема: ${job.complaint}`,
  ].filter(Boolean).join('\n');

  for (const to of recipients) {
    await sendSMS(to, text);
  }
}
