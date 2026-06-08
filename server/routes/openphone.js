import { Router } from 'express';
import { processTranscriptWithAI } from '../services/gemini.js';

export const openphoneRouter = Router();

// In-memory stores (restart clears them — OK for now, will persist to DB later)
export const pendingJobSuggestions = new Map();
export const recentCalls = [];      // [{id, from, to, direction, status, duration, createdAt, ...}]
export const recentMessages = [];   // [{id, from, to, body, direction, createdAt, contact}]
const MAX_STORE = 100;

// ─── Webhook — OpenPhone posts events here ────────────────────────────────────
openphoneRouter.post('/webhook', async (req, res) => {
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
    }

    if (event.type === 'call.completed') {
      await handleCallCompleted(obj);
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
      console.log('[OpenPhone] Incoming SMS from', obj.from, ':', msg.body);
    }
  } catch (err) {
    console.error('[OpenPhone webhook error]', err);
  }
});

// ─── GET recent calls (from webhook store, not REST API) ─────────────────────
openphoneRouter.get('/calls', (_req, res) => {
  res.json({ data: recentCalls, totalItems: recentCalls.length });
});

// ─── GET recent messages (from webhook store) ─────────────────────────────────
openphoneRouter.get('/messages', (_req, res) => {
  res.json({ data: recentMessages, totalItems: recentMessages.length });
});

// ─── POST send SMS ────────────────────────────────────────────────────────────
openphoneRouter.post('/messages/send', async (req, res) => {
  try {
    const { to, content, phoneNumberId } = req.body;
    const response = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: process.env.OPENPHONE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: [to], content, phoneNumberId }),
    });
    const data = await response.json();
    // Also store outgoing message locally
    recentMessages.unshift({
      id: data.data?.id || `out-${Date.now()}`,
      from: process.env.OPENPHONE_PHONE_NUMBER,
      to,
      body: content,
      direction: 'outgoing',
      createdAt: new Date().toISOString(),
      contact: null,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET phone numbers ────────────────────────────────────────────────────────
openphoneRouter.get('/phone-numbers', async (_req, res) => {
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
openphoneRouter.get('/pending-jobs', (_req, res) => {
  res.json(Array.from(pendingJobSuggestions.values()));
});

openphoneRouter.delete('/pending-jobs/:callId', (req, res) => {
  pendingJobSuggestions.delete(req.params.callId);
  res.sendStatus(204);
});

// ─── Internal: process completed call transcript with AI ─────────────────────
async function handleCallCompleted(call) {
  const transcript = call.transcript?.dialogue
    ?.map(d => `${d.identifier}: ${d.content}`)
    .join('\n');

  if (!transcript) {
    console.log('[OpenPhone] No transcript for call', call.id);
    return;
  }

  const callerPhone = call.from;
  const suggestion = await processTranscriptWithAI(transcript, callerPhone);

  pendingJobSuggestions.set(call.id, {
    callId: call.id,
    callerPhone,
    duration: call.duration,
    recordingUrl: call.recording?.url,
    transcript,
    suggestion,
    createdAt: new Date().toISOString(),
  });

  console.log('[OpenPhone] Job suggestion ready for call', call.id);
}
