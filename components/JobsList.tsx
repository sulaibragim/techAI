import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Job, JobStatus, STATUS_COLORS } from '../types';
import { MapPin, Clock, ArrowRight, Calendar, X, Hash, CheckCircle2, Activity, Trash2, AlertCircle, Wrench, Search } from 'lucide-react';
import { useAppStore } from '../store';
import { useCurrentUser, can } from '../authStore';

interface JobsListProps {
  jobs: Job[];
  onJobSelect: (job: Job) => void;
  onAddJob: () => void;
}

const TIME_WINDOWS = ['9:00 - 11:00', '11:00 - 13:00', '13:00 - 15:00', '15:00 - 17:00', '17:00 - 19:00'];

export const JobsList: React.FC<JobsListProps> = ({ jobs, onJobSelect, onAddJob }) => {
  const [filter, setFilter] = useState<'pending' | 'completed' | 'cancelled'>('pending');
  const [search, setSearch] = useState('');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState(new Date().toISOString().split('T')[0]);
  const { updateJobStatus, updateJob, removeJob } = useAppStore();
  const currentUser = useCurrentUser();
  const canCancel = currentUser ? can.deleteJob(currentUser.role) || currentUser.role === 'manager' : false;
  const canDelete = currentUser ? can.deleteJob(currentUser.role) : false;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const filteredJobs = jobs.filter(j => {
    if (filter === 'pending' && (j.status === 'completed' || j.status === 'cancelled')) return false;
    if (filter !== 'pending' && j.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        j.client.firstName.toLowerCase().includes(q) ||
        j.client.lastName.toLowerCase().includes(q) ||
        j.client.phone.includes(q) ||
        j.jobNumber.toLowerCase().includes(q) ||
        (j.client.address || '').toLowerCase().includes(q) ||
        j.lockDetails.type.toLowerCase().includes(q) ||
        (j.lockDetails.brand || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Forward progression through the job lifecycle. Each status advances to the next logical step.
  const getButtonConfig = (status: JobStatus): { label: string; color: string; nextStatus: JobStatus } => {
    switch (status) {
      case 'scheduled':    return { label: 'Start',      color: 'bg-blue-600 text-white', nextStatus: 'enRoute' };
      case 'enRoute':      return { label: 'Arrived',    color: 'bg-blue-600 text-white', nextStatus: 'onSite' };
      case 'onSite':       return { label: 'Diagnose',   color: 'bg-blue-600 text-white', nextStatus: 'diagnosed' };
      case 'diagnosed':    return { label: 'Mark Sold',  color: 'bg-amber-500 text-white', nextStatus: 'sold' };
      case 'sold':         return { label: 'Complete',   color: 'bg-green-600 text-white', nextStatus: 'completed' };
      case 'waitingParts': return { label: 'Resume',     color: 'bg-violet-600 text-white', nextStatus: 'diagnosed' };
      case 'coffee':       return { label: 'Resume',     color: 'bg-blue-600 text-white', nextStatus: 'diagnosed' };
      case 'completed':    return { label: 'Done',       color: 'bg-green-600 text-white', nextStatus: 'completed' };
      case 'cancelled':    return { label: 'Closed',     color: 'bg-slate-600 text-white', nextStatus: 'cancelled' };
      default:             return { label: 'Update',     color: 'bg-blue-600 text-white', nextStatus: 'diagnosed' };
    }
  };

  const handleUpdate = (e: React.MouseEvent, jobId: string, currentStatus: JobStatus) => {
    e.stopPropagation();
    if (currentStatus === 'completed' || currentStatus === 'cancelled') return; // terminal
    const config = getButtonConfig(currentStatus);
    updateJobStatus(jobId, config.nextStatus);
    if (config.nextStatus === 'completed') setFilter('completed');
  };

  const handleCancel = (jobId: string) => {
    updateJobStatus(jobId, 'cancelled');
    setFilter('cancelled');
    setCancelingId(null);
  };

  return (
    <div className="space-y-5 pb-24 relative">

      {/* Reschedule Overlay */}
      <AnimatePresence>
      {reschedulingId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6"
        >
           <motion.div
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             exit={{ scale: 0.9, opacity: 0 }}
             className="bg-slate-900 w-full max-w-[280px] rounded-2xl border border-blue-500/20 p-5 shadow-[0_0_40px_rgba(0,229,255,0.15)] space-y-4"
           >
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Reschedule</h3>
                 <button onClick={() => setReschedulingId(null)} className="text-slate-400 hover:text-white"><X size={16}/></button>
              </div>
              <div className="space-y-3">
                 <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <label className="text-xs font-bold text-blue-400 uppercase block mb-1">Service Date</label>
                    <input type="date" className="bg-transparent text-white font-semibold w-full outline-none text-sm" value={tempDate} onChange={e => setTempDate(e.target.value)} />
                 </div>
                 <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-hide">
                    {TIME_WINDOWS.map(window => (
                      <button
                        key={window}
                        onClick={() => {
                          const target = jobs.find(j => j.id === reschedulingId);
                          if (target) updateJob({ ...target, scheduledDate: tempDate, scheduledTime: window.split(' ')[0].padStart(5, '0') });
                          setReschedulingId(null);
                        }}
                        className={`w-full py-2 px-3 rounded-lg text-left text-xs font-semibold border transition-all flex justify-between items-center group ${tempDate === new Date().toISOString().split('T')[0] ? 'bg-blue-500/10 border-blue-500/30 text-white hover:bg-blue-600 hover:text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-blue-500/20'}`}
                      >
                        {window}
                        <ArrowRight size={9} className="opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                 </div>
              </div>
           </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white leading-none">Dispatch Queue</h2>
          <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest mt-2">Operational Hub</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs…"
              className="bg-slate-900 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all w-48"
            />
          </div>
          <button
            onClick={onAddJob}
            className="bg-blue-600 hover:bg-white text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all"
          >
            New Intake
          </button>
        </div>
      </div>

      <div className="flex bg-slate-900/60 p-1 rounded-2xl border border-blue-500/20 backdrop-blur-xl max-w-sm">
        {['pending', 'completed', 'cancelled'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`relative flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-xl transition-all ${filter === f ? 'text-white z-10' : 'text-slate-400 hover:text-white'}`}
          >
            {filter === f && (
              <motion.div
                layoutId="filter-pill"
                className="absolute inset-0 bg-blue-600 rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)] -z-10"
              />
            )}
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredJobs.map((job) => {
            const btn = getButtonConfig(job.status);
            return (
              <div
                key={job.id}
                onClick={() => onJobSelect(job)}
                className="bg-slate-900/80 backdrop-blur-3xl p-4 rounded-2xl border border-white/10 hover:border-blue-500/50 transition-colors group cursor-pointer flex flex-col shadow-lg relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: STATUS_COLORS[job.status] }} />

                <div className="flex flex-col mb-3">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold text-blue-400/80 uppercase tracking-widest">#{job.jobNumber}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-white tracking-tight">${job.totalAmount}</span>
                      <div className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-widest bg-white/5 border border-white/10`} style={{ color: STATUS_COLORS[job.status] }}>
                        {job.status.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-base font-bold text-white leading-none truncate group-hover:translate-x-1 transition-transform">
                      {job.client.firstName} {job.client.lastName}
                    </p>
                    <p className="text-xs font-medium text-slate-400 uppercase mt-1 tracking-tight truncate">{job.lockDetails.type} — {job.lockDetails.brand || 'Elite Unit'}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                   <div className="flex items-center text-slate-400 text-sm">
                     <Clock size={13} className="mr-2 text-blue-400" />
                     <span className="font-semibold uppercase tracking-wider text-xs">{job.scheduledTime}</span>
                   </div>
                   <div className="flex items-start text-slate-400 text-xs">
                     <MapPin size={13} className="mr-2 text-blue-400 mt-0.5 shrink-0" />
                     <span className="font-medium leading-tight truncate">{job.client.address}</span>
                   </div>
                </div>

                <div className="mt-auto pt-4 border-t border-white/10 flex items-center space-x-2">
                   <button
                     onClick={(e) => handleUpdate(e, job.id, job.status)}
                     className={`flex-1 py-2.5 rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-widest text-white shadow-lg hover:scale-105 active:scale-95 transition-all ${btn.color}`}
                   >
                      {job.status === 'completed' ? <CheckCircle2 size={13} className="mr-1.5" /> : <Activity size={13} className="mr-1.5" />}
                      {btn.label}
                   </button>

                   <button
                     onClick={(e) => { e.stopPropagation(); setReschedulingId(job.id); }}
                     className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                     title="Reschedule"
                   >
                      <Calendar size={14} />
                   </button>

                   {canCancel && job.status !== 'cancelled' && job.status !== 'completed' && (
                     <button
                       onClick={(e) => { e.stopPropagation(); setCancelingId(job.id); }}
                       className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20 active:scale-95"
                       title="Cancel Job"
                     >
                        <X size={14} />
                     </button>
                   )}
                   {canDelete && (
                     <button
                       onClick={(e) => { e.stopPropagation(); setDeletingId(job.id); }}
                       className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-600 hover:text-white transition-all border border-red-500/20 active:scale-95"
                       title="Delete Job"
                     >
                        <Trash2 size={14} />
                     </button>
                   )}
                </div>
              </div>
            );
          })}
        {filteredJobs.length === 0 && (
          <div className="col-span-full h-40 flex flex-col items-center justify-center opacity-40">
             <Hash size={28} className="mb-3" />
             <p className="text-sm font-semibold uppercase tracking-widest">Queue Empty</p>
          </div>
        )}
      </div>

      {/* CANCEL CONFIRMATION */}
      <AnimatePresence>
        {cancelingId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 w-full max-w-sm rounded-2xl border border-amber-500/20 p-8 shadow-2xl space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Cancel this job?</h3>
                <p className="text-sm text-slate-400 mt-2">The job moves to Cancelled. You can still find it under the Cancelled filter.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCancelingId(null)} className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest">Keep Job</button>
                <button onClick={() => handleCancel(cancelingId)} className="flex-1 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-widest active:scale-95">Cancel Job</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION */}
      <AnimatePresence>
        {deletingId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 w-full max-w-sm rounded-2xl border border-red-500/20 p-8 shadow-2xl space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 size={28} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Delete this job?</h3>
                <p className="text-sm text-slate-400 mt-2">This permanently removes the job, invoice, and all data. Cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeletingId(null)} className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest">Cancel</button>
                <button onClick={() => { removeJob(deletingId); setDeletingId(null); }} className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-widest active:scale-95 shadow-lg shadow-red-500/20">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
