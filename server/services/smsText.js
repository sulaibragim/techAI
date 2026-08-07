// Server twin of /smsText.ts — keep the two in sync.
//
// Every outgoing SMS passes through sanitizeSms() so typographic chars (em dash, curly
// quote, Í, á…) can't silently flip a message into the UCS-2 encoding, where a segment
// holds 70 chars instead of 160 and the same text costs 2-3x more.

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑܧ¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

const GSM_SET = new Set(GSM_BASIC);
const GSM_EXT_SET = new Set(GSM_EXT);

const REPLACEMENTS = {
  '–': '-', '—': '-', '−': '-',
  '‘': "'", '’': "'", '‚': "'",
  '“': '"', '”': '"', '„': '"',
  '«': '"', '»': '"',
  '…': '...',
  '•': '-', '·': '-',
  ' ': ' ', ' ': ' ', '​': '',
  'á': 'a', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
  'ë': 'e', 'ï': 'i', 'ç': 'c',
};

export function sanitizeSms(text) {
  let out = '';
  for (const ch of String(text ?? '')) out += REPLACEMENTS[ch] ?? ch;
  return out;
}

export function smsInfo(text) {
  let septets = 0;
  let gsm = true;
  for (const ch of String(text ?? '')) {
    if (GSM_SET.has(ch)) septets += 1;
    else if (GSM_EXT_SET.has(ch)) septets += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    const segments = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    return { chars: septets, encoding: 'GSM-7', segments, perSegment: segments > 1 ? 153 : 160 };
  }
  let units = 0;
  for (const ch of String(text ?? '')) units += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
  return { chars: units, encoding: 'UCS-2', segments, perSegment: segments > 1 ? 67 : 70 };
}
