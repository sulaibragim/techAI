import { db } from '../db.js';
import { opGet, resolveOwnNumber, sendSMS } from './openphone.js';
import { sendPushToRoles } from './push.js';
import { claimOnce } from './messages.js';
import { staffNotifyEnabled } from './businessSettings.js';
import { sanitizeSms } from './smsText.js';

// When Sona (the OpenPhone AI agent on our number) takes a call and promises the caller a
// callback, every owner gets a text AND a push. Push alone is not enough — nobody sits in
// the app, and a promised callback nobody makes is a lost job. Only PROMISED callbacks:
// a caller who got their answer from Sona and hung up is not worth a text.
//
// This does not wait for a webhook — the OpenPhone account had none registered when this
// was built (GET /v1/webhooks → []). A one-minute poll asks the API about calls on
// conversations that moved recently. If call webhooks are turned on later they only get
// here sooner; the sent_sms guard keeps it to one text per call either way.

const POLL_MS = 60 * 1000;
const LOOKBACK_MS = 30 * 60 * 1000; // conversations touched this recently get looked at
const WAIT_MS = 15 * 60 * 1000;     // how long Sona's summary / transcript may take to appear

const digits10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Sona's closing promise, in her default wording ("someone will follow-up with you") and
// in our own call script (locksmitch/CALL-SCRIPT.md), which ends every call with "I'm
// sending this to our available technician now. He'll call you within five minutes." —
// no "back" in it. Her OFFERS are not promises ("would you like me to have someone call
// you?" can still get a no), so questions are skipped sentence by sentence.
// No trailing \b on the Spanish: without the u flag "á" is not a word character, so
// "comunicará\b" never matches.
const PROMISE_EN = /\b(?:will|['’]ll)\s+(?:be\s+)?(?:follow(?:ing)?[\s-]*up|call(?:ing)?\s+you|get(?:ting)?\s+back\s+to\s+you|reach(?:ing)?\s+out|contact(?:ing)?\s+you|give\s+you\s+a\s+(?:call|ring)|return(?:ing)?\s+your\s+call)|\bsending\s+(?:this|it|that|your\s+\w+)\s+(?:over\s+)?to\s+(?:our|the|an?)\s+(?:available\s+)?(?:tech|technician|team|dispatch)|\bhave\s+(?:dispatch|someone|our\s+team|the\s+tech\w*|a\s+tech\w*)\s+(?:call|contact|confirm|reach)|\b(?:tech|technician|dispatch)\s+(?:calls|will\s+call)\s+you/i;
const PROMISE_ES = /devolver[áa]n?\s+(?:la|su)\s+llamada|le\s+llamar(?:[áa]n?|emos)|se\s+(?:comunicar|pondr)[áa]n?|nos\s+(?:comunicaremos|pondremos\s+en\s+contacto)/i;

// Sona's summary lists the "jobs" she ran on the call, each with what it captured.
// "Answer questions" holds Q&A pairs; every other job — the stock "Message taking", our
// intake job — holds what the caller told her. Any of those capturing something is the
// plainest possible "someone will call you back".
function intakeFields(summary) {
  const out = [];
  for (const j of summary?.jobs || []) {
    if (/answer/i.test(j?.name || '')) continue;
    for (const d of j?.result?.data || []) {
      const v = String(d?.value ?? '').trim();
      if (v) out.push([String(d?.name || ''), v]);
    }
  }
  return out;
}

const pick = (fields, re) => (fields.find(([k]) => re.test(k)) || [])[1] || '';

/** What the owners' text needs from Sona's summary: who, where, and what's wrong. */
export function callbackDetails(summary) {
  const f = intakeFields(summary);
  const issue = pick(f, /going on|message|reason|summary|issue|problem|need|\bjob\b/i);
  const vehicle = pick(f, /vehicle|\bcar\b|make|model|\block\b/i);
  return {
    name: pick(f, /\bname\b/i),
    zip: pick(f, /\bzip\b|postal/i),
    address: pick(f, /address|street|location/i),
    note: [issue || firstSentence(summary), vehicle].filter(Boolean).join('; '),
  };
}

/**
 * Did Sona promise this caller a callback? `summary` / `dialogue` may each be null when
 * OpenPhone hasn't produced them (yet). Only OUR side of the transcript counts — a caller
 * saying "I'll get back to you" is not a promise we made.
 */
export function callbackPromised({ summary, dialogue, ownNumber }) {
  if (intakeFields(summary).length) return true;
  const own = digits10(ownNumber);
  return (dialogue || [])
    .filter(l => own && digits10(l?.identifier) === own)
    .flatMap(l => String(l?.content || '').match(/[^.!?]+[.!?]*/g) || [])
    .filter(s => !s.trim().endsWith('?'))
    .some(s => PROMISE_EN.test(s) || PROMISE_ES.test(s));
}

export function prettyPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d.length === 10 ? d : '';
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : (raw || 'unknown number');
}

// One segment, always. The number goes first, then ZIP and address; the note is what gets
// cut to fit — never the thing the owner taps, and never where the job is.
export function callbackText({ phone, name, zip, address, note }) {
  const who = [prettyPhone(phone), sanitizeSms(name || '').slice(0, 40)].filter(Boolean).join(', ');
  const where = [zip, address].map(s => sanitizeSms(s || '').trim()).filter(Boolean).join(', ').slice(0, 70);
  let text = `Call back: ${who}` + (where ? `\n${where}` : '');
  const room = 160 - text.length - '\nSona: '.length;
  const n = sanitizeSms(note || '').trim();
  if (n && room >= 12) text += `\nSona: ${n.length > room ? n.slice(0, room - 3).trimEnd() + '...' : n}`;
  return text;
}

function firstSentence(summary) {
  const s = Array.isArray(summary?.summary) ? summary.summary.join(' ') : String(summary?.summary || '');
  return (s.match(/^[^.!?]+[.!?]?/) || [''])[0].trim();
}

async function readSummary(callId) {
  try {
    const r = await opGet(`/call-summaries/${encodeURIComponent(callId)}`);
    return r?.data?.status === 'completed' ? r.data : null;
  } catch (e) { if (e.status === 404) return null; throw e; }
}

async function readDialogue(callId) {
  try {
    const r = await opGet(`/call-transcripts/${encodeURIComponent(callId)}`);
    return r?.data?.status === 'completed' ? (r.data.dialogue || []) : null;
  } catch (e) { if (e.status === 404) return null; throw e; }
}

async function notifyOwners({ callId, phone, name, zip, address, note }) {
  const text = callbackText({ phone, name, zip, address, note });
  sendPushToRoles(['owner'], {
    title: `Call back ${name || prettyPhone(phone)}`,
    body: [name && prettyPhone(phone), [zip, address].filter(Boolean).join(', '), note || 'Sona told them we will call back.']
      .filter(Boolean).join(' · '),
    tag: `callback-${callId}`,
    data: { type: 'callback', from: phone || null, url: '/' },
  }).catch(e => console.error('[callbacks] push error', e.message));

  // Text AND push, every time (same rule as a job assignment): a push can be swiped away
  // or silenced, and this one stands for a customer waiting by their phone.
  const { rows } = await db.query(
    "SELECT phone FROM users WHERE role = 'owner' AND active = true AND phone IS NOT NULL AND phone <> ''"
  );
  const sentTo = new Set();
  for (const r of rows) {
    const key = digits10(r.phone);
    if (sentTo.has(key)) continue;
    sentTo.add(key);
    await sendSMS(r.phone.trim(), text);
  }
  if (!sentTo.size) console.warn('[callbacks] no active owner has a phone on file — callback went out as push only');
  console.log(`[callbacks] Sona promised a callback on ${callId} → texted ${sentTo.size} owner(s)`);
}

// Calls already decided (texted, or not a promise). Bounded by the poll's time window.
const settled = new Map(); // callId -> decidedAt
const inFlight = new Set();

/**
 * Look at one call and text the owners if Sona promised a callback. Safe to call as often
 * as you like: undecided calls (summary not ready yet) are simply left for the next pass.
 * `known` is the call object when the caller already has it, saving a request.
 */
export async function checkAiCall(callId, known) {
  if (!callId || settled.has(callId) || inFlight.has(callId)) return;
  inFlight.add(callId);
  try {
    const call = known || (await opGet(`/calls/${encodeURIComponent(callId)}`))?.data;
    if (!call) return;
    if (call.aiHandled !== 'ai-agent' || call.direction !== 'incoming') { settled.set(callId, Date.now()); return; }
    if (!call.completedAt) return; // the caller is still talking to her

    const { e164: own } = await resolveOwnNumber();
    const [summary, dialogue] = await Promise.all([readSummary(callId), readDialogue(callId)]);
    if (!callbackPromised({ summary, dialogue, ownNumber: own })) {
      // No promise in what we can read. Only final once both sources are in (or have had
      // their chance): the transcript can carry a promise the summary's jobs don't.
      const waited = Date.now() - new Date(call.completedAt).getTime();
      if ((summary && dialogue) || waited > WAIT_MS) settled.set(callId, Date.now());
      return;
    }

    settled.set(callId, Date.now());
    if (!(await staffNotifyEnabled('aiCallback'))) return;
    if (!(await claimOnce(callId, 'aiCallback'))) return; // texted before a restart / by the webhook path
    const phone = (call.participants || []).find(p => digits10(p) !== digits10(own)) || '';
    await notifyOwners({ callId, phone, ...callbackDetails(summary) });
  } finally {
    inFlight.delete(callId);
  }
}

async function poll() {
  if (!(await staffNotifyEnabled('aiCallback'))) return;
  const { id: phoneNumberId, e164: own } = await resolveOwnNumber();
  if (!phoneNumberId) return;
  const now = Date.now();
  const convs = await opGet('/conversations', {
    phoneNumbers: [phoneNumberId],
    updatedAfter: new Date(now - LOOKBACK_MS).toISOString(),
    maxResults: 50,
  });
  for (const conv of convs?.data || []) {
    const others = (conv.participants || []).filter(p => digits10(p) !== digits10(own));
    if (others.length !== 1) continue; // calls are 1:1; group threads are texts
    // One thread's hiccup (a 429, a deleted call) must not hide the next caller's callback.
    try {
      const calls = await opGet('/calls', { phoneNumberId, participants: others, maxResults: 5 });
      for (const call of calls?.data || []) {
        if (call.aiHandled !== 'ai-agent' || settled.has(call.id)) continue;
        if (now - new Date(call.createdAt).getTime() > LOOKBACK_MS + WAIT_MS) continue;
        await checkAiCall(call.id, call);
      }
    } catch (e) { console.warn('[callbacks] conversation check failed:', e.message); }
  }
  for (const [id, at] of settled) if (now - at > 2 * (LOOKBACK_MS + WAIT_MS)) settled.delete(id);
}

export function startAiCallbackWatch() {
  if (!process.env.OPENPHONE_API_KEY) {
    console.log('[callbacks] no OPENPHONE_API_KEY — Sona callback alerts off');
    return;
  }
  // The sent_sms guard is what stops a restart from re-texting the last half hour.
  if (!process.env.DATABASE_URL) {
    console.log('[callbacks] no DATABASE_URL — Sona callback alerts off');
    return;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await poll(); } catch (e) { console.warn('[callbacks] poll failed:', e.message); }
    finally { running = false; }
  };
  setTimeout(run, 20 * 1000);
  setInterval(run, POLL_MS);
  console.log('[callbacks] watching for calls where Sona promised a callback (every 60s)');
}
