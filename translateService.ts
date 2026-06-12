import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

export interface RuCallSummary {
  summary: string;
  strengths: string[];
  improvements: string[];
  missedInfo: string[];
}

// Translate a call summary + quality lists to Russian via the server AI proxy.
// Returns null on any failure so the UI can degrade gracefully (stay on EN).
export async function translateCallSummary(
  summary: string,
  quality?: { strengths: string[]; improvements: string[]; missedInfo: string[] } | null
): Promise<RuCallSummary | null> {
  try {
    const payload = {
      summary,
      strengths: quality?.strengths || [],
      improvements: quality?.improvements || [],
      missedInfo: quality?.missedInfo || [],
    };
    const res = await fetch(`${API_BASE}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        systemInstruction:
          'You translate locksmith-CRM call reviews from English to natural, business-style Russian. ' +
          'Input is JSON: {"summary": string, "strengths": string[], "improvements": string[], "missedInfo": string[]}. ' +
          'Reply with ONLY the same JSON structure with every string translated to Russian. ' +
          'Keep names, phone numbers, addresses and prices as-is. No markdown, no code fences, JSON only.',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = String(data?.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);
    if (typeof parsed?.summary !== 'string') return null;
    return {
      summary: parsed.summary,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
      missedInfo: Array.isArray(parsed.missedInfo) ? parsed.missedInfo.map(String) : [],
    };
  } catch {
    return null;
  }
}
