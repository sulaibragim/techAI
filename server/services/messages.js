import { db } from '../db.js';

// Client-facing SMS: one place for the copy (English + Spanish) and the per-client
// language preference. Spanish is opt-in — a client replies "SÍ" and every automated
// message to their number switches to Spanish from then on.

export const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const hasDB = () => !!process.env.DATABASE_URL;

// Language for a phone number ('en' default). Best-effort — a DB hiccup just means English.
export async function getClientLang(phone) {
  const key = last10(phone);
  if (!key || !hasDB()) return 'en';
  try {
    const { rows } = await db.query('SELECT lang FROM client_prefs WHERE phone_key = $1', [key]);
    return rows[0]?.lang === 'es' ? 'es' : 'en';
  } catch { return 'en'; }
}

export async function setClientLang(phone, lang) {
  const key = last10(phone);
  if (!key || !hasDB()) return;
  const val = lang === 'es' ? 'es' : 'en';
  try {
    await db.query(
      `INSERT INTO client_prefs (phone_key, lang, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (phone_key) DO UPDATE SET lang = $2, updated_at = NOW()`,
      [key, val]
    );
  } catch (e) { console.error('[messages] setClientLang', e.message); }
}

// ─── SMS opt-out (STOP) ────────────────────────────────────────────────────────
// Carriers require a working opt-out on automated A2P traffic, and there was none: a
// client who replied STOP got blocked at the carrier, our send failed, and the scheduler
// simply retried the same number every 15 minutes forever.

// Standard carrier keywords, plus the Spanish ones our clients actually use.
// The message must BE the keyword — that's how carriers match, and it matters here:
// "cancel my appointment" is a request to reschedule, not a demand to stop all texts.
// Punctuation and case are ignored ("STOP.", "stop!").
const STOP_WORDS = /^(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout|opt out|baja|parar|detener)$/i;
const START_WORDS = /^(start|unstop|subscribe|resume|alta)$/i;

const keyword = (body) => String(body || '').trim().replace(/[.!¡?¿,;:]+$/g, '').replace(/\s+/g, ' ');
export const isStopKeyword = (body) => STOP_WORDS.test(keyword(body));
export const isStartKeyword = (body) => START_WORDS.test(keyword(body));

/** True when this number has asked us to stop texting. Fails OPEN only on a DB error. */
export async function isOptedOut(phone) {
  const key = last10(phone);
  if (!key || !hasDB()) return false;
  try {
    const { rows } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone_key = $1', [key]);
    return rows.length > 0;
  } catch (e) {
    console.error('[messages] isOptedOut', e.message);
    return false;
  }
}

export async function setOptOut(phone, reason = 'client replied STOP') {
  const key = last10(phone);
  if (!key || !hasDB()) return;
  try {
    await db.query(
      `INSERT INTO sms_opt_outs (phone_key, reason, at) VALUES ($1, $2, NOW())
       ON CONFLICT (phone_key) DO UPDATE SET reason = $2, at = NOW()`,
      [key, reason]
    );
  } catch (e) { console.error('[messages] setOptOut', e.message); }
}

export async function clearOptOut(phone) {
  const key = last10(phone);
  if (!key || !hasDB()) return;
  try {
    await db.query('DELETE FROM sms_opt_outs WHERE phone_key = $1', [key]);
  } catch (e) { console.error('[messages] clearOptOut', e.message); }
}

// Confirmations, per the carrier convention that the STOP acknowledgement is itself
// allowed to go out.
export const OPT_OUT_CONFIRM = {
  en: "You're unsubscribed and won't get any more automated texts from us. Reply START to resume.",
  es: 'Se ha dado de baja y no recibirá más mensajes automáticos. Responda START para reactivar.',
};
export const OPT_IN_CONFIRM = {
  en: "You're subscribed again — we'll text you about your jobs. Reply STOP to opt out anytime.",
  es: 'Se ha suscrito de nuevo — le enviaremos mensajes sobre sus trabajos. Responda STOP para darse de baja.',
};

// Appended to automated (non-transactional-reply) client messages so the opt-out path is
// always visible, as carriers expect.
export const OPT_OUT_NOTE = { en: ' Reply STOP to opt out.', es: ' Responda STOP para no recibir más.' };

// A bare "SÍ / si / yes" reply (the opt-in), or an explicit mention of Spanish.
export function isSpanishOptIn(body) {
  const s = String(body || '').trim().toLowerCase();
  return /^s[íi]$/.test(s) || /\b(espa[nñ]ol|spanish)\b/.test(s);
}

// Invite appended to the FIRST outbound message a client gets, only while they're still
// on English — so an English speaker sees it once, a Spanish speaker taps SÍ and it's gone.
export const SPANISH_INVITE = ' Para español, responda SÍ.';

const nf = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;

