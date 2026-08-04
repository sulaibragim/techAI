import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import {
  MessageSquare, User, Smartphone, RefreshCw, Send, Radio, ArrowLeft,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, CreditCard, Briefcase, ExternalLink, History, Search,
} from 'lucide-react';
import { Job } from '../types';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import {
  buildClients, findClientByPhone, normalizePhone, formatPhone,
  clientFlags, clientScore, TIER_STYLE, ClientRecord,
} from '../clientUtils';

const PHONE_NUMBER_ID = 'PNkhFHiD2G';

interface RawMessage {
  id: string; from: string; to: string; body: string;
  direction: 'incoming' | 'outgoing'; createdAt: string; contact?: { name?: string };
}
interface RawCall {
  id: string; from: string; to: string; direction?: string; status?: string;
  duration?: number; createdAt: string; contact?: { name?: string };
}

type ThreadItem =
  | { kind: 'sms'; id: string; ts: number; direction: 'in' | 'out'; body: string }
  | { kind: 'call'; id: string; ts: number; direction: 'in' | 'out' | 'missed'; duration?: number };

interface Thread {
  key: string;              // normalized phone — the identity
  phone: string;            // best raw number to display / message
  contactName?: string;     // name OpenPhone had, if any
  client?: ClientRecord;    // matched CRM client, if any
  items: ThreadItem[];      // oldest → newest
  latest: ThreadItem;
}

interface MessagesListProps {
  onJobSelect?: (job: Job) => void;
  onClientSelect?: (clientId: string) => void;
  onCreateJobFromContact?: (phone: string, name?: string) => void;
}

const STRIPE_LINK = /(https?:\/\/\S*(?:checkout\.stripe\.com|\/pay\/cs_)\S*)/i;
const ANY_URL = /(https?:\/\/\S+)/i;

