import { db } from '../db.js';
import { sendSMS } from './openphone.js';
import { sendPushToRoles } from './push.js';
import { stripeConfigured, createCheckoutSession, publicBase } from './stripe.js';
import { getClientLang, t } from './messages.js';
import { clientSmsEnabled } from './businessSettings.js';

// Time-based automations that need a clock, not a request:
//   • payment reminders — completed-but-unpaid jobs get a polite SMS at 3 and 10 days
//   • evening digest    — owners get a one-text summary of the day at 20:00
// The Railway process is always on, so a simple interval tick is enough — no cron infra.
// Everything is stamped (reminders on the job, digest date in settings) so a restart
// never double-sends, and all times run in the business timezone, not server UTC.

const TZ = process.env.BUSINESS_TZ || 'America/Phoenix';
const DIGEST_HOUR = Number(process.env.DIGEST_HOUR || 20);
const REMINDER_DAYS = [3, 10]; // days after completion → reminder #1, #2; then stop
const REMINDER_WINDOW = { from: 10, to: 18 }; // only nag clients during business hours

const hasDB = () => !!process.env.DATABASE_URL;

// Local wall-clock parts in the business timezone.
function localNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

const daysBetween = (isoThen, isoNow) =>
  Math.floor((new Date(isoNow) - new Date(isoThen)) / 86400000);

const money = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;

async function companyInfo() {
  try {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'company'");
    const v = rows[0] ? JSON.parse(rows[0].value) : {};
    return { name: v.companyName || 'your locksmith', phone: v.companyPhone || '' };
  } catch { return { name: 'your locksmith', phone: '' }; }
}

// ─── Payment reminders ─────────────────────────────────────────────────────────

const balanceOf = (j) => {
  const total = j.totalAmount || 0;
  const paid = j.paymentStatus === 'paid' ? total : j.paymentStatus === 'partial' ? (j.amountPaid || 0) : 0;
  return Math.max(0, total - paid);
};

async function runPaymentReminders() {
  const { hour } = localNow();
  if (hour < REMINDER_WINDOW.from || hour >= REMINDER_WINDOW.to) return;
  if (!(await clientSmsEnabled('reminders'))) return; // owner-controlled; off by default

  const { rows } = await db.query(
    `SELECT id, data FROM jobs
      WHERE data->>'status' = 'completed'
        AND data->>'paymentStatus' IN ('unpaid', 'partial')
        AND data->>'completedAt' IS NOT NULL
      LIMIT 200`
  );
  const now = new Date().toISOString();
  const company = await companyInfo();

  for (const row of rows) {
    const j = row.data;
    const phone = (j.client?.phone || '').trim();
    const balance = balanceOf(j);
    if (!phone || balance < 1) continue;
    if ((j.client?.tags || []).includes('Do not service')) continue;

    const sent = Array.isArray(j.paymentReminders) ? j.paymentReminders : [];
    if (sent.length >= REMINDER_DAYS.length) continue; // both nudges sent — humans take over
    const dueAfter = REMINDER_DAYS[sent.length];
    if (daysBetween(j.completedAt, now) < dueAfter) continue;

    const lang = await getClientLang(phone);
    const first = (j.client?.firstName || '').trim() || (lang === 'es' ? 'hola' : 'there');

    // With Stripe configured, the reminder carries a tap-to-pay card link — the client can
    // settle right from the text. Link failure never blocks the reminder itself.
    let payUrl = '';
    if (stripeConfigured()) {
      try {
        const session = await createCheckoutSession({
          jobId: row.id,
          jobNumber: j.jobNumber || row.id,
          amountCents: Math.round(balance * 100),
          companyName: company.name,
          base: publicBase(),
        });
        payUrl = session.url;
      } catch (e) { console.warn('[scheduler] pay-link failed, sending reminder without it:', e.message); }
    }

    const text = t('paymentReminder', lang, {
      name: first, company: company.name, jobNo: j.jobNumber || row.id, balance, payUrl, phone: company.phone,
    });
    const ok = await sendSMS(phone, text);
    if (!ok) continue; // OpenPhone hiccup — retry next tick, don't stamp

    // Stamp the reminder (and freshness) so restarts/other devices never double-send.
    const updated = { ...j, paymentReminders: [...sent, now], updatedAt: now };
    await db.query('UPDATE jobs SET data = $2, updated_at = NOW() WHERE id = $1', [row.id, JSON.stringify(updated)]);
    console.log(`[scheduler] payment reminder #${sent.length + 1} → job ${j.jobNumber || row.id} (${money(balance)})`);
  }
}

// ─── Evening digest ────────────────────────────────────────────────────────────

