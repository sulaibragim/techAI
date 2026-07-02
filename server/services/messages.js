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
