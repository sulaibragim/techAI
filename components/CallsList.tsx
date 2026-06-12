import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, useVisibleJobs } from '../store';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, PhoneCall, RefreshCw, Radio, History, ChevronRight, UserPlus, AlertTriangle, Star, Ban } from 'lucide-react';
import { CallRecord } from '../types';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { buildClients, findClientByPhone, formatPhone, clientFlags, clientScore, TIER_STYLE } from '../clientUtils';
import { useSettingsStore } from '../settingsStore';

const PHONE_NUMBER_ID = 'PNkhFHiD2G';

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function mapOpenPhoneCall(c: any): CallRecord {
  const isInbound = c.direction === 'inbound' || c.direction === 'incoming';
  const isMissed = c.status === 'missed' || c.status === 'no-answer';
  const type = isMissed ? 'missed' : isInbound ? 'incoming' : 'outgoing';
  const callerNumber = isInbound ? c.from : c.to;
  const name = c.contact?.name || callerNumber;

  return {
    id: c.id,
    from: name,
    phone: callerNumber,
    type,
    duration: c.duration ? formatDuration(c.duration) : undefined,
    timestamp: new Date(c.createdAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }),
    avatar: '',
  };
}

export const CallsList: React.FC<{
  onClientSelect?: (clientId: string) => void;
  onCreateJobFromCall?: (phone: string, name?: string) => void;
}> = ({ onClientSelect, onCreateJobFromCall }) => {
  const { calls: storeCalls } = useAppStore();
  const jobs = useVisibleJobs();
  const clientProfiles = useSettingsStore(s => s.clientProfiles);
  const clients = useMemo(() => buildClients(jobs, clientProfiles), [jobs, clientProfiles]);
  const [liveCalls, setLiveCalls] = useState<CallRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);

  const fetchCalls = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/openphone/calls?phoneNumberId=${PHONE_NUMBER_ID}`, { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setLiveCalls((data.data || []).map(mapOpenPhoneCall));
      setIsLive(true);
    } catch {
      setError('Backend offline — showing local data');
      setLiveCalls(null);
      setIsLive(false);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load + silent auto-refresh so incoming calls aren't missed.
  useEffect(() => {
    fetchCalls();
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchCalls(true); }, 15000);
    return () => clearInterval(id);
  }, []);

  const callHistory = liveCalls ?? storeCalls ?? [];

  const getCallIcon = (type: string) => {
    switch (type) {
      case 'incoming': return <PhoneIncoming size={14} className="text-green-500" />;
      case 'outgoing': return <PhoneOutgoing size={14} className="text-blue-500" />;
      case 'missed': return <PhoneMissed size={14} className="text-red-500" />;
      default: return <Phone size={14} className="text-slate-400" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'incoming': return 'hover:border-green-500/30';
      case 'missed': return 'hover:border-red-500/30';
      default: return 'hover:border-blue-500/30';
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Call History</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Communication Ledger</p>
        </div>
        <div className="flex items-center gap-3">
          {isLive && (
            <div className="flex items-center space-x-2 text-green-400 bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/20">
              <Radio size={12} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">OpenPhone Live</span>
            </div>
          )}
          <button
            onClick={() => fetchCalls()}
            disabled={loading}
            className="p-2.5 bg-slate-900 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center space-x-2 text-blue-500 bg-blue-500/5 px-4 py-2.5 rounded-xl border border-blue-500/10">
            <Phone size={15} />
            <span className="text-xs font-bold uppercase tracking-widest">{callHistory.length} Records</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-2">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-2.5 text-xs font-semibold text-amber-400 flex items-center gap-2">
            <Phone size={12} />
            {error}
          </div>
        </div>
      )}

      <div className="space-y-3 px-2">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 animate-pulse h-20" />
          ))
        ) : callHistory.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl border border-white/10 p-16 flex flex-col items-center justify-center opacity-30 text-center">
            <Phone size={28} className="mb-4 text-blue-500" />
            <p className="text-base font-bold tracking-tight">No call history yet</p>
          </div>
        ) : (
          callHistory.map((call) => {
            const client = findClientByPhone(clients, call.phone);
            const flags = client ? clientFlags(client) : null;
            const displayName = client ? `${client.firstName} ${client.lastName}`.trim() : (call.from !== call.phone ? call.from : formatPhone(call.phone));
            const initials = client ? `${client.firstName[0] || ''}${client.lastName[0] || ''}`.toUpperCase() : '';
            // Tap a row: known client → open their profile; unknown caller → start a job
            // prefilled with their number so they get saved as a client.
            const rowAction = () => {
              if (client) onClientSelect?.(client.id);
              else onCreateJobFromCall?.(call.phone, call.from !== call.phone ? call.from : undefined);
            };
            const clickable = !!(client ? onClientSelect : onCreateJobFromCall);
            // Reputation colours the whole row so the team reads the caller before "hello".
            const toneBorder = flags?.tone === 'danger' ? 'border-red-500/50 hover:border-red-500/70'
              : flags?.tone === 'vip' ? 'border-amber-500/50 hover:border-amber-500/70'
              : `border-white/10 ${getBorderColor(call.type)}`;
            const toneAvatar = flags?.tone === 'danger' ? 'bg-red-500/15 border-red-500/40 text-red-300 font-bold'
              : flags?.tone === 'vip' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
              : client ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 font-bold' : 'bg-slate-950 border-white/10 shadow-inner';
            return (
            <div
              key={call.id}
              onClick={rowAction}
              role={clickable ? 'button' : undefined}
              className={`bg-slate-900/80 backdrop-blur-3xl p-4 rounded-2xl border ${toneBorder} hover:scale-[1.01] transition-all flex items-center justify-between group shadow-xl relative ${clickable ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center space-x-5 flex-1 min-w-0">
                <div className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center border shrink-0 ${toneAvatar}`}>
                  {call.avatar ? (
                    <img src={call.avatar} className="w-full h-full object-cover" alt="" />
                  ) : client ? (
                    <span className="text-sm tracking-tight">{initials}</span>
                  ) : (
                    <Phone size={18} className="text-slate-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-tight truncate leading-none">
                      {displayName}
                    </h3>
                    <div className="bg-white/5 px-2 py-0.5 rounded-lg">
                      {getCallIcon(call.type)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{formatPhone(call.phone)}</p>
                    {flags?.doNotService && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-full">
                        <Ban size={10} /> Do not service
                      </span>
                    )}
                    {flags?.tone === 'danger' && !flags.doNotService && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={10} /> Difficult
                      </span>
                    )}
                    {flags?.tone === 'vip' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <Star size={10} /> VIP
                      </span>
                    )}
                    {client && (() => { const tier = clientScore(client).tier; return (tier === 'Gold' || tier === 'Silver') ? (
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${TIER_STYLE[tier]}`}>{tier}</span>
                    ) : null; })()}
                    {client ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        <History size={10} />
                        {client.jobs.length} job{client.jobs.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        New caller
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2 ml-4 shrink-0">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Clock size={11} />
                  <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{call.timestamp}</span>
                </div>
                {call.duration && (
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{call.duration}</span>
                )}
                <div className="flex items-center gap-2">
                  {client ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); rowAction(); }}
                      className="inline-flex items-center gap-1 px-2.5 py-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all active:scale-90 text-[10px] font-bold uppercase tracking-wider"
                      title="Open client profile"
                    >
                      History <ChevronRight size={12} />
                    </button>
                  ) : onCreateJobFromCall && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCreateJobFromCall(call.phone, call.from !== call.phone ? call.from : undefined); }}
                      className="inline-flex items-center gap-1 px-2.5 py-2 bg-violet-600/10 text-violet-400 hover:bg-violet-600 hover:text-white rounded-xl transition-all active:scale-90 text-[10px] font-bold uppercase tracking-wider"
                      title="Save as client — create a job from this call"
                    >
                      <UserPlus size={12} /> New Job
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${call.phone}`; }}
                    className="p-2 bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white rounded-xl transition-all active:scale-90"
                    title="Call back"
                  >
                    <PhoneCall size={14} />
                  </button>
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};