const fmtTime = (iso: number) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Which message in each thread the user has actually SEEN (per device). Without this the
// green dot just meant "latest is incoming" and never went away.
const READ_KEY = 'techai-inbox-read-v1';
const loadReadMap = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch { return {}; }
};
const fmtDur = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export const MessagesList: React.FC<MessagesListProps> = ({ onClientSelect, onCreateJobFromContact }) => {
  const jobs = useVisibleJobs();
  const clientProfiles = useSettingsStore(s => s.clientProfiles);
  const clients = useMemo(() => buildClients(jobs, clientProfiles), [jobs, clientProfiles]);

  const [messages, setMessages] = useState<RawMessage[] | null>(null);
  const [calls, setCalls] = useState<RawCall[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [readMap, setReadMap] = useState<Record<string, number>>(loadReadMap);

  const markRead = useCallback((key: string, ts: number) => {
    setReadMap(prev => {
      if ((prev[key] || 0) >= ts) return prev;
      const next = { ...prev, [key]: ts };
      try { localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/api/openphone/messages?phoneNumberId=${PHONE_NUMBER_ID}`, { headers: { ...authHeaders() } }),
        fetch(`${API_BASE}/api/openphone/calls?phoneNumberId=${PHONE_NUMBER_ID}`, { headers: { ...authHeaders() } }),
      ]);
      if (!mRes.ok) throw new Error(`${mRes.status}`);
      const m = await mRes.json();
      setMessages(m.data || []);
      // Calls are best-effort — a failure there shouldn't blank the whole inbox.
      if (cRes.ok) { const c = await cRes.json(); setCalls(c.data || []); } else { setCalls([]); }
      setOnline(true);
    } catch {
      setMessages(null); setCalls(null); setOnline(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchAll(true); }, 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Force a full pull of history from OpenPhone (past the server-side throttle), then reload.
  const syncHistory = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/api/openphone/sync`, { method: 'POST', headers: { ...authHeaders() } });
    } catch { /* ignore — the fetch below still shows whatever synced */ }
    await fetchAll(true);
    setSyncing(false);
  }, [fetchAll]);

  // Group every SMS and call into one thread per client, keyed by the OTHER party's
  // normalized number so "(602) 373-2379", "+16023732379" and "602-373-2379" are one chat.
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    const ensure = (rawPhone: string, name?: string): Thread | null => {
      const key = normalizePhone(rawPhone);
      if (!key) return null;
      let t = map.get(key);
      if (!t) {
        t = { key, phone: rawPhone, contactName: name, items: [], latest: undefined as any };
        map.set(key, t);
      }
      if (!t.contactName && name) t.contactName = name;
      return t;
    };

    for (const m of messages || []) {
      const incoming = m.direction === 'incoming';
      const other = incoming ? m.from : m.to;
      const t = ensure(other, m.contact?.name);
      if (!t) continue;
      t.items.push({ kind: 'sms', id: m.id, ts: new Date(m.createdAt).getTime(), direction: incoming ? 'in' : 'out', body: m.body || '' });
    }
    for (const c of calls || []) {
      const incoming = c.direction === 'inbound' || c.direction === 'incoming';
      const missed = c.status === 'missed' || c.status === 'no-answer';
      const other = incoming ? c.from : c.to;
      const t = ensure(other, c.contact?.name);
      if (!t) continue;
      t.items.push({ kind: 'call', id: c.id, ts: new Date(c.createdAt).getTime(), direction: missed ? 'missed' : incoming ? 'in' : 'out', duration: c.duration });
    }

    const out: Thread[] = [];
    for (const t of map.values()) {
      if (!t.items.length) continue;
      t.items.sort((a, b) => a.ts - b.ts);
      t.latest = t.items[t.items.length - 1];
      t.client = findClientByPhone(clients, t.phone);
      out.push(t);
    }
    return out.sort((a, b) => b.latest.ts - a.latest.ts);
  }, [messages, calls, clients]);

  const open = openKey ? threads.find(t => t.key === openKey) || null : null;

  // Looking at a thread = having read it, including messages arriving while it's open.
  useEffect(() => {
    if (open) markRead(open.key, open.latest.ts);
  }, [open?.key, open?.latest.ts, markRead]);

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    const qDigits = q.replace(/\D/g, '');
    return threads.filter(t => {
      const names = [t.client ? `${t.client.firstName} ${t.client.lastName}` : '', t.contactName || ''].join(' ').toLowerCase();
      return names.includes(q) || (qDigits.length > 0 && t.key.includes(qDigits));
    });
  }, [threads, query]);

  const sendReply = async (to: string) => {
    if (sending || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/openphone/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ to, content: replyText.trim(), phoneNumberId: PHONE_NUMBER_ID }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const reason = err?.error || '';
        if (res.status === 402 || /credit/i.test(reason)) {
          throw new Error('OpenPhone is out of prepaid SMS credits — top up in OpenPhone → Settings → Billing, then resend.');
        }
        throw new Error(reason || 'The message was not delivered. Check the number or try again.');
      }
      setReplyText('');
      await fetchAll(true);
    } catch (e) {
      alert(`Send failed — ${e instanceof Error ? e.message : 'the message was not delivered.'}`);
    } finally {
      setSending(false);
    }
  };

  const titleFor = (t: Thread) =>
    t.client ? `${t.client.firstName} ${t.client.lastName}`.trim() || formatPhone(t.phone)
    : t.contactName && t.contactName !== t.phone ? t.contactName
    : formatPhone(t.phone);

  const snippet = (it: ThreadItem) => {
    if (it.kind === 'call') return it.direction === 'missed' ? 'Missed call' : it.direction === 'in' ? 'Incoming call' : 'Outgoing call';
    if (STRIPE_LINK.test(it.body)) return `${it.direction === 'out' ? 'You: ' : ''}💳 Payment link`;
    return `${it.direction === 'out' ? 'You: ' : ''}${it.body}`;
  };

  return (
    // Bounded to the viewport so the LIST and the CHAT scroll inside themselves — the whole
    // page no longer runs to the bottom when you scroll a long conversation.
    <div className="flex flex-col h-[calc(100dvh-12rem)] md:h-[calc(100dvh-9rem)] max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2 shrink-0 mb-4">
        <div className="flex items-center gap-3">
          {open && (
            <button onClick={() => setOpenKey(null)} className="p-2 bg-slate-900 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all active:scale-95 md:hidden">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Client Inbox</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">One chat per client · calls, texts & invoices</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {online && (
            <div className="flex items-center space-x-2 text-green-400 bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/20">
              <Radio size={12} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">OpenPhone Live</span>
            </div>
          )}
          <button
            onClick={syncHistory}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
            title="Pull the full message & call history from OpenPhone"
          >
            <History size={14} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync history'}</span>
          </button>
          <button onClick={() => fetchAll()} disabled={loading} className="p-2.5 bg-slate-900 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-40" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,340px)_1fr] gap-4 px-2 flex-1 min-h-0">
        {/* ── Thread list ── */}
        <div className={`flex-col min-h-0 ${open ? 'hidden md:flex' : 'flex'}`}>
          <div className="relative mb-2 shrink-0">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or number…"
              className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-2 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 animate-pulse h-16" />)
          ) : !threads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-12 flex flex-col items-center justify-center opacity-40 text-center">
              <Smartphone size={26} className="mb-3 text-blue-500" />
              <p className="text-sm font-bold tracking-tight">{online ? 'No conversations yet' : 'Can’t reach the server'}</p>
              <p className="text-xs font-semibold text-slate-400 mt-1.5">{online ? 'Client texts & calls will appear here' : 'The inbox is unavailable right now'}</p>
            </div>
          ) : !visibleThreads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-10 text-center opacity-40">
              <p className="text-sm font-bold">Nothing matches “{query.trim()}”</p>
            </div>
          ) : (
            visibleThreads.map(t => {
              const flags = t.client ? clientFlags(t.client) : null;
              const tone = flags?.tone === 'danger' ? 'border-red-500/40' : flags?.tone === 'vip' ? 'border-amber-500/40' : 'border-white/10';
              const active = openKey === t.key;
              const unread = (t.latest.direction === 'in' || t.latest.direction === 'missed') && t.latest.ts > (readMap[t.key] || 0);
              return (
                <button
                  key={t.key}
                  onClick={() => setOpenKey(t.key)}
                  className={`w-full text-left bg-slate-900 p-3.5 rounded-2xl border ${active ? 'border-blue-500/60 bg-blue-600/10' : tone} hover:border-blue-500/40 transition-all flex items-center gap-3 shadow-lg`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${t.client ? 'bg-blue-600/10 border-blue-500/30 text-blue-300 font-bold' : 'bg-slate-950 border-white/10 text-slate-400'}`}>
                    {t.client ? `${t.client.firstName[0] || ''}${t.client.lastName[0] || ''}`.toUpperCase() || <User size={18} /> : <User size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white truncate">{titleFor(t)}</p>
                      {unread && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />}
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-slate-200 font-semibold' : 'text-slate-400 italic'}`}>{snippet(t.latest)}</p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">{fmtTime(t.latest.ts)}</span>
                </button>
              );
            })
          )}
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className={`min-h-0 ${open ? 'flex' : 'hidden md:flex'}`}>
          {!open ? (
            <div className="w-full h-full bg-slate-900/40 rounded-2xl border border-white/10 border-dashed flex flex-col items-center justify-center p-16 opacity-40 text-center">
              <MessageSquare size={28} className="mb-3 text-blue-500" />
              <p className="text-sm font-bold">Pick a conversation</p>
              <p className="text-xs text-slate-400 mt-1.5">Everything with that client — one thread</p>
            </div>
          ) : (
            <ChatPanel
              thread={open}
              title={titleFor(open)}
              sending={sending}
              replyText={replyText}
              setReplyText={setReplyText}
              onSend={() => sendReply(open.phone)}
              onCall={() => { window.location.href = `tel:${open.phone}`; }}
              onProfile={open.client && onClientSelect ? () => onClientSelect(open.client!.id) : undefined}
              onNewJob={onCreateJobFromContact ? () => onCreateJobFromContact(open.phone, titleFor(open)) : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const ChatPanel: React.FC<{
  thread: Thread; title: string; sending: boolean;
  replyText: string; setReplyText: (v: string) => void;
  onSend: () => void; onCall: () => void;
  onProfile?: () => void; onNewJob?: () => void;
}> = ({ thread, title, sending, replyText, setReplyText, onSend, onCall, onProfile, onNewJob }) => {
  const flags = thread.client ? clientFlags(thread.client) : null;
  const score = thread.client ? clientScore(thread.client) : null;

  // Open at the NEWEST message (bottom), like any messenger. Stay pinned to the bottom as
  // messages arrive — but only if the user hasn't scrolled up to read history.
  const timelineRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const scrollToBottom = () => {
    const el = timelineRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  useLayoutEffect(() => { pinnedRef.current = true; scrollToBottom(); }, [thread.key]);
  useLayoutEffect(() => { if (pinnedRef.current) scrollToBottom(); }, [thread.items.length]);

  return (
    <div className="w-full h-full bg-slate-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${thread.client ? 'bg-blue-600/10 border-blue-500/30 text-blue-300 font-bold' : 'bg-slate-950 border-white/10 text-slate-400'}`}>
          {thread.client ? `${thread.client.firstName[0] || ''}${thread.client.lastName[0] || ''}`.toUpperCase() || <User size={18} /> : <User size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-bold text-white truncate">{title}</p>
            {score && <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${TIER_STYLE[score.tier]}`}>{score.tier}</span>}
          </div>
          <p className="text-xs text-slate-500 tracking-widest">{formatPhone(thread.phone)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onCall} title="Call" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-green-400 transition-all active:scale-95"><Phone size={15} /></button>
          {onProfile && <button onClick={onProfile} title="Client profile" className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-blue-400 transition-all active:scale-95"><User size={15} /></button>}
          {onNewJob && <button onClick={onNewJob} title="New job for this client" className="p-2.5 bg-blue-600/15 border border-blue-500/30 rounded-xl text-blue-300 hover:bg-blue-600 hover:text-white transition-all active:scale-95"><Briefcase size={15} /></button>}
        </div>
      </div>

      {flags?.doNotService && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-[11px] font-bold text-red-300">⚠ Flagged: do not service</div>
      )}

      {/* Timeline */}
      <div
        ref={timelineRef}
        onScroll={e => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        }}
        className="p-4 space-y-2.5 flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col"
      >
        {thread.items.map(it => {
          if (it.kind === 'call') {
            const Icon = it.direction === 'missed' ? PhoneMissed : it.direction === 'in' ? PhoneIncoming : PhoneOutgoing;
            const label = it.direction === 'missed' ? 'Missed call' : it.direction === 'in' ? 'Incoming call' : 'Outgoing call';
            return (
              <div key={it.id} className="self-center flex items-center gap-2 text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                <Icon size={12} className={it.direction === 'missed' ? 'text-red-400' : 'text-slate-400'} />
                {label}{it.duration ? ` · ${fmtDur(it.duration)}` : ''}
                <span className="text-slate-600">· {fmtTime(it.ts)}</span>
              </div>
            );
          }
          const out = it.direction === 'out';
          const invoice = STRIPE_LINK.exec(it.body);
          const url = invoice?.[1] || ANY_URL.exec(it.body)?.[1];
          return (
            <div key={it.id} className={`max-w-[85%] ${out ? 'self-end' : 'self-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${out ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 border border-white/10 rounded-bl-sm'}`}>
                {invoice ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 font-semibold ${out ? 'text-white' : 'text-blue-300'}`}>
                    <CreditCard size={15} /> Payment link <ExternalLink size={12} className="opacity-70" />
                  </a>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{it.body}</span>
                )}
              </div>
              <p className={`text-[10px] text-slate-500 mt-1 ${out ? 'text-right' : 'text-left'}`}>{fmtTime(it.ts)}</p>
            </div>
          );
        })}
      </div>

      {/* Reply */}
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Text the client…"
          className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button onClick={onSend} disabled={sending || !replyText.trim()} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5">
          <Send size={14} />{sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
