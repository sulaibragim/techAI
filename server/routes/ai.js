import { Router } from 'express';
// ipKeyGenerator groups an IPv6 address by its /56 subnet. Without it a single IPv6 client
// gets a fresh limiter bucket per address and can walk straight past the cap — express-rate-limit
// treats a bare req.ip fallback as a hard error, which is why the dev server refused to boot.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../middleware/auth.js';

export const aiRouter = Router();

// Per-USER limit (not per-IP) so a single account can't run up the Gemini bill. Runs
// after requireAuth, so req.user is set; falls back to IP for safety.
const aiUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { error: 'AI rate limit reached, slow down' },
});
const voiceUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { error: 'Voice session rate limit reached, slow down' },
});

// Models the text proxy is allowed to call — guards our key against arbitrary use.
const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
// Native-audio model the voice (Live API) sessions run on. Google retires these
// dated preview snapshots periodically (the -09-2025 one was removed 2026-03-19),
// so keep it overridable via env — next swap is a Railway change, not a code edit.
const VOICE_MODEL = process.env.VOICE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

// Hard ceilings on what one request — and one account per day — may cost. Without
// these, /generate was an open general-purpose Gemini: it forwards a client-supplied
// systemInstruction, contents AND tools with no output cap, at 30 req/min/user against
// a 5 MB body limit. Any technician's token (or a stolen 30-day one) could run up a
// real bill, and nothing anywhere would notice.
const MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS || 2048);
const MAX_REQUEST_BYTES = Number(process.env.AI_MAX_REQUEST_BYTES || 256 * 1024);
const DAILY_TOKEN_BUDGET = Number(process.env.AI_DAILY_TOKEN_BUDGET || 400_000);

// Per-user token spend for the current UTC day. In memory on purpose: a restart
// forgiving the budget is an acceptable trade for not putting a write on every AI call.
const spend = new Map(); // userId -> { day: string, tokens: number }
const today = () => new Date().toISOString().slice(0, 10);

function budgetRemaining(userId) {
  const e = spend.get(userId);
  if (!e || e.day !== today()) return DAILY_TOKEN_BUDGET;
  return Math.max(0, DAILY_TOKEN_BUDGET - e.tokens);
}
function recordSpend(userId, tokens) {
  const e = spend.get(userId);
  if (!e || e.day !== today()) spend.set(userId, { day: today(), tokens });
  else e.tokens += tokens;
}

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
aiRouter.post('/generate', requireAuth, aiUserLimiter, async (req, res) => {
  const ai = getAI();
  if (!ai) return res.status(503).json({ error: 'AI not configured on server' });

  const { model, contents, systemInstruction, tools } = req.body || {};
  if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: 'Unsupported model' });
  if (!Array.isArray(contents)) return res.status(400).json({ error: 'Invalid contents' });

  // The global JSON limit is 5 MB — far more than a chat turn needs, and roughly a
  // million tokens of input if someone points it at this endpoint deliberately.
  const size = Buffer.byteLength(JSON.stringify({ contents, systemInstruction, tools }) || '');
  if (size > MAX_REQUEST_BYTES) {
    return res.status(413).json({ error: 'AI request too large. Clear the chat and try again.' });
  }
  if (budgetRemaining(req.user.id) <= 0) {
    return res.status(429).json({ error: "You've hit today's AI usage limit. It resets tomorrow." });
  }

  try {
    const resp = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools, maxOutputTokens: MAX_OUTPUT_TOKENS },
    });
    // Charge actual usage when the API reports it; fall back to a rough estimate so a
    // missing usage block can't make the budget unenforceable.
    const used = resp.usageMetadata?.totalTokenCount ?? Math.ceil(size / 4) + MAX_OUTPUT_TOKENS;
    recordSpend(req.user.id, used);
    res.json({ text: resp.text ?? '', functionCalls: resp.functionCalls ?? null });
  } catch (err) {
    console.error('[AI] generate error:', err?.message);
    res.status(502).json({ error: 'AI request failed', detail: err?.message });
  }
});

// Mints a short-lived ephemeral token so the browser can open a Live (voice) session
// WITHOUT ever seeing the real API key.
aiRouter.post('/live-token', requireAuth, voiceUserLimiter, async (_req, res) => {
  const ai = getLiveAI();
  if (!ai) return res.status(503).json({ error: 'AI not configured on server' });

  try {
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1, // single new session
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),       // session may live up to 30 min
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // must start within 2 min
        // Pin the token to OUR voice model. Unconstrained, a token lifted from the
        // browser opened any Live session on the company key for its whole lifetime —
        // single-use and short-lived, but not limited to what we intended it for.
        liveConnectConstraints: {
          model: VOICE_MODEL,
          config: { responseModalities: ['AUDIO'] },
        },
      },
    });
    res.json({ token: token.name, model: VOICE_MODEL });
  } catch (err) {
    console.error('[AI] live-token error:', err?.message);
    res.status(502).json({ error: 'Failed to create voice token', detail: err?.message });
  }
});
