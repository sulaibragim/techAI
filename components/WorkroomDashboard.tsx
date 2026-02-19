
import React, { useState, useMemo } from 'react';
import { 
  Calendar, DollarSign, TrendingUp, Clock, Target, 
  MapPin, AlertCircle, Sparkles, Activity, Plus, ChevronLeft, ChevronRight,
  ArrowLeft, LayoutGrid, Zap, Shield
} from 'lucide-react';
import { useAppStore } from '../store';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { calculateFinancialMetrics } from '../financialUtils';

// --- SUB-COMPONENTS ---

const Speedometer: React.FC<{ closeRate: number; target: number }> = ({ closeRate, target }) => {
  const rotation = (closeRate / 100) * 180;
  const getColor = (rate: number) => {
    if (rate < 35) return '#ef4444';
    if (rate < 50) return '#f59e0b';
    if (rate < 70) return '#3b82f6';
    return '#10b981';
  };

  return (
    <div className="bg-[#111827] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col items-center relative overflow-hidden">
      <p className="text-[11px] font-bold uppercase text-gray-500 tracking-widest mb-10">Efficiency Matrix</p>
      <div className="relative w-full max-w-[220px]">
        <svg viewBox="0 0 200 120" className="w-full h-auto">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1f2937" strokeWidth="18" strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={getColor(closeRate)} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${(rotation / 180) * 251} 251`} />
          <line x1="100" y1="100" x2={100 + 75 * Math.cos((rotation - 180) * Math.PI / 180)} y2={100 + 75 * Math.sin((rotation - 180) * Math.PI / 180)} stroke="white" strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="white" />
        </svg>
        <div className="absolute bottom-0 inset-x-0 flex flex-col items-center">
          <span className="text-4xl font-extrabold text-white tracking-tight">{closeRate.toFixed(0)}%</span>
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">Close Rate</span>
        </div>
      </div>
    </div>
  );
};

const DailyGoalTracker: React.FC<{ current: number; target: number }> = ({ current, target }) => {
  const percentage = (current / target) * 100;

  return (
    <div className="bg-[#111827] p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-8 relative overflow-hidden">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-[11px] font-bold uppercase text-gray-500 tracking-widest mb-3">Daily Target</h3>
          <p className="text-5xl font-extrabold text-white tracking-tight">
            ${current.toLocaleString()} 
            <span className="text-lg font-bold text-gray-600 ml-4">/ ${target.toLocaleString()}</span>
          </p>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-bold ${percentage >= 100 ? 'text-green-500' : 'text-blue-500'}`}>{Math.round(percentage)}%</span>
        </div>
      </div>

      <div className="relative h-6 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5 shadow-inner">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${percentage >= 100 ? 'bg-green-500' : 'bg-blue-600'}`} 
          style={{ width: `${Math.min(percentage, 100)}%` }} 
        />
      </div>
    </div>
  );
};

