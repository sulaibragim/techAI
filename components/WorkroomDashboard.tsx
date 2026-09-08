
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, Clock, Target,
  AlertCircle, Activity, Plus, ChevronLeft, ChevronRight,
  ArrowLeft, Zap, Shield, Bell, Phone, MapPin, Globe, User, MoveRight, X, Wallet
} from 'lucide-react';
import { useAppStore, useVisibleJobs } from '../store';
import { useAuthStore, useCurrentUser, worksField } from '../authStore';
import { useSettingsStore } from '../settingsStore';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { calculateFinancialMetrics, revenueOnDay, technicianDay, accountsReceivable } from '../financialUtils';
import { PendingJobSuggestions } from './PendingJobSuggestions';
import { OnboardingChecklist } from './OnboardingChecklist';

// Short two-note chime via Web Audio (no asset file). Best-effort — silent if the browser blocks it.
function playLeadChime() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      const t = start + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.start(t);
      o.stop(t + 0.34);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {}
}

// --- SUB-COMPONENTS ---

const Speedometer: React.FC<{ closeRate: number; target: number }> = ({ closeRate, target }) => {
  const rotation = (closeRate / 100) * 180;
  const getColor = (rate: number) => {
    if (rate < 35) return '#ef4444';
    if (rate < 50) return '#f59e0b';
    if (rate < 70) return '#00E5FF';
    return '#10b981';
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="bg-slate-900 p-4 rounded-2xl border border-blue-500/10 shadow-[0_0_30px_rgba(0,229,255,0.05)] flex flex-col items-center relative overflow-hidden"
    >
      <p className="text-xs font-semibold uppercase text-blue-400 tracking-wider mb-5">Performance</p>
      <div className="relative w-full max-w-[180px]">
        <svg viewBox="0 0 200 120" className="w-full h-auto">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1f2937" strokeWidth="18" strokeLinecap="round" />
          <motion.path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={getColor(closeRate)}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`0 251`}
            animate={{ strokeDasharray: `${(rotation / 180) * 251} 251` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          <motion.line
            x1="100" y1="100"
            x2={100 + 75 * Math.cos((rotation - 180) * Math.PI / 180)}
            y2={100 + 75 * Math.sin((rotation - 180) * Math.PI / 180)}
            stroke="white" strokeWidth="4" strokeLinecap="round"
            initial={{ rotate: -90, transformOrigin: '100px 100px' }}
            animate={{ rotate: rotation - 180 + 90 }}
            transition={{ duration: 1.5, ease: "backOut" }}
          />
          <circle cx="100" cy="100" r="6" fill="white" />
        </svg>
        <div className="absolute bottom-0 inset-x-0 flex flex-col items-center">
          <span className="text-2xl font-extrabold text-white tracking-tight">{closeRate.toFixed(0)}%</span>
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider mt-0.5">Close Rate</span>
        </div>
      </div>
    </motion.div>
  );
};

const DailyGoalTracker: React.FC<{ current: number; target: number }> = ({ current, target }) => {
  const percentage = (current / target) * 100;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-slate-900 p-4 rounded-2xl border border-blue-500/20 shadow-[0_0_40px_rgba(0,229,255,0.1)] space-y-4 relative overflow-hidden"
    >
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-300 tracking-wider mb-2">Daily Target</h3>
          <p className="text-2xl font-extrabold text-white tracking-tight">
            ${current.toLocaleString()}
            <span className="text-sm font-bold text-slate-500 ml-3">/ ${target.toLocaleString()}</span>
          </p>
        </div>
        <div className="text-right">
          <span className={`text-xl font-bold ${percentage >= 100 ? 'text-blue-400 shadow-lg' : 'text-blue-400'}`}>{Math.round(percentage)}%</span>
        </div>
      </div>

      <div className="relative h-5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
        <motion.div
          className={`h-full rounded-full ${percentage >= 100 ? 'bg-blue-600 shadow-lg' : 'bg-blue-500/80'}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percentage, 100)}%` }}
          transition={{ duration: 1.5, ease: "circOut" }}
        />
      </div>
    </motion.div>
  );
};

