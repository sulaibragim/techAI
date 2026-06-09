import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openphoneRouter } from './routes/openphone.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { initDB } from './db.js';

import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

app.use(cors({
  origin: '*',
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.raw({ type: 'application/json' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/openphone', openphoneRouter);
app.use('/api/openphone', openphoneRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      console.log('[DB] Connected to PostgreSQL');
    } catch (err) {
      console.error('[DB] Failed to connect:', err.message);
      console.log('[DB] Running without database — data will be in-memory only');
    }
  } else {
    console.log('[DB] No DATABASE_URL — running without database');
  }

  app.listen(PORT, () => {
    console.log(`TrustKey backend running on port ${PORT}`);
  });
}

start();
