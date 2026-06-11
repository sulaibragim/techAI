import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const BASE = 'https://api.openphone.com/v1';
const headers = () => ({ Authorization: process.env.OPENPHONE_API_KEY });

// OpenPhone requires E.164 ("+<country><number>"). Numbers in the CRM arrive in every
// shape — "(602) 555-0199", "602-555-0199", "6025550199", "+1 602 555 0199" — and a
// non-E.164 number is silently REJECTED by the API. Coerce to E.164 (default US +1)
// before every send so messages actually go out regardless of how they were typed.
export function toE164(raw, defaultCc = '1') {
  if (raw == null) return raw;
  const s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return s;
  if (hasPlus) return '+' + digits;                              // already E.164 — just clean
  if (digits.length === 10) return `+${defaultCc}${digits}`;     // local US 10-digit → +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`; // 1 + 10 digits
  return `+${digits}`;                                           // assume it already carries a country code
}

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
      body: JSON.stringify({ from: toE164(from), to: [toE164(to)], content }),
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
