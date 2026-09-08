import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

// OpenPhone number the company sends from (same id used in the Calls/Messages views).
export const OPENPHONE_PHONE_NUMBER_ID = 'PNkhFHiD2G';

export interface SmsResult {
  ok: boolean;
  /** Human-readable reason, ready to show. Only set when ok is false. */
  error?: string;
}

// Turn an HTTP status + whatever the backend said into ONE honest sentence.
// The rule: only blame billing when OpenPhone actually said it's a billing problem.
// Guessing "out of credits" for every failure sent us chasing a paid-up account while
// the real cause (bad number, expired session, backend down) stayed invisible.
export function describeSmsFailure(status: number, reason?: string): string {
  const r = (reason || '').trim();
  if (status === 402 || /credit|insufficient funds|prepaid/i.test(r)) {
    return 'OpenPhone has no prepaid SMS credits left. Top up in OpenPhone > Settings > Billing, then resend.';
  }
  if (status === 401) return 'Your session expired. Sign in again, then resend.';
  if (status === 403) return r || 'You are not allowed to text this number.';
  if (status === 400) return r || 'The number or the message text was rejected. Check the phone number.';
  if (status === 404) return 'The messaging service is unreachable (endpoint not found). Tell the developer.';
  if (status === 429) return 'Too many messages at once. Wait a minute, then resend.';
  if (status === 503) return r || 'Texting is not set up on the server yet.';
  if (status >= 500) return r ? `Server error: ${r}` : 'The server could not send the message. Try again.';
  return r || 'The message was not delivered. Try again.';
}

// Send an SMS to a client via the backend OpenPhone proxy, reporting WHY it failed.
export async function sendSmsDetailed(to: string, content: string): Promise<SmsResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/openphone/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ to, content, phoneNumberId: OPENPHONE_PHONE_NUMBER_ID }),
    });
  } catch {
    return { ok: false, error: 'No connection to the server. Check your internet, then resend.' };
  }
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => null);
  return { ok: false, error: describeSmsFailure(res.status, body?.error) };
}

// Boolean shorthand for callers that only branch on success.
export async function sendSms(to: string, content: string): Promise<boolean> {
  return (await sendSmsDetailed(to, content)).ok;
}
