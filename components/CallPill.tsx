import React, { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, ChevronDown } from 'lucide-react';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';

// One call in a conversation timeline — tap it to read what was said. Shared by the
// inbox chat and the job card's message box so both read a call the same way.

type Transcript = { status: string; dialogue: { speaker: string; text: string }[] };
type TranscriptState = 'loading' | 'error' | Transcript;

// A finished transcript never changes; keep it for the session across every timeline.
const cache = new Map<string, Transcript>();

const last10 = (p: string) => String(p || '').replace(/\D/g, '').slice(-10);

export const fmtCallDuration = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export const CallPill: React.FC<{
  callId: string;
  direction: 'in' | 'out' | 'missed';
  duration?: number;
  when: string;
  clientKeys: string[];   // the client's numbers as last-10 digits — tells their lines from ours
  clientName: string;
  ourName: string;
}> = ({ callId, direction, duration, when, clientKeys, clientName, ourName }) => {
  const [open, setOpen] = useState(false);
  const [tr, setTr] = useState<TranscriptState | null>(() => cache.get(callId) || null);
  const missed = direction === 'missed';

  const toggle = async () => {
    if (missed) return; // nobody talked — there is nothing to transcribe
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (tr && tr !== 'error') return; // errors retry on re-expand
    setTr('loading');
    try {
      const r = await fetch(`${API_BASE}/api/openphone/calls/${encodeURIComponent(callId)}/transcript`, { headers: { ...authHeaders() } });
      const j = await r.json();
      if (!r.ok) throw new Error();
      if (j.dialogue?.length) cache.set(callId, j);
      setTr(j);
    } catch {
      setTr('error');
    }
  };

  const Icon = missed ? PhoneMissed : direction === 'in' ? PhoneIncoming : PhoneOutgoing;
  const label = missed ? 'Missed call' : direction === 'in' ? 'Incoming call' : 'Outgoing call';
  const isClient = (speaker: string) => clientKeys.includes(last10(speaker));

  return (
    <div className="flex flex-col items-center max-w-full min-w-0">
      <button
        onClick={toggle}
        disabled={missed}
        className="flex items-center justify-center flex-wrap gap-x-2 gap-y-0.5 max-w-full text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 enabled:hover:border-blue-500/40 enabled:hover:text-slate-200 transition-all disabled:cursor-default"
        title={missed ? undefined : 'Show call transcript'}
      >
        <Icon size={12} className={missed ? 'text-red-400' : 'text-slate-400'} />
        {label}{duration ? ` · ${fmtCallDuration(duration)}` : ''}
        <span className="text-slate-600">· {when}</span>
        {!missed && <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div className="mt-2 w-full max-w-md bg-slate-950/80 border border-white/10 rounded-xl p-3 text-left">
          {tr === 'loading' || !tr ? (
            <p className="text-[11px] text-slate-500 font-semibold animate-pulse">Loading transcript…</p>
          ) : tr === 'error' ? (
            <p className="text-[11px] text-slate-500 font-semibold">Couldn’t load the transcript.</p>
          ) : !tr.dialogue.length ? (
            <p className="text-[11px] text-slate-500 font-semibold">No transcript for this call.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-hide">
              {tr.dialogue.map((l, i) => {
                const client = isClient(l.speaker);
                return (
                  <p key={i} className="text-[11px] leading-relaxed text-slate-300">
                    <span className={`font-bold ${client ? 'text-amber-300' : 'text-blue-300'}`}>{client ? clientName : ourName}:</span> {l.text}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
