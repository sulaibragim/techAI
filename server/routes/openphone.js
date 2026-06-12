import { Router } from 'express';
import crypto from 'node:crypto';
import { processTranscriptWithAI } from '../services/gemini.js';
import { toE164 } from '../services/openphone.js';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db.js';

export const openphoneRouter = Router();

// In-memory cache for fast reads. Durable copy lives in Postgres (pending_jobs / calls /
// messages tables) so a Railway restart no longer wipes call summaries & history.
export const pendingJobSuggestions = new Map();
export const recentCalls = [];      // [{id, from, to, direction, status, duration, createdAt, ...}]
export const recentMessages = [];   // [{id, from, to, body, direction, createdAt, contact}]
const MAX_STORE = 100;

// ─── Durable persistence (write-through to Postgres) ─────────────────────────
const hasDB = () => !!process.env.DATABASE_URL;

async function dbSavePending(callId, obj) {
  if (!hasDB()) return;
  try {
    await db.query(
      `INSERT INTO pending_jobs (call_id, data) VALUES ($1, $2)
       ON CONFLICT (call_id) DO UPDATE SET data = $2`,
      [callId, JSON.stringify(obj)]
    );
  } catch (e) { console.error('[OpenPhone] dbSavePending', e.message); }
}
async function dbDeletePending(callId) {
  if (!hasDB()) return;
  try { await db.query('DELETE FROM pending_jobs WHERE call_id = $1', [callId]); }
  catch (e) { console.error('[OpenPhone] dbDeletePending', e.message); }
}
async function dbSaveCall(record) {
  if (!hasDB()) return;
  try {
    await db.query(
      `INSERT INTO calls (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = $2`,
      [record.id, JSON.stringify(record)]
    );
  } catch (e) { console.error('[OpenPhone] dbSaveCall', e.message); }
}
async function dbSaveMessage(record) {
  if (!hasDB()) return;
  try {
    await db.query(
      `INSERT INTO messages (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = $2`,
      [record.id, JSON.stringify(record)]
    );
  } catch (e) { console.error('[OpenPhone] dbSaveMessage', e.message); }
}

// Load durable history back into the in-memory cache on boot. Called from index.js
// after initDB so the app is warm with everything it had before the restart.
export async function hydrateOpenPhoneStores() {
  if (!hasDB()) return;
  try {
    const pj = await db.query('SELECT data FROM pending_jobs ORDER BY created_at DESC LIMIT 200');
    for (const row of pj.rows) {
      const obj = row.data;
      if (obj?.callId) pendingJobSuggestions.set(obj.callId, obj);
    }
    const cl = await db.query('SELECT data FROM calls ORDER BY created_at DESC LIMIT 100');
    for (const row of cl.rows) recentCalls.push(row.data);
    const ms = await db.query('SELECT data FROM messages ORDER BY created_at DESC LIMIT 100');
    for (const row of ms.rows) recentMessages.push(row.data);
    console.log(`[OpenPhone] Hydrated ${pendingJobSuggestions.size} pending, ${recentCalls.length} calls, ${recentMessages.length} messages from DB`);
  } catch (e) {
    console.error('[OpenPhone] hydrate failed', e.message);
  }
}

// ─── Webhook auth ─────────────────────────────────────────────────────────────
// The webhook is public (OpenPhone posts here from the internet), so without a guard
// anyone can forge call/SMS events and inject attacker text into the AI pipeline.
// Lock it with a shared secret: set OPENPHONE_WEBHOOK_SECRET on the server and append
// ?key=<secret> to the webhook URL configured in the OpenPhone dashboard. Enforced
// only when the env var is set, so live webhooks aren't dropped before it's configured.
const WEBHOOK_SECRET = process.env.OPENPHONE_WEBHOOK_SECRET || '';
if (!WEBHOOK_SECRET) {
  console.warn('[OpenPhone] OPENPHONE_WEBHOOK_SECRET not set — /webhook is UNAUTHENTICATED. Set it and add ?key=<secret> to the OpenPhone webhook URL to lock it down.');
}
function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
function webhookAuthorized(req) {
  if (!WEBHOOK_SECRET) return true; // not configured yet — stays open (logged above)
  const provided = req.query.key || req.headers['x-webhook-secret'] || '';
  return timingSafeEqualStr(provided, WEBHOOK_SECRET);
}

