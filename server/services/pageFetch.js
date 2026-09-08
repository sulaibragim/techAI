// Fetching a web page on the user's behalf makes this module a request-forwarder, so it
// is written defensively: http(s) only, public addresses only (every redirect hop
// re-checked), a hard size and time cap, and text/html or nothing. The pure halves —
// address classification and HTML-to-text — are exported for tests.

import { lookup } from 'node:dns/promises';

const SCAN_TIMEOUT_MS = 12_000;
const SCAN_MAX_BYTES = 2 * 1024 * 1024;
const SCAN_MAX_CHARS = 24_000;
const SCAN_MAX_REDIRECTS = 3;

// Anything that is not a public unicast address is off limits: this is the classic
// SSRF pivot into Railway's own network, the metadata service and localhost.
export function isPrivateAddress(ip, family) {
  if (family === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;          // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a >= 224) return true;                         // multicast / reserved
  return false;
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a valid link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) links can be read.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Only standard web ports are allowed.');
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Error("That site could not be found.");
  for (const a of addrs) {
    if (isPrivateAddress(a.address, a.family)) throw new Error('That address is not reachable.');
  }
  return url;
}

// Follow redirects by hand so every hop gets the address check — an open redirect to
// 169.254.169.254 would otherwise walk straight past the first one.
export async function fetchPage(rawUrl) {
  let target = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= SCAN_MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'TrustKeyCRM/1.0 (price import)', accept: 'text/html,text/plain' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      target = await assertPublicUrl(new URL(resp.headers.get('location'), target).toString());
      continue;
    }
    if (!resp.ok) throw new Error(`The page answered ${resp.status}.`);
    const type = (resp.headers.get('content-type') || '').toLowerCase();
    if (type && !type.includes('text/html') && !type.includes('text/plain')) {
      throw new Error('That link is not a web page.');
    }
    return await readCapped(resp);
  }
  throw new Error('Too many redirects.');
}

// Read at most SCAN_MAX_BYTES — a stream that never ends must not become our memory.
async function readCapped(resp) {
  const reader = resp.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
      if (size >= SCAN_MAX_BYTES) break;
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}

// HTML → the text a human would see. Prices live in the copy, and stripping the markup
// keeps the model's input (and our token bill) an order of magnitude smaller.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#36;/g, '$')
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(apos|#39);/gi, "'")
    .replace(/&(lt|gt);/gi, ' ')
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, SCAN_MAX_CHARS);
}
