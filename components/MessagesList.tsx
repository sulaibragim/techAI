
import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { MessageSquare, User, Clock, Smartphone, Mail, ChevronRight, Hash } from 'lucide-react';
import { Job, Message } from '../types';

interface MessagesListProps {
  onJobSelect: (job: Job) => void;
}

export const MessagesList: React.FC<MessagesListProps> = ({ onJobSelect }) => {
  const { jobs } = useAppStore();

  const threads = useMemo(() => {
    return jobs
      .filter(job => job.messages && job.messages.length > 0)
      .map(job => {
        const sortedMessages = [...(job.messages || [])].sort((a, b) => {
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
    <div className="space-y-5 pb-24 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Client Inbox</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Communication Stream</p>
        </div>
        <div className="flex items-center space-x-2 text-blue-500 bg-blue-500/5 px-4 py-2.5 rounded-xl border border-blue-500/10">
           <MessageSquare size={15} />
           <span className="text-xs font-bold uppercase tracking-widest">{threads.length} Active Threads</span>
        </div>
      </div>

      <div className="space-y-3 px-2">
        {threads.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl border border-white/10 p-16 flex flex-col items-center justify-center opacity-30 text-center">
            <Smartphone size={28} className="mb-4 text-blue-500" />
            <p className="text-base font-bold tracking-tight">Inbox Zero</p>
            <p className="text-xs font-semibold text-slate-400 mt-2">No active client communications recorded</p>
          </div>
        ) : (
          threads.map(({ job, latestMessage }) => (
            <div
              key={job.id}
              onClick={() => onJobSelect(job)}
              className="bg-slate-900/80 backdrop-blur-3xl p-4 rounded-2xl border border-white/10 hover:border-blue-500/30 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between group shadow-xl overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/30 group-hover:bg-blue-600 transition-colors" />

              <div className="flex items-center space-x-5 flex-1 min-w-0">
                <div className="w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center text-blue-500 border border-white/10 shadow-inner relative shrink-0">
                  <User size={20} />
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-slate-900 flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-tight truncate leading-none">
                      {job.client.firstName} {job.client.lastName}
                    </h3>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">#{job.jobNumber}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {latestMessage.method === 'sms' ? <Smartphone size={11} className="text-blue-500" /> : <Mail size={11} className="text-blue-500" />}
                    <p className="text-sm font-medium text-slate-300 truncate italic">
                       {latestMessage.sender === 'technician' ? 'You: ' : ''}
                       "{latestMessage.content}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2 ml-4 shrink-0">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Clock size={11} />
                  <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{latestMessage.timestamp}</span>
                </div>
                <div className="p-2 bg-white/5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <ChevronRight size={15} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
