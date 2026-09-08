import crypto from 'node:crypto';
import { jwtSecret } from '../config.js';
import { db } from '../db.js';

// Short public links for the two pages we text clients: the pay page and the receipt.
//
// The long form — /pay/j/job-<uuid>/<20-hex signature> — is 108 characters. A GSM-7 SMS
// segment holds 160, so the link alone ate two thirds of one, and the payment, receipt
// and reminder texts each spilled into a second segment at double the price. A 12-char
// code brings the whole URL to 54 characters and all three texts back to one segment.
//
// The code IS the authorisation (same contract as the HMAC path segment it replaces), so
// it is derived from the server secret and long enough not to be guessable: 62^12 is
// about 2^71. Codes are deterministic per (kind, job), so re-texting a reminder reuses
// the link the client already has rather than minting a new one each time.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_LEN = 12;

function codeFor(kind, jobId, len = CODE_LEN) {
  const h = crypto.createHmac('sha256', jwtSecret()).update(`short:${kind}:${jobId}`).digest();
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[h[i % h.length] % ALPHABET.length];
  return out;
}

// Claim (or re-claim) the code for this target. Returns null if the DB can't be reached,
// so callers fall back to the long URL rather than texting a dead link.
export async function shortCodeFor(kind, jobId) {
  if (!process.env.DATABASE_URL || !jobId) return null;
  try {
    const existing = await db.query('SELECT code FROM short_links WHERE kind = $1 AND job_id = $2', [kind, jobId]);
    if (existing.rows.length) return existing.rows[0].code;

    // A collision is astronomically unlikely, but a taken code must never point at the
    // wrong job — lengthen and retry rather than overwrite someone else's link.
    for (let len = CODE_LEN; len <= CODE_LEN + 6; len += 2) {
      const code = codeFor(kind, jobId, len);
      const ins = await db.query(
        `INSERT INTO short_links (code, kind, job_id) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [code, kind, jobId]
      );
      if (ins.rows.length) return ins.rows[0].code;
      const owner = await db.query('SELECT kind, job_id FROM short_links WHERE code = $1', [code]);
      if (owner.rows[0]?.kind === kind && owner.rows[0]?.job_id === jobId) return code;
      console.warn('[shortLinks] code collision, lengthening', { kind, len });
    }
    return null;
  } catch (e) {
    console.error('[shortLinks] shortCodeFor', e.message);
    return null;
  }
}

export async function resolveShortCode(code) {
  if (!process.env.DATABASE_URL || !code) return null;
  try {
    const { rows } = await db.query('SELECT kind, job_id FROM short_links WHERE code = $1', [code]);
    return rows[0] || null;
  } catch (e) {
    console.error('[shortLinks] resolveShortCode', e.message);
    return null;
  }
}

// URL builders. `longFallback` is the existing signed URL — used verbatim when the short
// link can't be minted, so a text never goes out without a way to pay.
export async function shortUrl(base, prefix, kind, jobId, longFallback) {
  if (!base) return longFallback;
  const code = await shortCodeFor(kind, jobId);
  return code ? `${base}/${prefix}/${code}` : longFallback;
}
