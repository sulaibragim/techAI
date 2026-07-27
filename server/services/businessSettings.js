import { db } from '../db.js';

// The whole business settings blob (settings row key='company'), or {} if unset.
// Same row the app's Settings screen writes through /api/settings.
export async function getCompanySettings() {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    return rows[0] ? JSON.parse(rows[0].value) : {};
  } catch {
    return {};
  }
}

// Which automatic client texts are on. Defaults are deliberately restrained so a fresh
// install doesn't over-text: the "tech arrived" ping and the unpaid-balance reminders are
// OFF unless the owner turns them on (they duplicate what the client already knows / can
// feel like nagging). The rest default on. Keys mirror types.ts ClientSmsSettings.
const CLIENT_SMS_DEFAULTS = {
  booking: true,    // "you're booked for …" on a future appointment
  arrived: false,   // "your technician has arrived" — redundant with On My Way
  receipt: true,    // "we received your payment / receipt" after a card charge
  reminders: false, // 3-/10-day unpaid-balance nudges
  etaReply: true,   // auto-answer when the client texts "where's the tech?"
  refund: true,     // "we issued a refund of …"
};

// Is a given automatic client SMS enabled? A stored boolean wins; otherwise the default.
export async function clientSmsEnabled(kind) {
  const s = await getCompanySettings();
  const cfg = (s && typeof s.clientSms === 'object' && s.clientSms) || {};
  const v = cfg[kind];
  return typeof v === 'boolean' ? v : (CLIENT_SMS_DEFAULTS[kind] ?? true);
}

// Automatic messages sent to STAFF (owner, managers, technicians) rather than clients.
// These had no switches at all — the only way to stop any of them was SCHEDULER_DISABLED,
// which also killed the payment reminders. Keys mirror types.ts StaffNotifySettings.
const STAFF_NOTIFY_DEFAULTS = {
  dailyDigest: false,     // 20:00 "daily wrap" SMS + push to owners — off by request
  jobAssigned: true,      // tech is told a job landed on them (SMS + push)
  techEnRoute: true,      // dispatchers told a tech is on the way
  techAccepted: true,     // dispatchers told a tech accepted
  techDeclined: true,     // dispatchers told a tech DECLINED — needs reassigning
  newLead: true,          // website lead arrived
  clientReply: true,      // a client texted us back (push)
  paymentReceived: true,  // card payment landed (push)
  refund: true,           // refund issued / chargeback opened (push)
};

/** Is a given automatic STAFF notification enabled? Stored boolean wins. */
export async function staffNotifyEnabled(kind) {
  const s = await getCompanySettings();
  const cfg = (s && typeof s.staffNotify === 'object' && s.staffNotify) || {};
  const v = cfg[kind];
  return typeof v === 'boolean' ? v : (STAFF_NOTIFY_DEFAULTS[kind] ?? true);
}
