// SMS cost math + cheap-encoding cleanup.
//
// Carriers bill per SEGMENT, and segment size depends on the encoding of the WHOLE
// message: if every char is in the GSM-7 alphabet a segment holds 160 chars (153 when
// the message splits); a single char outside it (em dash, curly quote, í, emoji) flips
// the entire message to UCS-2 where a segment holds only 70 (67 split). sanitizeSms()
// swaps the usual offenders for their GSM twins so a message stays cheap; smsInfo()
// prices whatever remains. Server twin: server/services/smsText.js — keep in sync.

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑܧ¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€'; // sendable, but each one costs TWO septets

const GSM_SET = new Set(GSM_BASIC);
const GSM_EXT_SET = new Set(GSM_EXT);

// Typographic char → GSM twin, keys as \u escapes so invisible characters can't be
// mangled by editors. Spanish acute vowels map to bare vowels on purpose: á/í/ó/ú are
// NOT in GSM-7 (é is) — "esta" reads fine and keeps the text cheap.
const REPLACEMENTS: Record<string, string> = {
  '–': '-', '—': '-', '−': '-',      // en dash, em dash, minus sign
  '‘': "'", '’': "'", '‚': "'",      // curly single quotes
  '“': '"', '”': '"', '„': '"',      // curly double quotes
  '«': '"', '»': '"',                     // guillemets
  '…': '...',                                  // ellipsis
  '•': '-', '·': '-',                     // bullet, middle dot
  ' ': ' ', ' ': ' ', '​': '',       // nbsp, thin space, zwsp
  'á': 'a', 'í': 'i', 'ó': 'o', 'ú': 'u', // á í ó ú
  'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', // Á Í Ó Ú
  'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u', // â ê î ô û
  'ë': 'e', 'ï': 'i', 'ç': 'c',      // ë ï ç
};

export function sanitizeSms(text: string): string {
  let out = '';
  for (const ch of text) out += REPLACEMENTS[ch] ?? ch;
  return out;
}

export interface SmsInfo {
  chars: number;                 // billed length (GSM extension chars count double)
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  perSegment: number;            // capacity of one segment at this encoding
}

export function smsInfo(text: string): SmsInfo {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_SET.has(ch)) septets += 1;
    else if (GSM_EXT_SET.has(ch)) septets += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    const segments = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    return { chars: septets, encoding: 'GSM-7', segments, perSegment: segments > 1 ? 153 : 160 };
  }
  // UCS-2 counts UTF-16 code units — an emoji outside the BMP takes two.
  let units = 0;
  for (const ch of text) units += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
  return { chars: units, encoding: 'UCS-2', segments, perSegment: segments > 1 ? 67 : 70 };
}
