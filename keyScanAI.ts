import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

// Sends a calibrated key photo (overlay already burned in) to the AI proxy and
// returns the draft bitting. Never trusted on its own — the caller marks every
// digit for confirmation against the gauge.

export interface KeyScanResult {
  depths: number[];
  /** 1-based positions the model was not confident about. */
  unsure: number[];
}

export const parseKeyScan = (raw: string, chambers: number): KeyScanResult => {
  const clean = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed: any;
  try { parsed = JSON.parse(clean); } catch { return { depths: [], unsure: [] }; }

  const depths = (Array.isArray(parsed.depths) ? parsed.depths : [])
    .map((n: any) => Number(n))
    .filter((n: number) => Number.isFinite(n));

  // A partial read is a failed read — we will not half-fill a bitting.
  if (depths.length !== chambers) return { depths: [], unsure: [] };

  const unsure = (Array.isArray(parsed.unsure) ? parsed.unsure : [])
    .map((n: any) => Number(n))
    .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= chambers);

  return { depths, unsure };
};

export async function readKeyImage(
  image: { data: string; mimeType: string },
  prompt: string,
  chambers: number,
): Promise<KeyScanResult> {
  const res = await fetch(`${API_BASE}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: 'Read the key against the overlay.' },
        ],
      }],
      systemInstruction: prompt,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'AI не ответил');
  }
  const { text } = await res.json();
  return parseKeyScan(text, chambers);
}
