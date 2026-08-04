import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import {
  MessageSquare, MessageSquarePlus, User, Smartphone, RefreshCw, Send, Radio, ArrowLeft,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, CreditCard, Briefcase, ExternalLink,
  History, Search, Sparkles, Zap, X, ChevronDown, Paperclip,
} from 'lucide-react';
import { Job } from '../types';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { useInboxStore, InboxMedia } from '../inboxStore';
import {
  buildClients, findClientByPhone, normalizePhone, formatPhone,
  clientFlags, clientScore, TIER_STYLE, ClientRecord,
} from '../clientUtils';

const PHONE_NUMBER_ID = 'PNkhFHiD2G';

type ThreadItem =
  | { kind: 'sms'; id: string; ts: number; direction: 'in' | 'out'; body: string; media?: InboxMedia[] }
  | { kind: 'call'; id: string; ts: number; direction: 'in' | 'out' | 'missed'; duration?: number };

interface Thread {
  key: string;              // normalized phone — the identity
  phone: string;            // best raw number to display / message
  contactName?: string;     // name OpenPhone had, if any
  client?: ClientRecord;    // matched CRM client, if any
  items: ThreadItem[];      // oldest → newest
  latest?: ThreadItem;      // undefined only for a just-started draft thread
}

interface MessagesListProps {
  onJobSelect?: (job: Job) => void;
  onClientSelect?: (clientId: string) => void;
  onCreateJobFromContact?: (phone: string, name?: string) => void;
}

const STRIPE_LINK = /(https?:\/\/\S*(?:checkout\.stripe\.com|\/pay\/cs_)\S*)/i;
const ANY_URL = /(https?:\/\/\S+)/i;
// A client message with no reply for this long is "needs reply".
const NEEDS_REPLY_MS = 2 * 60 * 60 * 1000;

const fmtTime = (iso: number) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDur = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

type InboxFilter = 'all' | 'unread' | 'needsReply';