// ─── Webhook — OpenPhone posts events here ────────────────────────────────────
openphoneRouter.post('/webhook', async (req, res) => {
  if (!webhookAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }
  const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  console.log('[OpenPhone webhook]', event?.type, event?.data?.object?.id);

  res.sendStatus(200); // always ack immediately before any async work

  try {
    const obj = event?.data?.object;
    if (!obj) return;

    if (event.type === 'call.ringing' || event.type === 'call.completed' || event.type === 'call.missed') {
      // Store in recent calls (deduplicate by id)
      const idx = recentCalls.findIndex(c => c.id === obj.id);
      const record = {
        id: obj.id,
        from: obj.from,
        to: obj.to,
        direction: obj.direction,
        status: obj.status || event.type.replace('call.', ''),
        duration: obj.duration || null,
        createdAt: obj.createdAt || new Date().toISOString(),
        contact: obj.contact || null,
      };
      if (idx >= 0) recentCalls[idx] = record;
      else recentCalls.unshift(record);
      if (recentCalls.length > MAX_STORE) recentCalls.pop();
      dbSaveCall(record);
    }

    if (event.type === 'call.completed') {
      await handleCallCompleted(obj);
    }

    if (event.type === 'call.transcript.completed') {
      await handleTranscriptCompleted(obj);
    }

    if (event.type === 'call.summary.completed') {
      handleSummaryCompleted(obj);
    }

    if (event.type === 'message.received') {
      const msg = {
        id: obj.id,
        from: obj.from,
        to: obj.to,
        body: obj.body || obj.text || '',
        direction: 'incoming',
        createdAt: obj.createdAt || new Date().toISOString(),
        contact: obj.contact || null,
      };
      recentMessages.unshift(msg);
      if (recentMessages.length > MAX_STORE) recentMessages.pop();
      dbSaveMessage(msg);
      console.log('[OpenPhone] Incoming SMS from', obj.from, ':', msg.body);
    }
  } catch (err) {
    console.error('[OpenPhone webhook error]', err);
  }
});

// ─── GET recent calls (from webhook store, not REST API) ─────────────────────
openphoneRouter.get('/calls', requireAuth, (_req, res) => {
  res.json({ data: recentCalls, totalItems: recentCalls.length });
});

// ─── GET recent messages (from webhook store) ─────────────────────────────────
openphoneRouter.get('/messages', requireAuth, (_req, res) => {
  res.json({ data: recentMessages, totalItems: recentMessages.length });
});

