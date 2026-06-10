import { API_BASE } from './backendUrl';

// OpenPhone number the company sends from (same id used in the Calls/Messages views).
export const OPENPHONE_PHONE_NUMBER_ID = 'PNkhFHiD2G';

// Send an SMS to a client via the backend OpenPhone proxy. Returns true on success,
// false on any failure (backend offline, send rejected) so callers can degrade gracefully.
export async function sendSms(to: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/openphone/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, content, phoneNumberId: OPENPHONE_PHONE_NUMBER_ID }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
