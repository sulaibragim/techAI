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

app.use('/openphone', openphoneRouter);
app.use('/api/openphone', openphoneRouter);

app.listen(PORT, () => {
  console.log(`TrustKey backend running on port ${PORT}`);
});
