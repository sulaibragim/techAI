import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const BASE = 'https://api.openphone.com/v1';
const headers = () => ({ Authorization: process.env.OPENPHONE_API_KEY });

export async function getPhoneNumbers() {
  const res = await fetch(`${BASE}/phone-numbers`, { headers: headers() });
  return res.json();
}

export async function getCallTranscript(callId) {
  const res = await fetch(`${BASE}/calls/${callId}/transcript`, { headers: headers() });
  return res.json();
}
