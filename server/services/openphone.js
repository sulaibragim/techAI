import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const BASE = 'https://api.openphone.com/v1';
const headers = () => ({ Authorization: process.env.OPENPHONE_API_KEY });

export async function getPhoneNumbers() {
  const res = await fetch(`${BASE}/phone-numbers`, { headers: headers() });
  return res.json();
}

export async function getCallTranscript(callId) {
  const res = await fetch(`${BASE}/calls/${callId}/transcript`, { headers: headers() });
  return res.json();
}

// Server-initiated SMS (notifications). Best-effort: returns null if OpenPhone isn't configured
// or the send fails, so callers can fire-and-forget without breaking their own flow.
export async function sendSMS(to, content) {
  const from = process.env.OPENPHONE_PHONE_NUMBER;
  if (!process.env.OPENPHONE_API_KEY || !from) {
    console.warn('[OpenPhone] API key / OPENPHONE_PHONE_NUMBER not set — cannot send SMS');
    return null;
  }
  try {
    const res = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], content }),
    });
    if (!res.ok) {
      console.error('[OpenPhone] send failed', res.status, await res.text());
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('[OpenPhone] send error', err);
    return null;
  }
}
