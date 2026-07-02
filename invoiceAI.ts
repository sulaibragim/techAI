import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { Part } from './types';

// AI invoice import: Дурачок reads a photo of a supplier invoice and returns structured
// line items, which are then matched to inventory by IDENTIFIER (UPC/MPN → learned
// supplier code → fuzzy name), never by name alone. Names are for humans.

export interface InvoiceLine {
  code: string;         // supplier's item code / part number as printed
  description: string;
  qty: number;
  unitCost: number;
}

export interface ParsedInvoice {
  supplier: string;
  invoiceNumber: string;
  lines: InvoiceLine[];
}

const PROMPT = `You are reading a photo of a SUPPLIER INVOICE for a locksmith company.
Extract the data and return ONLY valid JSON (no markdown fences, no commentary):

{
  "supplier": string,        // supplier/vendor company name as printed, "" if unclear
  "invoiceNumber": string,   // invoice/order number as printed, "" if none visible
  "lines": [
    { "code": string, "description": string, "qty": number, "unitCost": number }
  ]
}

Rules:
- code: the supplier's item/part number for the line ("" if the line has none)
- qty: the quantity shipped/billed (number)
- unitCost: price PER UNIT in dollars (if only a line total is printed, divide by qty)
- Skip shipping, tax, discounts, and subtotal rows — product lines only
- If the photo is not an invoice at all, return {"supplier":"","invoiceNumber":"","lines":[]}`;

// Downscale the chosen photo so the request stays well under the 5 MB body limit while
// keeping text legible for the model.
export async function fileToInvoiceImage(file: File): Promise<{ data: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg' };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.82);
  return { data: jpeg.split(',')[1], mimeType: 'image/jpeg' };
}

export async function parseInvoiceImage(image: { data: string; mimeType: string }): Promise<ParsedInvoice> {
  const res = await fetch(`${API_BASE}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: 'Extract this invoice.' },
        ],
      }],
      systemInstruction: PROMPT,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'AI request failed');
  }
  const { text } = await res.json();
  // The model is told "no fences" but strip them anyway — cheap insurance.
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(clean);
  return {
    supplier: String(parsed.supplier || '').trim(),
    invoiceNumber: String(parsed.invoiceNumber || '').trim(),
    lines: (Array.isArray(parsed.lines) ? parsed.lines : [])
      .map((l: any) => ({
        code: String(l.code || '').trim(),
        description: String(l.description || '').trim(),
        qty: Math.max(0, Number(l.qty) || 0),
        unitCost: Math.max(0, Number(l.unitCost) || 0),
      }))
      .filter((l: InvoiceLine) => l.qty > 0 && (l.description || l.code)),
  };
}

// ─── Match ladder ────────────────────────────────────────────────────────────
// Identifier first, learned alias second, fuzzy name last (needs human confirm).

export type MatchConfidence = 'exact' | 'alias' | 'fuzzy' | 'none';
export interface LineMatch { partId: string | null; confidence: MatchConfidence; }

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);

export function matchInvoiceLine(
  line: InvoiceLine,
  inventory: Part[],
  supplier: string,
  aliases: Record<string, string>
): LineMatch {
  const code = norm(line.code);

  if (code) {
    // 1. Exact identifier: the code printed on the invoice IS the UPC or the MPN.
    const byId = inventory.find(p => (p.upc && norm(p.upc) === code) || (p.mpn && norm(p.mpn) === code));
    if (byId) return { partId: byId.id, confidence: 'exact' };
    // 2. Learned supplier alias from a previously confirmed import.
    const aliasKey = `${supplier.trim().toLowerCase()}|${line.code.trim().toLowerCase()}`;
    const aliased = aliases[aliasKey];
    if (aliased && inventory.some(p => p.id === aliased)) return { partId: aliased, confidence: 'alias' };
  }

  // 3. Fuzzy name overlap — a suggestion only; the UI asks the human to confirm.
  const lineTokens = new Set(tokens(line.description));
  if (lineTokens.size > 0) {
    let best: { id: string; score: number } | null = null;
    for (const p of inventory) {
      const pt = tokens(`${p.name} ${p.brand || ''}`);
      if (pt.length === 0) continue;
      const hits = pt.filter(t => lineTokens.has(t)).length;
      const score = hits / Math.max(pt.length, lineTokens.size);
      if (hits >= 2 && score >= 0.4 && (!best || score > best.score)) best = { id: p.id, score };
    }
    if (best) return { partId: best.id, confidence: 'fuzzy' };
  }

  return { partId: null, confidence: 'none' };
}
