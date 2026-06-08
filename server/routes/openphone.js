import { Router } from 'express';
import { processTranscriptWithAI } from '../services/gemini.js';
import { getPhoneNumbers } from '../services/openphone.js';

export const openphoneRouter = Router();

// Webhook — OpenPhone sends events here
openphoneRouter.post('/webhook', async (req, res) => {
  const event = req.body;
  console.log('[OpenPhone webhook]', event?.type, event?.data?.object?.id);

  res.sendStatus(200); // always ack immediately

  try {
    if (event?.type === 'call.completed') {
      await handleCallCompleted(event.data.object);
    } else if (event?.type === 'message.received') {
      await handleMessageReceived(event.data.object);
    }
  } catch (err) {
    console.error('[OpenPhone webhook error]', err);
  }
});

// REST — frontend fetches recent calls
openphoneRouter.get('/calls', async (req, res) => {
  try {
    const { phoneNumberId } = req.query;
    const params = new URLSearchParams({ phoneNumberId, maxResults: '25' });
    params.append('participants[0]', process.env.OPENPHONE_PHONE_NUMBER);
    const response = await fetch(
      `https://api.openphone.com/v1/calls?${params}`,
      { headers: { Authorization: process.env.OPENPHONE_API_KEY } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST — frontend fetches recent messages
openphoneRouter.get('/messages', async (req, res) => {
  try {
    const { phoneNumberId } = req.query;
    const params = new URLSearchParams({ phoneNumberId, maxResults: '50' });
    params.append('participants[0]', process.env.OPENPHONE_PHONE_NUMBER);
    const response = await fetch(
      `https://api.openphone.com/v1/messages?${params}`,
      { headers: { Authorization: process.env.OPENPHONE_API_KEY } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST — send SMS from CRM
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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST — get phone numbers for this workspace
openphoneRouter.get('/phone-numbers', async (_req, res) => {
  try {
    const key = process.env.OPENPHONE_API_KEY;
    console.log('[phone-numbers] key prefix:', key?.slice(0, 8));
    const r = await fetch('https://api.openphone.com/v1/phone-numbers', {
      headers: { Authorization: key },
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

  // Store the result so the frontend can poll for it
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

async function handleMessageReceived(message) {
  // Just log for now — frontend polls /messages
  console.log('[OpenPhone] Incoming SMS from', message.from, ':', message.body);
}

// In-memory store of pending job suggestions (frontend polls this)
export const pendingJobSuggestions = new Map();

openphoneRouter.get('/pending-jobs', (_req, res) => {
  res.json(Array.from(pendingJobSuggestions.values()));
});

openphoneRouter.delete('/pending-jobs/:callId', (req, res) => {
  pendingJobSuggestions.delete(req.params.callId);
  res.sendStatus(204);
});