// ─── Message templates (lang → builder) ────────────────────────────────────────
export const MSG = {
  bookingScheduled: {
    en: ({ name, tech, company, when }) =>
      `Hi ${name}, thanks for choosing ${company}! ${tech ? `${tech} is assigned` : `You're booked`} for your appointment on ${when}. We'll text you when your technician is on the way. Reply here anytime with questions.`,
    es: ({ name, tech, company, when }) =>
      `Hola ${name}, ¡gracias por elegir ${company}! ${tech ? `${tech} está asignado` : `Su cita está reservada`} para el ${when}. Le avisaremos cuando su técnico vaya en camino. Responda aquí si tiene preguntas.`,
  },
  arrived: {
    en: ({ name, tech, company }) => `Hi ${name}, ${tech} from ${company} has arrived at your location. See you in a moment!`,
    es: ({ name, tech, company }) => `Hola ${name}, ${tech} de ${company} ha llegado a su ubicación. ¡Salgo a su encuentro!`,
  },
  etaReply: {
    en: ({ name, tech, miles, minutes }) => `Hi ${name}, ${tech} is about ${miles} mi away — ETA ${minutes} min. See you soon!`,
    es: ({ name, tech, miles, minutes }) => `Hola ${name}, ${tech} está a unas ${miles} millas — llegará en ${minutes} min. ¡Nos vemos pronto!`,
  },
  etaReplyNoLoc: {
    en: ({ name, tech }) => `Hi ${name}, ${tech} is on the way and will be there as soon as possible. Thanks for your patience!`,
    es: ({ name, tech }) => `Hola ${name}, ${tech} va en camino y llegará lo antes posible. ¡Gracias por su paciencia!`,
  },
  paymentReminder: {
    en: ({ name, company, jobNo, balance, payUrl, phone }) =>
      `Hi ${name}, this is ${company}. Friendly reminder: job #${jobNo} has an outstanding balance of ${nf(balance)}.`
      + (payUrl ? ` Pay securely by card: ${payUrl}` : '')
      + ` Reply here${phone ? ` or call ${phone}` : ''} with any questions — thank you!`,
    es: ({ name, company, jobNo, balance, payUrl, phone }) =>
      `Hola ${name}, le escribe ${company}. Recordatorio: el trabajo #${jobNo} tiene un saldo pendiente de ${nf(balance)}.`
      + (payUrl ? ` Pague de forma segura con tarjeta: ${payUrl}` : '')
      + ` Responda aquí${phone ? ` o llame al ${phone}` : ''} si tiene preguntas. ¡Gracias!`,
  },
  paymentReceived: {
    en: ({ name, company, jobNo, amount, balance, receiptUrl }) =>
      `Hi ${name}, ${company} received your payment of ${nf(amount)} for job #${jobNo} — thank you!`
      + (balance > 0.01 ? ` Remaining balance: ${nf(balance)}.` : '')
      + (receiptUrl ? ` Your receipt: ${receiptUrl}` : ''),
    es: ({ name, company, jobNo, amount, balance, receiptUrl }) =>
      `Hola ${name}, ${company} recibió su pago de ${nf(amount)} por el trabajo #${jobNo} — ¡gracias!`
      + (balance > 0.01 ? ` Saldo restante: ${nf(balance)}.` : '')
      + (receiptUrl ? ` Su recibo: ${receiptUrl}` : ''),
  },
  refundIssued: {
    en: ({ name, company, jobNo, amount }) =>
      `Hi ${name}, ${company} has issued a refund of ${nf(amount)} for job #${jobNo}. Card refunds usually appear on your statement within 5–10 business days.`,
    es: ({ name, company, jobNo, amount }) =>
      `Hola ${name}, ${company} le ha emitido un reembolso de ${nf(amount)} por el trabajo #${jobNo}. Los reembolsos a tarjeta suelen aparecer en su estado de cuenta en 5–10 días hábiles.`,
  },
  spanishConfirmed: {
    es: () => `¡Perfecto! A partir de ahora recibirá nuestros mensajes en español. 🇲🇽`,
  },
  // Holding reply while we ping the tech's phone for a fresh live location.
  etaChecking: {
    en: ({ name, tech }) => `Hi ${name}, ${tech} is on the way — getting his live location now, I'll text you the ETA in a moment.`,
    es: ({ name, tech }) => `Hola ${name}, ${tech} va en camino — estoy obteniendo su ubicación en vivo y le enviaré el tiempo estimado en un momento.`,
  },
};

// Returns true the FIRST time a (job, kind) SMS is claimed, false if already sent — so a
// notification that could be triggered by several code paths still goes out exactly once.
export async function claimOnce(jobId, kind) {
  if (!jobId || !hasDB()) return true; // no DB → best-effort, allow the send
  try {
    const r = await db.query(
      'INSERT INTO sent_sms (job_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [jobId, kind]
    );
    return r.rowCount > 0;
  } catch { return false; }
}

// Pick a template by key + language, falling back to English if a Spanish variant is missing.
export function t(key, lang, vars) {
  const group = MSG[key];
  if (!group) return '';
  const fn = group[lang] || group.en;
  return fn(vars);
}
