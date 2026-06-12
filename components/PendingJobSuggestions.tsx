import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store';
import { useAuthStore } from '../authStore';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { TechStatus, Message, Job } from '../types';
import { normalizePhone, toE164US } from '../clientUtils';
import { Sparkles, Phone, MapPin, Lock, Clock, CheckCircle, X, ChevronDown, ChevronUp, Mic, UserCheck, Circle, Car, FileText, Star, AlertTriangle, ThumbsUp, ThumbsDown, Info, User, Link2 } from 'lucide-react';

const OPEN_STATUSES = new Set(['scheduled', 'enRoute', 'onSite', 'diagnosed', 'sold', 'waitingParts', 'coffee']);

interface CallQuality {
  rating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  strengths: string[];
  improvements: string[];
  missedInfo: string[];
}

interface AISuggestion {
  clientName: string;
  clientPhone: string;
  address: string;
  serviceType: 'residential' | 'automotive' | 'commercial';
  lockType: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  problemDescription: string;
  urgency: 'standard' | 'urgent' | 'emergency';
  estimatedPrice: number | null;
  notes: string;
  callSummary: string;
  callQuality: CallQuality | null;
}

interface PendingJob {
  callId: string;
  callerPhone: string;
  duration: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  suggestion: AISuggestion | null;
  openPhoneSummary: string | null;
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

const QUALITY_BADGE: Record<string, { color: string; icon: typeof Star; label: string }> = {
  excellent: { color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: Star, label: 'Excellent' },
  good: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: ThumbsUp, label: 'Good' },
  needs_improvement: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: AlertTriangle, label: 'Needs Work' },
  poor: { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: ThumbsDown, label: 'Poor' },
};

