import { API_BASE } from './backendUrl';
import { authHeaders, setToken } from './apiClient';

// Durable outbox for writes.
//
// Every mutation in this app used to be `fetch(...).catch(() => {})`: the HTTP status was
// never read, so a 403, a 500, or no signal at all looked exactly like success. The
// technician saw a green "Up to Date", and the next poll silently reverted their work.
// Locksmiths work in basements and parking garages, so "no signal" is the normal case.
//
// Writes go through here instead. A failure that might succeed later is persisted and
// retried; a failure that never will (403, 404, 422) is surfaced once and dropped.

const STORAGE_KEY = 'techai-write-queue-v1';
const MAX_ATTEMPTS = 8;
const MAX_QUEUE = 200;

export interface QueuedWrite {
  id: string;
  url: string;              // path only, e.g. /api/jobs/123
  method: 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Collapse key: a newer write for the same key replaces an older queued one. */
  dedupe?: string;
  label: string;            // human wording for the failure notice ("job #1042")
  attempts: number;
  queuedAt: number;
}

type Listener = (state: { pending: number; lastError: string | null }) => void;

let queue: QueuedWrite[] = load();
let lastError: string | null = null;
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function load(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); }
  catch { /* storage full or unavailable — the in-memory queue still works this session */ }
}

function emit() {
  const state = { pending: queue.length, lastError };
  listeners.forEach(l => l(state));
}

export function subscribeToWrites(l: Listener): () => void {
  listeners.add(l);
  l({ pending: queue.length, lastError });
  return () => { listeners.delete(l); };
}

export const pendingWriteCount = () => queue.length;
export function clearWriteError() { lastError = null; emit(); }

/** Called when the server rejects our token — the session is over, not retryable. */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) { onSessionExpired = fn; }

/** Drop everything queued (logout, or the user chose to discard). */
export function resetWriteQueue() {
  queue = [];
  lastError = null;
  persist();
  emit();
}

/**
 * Send a write, retrying it later if the failure looks transient.
 * Returns true when the server accepted it on this attempt.
 */
export async function sendWrite(w: Omit<QueuedWrite, 'attempts' | 'queuedAt' | 'id'>): Promise<boolean> {
  const item: QueuedWrite = { ...w, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, attempts: 0, queuedAt: Date.now() };
  const outcome = await attempt(item);
  if (outcome === 'ok') return true;
  if (outcome === 'retry') enqueue(item); // enqueue emits
  else emit();                            // dropped: nothing queued, but the UI must hear the failure
  return false;
}

function enqueue(item: QueuedWrite) {
  if (item.dedupe) queue = queue.filter(q => q.dedupe !== item.dedupe); // newest wins
  queue.push(item);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persist();
  emit();
  schedule();
}

type Outcome = 'ok' | 'retry' | 'drop';

async function attempt(item: QueuedWrite): Promise<Outcome> {
  try {
    const res = await fetch(`${API_BASE}${item.url}`, {
      method: item.method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      ...(item.body !== undefined ? { body: JSON.stringify(item.body) } : {}),
    });
    if (res.ok) return 'ok';

    if (res.status === 401) {
      // The token is gone or expired. Nothing queued can succeed until they sign in
      // again, and retrying just spams the server.
      lastError = 'Your session expired — sign in again to save your changes.';
      setToken(null);
      onSessionExpired?.();
      return 'retry'; // keep the work; it flushes after the next successful login
    }
    if (res.status === 403) {
      lastError = `Not saved — you don’t have permission to change ${item.label}.`;
      return 'drop';
    }
    if (res.status === 404) {
      lastError = `Not saved — ${item.label} no longer exists on the server.`;
      return 'drop';
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      const detail = await res.json().catch(() => null);
      lastError = `Not saved — the server rejected ${item.label}${detail?.error ? `: ${detail.error}` : ''}.`;
      return 'drop';
    }
    // 5xx / 408 / 429 — the server's problem or a rate limit. Worth another go.
    return 'retry';
  } catch {
    return 'retry'; // offline
  }
}

/** Retry everything queued. Safe to call often; it self-serialises. */
export async function flushWrites(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { schedule(); return; }
  flushing = true;
  try {
    // Snapshot: writes added while flushing are picked up on the next pass.
    for (const item of [...queue]) {
      item.attempts += 1;
      const outcome = await attempt(item);
      if (outcome === 'ok') {
        queue = queue.filter(q => q.id !== item.id);
        if (queue.length === 0) lastError = null;
      } else if (outcome === 'drop' || item.attempts >= MAX_ATTEMPTS) {
        if (item.attempts >= MAX_ATTEMPTS && outcome !== 'drop') {
          lastError = `Could not save ${item.label} after several attempts — it may be out of date.`;
        }
        queue = queue.filter(q => q.id !== item.id);
      } else {
        break; // still failing; back off and try the rest later
      }
    }
  } finally {
    flushing = false;
    persist();
    emit();
    if (queue.length > 0) schedule();
  }
}

function schedule() {
  if (timer) return;
  // Back off with the size of the backlog so a long outage doesn't hammer the server.
  const oldest = queue[0];
  const delay = Math.min(60_000, 3_000 * Math.max(1, oldest?.attempts || 1));
  timer = setTimeout(() => { timer = null; void flushWrites(); }, delay);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushWrites(); });
  // A tech reopens the app after a job in a basement — push whatever piled up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushWrites();
  });
  if (queue.length > 0) schedule();
}
