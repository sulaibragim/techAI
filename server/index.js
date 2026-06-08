import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openphoneRouter } from './routes/openphone.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
}));

app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/debug-key', (_req, res) => {
  const key = process.env.OPENPHONE_API_KEY;
  res.json({ keyPrefix: key?.slice(0, 8), keyLength: key?.length });
});

app.get('/debug-openphone', async (_req, res) => {
  const key = process.env.OPENPHONE_API_KEY;
  const r = await fetch('https://api.openphone.com/v1/phone-numbers', {
    headers: { Authorization: key },
  });
  const data = await r.json();
  res.json({ key: key?.slice(0, 8), status: r.status, data });
});

app.use('/openphone', openphoneRouter);

app.listen(PORT, () => {
  console.log(`TrustKey backend running on port ${PORT}`);
});
