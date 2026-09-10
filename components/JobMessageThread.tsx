import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, CreditCard, ExternalLink, Paperclip } from 'lucide-react';
import { Job } from '../types';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { useSettingsStore } from '../settingsStore';
import type { RawMessage, RawCall, InboxMedia } from '../inboxStore';
import { CallPill } from './CallPill';

// The job card's message box: the WHOLE conversation with this client from OpenPhone —
// our texts, theirs, and calls (tap one for its transcript) — not just the texts that
// happened to be sent from this card. Texts logged on the card that OpenPhone doesn't
// have (older jobs, notes) are merged in without doubling the ones it does.

type Item =
  | { kind: 'sms'; id: string; ts: number; dir: 'in' | 'out'; body: string; media?: InboxMedia[] }
  | { kind: 'call'; id: string; ts: number; dir: 'in' | 'out' | 'missed'; duration?: number }
  | { kind: 'note'; id: string; ts: number; body: string };

const STRIPE_LINK = /(https?:\/\/\S*(?:checkout\.stripe\.com|\/pay\/cs_)\S*)/i;
const POLL_MS = 20000;
// A card-logged text and OpenPhone's copy of it land a few seconds apart; allow slack.
const SAME_TEXT_WINDOW_MS = 15 * 60 * 1000;

const last10 = (p?: string) => String(p || '').replace(/\D/g, '').slice(-10);
const bodyKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export const JobMessageThread: React.FC<{ job: Job; refreshKey: number }> = ({ job, refreshKey }) => {
  const companyName = useSettingsStore(s => s.companyName);
  const [remote, setRemote] = useState<{ messages: RawMessage[]; calls: RawCall[] } | 'unavailable' | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/openphone/jobs/${encodeURIComponent(job.id)}/thread`, { headers: { ...authHeaders() } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setRemote({ messages: j.messages || [], calls: j.calls || [] });
    } catch {
      // A failed poll keeps the last good history on screen.
      setRemote(prev => (prev && prev !== 'unavailable' ? prev : 'unavailable'));
    }
  }, [job.id]);

  useEffect(() => { setRemote(null); }, [job.id]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const opSms: Extract<Item, { kind: 'sms' }>[] = [];
    if (remote && remote !== 'unavailable') {
      for (const m of remote.messages) {
        const it = { kind: 'sms' as const, id: m.id, ts: Date.parse(m.createdAt), dir: m.direction === 'incoming' ? 'in' as const : 'out' as const, body: m.body || '', media: m.media };
        opSms.push(it);
        out.push(it);
      }
      for (const c of remote.calls) {
        const incoming = c.direction === 'inbound' || c.direction === 'incoming';
        const missed = c.status === 'missed' || c.status === 'no-answer';
        out.push({ kind: 'call', id: c.id, ts: Date.parse(c.createdAt), dir: missed ? 'missed' : incoming ? 'in' : 'out', duration: c.duration });
      }
    }
    for (const m of job.messages || []) {
      const ts = Date.parse(m.timestamp);
      if (m.sender === 'system') { out.push({ kind: 'note', id: `job-${m.id}`, ts, body: m.content }); continue; }
      const dir = m.sender === 'client' ? 'in' : 'out';
      const key = bodyKey(m.content || '');
      const alreadyThere = opSms.some(o => o.dir === dir && bodyKey(o.body) === key && Math.abs(o.ts - ts) < SAME_TEXT_WINDOW_MS);
      if (!alreadyThere) out.push({ kind: 'sms', id: `job-${m.id}`, ts, dir, body: m.content || '' });
    }
    return out.filter(it => Number.isFinite(it.ts)).sort((a, b) => a.ts - b.ts);
  }, [remote, job.messages]);

  // Open at the newest message and follow new ones — unless the user scrolled up to read.
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const clientKeys = [last10(job.client.phone), last10(job.client.secondaryPhone)].filter(k => k.length === 10);
  const clientName = `${job.client.firstName || ''} ${job.client.lastName || ''}`.trim() || 'Client';
  const ourName = companyName || 'Us';

  if (remote === null && !items.length) {
    return (
      <div className="flex-1 space-y-3">
        {[0, 1, 2].map(i => <div key={i} className={`h-12 rounded-2xl bg-white/5 animate-pulse ${i % 2 ? 'ml-auto w-2/3' : 'w-3/4'}`} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {remote === 'unavailable' && (
        <p className="mb-3 text-[11px] font-semibold text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          Full OpenPhone history is unavailable right now — showing only texts sent from this job card.
        </p>
      )}
      <div
        ref={listRef}
        onScroll={e => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 max-h-[560px] overflow-y-auto overflow-x-hidden overscroll-contain space-y-2.5 pr-1 scrollbar-hide flex flex-col"
      >
        {!items.length ? (
          <div className="my-auto flex flex-col items-center justify-center opacity-20 py-10">
            <MessageSquare size={26} className="mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">No Messages</p>
          </div>
        ) : items.map((it, i) => {
          const prev = items[i - 1];
          const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(it.ts).toDateString();
          return (
            <React.Fragment key={it.id}>
              {newDay && (
                <p className="self-center text-[10px] font-bold uppercase tracking-widest text-slate-600 pt-1">{fmtDay(it.ts)}</p>
              )}
              {it.kind === 'call' ? (
                <CallPill callId={it.id} direction={it.dir} duration={it.duration} when={fmtTime(it.ts)} clientKeys={clientKeys} clientName={clientName} ourName={ourName} />
              ) : it.kind === 'note' ? (
                <p className="self-center max-w-[90%] text-center text-[11px] italic text-slate-500">{it.body} · {fmtTime(it.ts)}</p>
              ) : (
                <SmsBubble item={it} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const SmsBubble: React.FC<{ item: Extract<Item, { kind: 'sms' }> }> = ({ item }) => {
  const out = item.dir === 'out';
  const link = STRIPE_LINK.exec(item.body)?.[1];
  const images = (item.media || []).filter(m => !m.type || m.type.startsWith('image'));
  const files = (item.media || []).filter(m => m.type && !m.type.startsWith('image'));
  return (
    <div className={`max-w-[88%] min-w-0 ${out ? 'self-end' : 'self-start'}`}>
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
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 font-semibold ${out ? 'text-white' : 'text-blue-300'}`}>
            <CreditCard size={15} /> Payment link <ExternalLink size={12} className="opacity-70" />
          </a>
        ) : item.body ? (
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</span>
        ) : null}
      </div>
      <p className={`text-[10px] text-slate-500 mt-1 ${out ? 'text-right' : 'text-left'}`}>{fmtTime(item.ts)}</p>
    </div>
  );
};
