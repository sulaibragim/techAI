import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, List, Calendar as CalendarIcon, ArrowLeft, MoreHorizontal, User, AlertCircle, Sparkles } from 'lucide-react';
import { Job, STATUS_COLORS } from '../types';

interface CalendarViewProps {
  jobs: Job[];
  onAddJob: () => void;
  onJobSelect: (job: Job) => void;
}

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9); 

export const CalendarView: React.FC<CalendarViewProps> = ({ jobs, onAddJob, onJobSelect }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'list' | 'day'>('calendar');
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  
  const days = useMemo(() => {
    const d = [];
    const startOffset = firstDayOfMonth(year, month);
    const totalDays = daysInMonth(year, month);
    for (let i = 0; i < startOffset; i++) d.push(null);
    for (let i = 1; i <= totalDays; i++) d.push(i);
    return d;
  }, [year, month]);

  const getJobsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return jobs.filter(j => j.scheduledDate === dateStr);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDayDate(dateStr);
    setView('day');
  };

  const dayJobs = useMemo(() => {
    if (!selectedDayDate) return [];
    return jobs.filter(j => j.scheduledDate === selectedDayDate);
  }, [selectedDayDate, jobs]);

  const renderDailyView = () => {
    if (!selectedDayDate) return null;
    const dateObj = new Date(selectedDayDate + 'T00:00:00');
    const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return (
      <div className="bg-[#111827]/80 backdrop-blur-3xl rounded-[3rem] border border-white/5 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="p-10 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-b from-blue-500/5 to-transparent">
          <button onClick={() => setView('calendar')} className="group flex items-center space-x-3 text-gray-400 hover:text-white transition-all">
            <div className="w-10 h-10 bg-[#1F2937] rounded-2xl flex items-center justify-center group-hover:bg-blue-600 transition-colors">
              <ArrowLeft size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Back to Hub</span>
          </button>
          <div className="text-center md:text-right">
            <h3 className="text-2xl font-black text-white">{displayDate}</h3>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.3em] mt-2 flex items-center justify-center md:justify-end">
              <Sparkles size={12} className="mr-2" />
              Service Pipeline Active
            </p>
          </div>
        </div>

        <div className="flex flex-col max-h-[750px] overflow-y-auto scrollbar-hide">
          <div className="grid grid-cols-1 relative bg-[#0F172A]/50">
            {HOURS.map((hour) => (
              <div key={hour} className="flex border-b border-white/[0.03] h-32 relative group transition-colors hover:bg-white/[0.01]">
                <div className="w-28 flex-shrink-0 flex items-start justify-center pt-8 border-r border-white/[0.03] bg-[#111827]/40">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest tabular-nums">
                    {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                  </span>
                </div>
                <div className="flex-1" />
                <div className="absolute top-16 left-28 right-0 h-px bg-white/[0.015] border-dashed" />
              </div>
            ))}

            {dayJobs.map((job) => {
              const [h, m] = job.scheduledTime.split(':').map(Number);
              const startPos = (h - 9) * 128 + (m / 60) * 128; 
              const duration = job.durationMinutes || 60;
              const height = (duration / 60) * 128;

              return (
                <div 
                  key={job.id}
                  onClick={() => onJobSelect(job)}
                  className="absolute left-[130px] right-10 rounded-[2.5rem] p-8 shadow-2xl border-l-8 cursor-pointer hover:scale-[1.015] transition-all group overflow-hidden z-10"
                  style={{ 
                    top: `${startPos + 8}px`, 
                    height: `${height - 16}px`,
                    backgroundColor: `${STATUS_COLORS[job.status]}15`,
                    borderColor: STATUS_COLORS[job.status],
                    backdropFilter: 'blur(15px)'
                  }}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-[0.4em]">Client #{job.jobNumber}</span>
                         <span className="text-[10px] font-black text-white/30 uppercase tracking-widest tabular-nums">{job.scheduledTime}</span>
                      </div>
                      <h4 className="text-4xl font-black text-white tracking-tighter group-hover:translate-x-1 transition-transform leading-none mb-1 uppercase">
                        {job.client.firstName}<br/>{job.client.lastName}
                      </h4>
                    </div>
                    
                    <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                      <div className="flex items-center text-[10px] text-gray-500 font-black uppercase tracking-widest">
                         <MapPin size={14} className="mr-2 text-blue-500" />
                         <span className="truncate max-w-[250px]">{job.client.address}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
      <div className="lg:col-span-3 space-y-8">
        {view === 'day' ? renderDailyView() : (
          <div className="bg-[#111827]/60 backdrop-blur-2xl rounded-[3.5rem] border border-white/5 overflow-hidden shadow-[0_48px_96px_-24px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-10 gap-8 border-b border-white/5 bg-gradient-to-r from-blue-500/[0.03] to-transparent">
              <div>
                <h2 className="text-4xl font-black tracking-tight">{monthName} <span className="text-blue-500/50">{year}</span></h2>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.4em] mt-3">{jobs.length} Active Records Secured</p>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="bg-[#0F172A] rounded-2xl p-1.5 flex shadow-2xl border border-white/5">
                  <button onClick={() => setView('calendar')} className={`p-4 rounded-xl transition-all ${view === 'calendar' ? 'bg-blue-600 text-white shadow-[0_0_24px_rgba(59,130,246,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}><CalendarIcon size={20} /></button>
                  <button onClick={() => setView('list')} className={`p-4 rounded-xl transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-[0_0_24px_rgba(59,130,246,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}><List size={20} /></button>
                </div>
                <button onClick={onAddJob} className="bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl text-white transition-all shadow-[0_20px_40px_-10px_rgba(59,130,246,0.5)] active:scale-90">
                  <Plus size={28} />
                </button>
              </div>
            </div>

            {view === 'calendar' ? (
              <div className="grid grid-cols-7 border-collapse">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                  <div key={day} className="bg-[#111827] py-6 text-center text-[10px] font-black uppercase tracking-[0.4em] text-gray-600 border border-white/[0.03]">{day}</div>
                ))}
                {days.map((day, i) => {
                  const dayJobs = day !== null ? getJobsForDay(day) : [];
                  const isToday = day !== null && new Date().toDateString() === new Date(year, month, day).toDateString();

                  return (
                    <div 
                      key={day === null ? `empty-${i}` : day} 
                      onClick={() => day !== null && handleDayClick(day)}
                      className={`h-36 md:h-48 p-4 group transition-all relative border border-white/[0.03] ${
                        day === null ? 'bg-[#0F172A]/20 pointer-events-none' : 'bg-[#111827] hover:bg-white/[0.02] cursor-pointer'
                      }`}
                    >
                      {day !== null && (
                        <>
                          <div className="flex justify-between items-start mb-4">
                            <span className={`text-[12px] font-black w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                              isToday ? 'bg-blue-600 text-white shadow-xl scale-110' : 'text-gray-600 group-hover:text-white'
                            }`}>
                              {day}
                            </span>
                            {dayJobs.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3B82F6]" />}
                          </div>
                          <div className="space-y-1 overflow-hidden">
                            {dayJobs.slice(0, 2).map(job => (
                              <div
                                key={job.id}
                                className="w-full text-left px-2 py-1 rounded-lg text-[8px] truncate font-black flex items-center border border-white/5"
                                style={{ backgroundColor: `${STATUS_COLORS[job.status]}10`, color: STATUS_COLORS[job.status] }}
                              >
                                <span className="truncate uppercase tracking-wider">#{job.jobNumber}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-10 space-y-5 bg-[#0F172A]/30">
                {jobs.map(job => (
                  <div key={job.id} onClick={() => onJobSelect(job)} className="bg-[#111827]/80 p-8 rounded-[3rem] border border-white/5 hover:border-blue-500/30 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between group">
                    <div className="flex items-center space-x-8">
                      <div className="w-16 h-16 bg-blue-600/10 rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-inner">
                        <User size={24} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase text-blue-500/60 tracking-[0.4em] mb-1">Client #{job.jobNumber}</p>
                        <p className="font-black text-3xl text-white tracking-tighter mb-1 uppercase leading-none">
                          {job.client.firstName} {job.client.lastName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-8">
                       <div className={`px-7 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl`} style={{ backgroundColor: `${STATUS_COLORS[job.status]}15`, color: STATUS_COLORS[job.status] }}>
                         {job.status.replace('_', ' ')}
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="space-y-10">
        <div className="bg-[#111827]/60 backdrop-blur-xl rounded-[3rem] p-10 border border-white/5 shadow-2xl">
          <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 mb-10 flex items-center">
            <Clock size={16} className="mr-3 text-blue-500" />
            Active Schedule
          </h3>
          <div className="space-y-8">
            {jobs.filter(j => j.status === 'scheduled').slice(0, 4).map(job => (
              <div 
                key={job.id} 
                onClick={() => onJobSelect(job)}
                className="group cursor-pointer relative pl-5 border-l-2 border-white/10 hover:border-blue-500 transition-all py-1"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-col min-w-0">
                    <p className="font-black text-[9px] text-blue-500/70 uppercase tracking-widest mb-0.5">#{job.jobNumber}</p>
                    <p className="font-black text-sm text-gray-200 group-hover:text-white transition-colors truncate uppercase tracking-tight">{job.client.lastName}</p>
                  </div>
                  <span className="text-[10px] text-gray-600 font-black tabular-nums">{job.scheduledTime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-10 text-white shadow-[0_32px_64px_-16px_rgba(59,130,246,0.6)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/20 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-125 transition-transform duration-1000" />
          <h3 className="font-black text-2xl mb-2 tracking-tight">System KPI</h3>
          <p className="text-[10px] text-blue-100/70 mb-8 uppercase tracking-[0.4em] font-black">Performance Matrix</p>
          <div className="w-full h-5 bg-black/20 rounded-full mb-8 p-1 shadow-inner">
            <div className="h-full bg-white rounded-full shadow-[0_0_20px_white]" style={{ width: '88%' }} />
          </div>
          <p className="text-[13px] leading-relaxed font-bold italic opacity-90">
            "Your operational velocity is currently exceeding fleet benchmarks by <span className="underline decoration-2 underline-offset-4">12%</span>."
          </p>
        </div>
      </div>
    </div>
  );
};