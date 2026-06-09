import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { API_BASE } from '../backendUrl';
import { Sparkles, Phone, MapPin, Lock, Clock, CheckCircle, X, ChevronDown, ChevronUp, Mic } from 'lucide-react';

interface AISuggestion {
  clientName: string;
  clientPhone: string;
  address: string;
  serviceType: 'residential' | 'automotive' | 'commercial';
  lockType: string;
  problemDescription: string;
  urgency: 'standard' | 'urgent' | 'emergency';
  estimatedPrice: number | null;
  notes: string;
}

interface PendingJob {
  callId: string;
  callerPhone: string;
  duration: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  suggestion: AISuggestion | null;
  createdAt: string;
  status: 'awaiting_transcript' | 'ready';
}

const URGENCY_COLOR: Record<string, string> = {
  emergency: 'text-red-400 bg-red-500/10 border-red-500/20',
  urgent: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  standard: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const SERVICE_ICON: Record<string, string> = {
  residential: '🏠',
  automotive: '🚗',
  commercial: '🏢',
};

function generateJobNumber(): string {
  return `LK-${Math.floor(8000 + Math.random() * 2000)}`;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function formatDur(s: number | null): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export const PendingJobSuggestions: React.FC = () => {
  const { addJob } = useAppStore();
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/openphone/pending-jobs`);
      if (!res.ok) return;
      const data: PendingJob[] = await res.json();
      setPending(data.filter(p => p.status === 'ready'));
    } catch {
      // backend offline — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const dismiss = async (callId: string) => {
    try {
      await fetch(`${API_BASE}/api/openphone/pending-jobs/${callId}`, { method: 'DELETE' });
    } catch {}
    setPending(p => p.filter(x => x.callId !== callId));
  };

  const approve = async (pj: PendingJob) => {
    if (!pj.suggestion) return;
    setCreating(pj.callId);
    const s = pj.suggestion;
    const { firstName, lastName } = splitName(s.clientName || '');
    const today = new Date();
    const lockTypeMap: Record<string, 'Automotive' | 'Residential' | 'Commercial' | 'Secure / Safe' | 'Other'> = {
      automotive: 'Automotive',
      residential: 'Residential',
      commercial: 'Commercial',
    };

    addJob({
      jobNumber: generateJobNumber(),
      client: {
        id: `c-${Date.now()}`,
        firstName: firstName || 'Unknown',
        lastName,
        phone: s.clientPhone || pj.callerPhone,
        email: '',
        address: s.address || '',
      },
      lockDetails: {
        type: lockTypeMap[s.serviceType] || 'Other',
        brand: '',
        modelOrYear: s.lockType || '',
      },
      complaint: s.problemDescription || '',
      diagnosisNotes: s.notes || '',
      scheduledDate: today.toISOString().split('T')[0],
      scheduledTime: `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
      durationMinutes: 60,
      status: 'scheduled',
      lineItems: s.estimatedPrice
        ? [{ id: `li-${Date.now()}`, type: 'service_call', description: 'Estimate', unitPrice: s.estimatedPrice, quantity: 1 }]
        : [],
      paymentStatus: 'unpaid',
      totalAmount: s.estimatedPrice || 0,
      photos: [],
      messages: [],
    });

    await dismiss(pj.callId);
    setCreating(null);
  };

  if (pending.length === 0) return null;

  return (
    <div className="space-y-3 px-2 mb-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
          AI Job Suggestions ({pending.length})
        </span>
        <div className="flex-1 h-px bg-violet-500/20" />
      </div>

      {pending.map((pj) => {
        const s = pj.suggestion;
        const isExpanded = expanded === pj.callId;
        const urgencyClass = URGENCY_COLOR[s?.urgency || 'standard'];

        return (
          <div
            key={pj.callId}
            className="bg-violet-950/30 border border-violet-500/20 rounded-2xl overflow-hidden shadow-xl"
          >
            {/* Header row */}
            <div className="flex items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center text-lg shrink-0">
                  {SERVICE_ICON[s?.serviceType || ''] || '🔑'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white leading-none">
                      {s?.clientName || 'Unknown Caller'}
                    </p>
                    {s?.urgency && (
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${urgencyClass}`}>
                        {s.urgency}
                      </span>
                    )}
                    {!s && (
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border text-amber-400 bg-amber-500/10 border-amber-500/20">
                        transcript only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-semibold">
                    {pj.callerPhone} {pj.duration ? `· ${formatDur(pj.duration)}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setExpanded(isExpanded ? null : pj.callId)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Details"
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => dismiss(pj.callId)}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={() => approve(pj)}
                  disabled={creating === pj.callId}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle size={13} />
                  {creating === pj.callId ? 'Creating…' : 'Create Job'}
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-violet-500/10 pt-3">
                {s && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {s.address && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <MapPin size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{s.address}</span>
                        </div>
                      )}
                      {s.lockType && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <Lock size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{s.lockType}</span>
                        </div>
                      )}
                      {s.clientPhone && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <Phone size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{s.clientPhone}</span>
                        </div>
                      )}
                      {s.estimatedPrice && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <Clock size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>Est. ${s.estimatedPrice}</span>
                        </div>
                      )}
                    </div>
                    {s.problemDescription && (
                      <p className="text-xs text-slate-400 italic bg-slate-900/50 rounded-xl px-3 py-2 leading-relaxed">
                        "{s.problemDescription}"
                      </p>
                    )}
                  </>
                )}

                {pj.transcript && (
                  <details className="group">
                    <summary className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-300 transition-colors list-none">
                      <Mic size={10} />
                      View Transcript
                    </summary>
                    <pre className="mt-2 text-[10px] text-slate-500 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded-xl p-3 max-h-40 overflow-y-auto font-mono">
                      {pj.transcript}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
