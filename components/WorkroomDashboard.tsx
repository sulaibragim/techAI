
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, DollarSign, TrendingUp, Clock, Target,
  MapPin, AlertCircle, Sparkles, Activity, Plus, ChevronLeft, ChevronRight,
  ArrowLeft, LayoutGrid, Zap, Shield
} from 'lucide-react';
import { useAppStore } from '../store';
import { useSettingsStore } from '../settingsStore';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { calculateFinancialMetrics } from '../financialUtils';

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
      <p className="text-xs font-semibold uppercase text-blue-400 tracking-wider mb-5">Efficiency Matrix</p>
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
      <span className="text-sm font-bold text-blue-400">${job.totalAmount > 0 ? job.totalAmount.toLocaleString() : '136.00'}</span>
      <div className="flex items-center space-x-1.5">
         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
         <span className="text-xs font-medium text-slate-300 capitalize">{job.status}</span>
      </div>
    </div>
  </motion.div>
);

export const WorkroomDashboard: React.FC<{ onJobSelect: (job: Job) => void; onAddJob: () => void }> = ({ onJobSelect, onAddJob }) => {
  const { jobs, updateJobStatus } = useAppStore();
  const { monthlyRevenueTarget } = useSettingsStore();
  const metrics = useMemo(() => calculateFinancialMetrics(jobs, monthlyRevenueTarget), [jobs, monthlyRevenueTarget]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

      {/* 1. COMMAND KPI BAR */}
      <div className="flex gap-4 overflow-x-auto scrollbar-hide py-1">
        <AnimatePresence>
          {[
            { label: 'Revenue Pool', value: `$${metrics.totalRevenue.toLocaleString()}`, detail: '↑ 14% Pace', icon: DollarSign, color: 'blue' },
            { label: 'Settlement', value: `${metrics.closeRate.toFixed(0)}%`, detail: 'System Peak', icon: Target, color: 'cyan' },
            { label: 'Asset Logs', value: jobs.length, detail: 'Operational Flux', icon: Activity, color: 'slate' },
            { label: 'Active Plan', value: 'Elite', detail: 'Guarantees Active', icon: Shield, color: 'cyan' }
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
                        <div key={job.id} onClick={() => onJobSelect(job)} className="bg-gray-800/30 p-4 rounded-xl border border-slate-700 flex items-center justify-between group hover:bg-gray-800/60 transition-all cursor-pointer">
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
                             <div className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize bg-gray-800/50 border border-slate-600`} style={{ color: STATUS_COLORS[job.status] }}>
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
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{monthName} <span className="text-blue-500/50">{year}</span></h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{monthName} Schedule</p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronLeft size={16} /></button>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronRight size={16} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex-1 shadow-inner">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                    <div key={d} className="bg-gray-800/30 py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-700">{d}</div>
                  ))}
                  {calendarDays.map((day, i) => {
                    const dayJobs = day ? getJobsForDay(day) : [];
                    const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

                    return (
                      <div
                        key={i}
                        onClick={() => day && handleDayClick(day)}
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

          <DailyGoalTracker current={todaysRevenue} target={1500} />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden group">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-5 flex items-center">
              <Activity size={14} className="mr-2 text-blue-400" /> System Focus
            </h3>
            <div className="space-y-3">
               <motion.div whileHover={{ scale: 1.02 }} className="bg-white/5 border border-blue-500/10 hover:border-blue-500/40 p-4 rounded-xl transition-all group/item shadow-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp size={15} className="text-blue-400" />
                    <p className="text-xs font-bold text-white uppercase tracking-tight">Growth Trace</p>
                  </div>
                  <p className="text-xs font-medium text-slate-300 leading-relaxed italic opacity-90">Analysis indicates Friday performance is pacing 12% above quarterly targets.</p>
               </motion.div>
               <motion.div whileHover={{ scale: 1.02 }} className="bg-white/5 border border-white/10 hover:border-amber-500/40 p-4 rounded-xl transition-all group/item shadow-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertCircle size={15} className="text-amber-500" />
                    <p className="text-xs font-bold text-white uppercase tracking-tight">Dispatch Audit</p>
                  </div>
                  <p className="text-xs font-medium text-slate-300 leading-relaxed italic opacity-90">Verifying 3 active dispatches. Target close rate objective is 65%.</p>
               </motion.div>
            </div>
          </div>
          <Speedometer closeRate={metrics.closeRate} target={65} />

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden group">
             <div className="absolute inset-0 bg-white/5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 to-transparent mix-blend-overlay" />
             <h4 className="relative z-10 text-lg font-extrabold uppercase tracking-tight mb-2">Elite Hub</h4>
             <p className="relative z-10 text-xs font-bold text-white/80 uppercase tracking-widest mb-4">Quarterly Matrix</p>
             <div className="relative z-10 w-full h-2.5 bg-black/20 rounded-full mb-4 overflow-hidden p-0.5 shadow-inner">
                <motion.div
                   initial={{ width: 0 }}
                   whileInView={{ width: '84%' }}
                   viewport={{ once: true }}
                   transition={{ duration: 1.5, ease: "easeOut" }}
                   className="h-full bg-white rounded-full shadow-[0_0_15px_white]"
                />
             </div>
             <p className="relative z-10 text-xs font-semibold italic leading-relaxed text-white/90">
               "Operational velocity is currently exceeding fleet benchmarks. Maintain focus on recurring service plans."
             </p>
          </div>
        </div>
      </div>

      {/* 3. DEPLOYMENT PIPELINE */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center px-2">
          <Zap size={15} className="mr-2 text-blue-400" />
          Pipeline Engineering
        </h3>
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