const STATUS_DOT: Record<TechStatus, { color: string; label: string }> = {
  available: { color: 'text-green-400', label: 'Available' },
  onJob: { color: 'text-amber-400', label: 'On Job' },
  offDuty: { color: 'text-slate-500', label: 'Off Duty' },
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

export const PendingJobSuggestions: React.FC<{ onJobCreated?: (job: import('../types').Job) => void }> = ({ onJobCreated }) => {
  const { addJob, jobs, updateJob } = useAppStore();
  const { users } = useAuthStore();
  const technicians = users.filter(u => u.role === 'technician' && u.active);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState<Record<string, string>>({});
  // Editable client fields, so a caller the AI couldn't identify can be named before creating.
  const [editFields, setEditFields] = useState<Record<string, { name?: string; phone?: string; address?: string }>>({});
  const setField = (callId: string, key: 'name' | 'phone' | 'address', value: string) =>
    setEditFields(prev => ({ ...prev, [callId]: { ...prev[callId], [key]: value } }));
  const seenRef = useRef<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/openphone/pending-jobs`, { headers: { ...authHeaders() } });
      if (!res.ok) return;
      const data: PendingJob[] = await res.json();
      setPending(data.filter(p => p.status === 'ready'));
    } catch {}
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  // Auto-open a newly arrived card so its actions (assign / create) are immediately
  // visible — don't make the user hunt for the expand chevron. Only fires once per
  // card, so a manual collapse sticks.
  useEffect(() => {
    for (const pj of pending) {
      if (!seenRef.current.has(pj.callId)) {
        seenRef.current.add(pj.callId);
        setExpanded(pj.callId);
      }
    }
  }, [pending]);

  const dismiss = async (callId: string) => {
    try {
      await fetch(`${API_BASE}/api/openphone/pending-jobs/${callId}`, { method: 'DELETE', headers: { ...authHeaders() } });
    } catch {}
    setPending(p => p.filter(x => x.callId !== callId));
  };

  const approve = async (pj: PendingJob) => {
    setCreating(pj.callId);
    const s = pj.suggestion; // may be null (transcript-only or AI extraction failed)
    const edited = editFields[pj.callId] || {};
    const nameVal = (edited.name ?? s?.clientName ?? '').trim();
    const rawPhone = (edited.phone ?? s?.clientPhone ?? pj.callerPhone ?? '').trim();
    const phoneVal = toE164US(rawPhone) || rawPhone;
    const addressVal = (edited.address ?? s?.address ?? '').trim();
    const { firstName, lastName } = splitName(nameVal);
    const today = new Date();
    const lockTypeMap: Record<string, 'Automotive' | 'Residential' | 'Commercial' | 'Secure / Safe' | 'Other'> = {
      automotive: 'Automotive',
      residential: 'Residential',
      commercial: 'Commercial',
    };

    const assignedTechId = selectedTech[pj.callId] || undefined;

    const createdJob = addJob({
      jobNumber: generateJobNumber(),
      client: {
        id: `c-${Date.now()}`,
        firstName: firstName || 'Unknown',
        lastName,
        phone: phoneVal,
        email: '',
        address: addressVal,
      },
      lockDetails: {
        type: lockTypeMap[s?.serviceType || ''] || 'Other',
        brand: s?.vehicleMake || '',
        modelOrYear: s?.vehicleYear && s?.vehicleModel
          ? `${s.vehicleYear} ${s.vehicleModel}`
          : s?.vehicleModel || s?.vehicleYear || s?.lockType || '',
      },
      complaint: s?.problemDescription || (pj.transcript ? 'Created from call — see transcript' : ''),
      diagnosisNotes: s?.notes || '',
      scheduledDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      scheduledTime: `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`,
      durationMinutes: 60,
      status: 'scheduled',
      lineItems: s?.estimatedPrice
        ? [{ id: `li-${Date.now()}`, type: 'service_call', description: 'Estimate', unitPrice: s.estimatedPrice, quantity: 1 }]
        : [],
      paymentStatus: 'unpaid',
      totalAmount: s?.estimatedPrice || 0,
      photos: [],
      messages: [],
      assignedTo: assignedTechId,
      // Mirror the wizard: an assigned tech must accept/decline; unassigned stays clear.
      acceptanceStatus: assignedTechId ? 'pending' : undefined,
      callSummary: s?.callSummary || pj.openPhoneSummary || undefined,
      callQuality: s?.callQuality || undefined,
      callTranscript: pj.transcript || undefined,
    });

    await dismiss(pj.callId);
    setCreating(null);

    if (createdJob && onJobCreated) {
      onJobCreated(createdJob);
    }
  };

  // The most recent still-open job for the caller's number — lets a callback about an
  // existing job attach its summary there instead of spawning a duplicate job.
  const findOpenJob = (pj: PendingJob): Job | null => {
    const key = normalizePhone(pj.suggestion?.clientPhone || pj.callerPhone);
    if (key.length < 7) return null;
    const matches = jobs
      .filter(j => OPEN_STATUSES.has(j.status) && normalizePhone(j.client?.phone) === key)
      .sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));
    return matches[0] || null;
  };

  const attachToJob = async (pj: PendingJob, job: Job) => {
    setCreating(pj.callId);
    const s = pj.suggestion;
    const summary = s?.callSummary || pj.openPhoneSummary || '';
    const note: Message = {
      id: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sender: 'system',
      method: 'voice',
      content: `📞 Follow-up call${pj.duration ? ` (${formatDur(pj.duration)})` : ''}${summary ? `: ${summary}` : ' — see transcript'}`,
    };
    updateJob({
      ...job,
      callSummary: job.callSummary || summary || undefined,
      callQuality: job.callQuality || s?.callQuality || undefined,
      callTranscript: pj.transcript || job.callTranscript,
      messages: [...(job.messages || []), note],
    });
    await dismiss(pj.callId);
    setCreating(null);
    onJobCreated?.(job);
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
        const openJob = findOpenJob(pj);

        return (
          <div
            key={pj.callId}
            className="bg-violet-950/30 border border-violet-500/20 rounded-2xl overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between p-4 gap-3">
              <div
                onClick={() => setExpanded(isExpanded ? null : pj.callId)}
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              >
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
                    {openJob && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border text-cyan-400 bg-cyan-500/10 border-cyan-500/20">
                        <Link2 size={9} /> open job #{openJob.jobNumber}
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
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-violet-500/10 pt-3">
                {s && (
                  <>
                    {/* Call Summary */}
                    {(s.callSummary || pj.openPhoneSummary) && (
                      <div className="bg-slate-900/60 rounded-xl p-3 space-y-1.5 border border-white/5">
                        <div className="flex items-center gap-1.5">
                          <FileText size={11} className="text-violet-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Call Summary</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {s.callSummary || pj.openPhoneSummary}
                        </p>
                      </div>
                    )}

                    {/* Call Quality Assessment */}
                    {s.callQuality && (() => {
                      const q = s.callQuality;
                      const badge = QUALITY_BADGE[q.rating] || QUALITY_BADGE.good;
                      const BadgeIcon = badge.icon;
                      return (
                        <div className="bg-slate-900/60 rounded-xl p-3 space-y-2 border border-white/5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Star size={11} className="text-amber-400" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Call Quality</span>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${badge.color}`}>
                              <BadgeIcon size={9} className="inline mr-1" />{badge.label}
                            </span>
                          </div>
                          {q.strengths?.length > 0 && (
                            <div className="space-y-0.5">
                              {q.strengths.map((s, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[11px] text-green-400/80">
                                  <span className="mt-0.5">+</span>
                                  <span>{s}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {q.improvements?.length > 0 && (
                            <div className="space-y-0.5">
                              {q.improvements.map((s, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400/80">
                                  <span className="mt-0.5">!</span>
                                  <span>{s}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {q.missedInfo?.length > 0 && (
                            <div className="space-y-0.5">
                              {q.missedInfo.map((s, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-400/60">
                                  <Info size={9} className="mt-0.5 shrink-0" />
                                  <span>Missing: {s}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {s.address && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <MapPin size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{s.address}</span>
                        </div>
                      )}
                      {s.vehicleMake && (
                        <div className="flex items-start gap-2 text-xs text-slate-300">
                          <Car size={12} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{[s.vehicleYear, s.vehicleMake, s.vehicleModel].filter(Boolean).join(' ')}</span>
                        </div>
                      )}
                      {!s.vehicleMake && s.lockType && (
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
                      View Full Transcript
                    </summary>
                    <pre className="mt-2 text-[10px] text-slate-500 leading-relaxed whitespace-pre-wrap bg-slate-900/50 rounded-xl p-3 max-h-40 overflow-y-auto font-mono">
                      {pj.transcript}
                    </pre>
                  </details>
                )}

                {/* Editable client — name a caller the AI couldn't identify before creating */}
                <div className="bg-slate-900/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <User size={11} className="text-violet-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</span>
                  </div>
                  <input
                    value={editFields[pj.callId]?.name ?? s?.clientName ?? ''}
                    onChange={e => setField(pj.callId, 'name', e.target.value)}
                    placeholder="Client name"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-violet-500/50"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <input
                      value={editFields[pj.callId]?.phone ?? s?.clientPhone ?? pj.callerPhone ?? ''}
                      onChange={e => setField(pj.callId, 'phone', e.target.value)}
                      placeholder="Phone"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-violet-500/50"
                    />
                    <input
                      value={editFields[pj.callId]?.address ?? s?.address ?? ''}
                      onChange={e => setField(pj.callId, 'address', e.target.value)}
                      placeholder="Address"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                {/* Assign technician */}
                {technicians.length > 0 && (
                  <div className="bg-slate-900/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <UserCheck size={11} className="text-violet-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Assign Technician</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {technicians.map(tech => {
                        const st = STATUS_DOT[tech.techStatus || 'offDuty'];
                        const isSelected = selectedTech[pj.callId] === tech.id;
                        return (
                          <button
                            key={tech.id}
                            onClick={() => setSelectedTech(prev => ({ ...prev, [pj.callId]: isSelected ? '' : tech.id }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'border-violet-500/50 bg-violet-500/10 text-white'
                                : 'border-white/5 bg-white/5 text-slate-300 hover:border-white/20'
                            }`}
                          >
                            <Circle size={8} className={`${st.color} fill-current`} />
                            <span className="text-xs font-semibold flex-1">{tech.name}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-wide ${st.color}`}>{st.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Attach to an existing open job — shown when the caller has one in flight */}
                {openJob && (
                  <button
                    onClick={() => attachToJob(pj, openJob)}
                    disabled={creating === pj.callId}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 text-cyan-300 text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <Link2 size={14} />
                    {creating === pj.callId ? 'Attaching…' : `Attach call to job #${openJob.jobNumber} (${openJob.client.firstName})`}
                  </button>
                )}

                {/* Create Job button — always available, even when the AI extracted nothing */}
                <button
                  onClick={() => approve(pj)}
                  disabled={creating === pj.callId}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  {creating === pj.callId
                    ? 'Creating…'
                    : selectedTech[pj.callId]
                      ? `Assign to ${technicians.find(t => t.id === selectedTech[pj.callId])?.name} & Create Job`
                      : openJob ? 'Create Separate Job' : 'Create Job (Unassigned)'
                  }
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