export const MessagesList: React.FC<MessagesListProps> = ({ onJobSelect, onClientSelect, onCreateJobFromContact }) => {
  const jobs = useVisibleJobs();
  const clientProfiles = useSettingsStore(s => s.clientProfiles);
  const clients = useMemo(() => buildClients(jobs, clientProfiles), [jobs, clientProfiles]);

  const messages = useInboxStore(s => s.messages);
  const calls = useInboxStore(s => s.calls);
  const loading = useInboxStore(s => s.loading);
  const online = useInboxStore(s => s.online);
  const readMap = useInboxStore(s => s.readMap);
  const fetchAll = useInboxStore(s => s.fetchAll);
  const markRead = useInboxStore(s => s.markRead);

  const [syncing, setSyncing] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  // Threads started from "New message" that have no OpenPhone history yet.
  const [drafts, setDrafts] = useState<Record<string, { phone: string; name?: string }>>({});

  // The app-level poller keeps the store warm; opening the tab just refreshes once.
  useEffect(() => { fetchAll(messages !== null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        t = { key, phone: rawPhone, contactName: name, items: [] };
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
      t.items.push({ kind: 'sms', id: m.id, ts: new Date(m.createdAt).getTime(), direction: incoming ? 'in' : 'out', body: m.body || '', media: m.media });
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
    // Draft threads (started from "New message") float to the top until they get history.
    for (const key of Object.keys(drafts)) {
      if (map.has(key)) continue;
      const d = drafts[key];
      out.push({ key, phone: d.phone, contactName: d.name, items: [], client: findClientByPhone(clients, d.phone) });
    }
    return out.sort((a, b) => (b.latest?.ts ?? Infinity) - (a.latest?.ts ?? Infinity));
  }, [messages, calls, clients, drafts]);

  const open = openKey ? threads.find(t => t.key === openKey) || null : null;

  // Looking at a thread = having read it, including messages arriving while it's open.
  useEffect(() => {
    if (open?.latest) markRead(open.key, open.latest.ts);
  }, [open?.key, open?.latest?.ts, markRead]);

  const isUnread = useCallback((t: Thread) =>
    !!t.latest && (t.latest.direction === 'in' || t.latest.direction === 'missed') && t.latest.ts > (readMap[t.key] || 0),
  [readMap]);
  const needsReply = useCallback((t: Thread) =>
    !!t.latest
    && ((t.latest.kind === 'sms' && t.latest.direction === 'in') || (t.latest.kind === 'call' && t.latest.direction === 'missed'))
    && Date.now() - t.latest.ts > NEEDS_REPLY_MS,
  []);

  const unreadCount = useMemo(() => threads.filter(isUnread).length, [threads, isUnread]);
  const needsReplyCount = useMemo(() => threads.filter(needsReply).length, [threads, needsReply]);

  const visibleThreads = useMemo(() => {
    let list = threads;
    if (filter === 'unread') list = list.filter(isUnread);
    if (filter === 'needsReply') list = list.filter(needsReply);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const qDigits = q.replace(/\D/g, '');
    return list.filter(t => {
      const names = [t.client ? `${t.client.firstName} ${t.client.lastName}` : '', t.contactName || ''].join(' ').toLowerCase();
      return names.includes(q) || (qDigits.length > 0 && t.key.includes(qDigits));
    });
  }, [threads, query, filter, isUnread, needsReply]);

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

  const snippet = (it?: ThreadItem) => {
    if (!it) return 'New conversation — say hi';
    if (it.kind === 'call') return it.direction === 'missed' ? 'Missed call' : it.direction === 'in' ? 'Incoming call' : 'Outgoing call';
    if (STRIPE_LINK.test(it.body)) return `${it.direction === 'out' ? 'You: ' : ''}💳 Payment link`;
    if (!it.body && it.media?.length) return `${it.direction === 'out' ? 'You: ' : ''}📷 Photo`;
    return `${it.direction === 'out' ? 'You: ' : ''}${it.body}`;
  };

  const startChat = (phone: string, name?: string) => {
    const key = normalizePhone(phone);
    if (!key) return;
    if (!threads.some(t => t.key === key)) {
      setDrafts(prev => ({ ...prev, [key]: { phone, name } }));
    }
    setOpenKey(key);
    setComposeOpen(false);
  };

  // Most recent job still in flight for the open thread's client — the header chip.
  const activeJob = useMemo<Job | null>(() => {
    if (!open?.client) return null;
    const live = open.client.jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    if (!live.length) return null;
    return [...live].sort((a, b) => `${b.scheduledDate}T${b.scheduledTime}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime}`))[0];
  }, [open?.client]);

  const FILTER_CHIPS: { id: InboxFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'needsReply', label: 'Needs reply', count: needsReplyCount },
  ];

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
            <div className="hidden sm:flex items-center space-x-2 text-green-400 bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/20">
              <Radio size={12} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">OpenPhone Live</span>
            </div>
          )}
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all active:scale-95 text-xs font-bold uppercase tracking-wider"
            title="Start a new conversation"
          >
            <MessageSquarePlus size={14} />
            <span className="hidden sm:inline">New message</span>
          </button>
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
          <div className="flex gap-1.5 mb-2 shrink-0">
            {FILTER_CHIPS.map(c => (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all active:scale-95 ${
                  filter === c.id ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {c.label}{c.count ? ` · ${c.count}` : ''}
              </button>
            ))}
          </div>
          <div className="space-y-2 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide">
          {loading && !threads.length ? (
            [...Array(4)].map((_, i) => <div key={i} className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 animate-pulse h-16" />)
          ) : !threads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-12 flex flex-col items-center justify-center opacity-40 text-center">
              <Smartphone size={26} className="mb-3 text-blue-500" />
              <p className="text-sm font-bold tracking-tight">{online ? 'No conversations yet' : 'Can’t reach the server'}</p>
              <p className="text-xs font-semibold text-slate-400 mt-1.5">{online ? 'Client texts & calls will appear here' : 'The inbox is unavailable right now'}</p>
            </div>
          ) : !visibleThreads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-10 text-center opacity-40">
              <p className="text-sm font-bold">{query.trim() ? `Nothing matches “${query.trim()}”` : 'Nothing here — all caught up'}</p>
            </div>
          ) : (
            visibleThreads.map(t => {
              const flags = t.client ? clientFlags(t.client) : null;
              const tone = flags?.tone === 'danger' ? 'border-red-500/40' : flags?.tone === 'vip' ? 'border-amber-500/40' : 'border-white/10';
              const active = openKey === t.key;
              const unread = isUnread(t);
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
                      {needsReply(t) && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-orange-300 shrink-0">Needs reply</span>}
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-slate-200 font-semibold' : 'text-slate-400 italic'}`}>{snippet(t.latest)}</p>
                  </div>
                  {t.latest && <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">{fmtTime(t.latest.ts)}</span>}
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
              activeJob={activeJob}
              onOpenJob={activeJob && onJobSelect ? () => onJobSelect(activeJob) : undefined}
            />
          )}
        </div>
      </div>

      {/* ── New message composer ── */}
      {composeOpen && (
        <ComposeModal
          clients={clients}
          onPick={startChat}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
};

// ─── New message: pick a client or type any number ───────────────────────────
const ComposeModal: React.FC<{
  clients: ClientRecord[];
  onPick: (phone: string, name?: string) => void;
  onClose: () => void;
}> = ({ clients, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const qTrim = q.trim();
  const qDigits = qTrim.replace(/\D/g, '');
  const matches = useMemo(() => {
    const ql = qTrim.toLowerCase();
    return clients
      .filter(c => c.phone && (
        !ql
        || `${c.firstName} ${c.lastName}`.toLowerCase().includes(ql)
        || (qDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(qDigits))
      ))
      .slice(0, 8);
  }, [clients, qTrim, qDigits]);
  const freeNumber = qDigits.length >= 10 ? qTrim : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <MessageSquarePlus size={18} className="text-blue-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') {
                if (matches.length === 1) onPick(matches[0].phone, `${matches[0].firstName} ${matches[0].lastName}`.trim());
                else if (freeNumber) onPick(freeNumber);
              }
            }}
            placeholder="Client name or phone number…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="max-h-[45vh] overflow-y-auto scrollbar-hide p-2 space-y-1">
          {freeNumber && (
            <button
              onClick={() => onPick(freeNumber)}
              className="w-full text-left p-3 rounded-xl border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 transition-all flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-950 border border-white/10 flex items-center justify-center text-blue-300 shrink-0"><Phone size={15} /></div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Text {formatPhone(freeNumber)}</p>
                <p className="text-[11px] text-slate-400">New number — not in your clients yet</p>
              </div>
            </button>
          )}
          {matches.map(c => (
            <button
              key={c.id}
              onClick={() => onPick(c.phone, `${c.firstName} ${c.lastName}`.trim())}
              className="w-full text-left p-3 rounded-xl border border-white/5 hover:border-blue-500/40 hover:bg-white/5 transition-all flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
                {`${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase() || <User size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{`${c.firstName} ${c.lastName}`.trim() || formatPhone(c.phone)}</p>
                <p className="text-[11px] text-slate-400">{formatPhone(c.phone)}</p>
              </div>
            </button>
          ))}
          {!matches.length && !freeNumber && (
            <p className="p-6 text-center text-xs text-slate-500 font-semibold">Type a client name, or a full phone number to text someone new.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Chat panel ───────────────────────────────────────────────────────────────
type TranscriptState = 'loading' | 'error' | { status: string; dialogue: { speaker: string; text: string }[] };

const ChatPanel: React.FC<{
  thread: Thread; title: string; sending: boolean;
  replyText: string; setReplyText: (v: string) => void;
  onSend: () => void; onCall: () => void;
  onProfile?: () => void; onNewJob?: () => void;
  activeJob?: Job | null; onOpenJob?: () => void;
}> = ({ thread, title, sending, replyText, setReplyText, onSend, onCall, onProfile, onNewJob, activeJob, onOpenJob }) => {
  const flags = thread.client ? clientFlags(thread.client) : null;
  const score = thread.client ? clientScore(thread.client) : null;
  const companyName = useSettingsStore(s => s.companyName);
  const googleReviewUrl = useSettingsStore(s => s.googleReviewUrl);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Call transcripts — fetched on first expand, kept for the session.
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptState>>({});
  const toggleCall = async (id: string) => {
    if (openCallId === id) { setOpenCallId(null); return; }
    setOpenCallId(id);
    if (transcripts[id] && transcripts[id] !== 'error') return; // errors retry on re-expand
    setTranscripts(p => ({ ...p, [id]: 'loading' }));
    try {
      const r = await fetch(`${API_BASE}/api/openphone/calls/${id}/transcript`, { headers: { ...authHeaders() } });
      const j = await r.json();
      if (!r.ok) throw new Error();
      setTranscripts(p => ({ ...p, [id]: j }));
    } catch {
      setTranscripts(p => ({ ...p, [id]: 'error' }));
    }
  };
  const clientDigits = thread.key;
  const speakerLabel = (speaker: string) => {
    const d = String(speaker || '').replace(/\D/g, '').slice(-10);
    return d && d === clientDigits ? (title || 'Client') : companyName || 'Us';
  };

  // Quick templates — {name} is the client's first name, EN + ES.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const firstName = thread.client?.firstName || (thread.contactName || '').split(' ')[0] || '';
  const fill = (tpl: string) => tpl.replace(/\{name\}/g, firstName || 'there').replace(/ {2,}/g, ' ').trim();
  const TEMPLATES: { lang: string; items: string[] }[] = [
    {
      lang: 'English',
      items: [
        `Hi {name}, this is ${companyName}. We got your request — when is a good time to call you?`,
        `On my way! I'll text you when I'm close.`,
        `I'm outside now.`,
        `Could you send a photo of the lock / door? It helps me bring the right parts.`,
        `Running about 15 minutes late — sorry! I'll be there as soon as I can.`,
        ...(googleReviewUrl ? [`Thank you for choosing ${companyName}! If everything was great, a quick review means a lot: ${googleReviewUrl}`] : []),
      ],
    },
    {
      lang: 'Español',
      items: [
        `¡Hola {name}! Le escribe ${companyName}. Recibimos su solicitud — ¿a qué hora le podemos llamar?`,
        `¡Voy en camino! Le aviso cuando esté cerca.`,
        `Ya estoy afuera.`,
        `¿Puede mandar una foto de la cerradura o de la puerta? Así llevo las piezas correctas.`,
      ],
    },
  ];

  // AI draft — Дурачок reads the conversation and proposes the next reply.
  const [drafting, setDrafting] = useState(false);
  const aiDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const convo = thread.items.slice(-25).map(it => it.kind === 'call'
        ? `[${it.direction === 'missed' ? 'Missed call' : it.direction === 'in' ? 'Incoming call' : 'Outgoing call'}${it.duration ? `, ${fmtDur(it.duration)}` : ''}]`
        : `${it.direction === 'out' ? 'Us' : 'Client'}: ${it.body || '[photo]'}`
      ).join('\n');
      const job = activeJob ? `Active job #${activeJob.jobNumber}: ${activeJob.status}, scheduled ${activeJob.scheduledDate} ${activeJob.scheduledTime}.` : 'No active job.';
      const res = await fetch(`${API_BASE}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          systemInstruction:
            `You write SMS replies to clients on behalf of ${companyName}, a locksmith company. ` +
            `Output ONLY the text of the next reply — no quotes, no preamble, no options. ` +
            `Match the client's language (English or Spanish). Keep it short, warm and professional. ` +
            `Never invent prices or promises not present in the conversation; if scheduling, propose a concrete next step.`,
          contents: [{ role: 'user', parts: [{ text: `Client: ${title}\n${job}\n\nConversation:\n${convo}\n\nWrite the next reply.` }] }],
        }),
      });
      const j = await res.json();
      if (res.ok && j?.text) {
        setReplyText(String(j.text).trim());
        inputRef.current?.focus();
      } else {
        alert(j?.error || 'AI draft failed — try again.');
      }
    } catch {
      alert('AI draft failed — try again.');
    } finally {
      setDrafting(false);
    }
  };

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
            {activeJob && (
              <button
                onClick={onOpenJob}
                disabled={!onOpenJob}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-blue-500/40 bg-blue-600/15 text-blue-300 hover:bg-blue-600/30 transition-all flex items-center gap-1"
                title="Open this job"
              >
                <Briefcase size={10} /> #{activeJob.jobNumber} · {activeJob.status}
              </button>
            )}
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
        {!thread.items.length && (
          <div className="self-center my-auto text-center opacity-40">
            <MessageSquare size={24} className="mx-auto mb-2 text-blue-500" />
            <p className="text-xs font-bold text-slate-300">No messages yet — write the first one below</p>
          </div>
        )}
        {thread.items.map(it => {
          if (it.kind === 'call') {
            const Icon = it.direction === 'missed' ? PhoneMissed : it.direction === 'in' ? PhoneIncoming : PhoneOutgoing;
            const label = it.direction === 'missed' ? 'Missed call' : it.direction === 'in' ? 'Incoming call' : 'Outgoing call';
            const tr = transcripts[it.id];
            const expanded = openCallId === it.id;
            return (
              <div key={it.id} className="self-center flex flex-col items-center max-w-full">
                <button
                  onClick={() => toggleCall(it.id)}
                  className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 hover:border-blue-500/40 hover:text-slate-200 transition-all"
                  title="Show call transcript"
                >
                  <Icon size={12} className={it.direction === 'missed' ? 'text-red-400' : 'text-slate-400'} />
                  {label}{it.duration ? ` · ${fmtDur(it.duration)}` : ''}
                  <span className="text-slate-600">· {fmtTime(it.ts)}</span>
                  <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="mt-2 w-full max-w-md bg-slate-950/80 border border-white/10 rounded-xl p-3 text-left">
                    {tr === 'loading' || !tr ? (
                      <p className="text-[11px] text-slate-500 font-semibold animate-pulse">Loading transcript…</p>
                    ) : tr === 'error' ? (
                      <p className="text-[11px] text-slate-500 font-semibold">Couldn’t load the transcript.</p>
                    ) : !tr.dialogue.length ? (
                      <p className="text-[11px] text-slate-500 font-semibold">No transcript for this call.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-hide">
                        {tr.dialogue.map((l, i) => (
                          <p key={i} className="text-[11px] leading-relaxed text-slate-300">
                            <span className={`font-bold ${speakerLabel(l.speaker) === (title || 'Client') ? 'text-amber-300' : 'text-blue-300'}`}>{speakerLabel(l.speaker)}:</span> {l.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }
          const out = it.direction === 'out';
          const invoice = STRIPE_LINK.exec(it.body);
          const url = invoice?.[1] || ANY_URL.exec(it.body)?.[1];
          const images = (it.media || []).filter(m => !m.type || m.type.startsWith('image'));
          const files = (it.media || []).filter(m => m.type && !m.type.startsWith('image'));
          return (
            <div key={it.id} className={`max-w-[85%] ${out ? 'self-end' : 'self-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${out ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 border border-white/10 rounded-bl-sm'}`}>
                {images.map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block mb-1.5 last:mb-0">
                    <img src={m.url} alt="MMS attachment" loading="lazy" className="rounded-xl max-h-52 w-auto max-w-full" />
                  </a>
                ))}
                {files.map((m, i) => (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 font-semibold mb-1 ${out ? 'text-white' : 'text-blue-300'}`}>
                    <Paperclip size={13} /> Attachment <ExternalLink size={11} className="opacity-70" />
                  </a>
                ))}
                {invoice ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 font-semibold ${out ? 'text-white' : 'text-blue-300'}`}>
                    <CreditCard size={15} /> Payment link <ExternalLink size={12} className="opacity-70" />
                  </a>
                ) : it.body ? (
                  <span className="whitespace-pre-wrap break-words">{it.body}</span>
                ) : null}
              </div>
              <p className={`text-[10px] text-slate-500 mt-1 ${out ? 'text-right' : 'text-left'}`}>{fmtTime(it.ts)}</p>
            </div>
          );
        })}
      </div>

      {/* Reply */}
      <div className="relative p-3 border-t border-white/10 flex gap-2">
        {templatesOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-slate-950 border border-white/10 rounded-2xl shadow-2xl max-h-64 overflow-y-auto scrollbar-hide p-2 z-10">
            {TEMPLATES.map(group => (
              <div key={group.lang}>
                <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.lang}</p>
                {group.items.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => { setReplyText(fill(tpl)); setTemplatesOpen(false); inputRef.current?.focus(); }}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    {fill(tpl)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setTemplatesOpen(v => !v)}
          title="Quick templates"
          className={`p-2.5 rounded-xl border transition-all active:scale-95 ${templatesOpen ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'}`}
        >
          <Zap size={15} />
        </button>
        <button
          onClick={aiDraft}
          disabled={drafting}
          title="Let the AI draft a reply"
          className={`p-2.5 rounded-xl border transition-all active:scale-95 disabled:opacity-60 ${drafting ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'bg-white/5 border-white/10 text-slate-300 hover:text-purple-300'}`}
        >
          <Sparkles size={15} className={drafting ? 'animate-pulse' : ''} />
        </button>
        <input
          ref={inputRef}
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Text the client…"
          className="flex-1 min-w-0 bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button onClick={onSend} disabled={sending || !replyText.trim()} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5">
          <Send size={14} />{sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
