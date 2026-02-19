import React, { useState } from 'react';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { MapPin, Clock, ArrowRight, Calendar, X, Hash, CheckCircle2, Activity, Trash2, AlertCircle, Wrench } from 'lucide-react';
import { useAppStore } from '../store';

interface JobsListProps {
  jobs: Job[];
  onJobSelect: (job: Job) => void;
  onAddJob: () => void;
}

const TIME_WINDOWS = ['9:00 - 11:00', '11:00 - 13:00', '13:00 - 15:00', '15:00 - 17:00', '17:00 - 19:00'];

export const JobsList: React.FC<JobsListProps> = ({ jobs, onJobSelect, onAddJob }) => {
  const [filter, setFilter] = useState<'pending' | 'completed' | 'cancelled'>('pending');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState(new Date().toISOString().split('T')[0]);
  const { updateJobStatus, updateJob } = useAppStore();

  const filteredJobs = jobs.filter(j => {
    if (filter === 'pending') {
      return j.status !== 'completed' && j.status !== 'cancelled';
    }
    return j.status === filter;
  });

  const getButtonConfig = (status: JobStatus) => {
    switch (status) {
      case 'diagnosed':
        return { label: 'Diagnosed', color: 'bg-yellow-500', nextStatus: 'completed' as JobStatus };
      case 'completed':
        return { label: 'Done', color: 'bg-green-600', nextStatus: 'completed' as JobStatus };
      default:
        return { label: 'Update', color: 'bg-blue-600', nextStatus: 'diagnosed' as JobStatus };
    }
  };

  const handleUpdate = (e: React.MouseEvent, jobId: string, currentStatus: JobStatus) => {
    e.stopPropagation(); 
    const config = getButtonConfig(currentStatus);
    updateJobStatus(jobId, config.nextStatus);
    if (config.nextStatus === 'completed' && currentStatus === 'diagnosed') {
        setFilter('completed');
    }
  };

  const handleCancel = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    updateJobStatus(jobId, 'cancelled');
    setFilter('cancelled');
  };

  return (
    <div className="space-y-8 pb-32 relative">
      
      {/* Reschedule Overlay (Neat & Small) */}
      {reschedulingId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="bg-[#111827] w-full max-w-[300px] rounded-[2rem] border border-white/10 p-6 shadow-2xl space-y-6">
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-black uppercase tracking-widest text-white">Reschedule</h3>
                 <button onClick={() => setReschedulingId(null)} className="text-gray-500 hover:text-white"><X size={18}/></button>
              </div>
              <div className="space-y-4">
                 <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <label className="text-[8px] font-black text-blue-500 uppercase block mb-1">Service Date</label>
                    <input type="date" className="bg-transparent text-white font-black w-full outline-none text-xs" value={tempDate} onChange={e => setTempDate(e.target.value)} />
                 </div>
                 <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-hide">
                    {TIME_WINDOWS.map(window => (
                      <button 
                        key={window} 
                        onClick={() => {
                          const target = jobs.find(j => j.id === reschedulingId);
                          if (target) updateJob({ ...target, scheduledDate: tempDate, scheduledTime: window.split(' ')[0] });
                          setReschedulingId(null);
                        }}
                        className={`w-full py-2.5 px-4 rounded-lg text-left text-[9px] font-black border transition-all flex justify-between items-center group ${tempDate === new Date().toISOString().split('T')[0] ? 'bg-white/5 text-gray-400 hover:bg-blue-600 hover:text-white' : 'bg-white/5 text-gray-400'}`}
                      >
                        {window}
                        <ArrowRight size={10} className="opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white uppercase leading-none">Dispatch Queue</h2>
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.4em] mt-3">Operational Hub</p>
        </div>
        <button
          onClick={onAddJob}
          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all"
        >
          New Manual Intake
        </button>
      </div>

      <div className="flex bg-[#111827]/60 p-1.5 rounded-[2rem] border border-white/5 backdrop-blur-xl max-w-xl">
        {['pending', 'completed', 'cancelled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all ${filter === f ? 'bg-blue-600 text-white shadow-xl' : 'text-gray-500 hover:text-white'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredJobs.map((job) => {
          const btn = getButtonConfig(job.status);
          return (
            <div
              key={job.id}
              onClick={() => onJobSelect(job)}
              className="bg-[#111827]/80 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/5 hover:border-blue-500/30 transition-all group cursor-pointer flex flex-col shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: STATUS_COLORS[job.status] }} />
              
              <div className="flex flex-col mb-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[9px] font-black text-blue-500/60 uppercase tracking-[0.2em]">#{job.jobNumber}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-black text-white tracking-tighter">${job.totalAmount || 136}</span>
                    <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-white/5 border border-white/5`} style={{ color: STATUS_COLORS[job.status] }}>
                      {job.status.charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-0.5">
                  <p className="text-xl font-black text-white tracking-tighter uppercase leading-none truncate group-hover:translate-x-1 transition-transform">
                    {job.client.firstName} {job.client.lastName}
                  </p>
                  <p className="text-[10px] font-bold text-gray-600 uppercase mt-1 tracking-tight truncate">{job.appliance.type} — {job.appliance.brand || 'Elite Unit'}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                 <div className="flex items-center text-gray-500 text-[11px]">
                   <Clock size={14} className="mr-3 text-blue-600" />
                   <span className="font-black uppercase tracking-widest">{job.scheduledTime}</span>
                 </div>
                 <div className="flex items-start text-gray-500 text-[10px]">
                   <MapPin size={14} className="mr-3 text-blue-600 mt-0.5 shrink-0" />
                   <span className="font-bold leading-tight truncate">{job.client.address}</span>
                 </div>
              </div>

              <div className="mt-auto pt-6 border-t border-white/[0.05] flex items-center space-x-2">
                 <button 
                   onClick={(e) => handleUpdate(e, job.id, job.status)}
                   className={`flex-1 py-3.5 rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-white shadow-lg hover:scale-105 active:scale-95 transition-all ${btn.color}`}
                 >
                    {job.status === 'completed' ? <CheckCircle2 size={14} className="mr-2" /> : <Activity size={14} className="mr-2" />}
                    {btn.label}
                 </button>
                 
                 <button 
                   onClick={(e) => { e.stopPropagation(); setReschedulingId(job.id); }}
                   className="w-10 h-10 bg-white/[0.03] rounded-xl flex items-center justify-center text-gray-600 hover:text-blue-500 hover:bg-white transition-all border border-white/5"
                   title="Reschedule"
                 >
                    <Calendar size={16} />
                 </button>

                 <button 
                   onClick={(e) => handleCancel(e, job.id)}
                   className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-600 hover:text-white transition-all border border-red-500/20 active:scale-95"
                   title="Cancel Job"
                 >
                    <X size={16} />
                 </button>
              </div>
            </div>
          );
        })}
        {filteredJobs.length === 0 && (
          <div className="col-span-full h-48 flex flex-col items-center justify-center opacity-20">
             <Hash size={40} className="mb-4" />
             <p className="text-sm font-black uppercase tracking-[0.3em]">Queue Empty</p>
          </div>
        )}
      </div>
    </div>
  );
};