async function runEveningDigest() {
  const { date, hour } = localNow();
  if (hour < DIGEST_HOUR) return;

  // Once per local day, survives restarts via a settings stamp.
  const { rows: stamp } = await db.query("SELECT value FROM settings WHERE key = 'digest-last'");
  if (stamp[0]?.value === date) return;
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('digest-last', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [date]
  );

  const { rows } = await db.query('SELECT id, data FROM jobs');
  const jobs = rows.map(r => r.data);

  const doneToday = jobs.filter(j =>
    (j.status === 'completed' || j.status === 'sold') && (j.completedAt || '').slice(0, 10) === date);
  const revenueToday = doneToday.reduce((s, j) => s + (j.totalAmount || 0), 0);
  const outstanding = jobs
    .filter(j => (j.status === 'completed' || j.status === 'sold'))
    .reduce((s, j) => s + balanceOf(j), 0);
  const unpaidCount = jobs.filter(j => j.status === 'completed' && balanceOf(j) >= 1).length;

  const tomorrow = new Date(new Date(date + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);
  const bookedTomorrow = jobs.filter(j =>
    j.scheduledDate === tomorrow && !['completed', 'cancelled', 'coffee'].includes(j.status)).length;

  // Fraud tripwires for the current month — same thresholds as the owner's in-app
  // Fraud Watch card (financialUtils.fraudWatch): heavy no-sale rate, cash-heavy
  // collections, repeated $0 completions. One short line so the owner looks closer.
  const monthKey = date.slice(0, 7);
  const revDate = (j) => (j.completedAt ? j.completedAt.slice(0, 10) : j.scheduledDate || '');
  const { rows: techRows } = await db.query("SELECT id, name FROM users WHERE role = 'technician' AND active = true");
  const watchLines = [];
  for (const t of techRows) {
    const mine = jobs.filter(j => j.assignedTo === t.id);
    const completed = mine.filter(j => (j.status === 'completed' || j.status === 'sold') && revDate(j).startsWith(monthKey));
    const sold = completed.filter(j => (j.totalAmount || 0) > 0).length;
    const coffee = mine.filter(j => j.status === 'coffee' && (j.scheduledDate || '').startsWith(monthKey)).length;
    const zero = mine.filter(j => j.status === 'completed' && revDate(j).startsWith(monthKey) && (j.totalAmount || 0) === 0).length;
    let cash = 0, collected = 0;
    for (const j of completed) {
      const c = j.paymentStatus === 'paid' ? (j.totalAmount || 0) : j.paymentStatus === 'partial' ? (j.amountPaid || 0) : 0;
      collected += c;
      if (j.paymentMethod === 'Cash') cash += c;
    }
    const opp = sold + coffee;
    const flags = [];
    if (coffee >= 3 && opp > 0 && coffee / opp >= 0.5) flags.push(`${coffee} no-sale visits`);
    if (collected >= 300 && cash / collected >= 0.8) flags.push(`${Math.round((cash / collected) * 100)}% cash`);
    if (zero >= 2) flags.push(`${zero}× $0 completions`);
    if (flags.length) watchLines.push(`${t.name}: ${flags.join(', ')}`);
  }

  const text = [
    `TrustKey daily wrap — ${date}:`,
    `${money(revenueToday)} from ${doneToday.length} job${doneToday.length === 1 ? '' : 's'} today.`,
    unpaidCount > 0 ? `${unpaidCount} unpaid (${money(outstanding)} outstanding).` : 'No outstanding balances.',
    `${bookedTomorrow} job${bookedTomorrow === 1 ? '' : 's'} booked for tomorrow.`,
    watchLines.length ? `⚠ Watch: ${watchLines.join('; ')}.` : '',
  ].filter(Boolean).join(' ');

  const { rows: owners } = await db.query(
    "SELECT phone FROM users WHERE role = 'owner' AND active = true AND phone IS NOT NULL AND phone <> ''"
  );
  for (const o of owners) await sendSMS(o.phone.trim(), text);
  sendPushToRoles(['owner'], {
    title: 'Daily wrap',
    body: text.replace('TrustKey daily wrap — ', '').slice(0, 160),
    tag: `digest-${date}`,
    data: { type: 'digest', url: '/' },
  }).catch(() => {});
  console.log('[scheduler] evening digest sent:', text);
}

// ─── Tick loop ────────────────────────────────────────────────────────────────

export function startScheduler() {
  if (!hasDB()) {
    console.log('[scheduler] no DATABASE_URL — reminders/digest disabled');
    return;
  }
  if (process.env.SCHEDULER_DISABLED === 'true') {
    console.log('[scheduler] SCHEDULER_DISABLED — skipping');
    return;
  }
  const tick = async () => {
    try { await runPaymentReminders(); } catch (e) { console.error('[scheduler] reminders error:', e.message); }
    try { await runEveningDigest(); } catch (e) { console.error('[scheduler] digest error:', e.message); }
  };
  setTimeout(tick, 30 * 1000);            // first pass shortly after boot
  setInterval(tick, 15 * 60 * 1000);      // then every 15 minutes
  console.log(`[scheduler] started — reminders at ${REMINDER_DAYS.join('/')} days (${REMINDER_WINDOW.from}:00–${REMINDER_WINDOW.to}:00 ${TZ}), digest at ${DIGEST_HOUR}:00 ${TZ}`);
}
