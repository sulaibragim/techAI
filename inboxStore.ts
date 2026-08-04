// Shared OpenPhone inbox state: messages, calls and per-thread read markers.
// Lifted out of MessagesList so the nav badges can show unread counts without the
// Messages tab ever having been opened. One poller for the whole app.
import { useMemo } from 'react';
import { create } from 'zustand';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { normalizePhone } from './clientUtils';

export interface InboxMedia { url: string; type?: string }
export interface RawMessage {
  id: string; from: string; to: string; body: string; media?: InboxMedia[];
  direction: 'incoming' | 'outgoing'; createdAt: string; contact?: { name?: string };
}
export interface RawCall {
  id: string; from: string; to: string; direction?: string; status?: string;
  duration?: number; createdAt: string; contact?: { name?: string };
}

// Which message in each thread the user has actually SEEN (per device).
const READ_KEY = 'techai-inbox-read-v1';
const loadReadMap = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch { return {}; }
};

interface InboxState {
  messages: RawMessage[] | null;
  calls: RawCall[] | null;
  loading: boolean;
  online: boolean;
  readMap: Record<string, number>;
  fetchAll: (silent?: boolean) => Promise<void>;
  markRead: (key: string, ts: number) => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  messages: null,
  calls: null,
  loading: true,
  online: false,
  readMap: loadReadMap(),

  fetchAll: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const [mRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/api/openphone/messages`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE}/api/openphone/calls`, { headers: { ...authHeaders() } }),
      ]);
      if (!mRes.ok) throw new Error(`${mRes.status}`);
      const m = await mRes.json();
      // Calls are best-effort — a failure there shouldn't blank the whole inbox.
      let calls: RawCall[] = [];
      if (cRes.ok) { const c = await cRes.json(); calls = c.data || []; }
      set({ messages: m.data || [], calls, online: true });
    } catch {
      set({ messages: null, calls: null, online: false });
    } finally {
      if (!silent) set({ loading: false });
    }
  },

  markRead: (key, ts) => {
    const prev = get().readMap;
    if ((prev[key] || 0) >= ts) return;
    const next = { ...prev, [key]: ts };
    try { localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* quota */ }
    set({ readMap: next });
  },
}));

// One app-wide poller (owner/manager only — techs get a 403 from these endpoints).
// Idempotent: MessagesList and App can both call it safely.
let pollId: ReturnType<typeof setInterval> | null = null;
export function startInboxPolling() {
  if (pollId != null) return;
  useInboxStore.getState().fetchAll();
  pollId = setInterval(() => {
    if (document.visibilityState === 'visible') useInboxStore.getState().fetchAll(true);
  }, 15000);
}
export function stopInboxPolling() {
  if (pollId != null) { clearInterval(pollId); pollId = null; }
}

// Threads whose LATEST item is an incoming text / incoming or missed call the user
// hasn't opened yet — the same rule as the green dot in the thread list.
export function computeUnreadKeys(
  messages: RawMessage[] | null, calls: RawCall[] | null, readMap: Record<string, number>
): Set<string> {
  const latest = new Map<string, { ts: number; needsEyes: boolean }>();
  const consider = (rawOther: string, iso: string, needsEyes: boolean) => {
    const key = normalizePhone(rawOther);
    if (!key) return;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return;
    const cur = latest.get(key);
    if (!cur || ts > cur.ts) latest.set(key, { ts, needsEyes });
  };
  for (const m of messages || []) {
    const incoming = m.direction === 'incoming';
    consider(incoming ? m.from : m.to, m.createdAt, incoming);
  }
  for (const c of calls || []) {
    const incoming = c.direction === 'inbound' || c.direction === 'incoming';
    const missed = c.status === 'missed' || c.status === 'no-answer';
    consider(incoming ? c.from : c.to, c.createdAt, incoming || missed);
  }
  const unread = new Set<string>();
  for (const [key, v] of latest) {
    if (v.needsEyes && v.ts > (readMap[key] || 0)) unread.add(key);
  }
  return unread;
}

export const useInboxUnreadCount = (): number => {
  const messages = useInboxStore(s => s.messages);
  const calls = useInboxStore(s => s.calls);
  const readMap = useInboxStore(s => s.readMap);
  return useMemo(() => computeUnreadKeys(messages, calls, readMap).size, [messages, calls, readMap]);
};
