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
import { useCurrentUser } from '../authStore';
import { useInboxStore, InboxMedia } from '../inboxStore';
import { OPENPHONE_PHONE_NUMBER_ID } from '../smsService';
import { smsInfo, sanitizeSms } from '../smsText';
import { SMS_TEMPLATES, fillSmsTemplate, resolveSmsTemplate, SmsLang } from '../smsTemplates';
import { useSwipeBack } from '../useSwipeBack';
import {
  buildClients, findClientByPhone, normalizePhone, formatPhone,
  clientFlags, clientScore, TIER_STYLE, ClientRecord,
} from '../clientUtils';

// One source of truth for the number we send from — a second copy here would drift.
const PHONE_NUMBER_ID = OPENPHONE_PHONE_NUMBER_ID;

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
// Draft threads survive a reload (per device), same idea as the read markers.
const DRAFTS_KEY = 'techai-inbox-drafts-v1';

const fmtTime = (iso: number) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
// Thread-list stamp: a phone row has ~60px for this, so today is a clock, older is a date.
const fmtShort = (ts: number) => {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yest.';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
};
// Mobile gets a full-screen chat (like JobDetail); ≥md keeps the two-pane inbox.
const useIsNarrow = () => {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};
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
  // Threads started from "New message" that have no OpenPhone history yet. Persisted
  // per device so a reload doesn't lose a chat you opened but haven't texted yet.
  const [drafts, setDrafts] = useState<Record<string, { phone: string; name?: string }>>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* quota */ }
  }, [drafts]);

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

  // A draft that has gained real history is just a thread now — drop the stub.
  useEffect(() => {
    const stale = Object.keys(drafts).filter(k => threads.some(t => t.key === k && t.items.length > 0));
    if (stale.length) {
      setDrafts(prev => { const next = { ...prev }; for (const k of stale) delete next[k]; return next; });
    }
  }, [threads]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Same GSM cleanup as every other send path — a pasted em dash or curly quote
      // would otherwise flip the whole message to the 70-char encoding.
      const content = sanitizeSms(replyText).trim();
      const res = await fetch(`${API_BASE}/api/openphone/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ to, content, phoneNumberId: PHONE_NUMBER_ID }),
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

  // ≥md the inbox is one bounded two-pane box. Its height is MEASURED, not guessed:
  // a fixed 100dvh−9rem was wrong whenever the app header grew (Active Dispatch bar,
  // offline banner) and pushed the composer off the bottom of the screen.
  const shellRef = useRef<HTMLDivElement>(null);
  const [paneH, setPaneH] = useState(0);
  const measurePane = useCallback(() => {
    const el = shellRef.current;
    if (!el || !window.matchMedia('(min-width: 768px)').matches) { setPaneH(0); return; }
    setPaneH(Math.max(420, Math.round(window.innerHeight - el.getBoundingClientRect().top - 24)));
  }, []);
  useLayoutEffect(measurePane); // every render — the banners above us come and go
  useEffect(() => {
    window.addEventListener('resize', measurePane);
    return () => window.removeEventListener('resize', measurePane);
  }, [measurePane]);

  // The phone's chat layer is `fixed`, and iOS does NOT shrink those when the keyboard
  // opens — the composer would sit behind it. Follow the VISUAL viewport instead.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!vv || !el || !openKey) return;
    const apply = () => {
      if (!window.matchMedia('(max-width: 767px)').matches) { el.style.height = ''; el.style.top = ''; return; }
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      el.style.height = '';
      el.style.top = '';
    };
  }, [openKey]);

  const FILTER_CHIPS: { id: InboxFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'needsReply', label: 'Needs reply', count: needsReplyCount },
  ];

  return (
    // Mobile: the list is a normal page section (the app shell owns the scrolling and the
    // bottom-nav inset) and the chat opens as a full-screen layer. ≥md: one bounded
    // two-pane inbox where the list and the chat scroll inside themselves.
    <div
      ref={shellRef}
      style={paneH ? { height: paneH } : undefined}
      className="flex flex-col max-w-5xl mx-auto animate-in fade-in duration-500"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-1 md:px-2 shrink-0 mb-3 md:mb-4">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white leading-none truncate">Client Inbox</h2>
          <p className="hidden sm:block text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">One chat per client · calls, texts & invoices</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {online && (
            <div className="hidden lg:flex items-center space-x-2 text-green-400 bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/20">
              <Radio size={12} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">OpenPhone Live</span>
            </div>
          )}
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-2 h-11 px-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all active:scale-95 text-xs font-bold uppercase tracking-wider"
            title="Start a new conversation"
          >
            <MessageSquarePlus size={16} />
            <span className="hidden lg:inline">New message</span>
          </button>
          <button
            onClick={syncHistory}
            disabled={syncing}
            className="flex items-center gap-2 h-11 px-3 bg-slate-900 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-50 text-xs font-bold uppercase tracking-wider"
            title="Pull the full message & call history from OpenPhone"
          >
            <History size={16} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden lg:inline">{syncing ? 'Syncing…' : 'Sync history'}</span>
          </button>
          <button onClick={() => fetchAll()} disabled={loading} className="h-11 w-11 flex items-center justify-center bg-slate-900 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-40" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4 px-1 md:px-2 flex-1 min-h-0 min-w-0">
        {/* ── Thread list ── */}
        <div className="flex flex-col min-w-0 md:min-h-0">
          <div className="relative mb-2 shrink-0">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or number…"
              /* 16px on phones — anything smaller makes iOS zoom the page on focus. */
              className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-base md:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1.5 mb-2 shrink-0 overflow-x-auto scrollbar-hide">
            {FILTER_CHIPS.map(c => (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all active:scale-95 ${
                  filter === c.id ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {c.label}{c.count ? ` · ${c.count}` : ''}
              </button>
            ))}
          </div>
          <div className="space-y-2 min-w-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1 scrollbar-hide">
          {loading && !threads.length ? (
            [...Array(4)].map((_, i) => <div key={i} className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 animate-pulse h-16" />)
          ) : !threads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-8 md:p-12 flex flex-col items-center justify-center opacity-40 text-center">
              <Smartphone size={26} className="mb-3 text-blue-500" />
              <p className="text-sm font-bold tracking-tight">{online ? 'No conversations yet' : 'Can’t reach the server'}</p>
              <p className="text-xs font-semibold text-slate-400 mt-1.5">{online ? 'Client texts & calls will appear here' : 'The inbox is unavailable right now'}</p>
            </div>
          ) : !visibleThreads.length ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-8 md:p-10 text-center opacity-40">
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
                  {t.latest && <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0 self-start mt-1">{fmtShort(t.latest.ts)}</span>}
                </button>
              );
            })
          )}
          </div>
        </div>

        {/* ── Chat panel — full-screen layer on a phone, right pane from md up ── */}
        <div ref={overlayRef} className={`min-w-0 min-h-0 ${open ? 'fixed inset-0 z-[120] flex md:static md:z-auto' : 'hidden md:flex'}`}>
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
              onBack={() => setOpenKey(null)}
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
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-end md:items-start justify-center md:pt-[15vh] md:px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] md:pb-0"
        onClick={e => e.stopPropagation()}
      >
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
            inputMode="text"
            className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <button onClick={onClose} className="p-2 -m-0.5 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="max-h-[50vh] md:max-h-[45vh] overflow-y-auto overscroll-contain scrollbar-hide p-2 space-y-1">
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
  onSend: () => void; onCall: () => void; onBack: () => void;
  onProfile?: () => void; onNewJob?: () => void;
  activeJob?: Job | null; onOpenJob?: () => void;
}> = ({ thread, title, sending, replyText, setReplyText, onSend, onCall, onBack, onProfile, onNewJob, activeJob, onOpenJob }) => {
  const flags = thread.client ? clientFlags(thread.client) : null;
  const score = thread.client ? clientScore(thread.client) : null;
  const companyName = useSettingsStore(s => s.companyName);
  const googleReviewUrl = useSettingsStore(s => s.googleReviewUrl);
  const templateOverrides = useSettingsStore(s => s.smsTemplates);
  const currentUser = useCurrentUser();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Phone = full-screen layer, so a right-swipe closes it the same way it closes a job card.
  const narrow = useIsNarrow();
  const swipeRef = useSwipeBack<HTMLDivElement>(onBack, { enabled: narrow });

  // The box grows with the text instead of scrolling a one-line input sideways.
  const autosize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);
  useLayoutEffect(autosize, [replyText, autosize]);
  useEffect(() => {
    window.addEventListener('resize', autosize); // rotation changes how many lines the text needs
    return () => window.removeEventListener('resize', autosize);
  }, [autosize]);

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
  // The keyboard shrinking the layer must not push the newest message out of sight.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { if (pinnedRef.current) requestAnimationFrame(scrollToBottom); };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

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

  // Quick templates. The dispatch set is the SAME one the owner edits in Settings, so a
  // reply from the inbox reads like a reply from the job card; the extras below are the
  // ones only a conversation needs. Every default fits one GSM-7 segment — see smsText.ts.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [tplLang, setTplLang] = useState<SmsLang>('en');
  const firstName = thread.client?.firstName || (thread.contactName || '').split(' ')[0] || '';

  const templates = useMemo(() => {
    const vars = { name: firstName, tech: currentUser?.name || '', company: companyName, eta: null };
    const extras: { id: string; label: string; en: string; es: string }[] = [
      {
        id: 'inbox-hello', label: 'First reply',
        en: 'Hi {name}, this is {company}. We got your message - when is a good time to call you?',
        es: 'Hola {name}, le escribe {company}. Recibimos su mensaje - a que hora le podemos llamar?',
      },
      {
        id: 'inbox-photo', label: 'Send a photo',
        en: 'Could you text a photo of the lock or the door? It helps us bring the right parts.',
        es: 'Puede mandar una foto de la cerradura o de la puerta? Asi llevamos las piezas correctas.',
      },
      {
        id: 'inbox-quote', label: 'Price after look',
        en: 'Hi {name}, the tech gives you the exact price on site before any work starts - no surprises.',
        es: 'Hola {name}, el tecnico le da el precio exacto en el sitio antes de empezar - sin sorpresas.',
      },
      ...(googleReviewUrl ? [{
        id: 'inbox-review', label: 'Review link',
        en: `Thanks for choosing {company}! If we did well, a quick review means a lot: ${googleReviewUrl}`,
        es: `Gracias por elegir {company}. Si quedo contento, una resena nos ayuda mucho: ${googleReviewUrl}`,
      }] : []),
    ];
    return [
      ...extras.map(e => ({ id: e.id, label: e.label, text: fillSmsTemplate(tplLang === 'es' ? e.es : e.en, vars, tplLang) })),
      ...SMS_TEMPLATES.map(def => ({
        id: def.id,
        label: def.label,
        text: fillSmsTemplate(resolveSmsTemplate(def, templateOverrides, tplLang), vars, tplLang),
      })),
    ];
  }, [firstName, currentUser?.name, companyName, googleReviewUrl, templateOverrides, tplLang]);

  const applyTemplate = (text: string) => {
    setReplyText(text);
    setTemplatesOpen(false);
    inputRef.current?.focus();
  };

  // What this reply will actually cost to send.
  const info = useMemo(() => smsInfo(sanitizeSms(replyText)), [replyText]);
  const costTone = info.encoding === 'UCS-2' || info.segments > 2 ? 'text-red-400'
    : info.segments === 2 ? 'text-amber-400' : 'text-slate-500';

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
    <div
      ref={swipeRef}
      className="w-full h-full bg-slate-900 md:rounded-2xl border-0 md:border border-white/10 shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Header — clears the notch when this is the top of the screen */}
      <div className="px-3 md:px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-4 border-b border-white/10 flex items-center gap-2.5 md:gap-3 shrink-0">
        <button
          onClick={onBack}
          title="Back to the inbox"
          className="md:hidden shrink-0 w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-slate-300 active:scale-90 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div className={`hidden sm:flex w-11 h-11 rounded-xl items-center justify-center border shrink-0 ${thread.client ? 'bg-blue-600/10 border-blue-500/30 text-blue-300 font-bold' : 'bg-slate-950 border-white/10 text-slate-400'}`}>
          {thread.client ? `${thread.client.firstName[0] || ''}${thread.client.lastName[0] || ''}`.toUpperCase() || <User size={18} /> : <User size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
            <p className="text-sm md:text-base font-bold text-white truncate">{title}</p>
            {score && <span className={`hidden sm:inline text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${TIER_STYLE[score.tier]}`}>{score.tier}</span>}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[11px] md:text-xs text-slate-500 tracking-wide truncate">{formatPhone(thread.phone)}</p>
            {activeJob && (
              <button
                onClick={onOpenJob}
                disabled={!onOpenJob}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-blue-500/40 bg-blue-600/15 text-blue-300 hover:bg-blue-600/30 transition-all flex items-center gap-1 shrink-0 max-w-[55%] truncate"
                title="Open this job"
              >
                <Briefcase size={10} className="shrink-0" /> <span className="truncate">#{activeJob.jobNumber} · {activeJob.status}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onCall} title="Call" className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-green-400 transition-all active:scale-95"><Phone size={16} /></button>
          {onProfile && <button onClick={onProfile} title="Client profile" className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-blue-400 transition-all active:scale-95"><User size={16} /></button>}
          {onNewJob && <button onClick={onNewJob} title="New job for this client" className="w-10 h-10 flex items-center justify-center bg-blue-600/15 border border-blue-500/30 rounded-xl text-blue-300 hover:bg-blue-600 hover:text-white transition-all active:scale-95"><Briefcase size={16} /></button>}
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
        className="p-3 md:p-4 space-y-2.5 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide flex flex-col"
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
              <div key={it.id} className="flex flex-col items-center max-w-full min-w-0">
                <button
                  onClick={() => toggleCall(it.id)}
                  className="flex items-center justify-center flex-wrap gap-x-2 gap-y-0.5 max-w-full text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 hover:border-blue-500/40 hover:text-slate-200 transition-all"
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
            <div key={it.id} className={`max-w-[88%] md:max-w-[85%] min-w-0 ${out ? 'self-end' : 'self-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-[15px] md:text-sm leading-relaxed ${out ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 border border-white/10 rounded-bl-sm'}`}>
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
                  // `anywhere`, not `break-word`: only this one lets a pasted URL shrink the
                  // bubble's min-content, which is what used to widen the whole tab sideways.
                  <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{it.body}</span>
                ) : null}
              </div>
              <p className={`text-[10px] text-slate-500 mt-1 ${out ? 'text-right' : 'text-left'}`}>{fmtTime(it.ts)}</p>
            </div>
          );
        })}
      </div>

      {/* Reply — this whole row used to end up behind the phone's tab bar */}
      <div className="relative shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] md:pb-3">
        {templatesOpen && (
          <>
            <div className="fixed inset-0 z-[125] md:hidden" onClick={() => setTemplatesOpen(false)} />
            <div className="fixed inset-x-0 bottom-0 z-[130] max-h-[68vh] rounded-t-3xl border-t border-white/10 bg-slate-950 shadow-2xl overflow-y-auto overscroll-contain scrollbar-hide p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:absolute md:inset-x-3 md:top-auto md:bottom-full md:z-10 md:mb-2 md:max-h-72 md:rounded-2xl md:border md:pb-2">
              <div className="sticky top-0 flex items-center justify-between gap-2 bg-slate-950 px-1.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Quick replies</p>
                <span className="flex rounded-lg border border-white/10 overflow-hidden">
                  {(['en', 'es'] as SmsLang[]).map(l => (
                    <button
                      key={l}
                      onClick={() => setTplLang(l)}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${tplLang === l ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}
                    >{l}</button>
                  ))}
                </span>
              </div>
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.text)}
                  className="w-full text-left px-2.5 py-2.5 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400/80">{t.label}</p>
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">{t.text}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* One-tap chips — the reason templates were invisible on a phone before */}
        {!replyText && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2 -mx-0.5 px-0.5">
            {templates.slice(0, 5).map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.text)}
                className="shrink-0 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold text-slate-300 hover:text-white hover:border-blue-500/40 transition-all active:scale-95"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 min-w-0">
          <button
            onClick={() => setTemplatesOpen(v => !v)}
            title="Quick templates"
            className={`shrink-0 w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${templatesOpen ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'}`}
          >
            <Zap size={17} />
          </button>
          <button
            onClick={aiDraft}
            disabled={drafting}
            title="Let the AI draft a reply"
            className={`shrink-0 w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-60 ${drafting ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'bg-white/5 border-white/10 text-slate-300 hover:text-purple-300'}`}
          >
            <Sparkles size={17} className={drafting ? 'animate-pulse' : ''} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !narrow) { e.preventDefault(); onSend(); } }}
            placeholder="Text the client…"
            enterKeyHint="enter"
            /* 16px on phones: a smaller font makes iOS zoom in the moment you tap the box. */
            className="flex-1 min-w-0 resize-none bg-slate-800 border border-white/10 rounded-xl px-3.5 py-3 text-base md:text-sm leading-snug text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 scrollbar-hide"
          />
          <button
            onClick={onSend}
            disabled={sending || !replyText.trim()}
            title="Send"
            className="shrink-0 h-10 md:h-11 px-3.5 md:px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
          >
            <Send size={16} /><span className="hidden md:inline">{sending ? '…' : 'Send'}</span>
          </button>
        </div>

        {!!replyText.trim() && (
          <p className={`mt-1.5 px-1 text-[10px] font-bold tabular-nums ${costTone}`}>
            {info.chars} chars · {info.segments || 1} SMS
            {info.encoding === 'UCS-2' && ' · emoji/symbols make this 2-3x pricier'}
          </p>
        )}
      </div>
    </div>
  );
};