// ─── POST send SMS ────────────────────────────────────────────────────────────
openphoneRouter.post('/messages/send', requireAuth, async (req, res) => {
  try {
    const { to, content, phoneNumberId } = req.body;
    const toAddr = toE164(to); // OpenPhone rejects non-E.164 numbers — coerce first
    const response = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: process.env.OPENPHONE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: [toAddr], content, phoneNumberId }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[OpenPhone] send failed', response.status, JSON.stringify(data));
      return res.status(response.status).json({ error: data?.message || 'Send failed', details: data });
    }
    // Also store outgoing message locally + durably
    const outMsg = {
      id: data.data?.id || `out-${Date.now()}`,
      from: process.env.OPENPHONE_PHONE_NUMBER,
      to: toAddr,
      body: content,
      direction: 'outgoing',
      createdAt: new Date().toISOString(),
      contact: null,
    };
    recentMessages.unshift(outMsg);
    if (recentMessages.length > MAX_STORE) recentMessages.pop();
    dbSaveMessage(outMsg);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET phone numbers ────────────────────────────────────────────────────────
openphoneRouter.get('/phone-numbers', requireAuth, async (_req, res) => {
  try {
    const r = await fetch('https://api.openphone.com/v1/phone-numbers', {
      headers: { Authorization: process.env.OPENPHONE_API_KEY },
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Pending job suggestions (from AI-processed transcripts) ─────────────────
openphoneRouter.get('/pending-jobs', requireAuth, (_req, res) => {
  res.json(Array.from(pendingJobSuggestions.values()));
});

openphoneRouter.delete('/pending-jobs/:callId', requireAuth, (req, res) => {
  pendingJobSuggestions.delete(req.params.callId);
  dbDeletePending(req.params.callId);
  res.sendStatus(204);
});

// ─── Internal: process completed call (if transcript already in payload) ──────
async function handleCallCompleted(call) {
  const transcript = call.transcript?.dialogue
    ?.map(d => `${d.identifier}: ${d.content}`)
    .join('\n');

  if (!transcript) {
    // Transcript will come separately via call.transcript.completed
    console.log('[OpenPhone] call.completed received, waiting for transcript', call.id);
    // Store basic call info so transcript handler can enrich it
    const stub = {
      callId: call.id,
      callerPhone: call.from,
      duration: call.duration,
      recordingUrl: call.recording?.url,
      transcript: null,
      suggestion: null,
      createdAt: new Date().toISOString(),
      status: 'awaiting_transcript',
    };
    pendingJobSuggestions.set(call.id, stub);
    dbSavePending(call.id, stub);
    return;
  }

  await enrichWithAI(call.id, call.from, call.duration, call.recording?.url, transcript);
}

// ─── Internal: handle transcript from call.transcript.completed event ─────────
async function handleTranscriptCompleted(transcriptObj) {
  const callId = transcriptObj.callId;
  const dialogue = transcriptObj.dialogue || [];
  const transcript = dialogue.map(d => `${d.identifier}: ${d.content}`).join('\n');

  if (!transcript) {
    console.log('[OpenPhone] Empty transcript for call', callId);
    return;
  }

  // Get stored call info if available
  const existing = pendingJobSuggestions.get(callId);
  const callerPhone = existing?.callerPhone || transcriptObj.from || 'unknown';
  const duration = existing?.duration || null;
  const recordingUrl = existing?.recordingUrl || null;

  await enrichWithAI(callId, callerPhone, duration, recordingUrl, transcript);
}

// ─── Internal: handle call.summary.completed from OpenPhone ─────────────────
function handleSummaryCompleted(summaryObj) {
  const callId = summaryObj.callId;
  const summary = summaryObj.summary || summaryObj.text || '';
  console.log('[OpenPhone] call.summary.completed for', callId, ':', summary.slice(0, 100));

  const existing = pendingJobSuggestions.get(callId);
  if (existing) {
    existing.openPhoneSummary = summary;
    pendingJobSuggestions.set(callId, existing);
    dbSavePending(callId, existing);
  } else {
    const stub = {
      callId,
      callerPhone: summaryObj.from || 'unknown',
      duration: null,
      recordingUrl: null,
      transcript: null,
      suggestion: null,
      openPhoneSummary: summary,
      createdAt: new Date().toISOString(),
      status: 'awaiting_transcript',
    };
    pendingJobSuggestions.set(callId, stub);
    dbSavePending(callId, stub);
  }
}

// ─── Internal: run Gemini on transcript and store suggestion ──────────────────
async function enrichWithAI(callId, callerPhone, duration, recordingUrl, transcript) {
  console.log('[OpenPhone] Processing transcript with AI for call', callId);
  const suggestion = await processTranscriptWithAI(transcript, callerPhone);

  const existing = pendingJobSuggestions.get(callId);
  const record = {
    callId,
    callerPhone,
    duration,
    recordingUrl,
    transcript,
    suggestion,
    openPhoneSummary: existing?.openPhoneSummary || null,
    createdAt: new Date().toISOString(),
    status: 'ready',
  };
  pendingJobSuggestions.set(callId, record);
  dbSavePending(callId, record);

  console.log('[OpenPhone] Job suggestion ready for call', callId);
}