const KanbanCard: React.FC<{
  job: Job;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent, job: Job) => void;
  onRequestMove: (job: Job) => void;
}> = ({ job, onSelect, onDragStart, onRequestMove }) => {
  const tech = useAuthStore(s => (job.assignedTo ? s.users.find(u => u.id === job.assignedTo) : null));
  return (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileTap={{ scale: 0.98 }}
    draggable
    onDragStart={(e: any) => onDragStart(e, job)}
    onClick={onSelect}
    className={`relative bg-slate-900 p-4 rounded-xl border shadow-lg mb-3 md:cursor-grab md:active:cursor-grabbing transition-colors group shrink-0 w-full ${job.isNewLead ? 'border-amber-500/60 ring-1 ring-amber-500/40 shadow-amber-500/10 hover:border-amber-400' : 'border-white/10 hover:border-blue-500/50'}`}
  >
    {/* Touch devices get no drag events at all, so the board was read-only on a phone.
        This opens a "move to" sheet — the same action, reachable with a thumb. */}
    <button
      aria-label="Move this job"
      onClick={(e) => { e.stopPropagation(); onRequestMove(job); }}
      className="md:hidden absolute top-2 right-2 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/20"
    >
      <MoveRight size={16} />
    </button>
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center space-x-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${job.isNewLead ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-blue-400'}`}>
          {job.isNewLead ? <Globe size={14} /> : <Clock size={14} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-white tracking-tight truncate max-w-[130px]">{job.client.firstName} {job.client.lastName}</p>
          <p className="text-xs font-medium text-slate-400 mt-0.5">{job.isNewLead ? job.client.phone : job.scheduledTime}</p>
        </div>
      </div>
      {job.isNewLead ? (
        <span className="bg-amber-500/15 text-amber-400 px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider">🌐 Web</span>
      ) : job.distance ? (
        // Only render a distance we actually have. The old `job.distance || '2.1'`
        // fallback printed an invented number on every card, and dispatch sequenced the
        // day off it — `distance` is never assigned anywhere in the app.
        <div className="bg-white/5 px-2 py-1 rounded-lg text-xs font-medium text-slate-300">{job.distance} mi</div>
      ) : null}
    </div>
    <p className="text-xs font-medium text-slate-300 mb-3 truncate">{job.isNewLead ? (job.complaint || 'New website lead') : [job.lockDetails.type, job.lockDetails.brand].filter(Boolean).join(' — ')}</p>

    <div className="mb-3">
      {tech ? (
        <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-md text-[10px] font-bold max-w-full truncate" title={`Assigned to ${tech.name}`}>
          <User size={10} className="shrink-0" /> {tech.name}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md text-[10px] font-bold" title="No technician assigned yet">
          <User size={10} className="shrink-0" /> Unassigned
        </span>
      )}
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-white/10">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-bold text-blue-400">${job.totalAmount > 0 ? job.totalAmount.toLocaleString() : 'TBD'}</span>
        {job.totalAmount > 0 && job.status !== 'cancelled' && job.paymentStatus !== 'paid' && (
          <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">
            {job.paymentStatus === 'partial' ? `Due $${Math.max(0, job.totalAmount - (job.amountPaid || 0)).toFixed(0)}` : 'Unpaid'}
          </span>
        )}
      </span>
      <div className="flex items-center space-x-1.5">
         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
         <span className="text-xs font-medium text-slate-300 capitalize">{job.status}</span>
      </div>
    </div>
  </motion.div>
  );
};

export const WorkroomDashboard: React.FC<{ onJobSelect: (job: Job) => void; onAddJob: () => void }> = ({ onJobSelect, onAddJob }) => {
  const { updateJobStatus, updateJob } = useAppStore();
  const currentUser = useCurrentUser();
  const isTechUser = currentUser?.role === 'technician';
  // An owner/manager who works jobs earns commission too, so they get the same
  // "what I made today" card — WITHOUT taking on any technician view restriction.
  const earnsCommission = !!currentUser && worksField(currentUser);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const jobs = useVisibleJobs();
  const { monthlyRevenueTarget, monthlyTargets, dailyRevenueTarget } = useSettingsStore();
  const nowRef = new Date();
  const effectiveMonthlyTarget = monthlyTargets[`${nowRef.getFullYear()}-${String(nowRef.getMonth() + 1).padStart(2, '0')}`] ?? monthlyRevenueTarget;
  const metrics = useMemo(() => calculateFinancialMetrics(jobs, effectiveMonthlyTarget), [jobs, effectiveMonthlyTarget]);

  // Unhandled website leads — surfaced in their own banner + Kanban column until taken.
  const newLeads = useMemo(() => jobs.filter(j => j.isNewLead), [jobs]);

  // Chime when a new lead arrives while the dashboard is open (not on first load).
  const prevLeadCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevLeadCount.current !== null && newLeads.length > prevLeadCount.current) playLeadChime();
    prevLeadCount.current = newLeads.length;
  }, [newLeads.length]);

  // Opening a lead marks it handled (clears the "new" flag) and opens the job card.
  const openLead = (job: Job) => {
    if (job.isNewLead) updateJob({ ...job, isNewLead: false });
    onJobSelect(job);
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [popDay, setPopDay] = useState<{ day: number; cx: number; cy: number; cw: number; ch: number } | null>(null);
  // Touch alternative to dragging a Kanban card, plus the reason when a move is refused.
  const [movingJob, setMovingJob] = useState<Job | null>(null);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('en-US', { month: 'long' });

  const calendarDays = useMemo(() => {
    const days = [];
    const startOffset = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [year, month]);

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(dateStr);
  };

  const getJobsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return jobs.filter(j => j.scheduledDate === dateStr);
  };

  const handleCellHover = (day: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setPopDay({ day, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, cw: rect.width, ch: rect.height });
  };

  const handleCellLeave = () => {
    hoverTimer.current = setTimeout(() => setPopDay(null), 120);
  };

  const handlePopupEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };

  const handlePopupLeave = () => {
    setPopDay(null);
  };

  const pipelineColumns = [
    { id: 'leads', label: 'New Leads', statuses: [] as JobStatus[], defaultStatus: 'scheduled' as JobStatus, isLeads: true },
    { id: 'new', label: 'New Tasks', statuses: ['scheduled', 'enRoute', 'onSite'] as JobStatus[], defaultStatus: 'scheduled' as JobStatus, isLeads: false },
    { id: 'diagnostics', label: 'In Progress', statuses: ['diagnosed', 'sold', 'waitingParts', 'coffee'] as JobStatus[], defaultStatus: 'diagnosed' as JobStatus, isLeads: false },
    { id: 'completed', label: 'Closed', statuses: ['completed', 'cancelled'] as JobStatus[], defaultStatus: 'completed' as JobStatus, isLeads: false }
  ];

  // New leads live in their own column; every other column excludes them so a lead shows once.
  const jobsInColumn = (col: typeof pipelineColumns[number]) =>
    col.isLeads ? newLeads : jobs.filter(j => !j.isNewLead && col.statuses.includes(j.status));

  const handleDragStart = (e: React.DragEvent, job: Job) => {
    e.dataTransfer.setData('jobId', job.id);
  };

  /**
   * Move a job into a pipeline column. Shared by drag-and-drop (desktop) and the move
   * menu (touch) — HTML5 drag events never fire on a phone, so the board used to be a
   * picture there, with `cursor-grab` advertising a gesture that didn't exist.
   * Returns a reason when the move is refused, so the caller can say why instead of the
   * card just snapping back.
   */
  const moveJobToColumn = (jobId: string, columnId: string): string | null => {
    const col = pipelineColumns.find(c => c.id === columnId);
    if (!col) return null;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;

    // Dropping a card back where it already is must not rewrite its status: "In Progress"
    // always wrote `diagnosed`, so a job that was already `sold` lost the sale, and "New
    // Tasks" dragged an `onSite` job back to `scheduled`.
    if (!col.isLeads && col.statuses.includes(job.status) && !job.isNewLead) return null;

    if (col.isLeads) {
      if (!job.isNewLead) updateJob({ ...job, isNewLead: true }); // rare: re-flag
      return null;
    }
    // Techs can't close a job until the money has actually landed — unless there's
    // nothing to collect (a $0 warranty callback).
    if (isTechUser && col.defaultStatus === 'completed' && job.paymentStatus !== 'paid' && (job.totalAmount || 0) > 0.01) {
      return 'This job can’t be closed until the payment has landed.';
    }
    // Moving into a status column clears the lead flag and sets the status in one write.
    if (job.isNewLead) updateJob({ ...job, isNewLead: false, status: col.defaultStatus });
    else updateJobStatus(jobId, col.defaultStatus);
    return null;
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const refusal = moveJobToColumn(e.dataTransfer.getData('jobId'), columnId);
    if (refusal) setMoveNotice(refusal);
  };

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todaysJobs = jobs.filter(j => j.scheduledDate === todayStr);
  // Recognise today's money the same way every other screen does — on the day the work
  // was FINISHED. Keyed to scheduledDate, a job booked yesterday and closed today was
  // counted on neither day: yesterday it wasn't complete, today it isn't scheduled. The
  // daily target tracker reads this, so it silently never saw that revenue at all.
  const todaysRevenue = revenueOnDay(jobs, todayStr);

  // A tech's own numbers for today; the owner's view of who owes money.
  const myDay = useMemo(
    () => (earnsCommission && currentUser ? technicianDay(jobs, currentUser.id, currentUser.commissionRate ?? 0, todayStr) : null),
    [earnsCommission, currentUser, jobs, todayStr]
  );
  const debtors = useMemo(() => {
    const rows = accountsReceivable(jobs);
    const dayMs = 86400000;
    const age = (d: string) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / dayMs)) : 0);
    return {
      total: Math.round(rows.reduce((s, r) => s + r.balance, 0)),
      count: rows.length,
      oldestDays: rows.reduce((m, r) => Math.max(m, age(r.date)), 0),
      top: [...rows].sort((a, b) => b.balance - a.balance).slice(0, 3),
    };
  }, [jobs]);

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-700">

      {/* Setup progress — hides itself once the account is past its first paid job */}
      <OnboardingChecklist onAddJob={onAddJob} />

      {/* New website leads — loud "don't miss it" banner */}
      <AnimatePresence>
        {newLeads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 shadow-[0_0_30px_rgba(245,158,11,0.08)]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Bell size={16} className="animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-300 tracking-tight">
                  {newLeads.length === 1 ? 'New website lead' : `${newLeads.length} new website leads`}
                </p>
                <p className="text-xs text-amber-400/70 font-medium">Grab it before the lead goes cold</p>
              </div>
            </div>
            <div className="space-y-2">
              {newLeads.slice(0, 4).map(lead => (
                <div key={lead.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <Globe size={14} className="text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{lead.client.firstName} {lead.client.lastName}</p>
                    <p className="text-xs text-slate-400 truncate flex items-center gap-3">
                      {lead.client.phone && <span className="flex items-center gap-1 shrink-0"><Phone size={10} />{lead.client.phone}</span>}
                      {lead.client.address && <span className="flex items-center gap-1 truncate"><MapPin size={10} />{lead.client.address}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => openLead(lead)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 shrink-0"
                  >
                    Open
                  </button>
                </div>
              ))}
              {newLeads.length > 4 && (
                <p className="text-xs text-amber-400/70 font-medium pl-1">…and {newLeads.length - 4} more — see the New Leads column below</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI pending job suggestions from call transcripts */}
      <PendingJobSuggestions onJobCreated={onJobSelect} />

      {/* 1. COMMAND KPI BAR */}
      <div className="flex gap-4 overflow-x-auto scrollbar-hide py-1">
        <AnimatePresence>
          {[
            { label: 'Revenue', value: `$${metrics.totalRevenue.toLocaleString()}`, detail: 'This month', icon: DollarSign, color: 'blue' },
            { label: 'Close Rate', value: `${metrics.closeRate.toFixed(0)}%`, detail: 'Sold vs visited', icon: Target, color: 'cyan' },
            { label: 'Total Jobs', value: jobs.length, detail: 'In system', icon: Activity, color: 'slate' },
            { label: 'Completed', value: jobs.filter(j => j.status === 'completed').length, detail: 'Jobs closed', icon: Shield, color: 'cyan' }
          ].map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`bg-slate-900 p-4 rounded-2xl border border-white/10 min-w-[160px] flex-1 flex flex-col justify-between shadow-lg group hover:border-blue-500/30 transition-colors cursor-default relative overflow-hidden`}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-all" />
               <div className={`flex items-center space-x-2 mb-3 text-slate-400 group-hover:text-blue-400 transition-colors`}>
                  <card.icon size={14} />
                  <span className="text-xs font-semibold tracking-wider uppercase">{card.label}</span>
               </div>
               <p className="text-2xl font-bold text-white tracking-tight tabular-nums">{card.value}</p>
               <p className={`text-xs font-medium mt-2 ${card.color === 'cyan' ? 'text-blue-400' : 'text-slate-300'}`}>{card.detail}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 2. CORE WORKROOM ENGINE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-xl flex flex-col min-h-[480px] relative overflow-hidden">
            {selectedDay ? (
               <motion.div
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="h-full flex flex-col"
               >
                  <div className="flex items-center justify-between mb-5 border-b border-slate-700 pb-4">
                    <button onClick={() => setSelectedDay(null)} className="flex items-center space-x-2 text-slate-400 hover:text-white transition-all">
                       <ArrowLeft size={18} />
                       <span className="text-xs font-medium tracking-wide">Back to Hub</span>
                    </button>
                    <div className="text-right">
                       <h3 className="text-lg font-bold text-white">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</h3>
                       <p className="text-xs text-blue-500 mt-0.5">Active Schedule</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-hide">
                    {jobs.filter(j => j.scheduledDate === selectedDay).map(job => (
                        <div key={job.id} onClick={() => onJobSelect(job)} className="bg-slate-800/30 p-4 rounded-xl border border-slate-700 flex items-center justify-between group hover:bg-slate-800/60 transition-all cursor-pointer">
                          <div className="flex items-center space-x-4">
                             <div className="w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center">
                                <span className="text-xs font-bold text-blue-500">{job.scheduledTime}</span>
                             </div>
                             <div>
                                <p className="text-xs font-medium text-slate-400 mb-0.5">#{job.jobNumber}</p>
                                <p className="text-base font-bold text-white">{job.client.firstName} {job.client.lastName}</p>
                                <p className="text-xs font-medium text-slate-300 mt-0.5">{job.lockDetails.type}</p>
                             </div>
                          </div>
                          <div className="flex items-center space-x-3">
                             <div className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize bg-slate-800/50 border border-slate-600`} style={{ color: STATUS_COLORS[job.status] }}>
                                {job.status}
                             </div>
                             <ChevronRight size={18} className="text-slate-400 group-hover:text-white" />
                          </div>
                        </div>
                    ))}
                  </div>
               </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{monthName} <span className="text-blue-500/50">{year}</span></h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{monthName} Schedule</p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronLeft size={16} /></button>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronRight size={16} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex-1 shadow-inner">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                    <div key={d} className="bg-slate-800/30 py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-700">{d}</div>
                  ))}
                  {calendarDays.map((day, i) => {
                    const dayJobs = day ? getJobsForDay(day) : [];
                    const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

                    return (
                      <div
                        key={i}
                        onClick={() => day && handleDayClick(day)}
                        onMouseEnter={day ? (e) => handleCellHover(day, e) : undefined}
                        onMouseLeave={day ? handleCellLeave : undefined}
                        className={`min-h-[80px] p-2 transition-colors relative border border-white/10 overflow-hidden ${day ? 'bg-slate-900/50 hover:border-blue-500/40 cursor-pointer group' : 'bg-transparent'}`}
                      >
                        {day && (
                          <div className="h-full flex flex-col relative z-10">
                            <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-all ${isToday ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 group-hover:text-white'}`}>
                              {day}
                            </span>
                            <div className="mt-auto space-y-0.5">
                               {dayJobs.slice(0, 3).map(j => (
                                 <motion.div layoutId={`job-indic-${j.id}`} key={j.id} className="h-1 w-full rounded-full opacity-60" style={{ backgroundColor: STATUS_COLORS[j.status] }} />
                               ))}
                            </div>
                          </div>
                        )}
                        {day && (
                          <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <DailyGoalTracker current={todaysRevenue} target={dailyRevenueTarget} />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* A technician's own day. They used to have to ask the owner what they'd
              earned; this is the same arithmetic payroll uses, for today only. */}
          {myDay && (
            <div className="bg-gradient-to-br from-emerald-900/30 to-slate-900 p-5 rounded-2xl border border-emerald-500/25 shadow-2xl">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center">
                <Wallet size={14} className="mr-2" /> Your day
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">{myDay.jobsDone}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Closed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">${myDay.revenue.toLocaleString()}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Billed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400 tabular-nums">${myDay.payout.toLocaleString()}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Yours</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 leading-snug">
                {myDay.tips > 0
                  ? `Commission $${myDay.commission.toLocaleString()} + tips $${myDay.tips.toLocaleString()}.`
                  : `Commission at ${currentUser?.commissionRate ?? 0}%.`}
                {myDay.stillOpen > 0 && ` ${myDay.stillOpen} job${myDay.stillOpen > 1 ? 's' : ''} still open today.`}
              </p>
            </div>
          )}

          {/* Money owed, on the first screen. It was only visible buried in Accounting,
              mixed in with period figures, so nobody looked at it daily. */}
          {!isTechUser && debtors.count > 0 && (
            <div className="bg-gradient-to-br from-amber-900/25 to-slate-900 p-5 rounded-2xl border border-amber-500/25 shadow-2xl">
              <button
                onClick={() => setActiveTab('accounting')}
                className="w-full text-left group"
              >
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                  <span className="flex items-center"><AlertCircle size={14} className="mr-2" /> Owed to you</span>
                  <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-3xl font-bold text-white tabular-nums">${debtors.total.toLocaleString()}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {debtors.count} unpaid invoice{debtors.count > 1 ? 's' : ''}
                  {debtors.oldestDays > 0 && ` · oldest ${debtors.oldestDays} days`}
                </p>
              </button>
              <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                {debtors.top.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300 truncate">{d.client}</span>
                    <span className="font-bold text-amber-300 tabular-nums shrink-0">${d.balance.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center">
              <Activity size={14} className="mr-2 text-blue-400" /> Today
            </h3>
            <div className="space-y-3">
              {(() => {
                const completedToday = todaysJobs.filter(j => j.status === 'completed').length;
                const nextJob = todaysJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))[0];
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Done</p>
                        <p className="text-2xl font-bold text-white">{completedToday}</p>
                        <p className="text-xs text-slate-500 mt-0.5">of {todaysJobs.length} jobs</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Revenue</p>
                        <p className="text-2xl font-bold text-blue-400">${todaysRevenue.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 mt-0.5">today</p>
                      </div>
                    </div>
                    {nextJob ? (
                      <div className="bg-white/5 border border-blue-500/20 p-3 rounded-xl">
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Clock size={11} /> Next Up</p>
                        <p className="text-sm font-bold text-white truncate">{nextJob.client.firstName} {nextJob.client.lastName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{nextJob.scheduledTime} · {nextJob.lockDetails.type}</p>
                      </div>
                    ) : (
                      <div className="bg-white/5 border border-white/10 p-3 rounded-xl text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">No more jobs today</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <Speedometer closeRate={metrics.closeRate} target={65} />
        </div>
      </div>

      {/* CALENDAR CELL POP-OUT */}
      <AnimatePresence mode="wait">
        {popDay && (() => {
          const tipJobs = getJobsForDay(popDay.day).slice().sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
          if (tipJobs.length === 0) return null;
          const dayRevenue = tipJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);
          const dateLabel = new Date(year, month, popDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

          const EW = Math.min(248, window.innerWidth - 16);
          const EH = 58 + tipJobs.length * 54 + 10;
          // Left gutter to avoid: the desktop sidebar (~140px) exists only at md+.
          // On mobile there is no sidebar, so keep the popup flush to the screen edge.
          const NAV = window.innerWidth < 768 ? 8 : 140;

          // Position popup BELOW the cell (no overlap → no self-dismiss)
          let ex = popDay.cx - EW / 2;
          const cellBottom = popDay.cy + popDay.ch / 2;
          let ey = cellBottom + 6;

          // Flip above if not enough space below
          if (ey + EH > window.innerHeight - 8) {
            ey = popDay.cy - popDay.ch / 2 - EH - 6;
          }
          ex = Math.max(NAV + 4, Math.min(ex, window.innerWidth - EW - 8));
          ey = Math.max(60, ey);

          // transformOrigin: top-center of popup = bottom edge of cell → grows downward from cell
          const originX = EW / 2;
          const originY = ey > cellBottom ? 0 : EH;

          return (
            <motion.div
              key={`pop-${popDay.day}`}
              initial={{ scale: 0.25, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.2,  opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              style={{
                position: 'fixed',
                left: ex, top: ey,
                width: EW, height: EH,
                transformOrigin: `${originX}px ${originY}px`,
                zIndex: 9999,
              }}
              onMouseEnter={handlePopupEnter}
              onMouseLeave={handlePopupLeave}
              className="bg-slate-800 border border-blue-500/40 shadow-2xl shadow-blue-900/40 rounded-2xl overflow-hidden pointer-events-auto"
            >
              {/* Day header */}
              <div className="px-3 pt-2.5 pb-2 bg-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{dateLabel}</p>
                  <p className="text-xs font-extrabold text-white mt-0.5">{tipJobs.length} job{tipJobs.length > 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-extrabold text-blue-400 tabular-nums">${dayRevenue.toLocaleString()}</p>
              </div>

              {/* Job rows */}
              <div className="p-1.5 space-y-1 overflow-hidden">
                {tipJobs.map(j => (
                  <button
                    key={j.id}
                    onClick={() => { setPopDay(null); onJobSelect(j); }}
                    className="w-full text-left px-2.5 py-2 rounded-xl bg-white/5 hover:bg-blue-600/20 border border-white/5 hover:border-blue-500/30 transition-all active:scale-95 group/row"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 font-mono bg-white/5 px-1.5 py-0.5 rounded-md">{j.scheduledTime}</span>
                        <span className="text-xs font-bold text-white truncate group-hover/row:text-blue-300 transition-colors">{j.client.firstName} {j.client.lastName}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-400 shrink-0">${(j.totalAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 pl-0.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[j.status] }} />
                      <span className="text-[10px] text-slate-400 truncate">{j.lockDetails.type}</span>
                      <span className="text-[10px] text-slate-500">·</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: STATUS_COLORS[j.status] }}>{j.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* 3. DEPLOYMENT PIPELINE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center">
            <Zap size={15} className="mr-2 text-blue-400" />
            Pipeline
          </h3>
          <button data-tour="new-job" onClick={onAddJob} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/30">
            <Plus size={13} />
            <span>New Job</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 px-2">
          {pipelineColumns.map((col) => {
            const colJobs = jobsInColumn(col);
            return (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              key={col.id}
              onDragOver={(e: any) => e.preventDefault()}
              onDrop={(e: any) => handleDrop(e, col.id)}
              className={`bg-slate-900/50 rounded-2xl border flex flex-col h-[460px] overflow-hidden shadow-2xl ${col.isLeads && colJobs.length > 0 ? 'border-amber-500/40' : 'border-white/10'}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${col.id === 'leads' ? 'bg-amber-500 animate-pulse' : col.id === 'new' ? 'bg-blue-500' : col.id === 'diagnostics' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{col.label}</span>
                </div>
                <span className={`bg-white/5 px-2.5 py-1 rounded-lg text-xs font-extrabold ${col.isLeads ? 'text-amber-400' : 'text-blue-500'}`}>
                  {colJobs.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-3">
                {colJobs.length === 0 && col.isLeads && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                    <Globe size={24} className="mb-2" />
                    <p className="text-xs font-semibold">No website leads yet</p>
                  </div>
                )}
                {colJobs.map(job => (
                  <KanbanCard key={job.id} job={job} onSelect={() => (col.isLeads ? openLead(job) : onJobSelect(job))} onDragStart={handleDragStart} onRequestMove={(j) => { setMoveNotice(null); setMovingJob(j); }} />
                ))}
              </div>
            </motion.div>
            );
          })}
        </div>
      </section>

      {/* Move sheet — the touch equivalent of dragging a card between columns.
          Deliberately NOT wrapped in AnimatePresence: an exit animation that doesn't
          finish leaves the overlay in the DOM covering the whole board, and a modal that
          can get stuck open is a worse trade than a slightly abrupt dismiss. */}
      {movingJob && (
          <div
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center animate-in fade-in duration-150"
            onClick={() => setMovingJob(null)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full md:max-w-sm bg-slate-900 border-t md:border border-white/10 md:rounded-2xl rounded-t-2xl p-5 space-y-2"
              style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Move job</p>
                  <p className="text-sm font-bold text-white truncate">
                    #{movingJob.jobNumber} · {movingJob.client.firstName} {movingJob.client.lastName}
                  </p>
                </div>
                <button aria-label="Close" onClick={() => setMovingJob(null)} className="p-2 text-slate-400 hover:text-white"><X size={20} /></button>
              </div>
              {pipelineColumns.map(col => {
                const here = !col.isLeads && col.statuses.includes(movingJob.status) && !movingJob.isNewLead;
                return (
                  <button
                    key={col.id}
                    disabled={here}
                    onClick={() => {
                      const refusal = moveJobToColumn(movingJob.id, col.id);
                      setMoveNotice(refusal);
                      if (!refusal) setMovingJob(null);
                    }}
                    className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
                      here
                        ? 'bg-white/5 text-slate-500 cursor-default'
                        : 'bg-white/5 text-white hover:bg-blue-600/20 hover:text-blue-200 active:bg-blue-600/30'
                    }`}
                  >
                    {col.label}{here && <span className="text-[10px] uppercase tracking-widest ml-2">· current</span>}
                  </button>
                );
              })}
              {moveNotice && <p className="text-xs font-semibold text-amber-300 pt-1">{moveNotice}</p>}
            </motion.div>
          </div>
        )}
    </div>
  );
};
