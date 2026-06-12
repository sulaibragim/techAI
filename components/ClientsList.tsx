import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  User, Phone, Mail, MapPin, Briefcase, DollarSign, ChevronRight, Search,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageSquare, UserPlus, X,
  ThumbsUp, ThumbsDown, Minus, Star, AlertTriangle, Ban, StickyNote, Wrench,
} from 'lucide-react';
import { useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import { useAuthStore } from '../authStore';
import { Job, ClientRating, CLIENT_TAGS, NEGATIVE_TAGS } from '../types';
import { formatDate, formatTimestamp } from '../dateUtils';
import { ClientRecord, buildClients, normalizePhone, toE164US, formatPhone, clientFlags } from '../clientUtils';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';

interface CommEvent {
  id: string;
  kind: 'call' | 'sms';
  direction: 'incoming' | 'outgoing' | 'missed';
  body?: string;
  duration?: number;
  at: string;
}

function durLabel(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const tagClass = (t: string) =>
  NEGATIVE_TAGS.has(t)
    ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : t === 'VIP' || t === 'Frequent' || t === 'Referrer' || t === 'Big ticket'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-white/5 text-slate-300 border-white/10';

const RATING_META: Record<ClientRating, { label: string; icon: typeof ThumbsUp; cls: string }> = {
  good: { label: 'Good', icon: ThumbsUp, cls: 'bg-green-500/15 text-green-400 border-green-500/40' },
  neutral: { label: 'Neutral', icon: Minus, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/40' },
  difficult: { label: 'Difficult', icon: ThumbsDown, cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
};

const FILTERS = ['All', 'VIP', 'Difficult', 'Frequent', 'Slow payer'] as const;

export const ClientsList: React.FC<{
  onJobSelect?: (job: Job) => void;
  focusClientId?: string | null;
  onFocusConsumed?: () => void;
}> = ({ onJobSelect, focusClientId, onFocusConsumed }) => {
  const jobs = useVisibleJobs();
  const clientProfiles = useSettingsStore(s => s.clientProfiles);
  const upsertClientProfile = useSettingsStore(s => s.upsertClientProfile);
  const allUsers = useAuthStore(s => s.users);
  const technicians = useMemo(() => allUsers.filter(u => u.role === 'technician' && u.active), [allUsers]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [sms, setSms] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' });

  const clients = useMemo<ClientRecord[]>(() => buildClients(jobs, clientProfiles), [jobs, clientProfiles]);
  // Always re-derive the open profile from the live list so edits show instantly.
  const selected = selectedId ? clients.find(c => c.id === selectedId) || null : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, m] = await Promise.all([
          fetch(`${API_BASE}/api/openphone/calls`, { headers: { ...authHeaders() } }).then(r => r.ok ? r.json() : { data: [] }),
          fetch(`${API_BASE}/api/openphone/messages`, { headers: { ...authHeaders() } }).then(r => r.ok ? r.json() : { data: [] }),
        ]);
        if (!alive) return;
        setCalls(c.data || []);
        setSms(m.data || []);
      } catch { /* offline — no comms */ }
    })();
    return () => { alive = false; };
  }, []);

  const commsFor = (phone: string): CommEvent[] => {
    const key = normalizePhone(phone);
    if (key.length < 7) return [];
    const events: CommEvent[] = [];
    for (const c of calls) {
      if (normalizePhone(c.from) !== key && normalizePhone(c.to) !== key) continue;
      const inbound = c.direction === 'inbound' || c.direction === 'incoming';
      const missed = c.status === 'missed' || c.status === 'no-answer';
      events.push({ id: c.id, kind: 'call', direction: missed ? 'missed' : inbound ? 'incoming' : 'outgoing', duration: c.duration, at: c.createdAt });
    }
    for (const m of sms) {
      if (normalizePhone(m.from) !== key && normalizePhone(m.to) !== key) continue;
      events.push({ id: m.id, kind: 'sms', direction: m.direction === 'incoming' ? 'incoming' : 'outgoing', body: m.body, at: m.createdAt });
    }
    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  };

  useEffect(() => {
    if (!focusClientId) return;
    if (clients.some(c => c.id === focusClientId)) setSelectedId(focusClientId);
    onFocusConsumed?.();
  }, [focusClientId, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(c => {
      if (q && !`${c.firstName} ${c.lastName} ${c.phone} ${c.email}`.toLowerCase().includes(q)) return false;
      if (filter === 'All') return true;
      if (filter === 'Difficult') return c.rating === 'difficult' || c.tags.some(t => NEGATIVE_TAGS.has(t));
      const all = [...c.tags, ...c.autoTags];
      return all.includes(filter);
    });
  }, [clients, search, filter]);

  // ── reputation editing ──
  const toggleTag = (rec: ClientRecord, tag: string) => {
    const has = rec.tags.includes(tag);
    const tags = has ? rec.tags.filter(t => t !== tag) : [...rec.tags, tag];
    upsertClientProfile(rec.id, { tags });
  };
  const setRating = (rec: ClientRecord, rating: ClientRating) =>
    upsertClientProfile(rec.id, { rating: rec.rating === rating ? undefined : rating });
  const setNotes = (rec: ClientRecord, notes: string) => upsertClientProfile(rec.id, { notes });
  const setFavTech = (rec: ClientRecord, favoriteTechId: string) =>
    upsertClientProfile(rec.id, { favoriteTechId: favoriteTechId || undefined });

  const saveNewClient = () => {
    const phone = toE164US(draft.phone) || draft.phone.trim();
    const key = normalizePhone(phone);
    if (!draft.firstName.trim() && key.length < 7) return; // need at least a name or a real phone
    const id = key.length >= 7 ? key : `manual-${Date.now()}`;
    upsertClientProfile(id, {
      contact: {
        firstName: draft.firstName.trim() || 'Client',
        lastName: draft.lastName.trim(),
        phone, email: draft.email.trim(), address: draft.address.trim(),
      },
      tags: [],
    });
    setDraft({ firstName: '', lastName: '', phone: '', email: '', address: '' });
    setShowAdd(false);
    setSelectedId(id);
  };

  // ── PROFILE VIEW ──
  if (selected) {
    const flags = clientFlags(selected);
    const displayTags = Array.from(new Set([...selected.tags, ...selected.autoTags]));
    const favTechName = technicians.find(t => t.id === selected.favoriteTechId)?.name;
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 max-w-3xl mx-auto pb-24">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedId(null)} className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Client Profile</p>
            <h2 className="text-2xl font-bold text-white truncate">{selected.firstName} {selected.lastName}</h2>
          </div>
          {selected.rating && (() => { const m = RATING_META[selected.rating]; const Icon = m.icon; return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider ${m.cls}`}><Icon size={13} /> {m.label}</span>
          ); })()}
        </div>

        {/* Do-not-service / difficult banner */}
        {flags.doNotService ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
            <Ban size={20} className="text-red-400 shrink-0" />
            <p className="text-sm font-bold text-red-300">Do not service — flagged. Confirm with the owner before booking.</p>
          </div>
        ) : flags.tone === 'danger' && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-red-300/90">Difficult client — brief the tech before the visit.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Jobs', value: selected.jobs.length, icon: Briefcase },
            { label: 'Total Spent', value: `$${selected.totalSpend.toLocaleString()}`, icon: DollarSign },
            { label: selected.isStandalone ? 'Added' : 'Last Visit', value: formatDate(selected.lastJobDate), icon: ChevronRight },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-slate-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center"><Icon size={16} className="text-blue-400" /></div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* REPUTATION */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 space-y-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Reputation</h3>

          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Rating</p>
            <div className="flex gap-2">
              {(['good', 'neutral', 'difficult'] as ClientRating[]).map(r => {
                const m = RATING_META[r]; const Icon = m.icon; const active = selected.rating === r;
                return (
                  <button key={r} onClick={() => setRating(selected, r)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${active ? m.cls : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
                    <Icon size={14} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Flags</p>
            <div className="flex flex-wrap gap-2">
              {CLIENT_TAGS.map(tag => {
                const on = selected.tags.includes(tag);
                return (
                  <button key={tag} onClick={() => toggleTag(selected, tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${on ? tagClass(tag) : 'bg-white/5 text-slate-500 border-white/10 hover:text-white'}`}>
                    {tag}
                  </button>
                );
              })}
            </div>
            {selected.autoTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Auto:</span>
                {selected.autoTags.map(t => (
                  <span key={t} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${tagClass(t)} opacity-80`}>{t}</span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Wrench size={11} /> Preferred technician</p>
              <select value={selected.favoriteTechId || ''} onChange={e => setFavTech(selected, e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 [&>option]:bg-slate-900">
                <option value="">No preference</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><StickyNote size={11} /> Private note (tech sees this)</p>
              <input defaultValue={selected.notes || ''} onBlur={e => { if (e.target.value !== (selected.notes || '')) setNotes(selected, e.target.value); }}
                placeholder="e.g. has a dog, gate code changes…"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
            </div>
          </div>
        </div>

        {/* CONTACT */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Contact</h3>
          <div className="space-y-3">
            {selected.phone && <div className="flex items-center gap-3 text-sm"><Phone size={14} className="text-blue-400 shrink-0" /><span className="text-white">{formatPhone(selected.phone)}</span></div>}
            {selected.email && <div className="flex items-center gap-3 text-sm"><Mail size={14} className="text-blue-400 shrink-0" /><span className="text-white">{selected.email}</span></div>}
            {selected.address && <div className="flex items-center gap-3 text-sm"><MapPin size={14} className="text-blue-400 shrink-0" /><span className="text-slate-300">{selected.address}</span></div>}
          </div>
        </div>

        {/* COMMS */}
        {(() => {
          const comms = commsFor(selected.phone);
          if (comms.length === 0) return null;
          const callCount = comms.filter(c => c.kind === 'call').length;
          const smsCount = comms.filter(c => c.kind === 'sms').length;
          const ICON = {
            incoming: <PhoneIncoming size={13} className="text-green-400" />,
            outgoing: <PhoneOutgoing size={13} className="text-blue-400" />,
            missed: <PhoneMissed size={13} className="text-red-400" />,
          };
          return (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Communication · <span className="text-slate-500">{callCount} call{callCount !== 1 ? 's' : ''}, {smsCount} SMS</span></h3>
              <div className="bg-slate-900 border border-white/5 rounded-2xl divide-y divide-white/5 max-h-72 overflow-y-auto">
                {comms.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                      {ev.kind === 'sms' ? <MessageSquare size={13} className={ev.direction === 'incoming' ? 'text-green-400' : 'text-blue-400'} /> : ICON[ev.direction]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-300 capitalize">
                          {ev.kind === 'sms' ? `SMS ${ev.direction === 'incoming' ? 'received' : 'sent'}` : `${ev.direction} call`}
                          {ev.kind === 'call' && ev.duration ? <span className="text-slate-500 font-semibold"> · {durLabel(ev.duration)}</span> : ''}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold shrink-0">{formatTimestamp(ev.at)}</span>
                      </div>
                      {ev.body && <p className="text-xs text-slate-400 mt-1 leading-relaxed break-words">{ev.body}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* JOB HISTORY */}
        {selected.jobs.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Job History</h3>
            {selected.jobs.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).map(job => (
              <motion.div key={job.id} whileHover={{ x: 4 }} onClick={() => onJobSelect?.(job)}
                className="bg-slate-900 border border-white/5 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-blue-500/20 transition-all">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">#{job.jobNumber}</p>
                  <p className="text-sm font-semibold text-white">{job.lockDetails.type} — {job.lockDetails.brand || 'N/A'}</p>
                  <p className="text-xs text-slate-500">{formatDate(job.scheduledDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">${job.totalAmount}</p>
                  <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${job.status === 'completed' ? 'bg-green-500/10 text-green-400' : job.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{job.status}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── LIST VIEW ──
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1">Client Database</p>
          <h2 className="text-2xl font-bold text-white">{clients.length} Clients</h2>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 transition-all">
          {showAdd ? <X size={14} /> : <UserPlus size={14} />} {showAdd ? 'Cancel' : 'Add client'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={draft.firstName} onChange={e => setDraft({ ...draft, firstName: e.target.value })} placeholder="First name" className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
            <input value={draft.lastName} onChange={e => setDraft({ ...draft, lastName: e.target.value })} placeholder="Last name" className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
            <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone (just digits — +1 is auto)" inputMode="tel" className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
            <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email (optional)" className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
          </div>
          <input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} placeholder="Address (optional)" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-slate-600" />
          <button onClick={saveNewClient} disabled={!draft.firstName.trim() && normalizePhone(draft.phone).length < 7}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            Save client
          </button>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email…"
          className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${filter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <User size={28} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-semibold">No clients found</p>
          </div>
        )}
        {filtered.map((client, i) => {
          const flags = clientFlags(client);
          const border = flags.tone === 'danger' ? 'border-red-500/30 hover:border-red-500/50'
            : flags.tone === 'vip' ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-white/5 hover:border-blue-500/20';
          const avatar = flags.tone === 'danger' ? 'bg-red-500/15 text-red-300'
            : flags.tone === 'vip' ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-600/10 text-blue-400';
          const chips = Array.from(new Set([...client.tags, ...client.autoTags])).slice(0, 3);
          return (
            <motion.div key={client.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              whileHover={{ x: 4 }} onClick={() => setSelectedId(client.id)}
              className={`bg-slate-900 border rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all ${border}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold ${avatar}`}>
                {(client.firstName[0] || '?')}{(client.lastName[0] || '')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white truncate">{client.firstName} {client.lastName}</p>
                  {flags.doNotService && <Ban size={13} className="text-red-400 shrink-0" />}
                  {!flags.doNotService && flags.tone === 'danger' && <AlertTriangle size={13} className="text-red-400 shrink-0" />}
                  {flags.tone === 'vip' && <Star size={13} className="text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{formatPhone(client.phone)}</p>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {chips.map(t => <span key={t} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tagClass(t)}`}>{t}</span>)}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-white">${client.totalSpend.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">{client.isStandalone ? 'No jobs yet' : `${client.jobs.length} job${client.jobs.length !== 1 ? 's' : ''}`}</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 shrink-0" />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};
