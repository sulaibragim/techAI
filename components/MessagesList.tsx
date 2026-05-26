
import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { MessageSquare, User, Clock, Smartphone, Mail, ChevronRight, Hash } from 'lucide-react';
import { Job, Message } from '../types';

interface MessagesListProps {
  onJobSelect: (job: Job) => void;
}

export const MessagesList: React.FC<MessagesListProps> = ({ onJobSelect }) => {
  const { jobs } = useAppStore();

  // Aggregate and sort threads by the latest message in each job
  const threads = useMemo(() => {
    return jobs
      .filter(job => job.messages && job.messages.length > 0)
      .map(job => {
        const sortedMessages = [...(job.messages || [])].sort((a, b) => {
          // Simple time comparison for mock data (HH:mm format)
          // In a real app we'd use ISO dates
          return b.timestamp.localeCompare(a.timestamp);
        });
        return {
          job,
          latestMessage: sortedMessages[0],
          allMessages: sortedMessages
        };
      })
      .sort((a, b) => b.latestMessage.timestamp.localeCompare(a.latestMessage.timestamp));
  }, [jobs]);

  return (
    <div className="space-y-10 pb-32 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-white leading-none uppercase">Client Inbox</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-4">Communication Stream</p>
        </div>
        <div className="flex items-center space-x-3 text-blue-500 bg-blue-500/5 px-6 py-3 rounded-2xl border border-blue-500/10">
           <MessageSquare size={18} />
           <span className="text-xs font-bold uppercase tracking-widest">{threads.length} Active Threads</span>
        </div>
      </div>

      <div className="space-y-4 px-4">
        {threads.length === 0 ? (
          <div className="bg-slate-900 rounded-[3rem] border border-white/10 p-20 flex flex-col items-center justify-center opacity-30 text-center">
            <Smartphone size={48} className="mb-6 text-blue-500" />
            <p className="text-xl font-bold uppercase tracking-widest">Inbox Zero</p>
            <p className="text-xs font-bold uppercase tracking-tight mt-2">No active client communications recorded</p>
          </div>
        ) : (
          threads.map(({ job, latestMessage }) => (
            <div 
              key={job.id} 
              onClick={() => onJobSelect(job)}
              className="bg-slate-900/80 backdrop-blur-3xl p-8 rounded-[3rem] border border-white/10 hover:border-blue-500/30 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between group shadow-xl overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/30 group-hover:bg-blue-600 transition-colors" />
              
              <div className="flex items-center space-x-8 flex-1 min-w-0">
                <div className="w-16 h-16 bg-slate-950 rounded-[1.8rem] flex items-center justify-center text-blue-500 border border-white/10 shadow-inner relative shrink-0">
                  <User size={24} />
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full border-2 border-[#111827] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-xl font-bold text-white uppercase tracking-tighter truncate leading-none">
                      {job.client.firstName} {job.client.lastName}
                    </h3>
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">#{job.jobNumber}</span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {latestMessage.method === 'sms' ? <Smartphone size={12} className="text-blue-500" /> : <Mail size={12} className="text-blue-500" />}
                    <p className="text-sm font-medium text-slate-300 truncate italic">
                       {latestMessage.sender === 'technician' ? 'You: ' : ''}
                       "{latestMessage.content}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-3 ml-6 shrink-0">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Clock size={12} />
                  <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{latestMessage.timestamp}</span>
                </div>
                <div className="p-3 bg-white/5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <ChevronRight size={18} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Interaction Metrics Footer */}
      {threads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
           <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-xl">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Response Velocity</p>
              <p className="text-3xl font-bold text-white leading-none tracking-tighter">4.2<span className="text-xs text-blue-500 ml-2">min</span></p>
           </div>
           <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-xl">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">SLA Compliance</p>
              <p className="text-3xl font-bold text-white leading-none tracking-tighter">98<span className="text-xs text-green-500 ml-2">%</span></p>
           </div>
           <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-white/10 shadow-xl">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Sentiment Index</p>
              <p className="text-3xl font-bold text-white leading-none tracking-tighter">Elite</p>
           </div>
        </div>
      )}
    </div>
  );
};
