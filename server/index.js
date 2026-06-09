import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openphoneRouter } from './routes/openphone.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

app.use(cors({
  origin: '*',
}));

app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/debug-key', (_req, res) => {
  const key = process.env.OPENPHONE_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const viteKey = process.env.VITE_API_KEY;
  res.json({
    openphone: { prefix: key?.slice(0, 8), len: key?.length },
    gemini: { prefix: gemini?.slice(0, 8), len: gemini?.length },
    viteApiKey: { prefix: viteKey?.slice(0, 8), len: viteKey?.length },
  });
});

app.get('/debug-openphone', async (_req, res) => {
  const key = process.env.OPENPHONE_API_KEY;
  const r = await fetch('https://api.openphone.com/v1/phone-numbers', {
    headers: { Authorization: key },
  });
  const data = await r.json();
  res.json({ key: key?.slice(0, 8), status: r.status, data });
});

app.get('/debug-gemini', async (_req, res) => {
  try {
    const { processTranscriptWithAI } = await import('./services/gemini.js');
    const result = await processTranscriptWithAI('Customer: Hi my name is Test, I need a locksmith at 123 Main St', '+15551234567');
    res.json({ status: 'ok', result });
  } catch (err) {
    res.json({ status: 'error', message: err.message, stack: err.stack?.slice(0, 500) });
  }
});

app.use('/openphone', openphoneRouter);
app.use('/api/openphone', openphoneRouter);

app.listen(PORT, () => {
  console.log(`TrustKey backend running on port ${PORT}`);
});
