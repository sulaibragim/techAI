
import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, Clock, Target,
  AlertCircle, Activity, Plus, ChevronLeft, ChevronRight,
  ArrowLeft, Zap, Shield
} from 'lucide-react';
import { useAppStore, useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { calculateFinancialMetrics } from '../financialUtils';
import { PendingJobSuggestions } from './PendingJobSuggestions';

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
      className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-blue-500/10 shadow-[0_0_30px_rgba(0,229,255,0.05)] flex flex-col items-center relative overflow-hidden"
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

const KanbanCard: React.FC<{ job: Job; onSelect: () => void; onDragStart: (e: React.DragEvent, job: Job) => void }> = ({ job, onSelect, onDragStart }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    draggable
    onDragStart={(e: any) => onDragStart(e, job)}
    onClick={onSelect}
    className="bg-slate-900/50 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-lg mb-3 cursor-grab active:cursor-grabbing hover:border-blue-500/50 transition-all group shrink-0 w-full"
  >
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-white/5 text-blue-400 rounded-lg flex items-center justify-center">
          <Clock size={14} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white tracking-tight truncate max-w-[130px]">{job.client.firstName} {job.client.lastName}</p>
          <p className="text-xs font-medium text-slate-400 mt-0.5">{job.scheduledTime}</p>
        </div>
      </div>
      <div className="bg-white/5 px-2 py-1 rounded-lg text-xs font-medium text-slate-300">
         {job.distance || '2.1'} mi
      </div>
    </div>
    <p className="text-xs font-medium text-slate-300 mb-3 truncate">{job.lockDetails.type} — {job.lockDetails.brand || 'Elite'}</p>

    <div className="flex items-center justify-between pt-3 border-t border-white/10">
      <span className="text-sm font-bold text-blue-400">${job.totalAmount > 0 ? job.totalAmount.toLocaleString() : 'TBD'}</span>
      <div className="flex items-center space-x-1.5">
         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
         <span className="text-xs font-medium text-slate-300 capitalize">{job.status}</span>
      </div>
    </div>
  </motion.div>
);

export const WorkroomDashboard: React.FC<{ onJobSelect: (job: Job) => void; onAddJob: () => void }> = ({ onJobSelect, onAddJob }) => {
  const { updateJobStatus } = useAppStore();
  const jobs = useVisibleJobs();
  const { monthlyRevenueTarget, monthlyTargets, dailyRevenueTarget } = useSettingsStore();
  const nowRef = new Date();
  const effectiveMonthlyTarget = monthlyTargets[`${nowRef.getFullYear()}-${String(nowRef.getMonth() + 1).padStart(2, '0')}`] ?? monthlyRevenueTarget;
  const metrics = useMemo(() => calculateFinancialMetrics(jobs, effectiveMonthlyTarget), [jobs, effectiveMonthlyTarget]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [popDay, setPopDay] = useState<{ day: number; cx: number; cy: number; cw: number; ch: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

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
    { id: 'new', label: 'New Tasks', statuses: ['scheduled', 'enRoute'], defaultStatus: 'scheduled' as JobStatus },
    { id: 'diagnostics', label: 'Diagnostics', statuses: ['diagnosed', 'sold', 'waitingParts', 'coffee'], defaultStatus: 'diagnosed' as JobStatus },
    { id: 'completed', label: 'Completed', statuses: ['completed'], defaultStatus: 'completed' as JobStatus }
  ];

  const handleDragStart = (e: React.DragEvent, job: Job) => {
    e.dataTransfer.setData('jobId', job.id);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    const col = pipelineColumns.find(c => c.id === columnId);
    if (col) {
      updateJobStatus(jobId, col.defaultStatus);
    }
  };

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todaysJobs = jobs.filter(j => j.scheduledDate === todayStr);
  const todaysRevenue = todaysJobs.filter(j => j.status === 'completed' || j.status === 'sold').reduce((s, j) => s + (j.totalAmount || 0), 0);

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-700">

      {/* AI pending job suggestions from call transcripts */}
      <PendingJobSuggestions onJobCreated={onJobSelect} />

      {/* 1. COMMAND KPI BAR */}
      <div className="flex gap-4 overflow-x-auto scrollbar-hide py-1">
        <AnimatePresence>
          {[
            { label: 'Revenue', value: `$${metrics.totalRevenue.toLocaleString()}`, detail: 'All time', icon: DollarSign, color: 'blue' },
            { label: 'Close Rate', value: `${metrics.closeRate.toFixed(0)}%`, detail: 'Sold vs visited', icon: Target, color: 'cyan' },
            { label: 'Total Jobs', value: jobs.length, detail: 'In system', icon: Activity, color: 'slate' },
            { label: 'Completed', value: jobs.filter(j => j.status === 'completed').length, detail: 'Jobs closed', icon: Shield, color: 'cyan' }
          ].map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10 min-w-[160px] flex-1 flex flex-col justify-between shadow-lg group hover:border-blue-500/30 transition-all cursor-default relative overflow-hidden`}
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
                       <h3 className="text-lg font-bold text-white">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('default', { month: 'long', day: 'numeric' })}</h3>
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
                        className={`min-h-[80px] p-2 transition-all relative border border-white/10 overflow-hidden ${day ? 'bg-slate-900/50 backdrop-blur-sm hover:border-blue-500/40 cursor-pointer group' : 'bg-transparent'}`}
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
          <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
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

          const EW = 248;
          const EH = 58 + tipJobs.length * 54 + 10;
          const NAV = 140;

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
          <button onClick={onAddJob} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/30">
            <Plus size={13} />
            <span>New Job</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 px-2">
          {pipelineColumns.map((col) => (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              key={col.id}
              onDragOver={(e: any) => e.preventDefault()}
              onDrop={(e: any) => handleDrop(e, col.id)}
              className="bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col h-[460px] overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${col.id === 'new' ? 'bg-blue-500' : col.id === 'diagnostics' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{col.label}</span>
                </div>
                <span className="bg-white/5 px-2.5 py-1 rounded-lg text-xs font-extrabold text-blue-500">
                  {jobs.filter(j => col.statuses.includes(j.status)).length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-3">
                {jobs.filter(j => col.statuses.includes(j.status)).map(job => (
                  <KanbanCard key={job.id} job={job} onSelect={() => onJobSelect(job)} onDragStart={handleDragStart} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};