const KanbanCard: React.FC<{ job: Job; onSelect: () => void; onDragStart: (e: React.DragEvent, job: Job) => void }> = ({ job, onSelect, onDragStart }) => (
  <div 
    draggable
    onDragStart={(e) => onDragStart(e, job)}
    onClick={onSelect}
    className="bg-[#1F2937]/50 backdrop-blur-md p-6 rounded-3xl border border-white/5 shadow-lg mb-4 cursor-grab active:cursor-grabbing hover:border-blue-500/30 hover:scale-[1.01] transition-all group shrink-0 w-full"
  >
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-[#111827] rounded-xl flex items-center justify-center text-blue-500 border border-white/5">
          <Clock size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-white uppercase tracking-tight truncate max-w-[150px]">{job.client.firstName} {job.client.lastName}</p>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">{job.scheduledTime}</p>
        </div>
      </div>
      <div className="bg-[#111827] px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500 uppercase">
         {job.distance || '2.1'} mi
      </div>
    </div>
    <p className="text-[10px] font-medium text-gray-400 mb-4 truncate uppercase tracking-wider opacity-80">{job.appliance.type} — {job.appliance.brand || 'Elite'}</p>

    <div className="flex items-center justify-between pt-4 border-t border-white/5">
      <span className="text-[11px] font-extrabold text-blue-500 tracking-wider">${job.totalAmount > 0 ? job.totalAmount.toLocaleString() : '136.00'}</span>
      <div className="flex items-center space-x-2">
         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
         <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{job.status}</span>
      </div>
    </div>
  </div>
);

export const WorkroomDashboard: React.FC<{ onJobSelect: (job: Job) => void; onAddJob: () => void }> = ({ onJobSelect, onAddJob }) => {
  const { jobs, updateJobStatus } = useAppStore();
  const metrics = useMemo(() => calculateFinancialMetrics(jobs), [jobs]);
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 1));
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

  const getJobsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return jobs.filter(j => j.scheduledDate === dateStr);
  };

  return (
    <div className="space-y-12 pb-40 animate-in fade-in duration-700">
      
      {/* 1. COMMAND KPI BAR */}
      <div className="flex gap-6 overflow-x-auto scrollbar-hide py-2">
        {[
          { label: 'Revenue Pool', value: `$${metrics.totalRevenue.toLocaleString()}`, detail: '↑ 14% Pace', icon: DollarSign, color: 'blue' },
          { label: 'Settlement', value: `${metrics.closeRate.toFixed(0)}%`, detail: 'System Peak', icon: Target, color: 'green' },
          { label: 'Asset Logs', value: jobs.length, detail: 'Operational Flux', icon: Activity, color: 'slate' },
          { label: 'Active Plan', value: 'Elite', detail: 'Guarantees Active', icon: Shield, color: 'blue' }
        ].map((card, i) => (
          <div key={i} className={`bg-[#111827] p-8 rounded-[2.5rem] border border-white/5 min-w-[200px] flex-1 flex flex-col justify-between shadow-2xl group hover:scale-[1.01] transition-all cursor-default`}>
             <div className={`flex items-center space-x-3 mb-4 text-gray-500 group-hover:text-blue-500 transition-colors`}>
                <card.icon size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{card.label}</span>
             </div>
             <p className="text-4xl font-extrabold text-white tracking-tight tabular-nums">{card.value}</p>
             <p className={`text-[10px] font-bold mt-3 uppercase tracking-wider ${card.color === 'green' ? 'text-green-500' : 'text-blue-500'}`}>{card.detail}</p>
          </div>
        ))}
      </div>

      {/* 2. CORE WORKROOM ENGINE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          <div className="bg-[#111827] p-10 rounded-[3.5rem] border border-white/5 shadow-2xl flex flex-col min-h-[580px] relative overflow-hidden">
            {selectedDay ? (
               <div className="animate-in fade-in duration-300 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-10 border-b border-white/5 pb-8">
                    <button onClick={() => setSelectedDay(null)} className="flex items-center space-x-3 text-gray-500 hover:text-white transition-all">
                       <ArrowLeft size={20} />
                       <span className="text-[11px] font-bold uppercase tracking-widest">Back to Hub</span>
                    </button>
                    <div className="text-right">
                       <h3 className="text-2xl font-extrabold text-white uppercase tracking-tight">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('default', { month: 'long', day: 'numeric' })}</h3>
                       <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1">Active Schedule</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4 overflow-y-auto pr-2 scrollbar-hide">
                    {jobs.filter(j => j.scheduledDate === selectedDay).map(job => (
                        <div key={job.id} onClick={() => onJobSelect(job)} className="bg-white/5 p-6 rounded-3xl border border-white/5 flex items-center justify-between group hover:bg-white/[0.08] transition-all cursor-pointer">
                          <div className="flex items-center space-x-6">
                             <div className="w-14 h-14 bg-[#0F172A] rounded-2xl flex items-center justify-center border border-white/5">
                                <span className="text-[11px] font-extrabold text-blue-500">{job.scheduledTime}</span>
                             </div>
                             <div>
                                <p className="text-[9px] font-bold text-gray-600 uppercase mb-0.5 tracking-wider">#{job.jobNumber}</p>
                                <p className="text-xl font-bold text-white uppercase tracking-tight">{job.client.firstName} {job.client.lastName}</p>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1">{job.appliance.type}</p>
                             </div>
                          </div>
                          <div className="flex items-center space-x-4">
                             <div className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/5`} style={{ color: STATUS_COLORS[job.status] }}>
                                {job.status}
                             </div>
                             <ChevronRight size={20} className="text-gray-700 group-hover:text-white" />
                          </div>
                        </div>
                    ))}
                  </div>
               </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-3xl font-extrabold text-white uppercase tracking-tight">{monthName} <span className="text-blue-500/50">{year}</span></h3>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">Field Deployment Hub</p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-4 bg-white/5 rounded-2xl text-gray-500 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronLeft size={18} /></button>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-4 bg-white/5 rounded-2xl text-gray-500 hover:text-white hover:bg-blue-600 transition-all shadow-lg"><ChevronRight size={18} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/5 rounded-3xl overflow-hidden flex-1 shadow-inner">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                    <div key={d} className="bg-[#111827] py-5 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600 border-b border-white/5">{d}</div>
                  ))}
                  {calendarDays.map((day, i) => {
                    const dayJobs = day ? getJobsForDay(day) : [];
                    const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

                    return (
                      <div 
                        key={i} 
                        onClick={() => day && handleDayClick(day)}
                        className={`min-h-[100px] p-3 transition-all relative border border-white/5 ${day ? 'bg-[#111827] hover:bg-blue-600/5 cursor-pointer group' : 'bg-transparent'}`}
                      >
                        {day && (
                          <div className="h-full flex flex-col">
                            <span className={`text-[11px] font-bold w-8 h-8 flex items-center justify-center rounded-xl transition-all ${isToday ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 group-hover:text-white'}`}>
                              {day}
                            </span>
                            <div className="mt-auto space-y-1">
                               {dayJobs.slice(0, 3).map(j => (
                                 <div key={j.id} className="h-1 w-full rounded-full opacity-60" style={{ backgroundColor: STATUS_COLORS[j.status] }} />
                               ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          
          <DailyGoalTracker current={jobs.filter(j => j.scheduledDate === '2026-02-13' && j.status === 'completed').reduce((s, j) => s + j.totalAmount, 0)} target={1500} />
        </div>

        <div className="lg:col-span-4 flex flex-col gap-10">
          <div className="bg-[#111827] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden group">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-10 flex items-center">
              <Activity size={16} className="mr-3 text-blue-500" /> System Focus
            </h3>
            <div className="space-y-6">
               <div className="bg-white/5 border border-white/5 p-6 rounded-3xl transition-all group/item">
                  <div className="flex items-center space-x-3 mb-3">
                    <TrendingUp size={18} className="text-blue-500" />
                    <p className="text-sm font-bold text-white uppercase tracking-tight">Growth Trace</p>
                  </div>
                  <p className="text-[11px] font-medium text-gray-400 leading-relaxed italic opacity-90">Analysis indicates Friday performance is pacing 12% above quarterly targets.</p>
               </div>
               <div className="bg-white/5 border border-white/5 p-6 rounded-3xl transition-all group/item">
                  <div className="flex items-center space-x-3 mb-3">
                    <AlertCircle size={18} className="text-amber-500" />
                    <p className="text-sm font-bold text-white uppercase tracking-tight">Dispatch Audit</p>
                  </div>
                  <p className="text-[11px] font-medium text-gray-400 leading-relaxed italic opacity-90">Verifying 3 active dispatches. Target close rate objective is 65%.</p>
               </div>
            </div>
          </div>
          <Speedometer closeRate={metrics.closeRate} target={65} />
          
          <div className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-[3.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
             <h4 className="text-2xl font-extrabold uppercase tracking-tight mb-4">Elite Hub</h4>
             <p className="text-[11px] font-bold text-blue-100/60 uppercase tracking-widest mb-8">Quarterly Matrix</p>
             <div className="w-full h-3 bg-white/10 rounded-full mb-8 overflow-hidden p-0.5">
                <div className="h-full bg-white rounded-full shadow-[0_0_10px_white]" style={{ width: '84%' }} />
             </div>
             <p className="text-[11px] font-semibold italic leading-relaxed text-blue-100/80">
               "Operational velocity is currently exceeding fleet benchmarks. Maintain focus on recurring service plans."
             </p>
          </div>
        </div>
      </div>

      {/* 3. DEPLOYMENT PIPELINE (Height reduced to 540px) */}
      <section className="space-y-8">
        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center px-4">
          <Zap size={18} className="mr-3 text-blue-500" />
          Pipeline Engineering
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
          {pipelineColumns.map((col) => (
            <div 
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
              className="bg-[#111827] rounded-[3rem] border border-white/5 flex flex-col h-[540px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${col.id === 'new' ? 'bg-blue-500' : col.id === 'diagnostics' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{col.label}</span>
                </div>
                <span className="bg-white/5 px-3 py-1 rounded-lg text-[10px] font-extrabold text-blue-500">
                  {jobs.filter(j => col.statuses.includes(j.status)).length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-4">
                {jobs.filter(j => col.statuses.includes(j.status)).map(job => (
                  <KanbanCard key={job.id} job={job} onSelect={() => onJobSelect(job)} onDragStart={handleDragStart} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
