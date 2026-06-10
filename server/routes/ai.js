import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../middleware/auth.js';

export const aiRouter = Router();

// Models the text proxy is allowed to call — guards our key against arbitrary use.
const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
// Native-audio model the voice (Live API) sessions run on.
const VOICE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

function serverKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || '';
}

// Lazily build clients at request time (env is loaded by the time a request arrives,
// avoiding the import-order trap where dotenv runs after module imports).
let _ai = null;
let _aiKey = null;
function getAI() {
  const key = serverKey();
  if (!key) return null;
  if (!_ai || _aiKey !== key) {
    _ai = new GoogleGenAI({ apiKey: key });
    _aiKey = key;
  }
  return _ai;
}

// Ephemeral auth tokens live only on the v1alpha API surface — the default (v1beta)
// client 404s on authTokens.create. Keep a separate client so the chat path stays on the
// proven default version.
let _liveAi = null;
let _liveAiKey = null;
function getLiveAI() {
  const key = serverKey();
  if (!key) return null;
  if (!_liveAi || _liveAiKey !== key) {
    _liveAi = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });
    _liveAiKey = key;
  }
  return _liveAi;
}

// Whether AI is configured on the server — drives the client-side gate (mic vs locked key).
aiRouter.get('/status', requireAuth, (_req, res) => {
  res.json({ enabled: !!serverKey() });
});

// Text-chat relay. The client builds the full request (contents + systemInstruction + tools);
// the server only injects the key and forwards. Tool execution stays on the client.
aiRouter.post('/generate', requireAuth, async (req, res) => {
  const ai = getAI();
  if (!ai) return res.status(503).json({ error: 'AI not configured on server' });

  const { model, contents, systemInstruction, tools } = req.body || {};
  if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: 'Unsupported model' });
  if (!Array.isArray(contents)) return res.status(400).json({ error: 'Invalid contents' });

  try {
    const resp = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools },
    });
    res.json({ text: resp.text ?? '', functionCalls: resp.functionCalls ?? null });
  } catch (err) {
    console.error('[AI] generate error:', err?.message);
    res.status(502).json({ error: 'AI request failed' });
  }
});

// Mints a short-lived ephemeral token so the browser can open a Live (voice) session
// WITHOUT ever seeing the real API key.
aiRouter.post('/live-token', requireAuth, async (_req, res) => {
  const ai = getLiveAI();
  if (!ai) return res.status(503).json({ error: 'AI not configured on server' });

  try {
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1, // single new session
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),       // session may live up to 30 min
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // must start within 2 min
      },
    });
    res.json({ token: token.name, model: VOICE_MODEL });
  } catch (err) {
    console.error('[AI] live-token error:', err?.message);
    res.status(502).json({ error: 'Failed to create voice token' });
  }
});
