import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { DraftRate, guessCategory, guessType } from './priceImport';

// The two network-backed halves of the price-list import: reading a competitor's or our
// own web page (the server fetches it — another origin is unreadable from the browser),
// and handing a paste the local parser could not make sense of to Дурачок.

interface RawRate { name?: unknown; price?: unknown; nightPrice?: unknown; note?: unknown; category?: unknown }

function toDrafts(raw: RawRate[]): DraftRate[] {
  return (raw || [])
    .map(r => {
      const name = String(r?.name ?? '').trim().slice(0, 80);
      const price = Number(r?.price);
      const nightPrice = Number(r?.nightPrice);
      const note = String(r?.note ?? '').trim().slice(0, 120);
      return {
        name,
        price,
        nightPrice: Number.isFinite(nightPrice) && nightPrice > price ? nightPrice : undefined,
        category: guessCategory(name),
        type: guessType(name),
        note: note || undefined,
      };
    })
    .filter(r => r.name && Number.isFinite(r.price) && r.price >= 0 && r.price <= 100000);
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/** Read the price list off a public web page (ours or a competitor's). Owner/manager only. */
export async function scanWebsitePrices(url: string): Promise<DraftRate[]> {
  const res = await fetch(`${API_BASE}/api/ai/price-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Не удалось прочитать страницу.'));
  const body = await res.json();
  return toDrafts(body?.rates || []);
}

const TEXT_PROMPT = `You are reading a locksmith company's PRICE LIST written by hand, in any language and any format.
Return ONLY valid JSON (no markdown fences, no commentary):

{"rates":[{"name":string,"price":number,"nightPrice":number|null,"note":string}]}

Rules:
- name: the service, in the language it was written in, max 60 chars
- price: the daytime/base price in dollars as a number (for "from $99" use 99 and put "from" in note)
- nightPrice: the after-hours/night price if given, otherwise null
- note: a short qualifier printed with the price ("per additional door", "from"), else ""
- Skip headings, phone numbers, dates and anything without a price
- If there are no prices at all, return {"rates":[]}`;

/** Last resort for a paste the offline parser choked on — costs an AI call, so the UI asks first. */
export async function aiParsePriceText(text: string): Promise<DraftRate[]> {
  const res = await fetch(`${API_BASE}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: text.slice(0, 24000) }] }],
      systemInstruction: TEXT_PROMPT,
    }),
  });
  if (!res.ok) throw new Error(await readError(res, 'ИИ не смог разобрать список.'));
  const body = await res.json();
  try {
    const cleaned = String(body?.text || '{}').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return toDrafts(Array.isArray(parsed) ? parsed : parsed?.rates || []);
  } catch {
    throw new Error('ИИ вернул непонятный ответ — попробуй ещё раз.');
  }
}
