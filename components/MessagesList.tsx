import React, { useMemo, useEffect, useState } from 'react';
import { useAppStore, useVisibleJobs } from '../store';
import { formatTimestamp } from '../dateUtils';
import { MessageSquare, User, Clock, Smartphone, ChevronRight, RefreshCw, Send, Radio } from 'lucide-react';
import { Job } from '../types';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';

const PHONE_NUMBER_ID = 'PNkhFHiD2G';

interface MessagesListProps {
  onJobSelect: (job: Job) => void;
}

interface LiveMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
  contact?: { name?: string };
}

export const MessagesList: React.FC<MessagesListProps> = ({ onJobSelect }) => {
  const jobs = useVisibleJobs();
  const [liveMessages, setLiveMessages] = useState<LiveMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'jobs'>('live');
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/openphone/messages?phoneNumberId=${PHONE_NUMBER_ID}`, { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setLiveMessages(data.data || []);
      setBackendOnline(true);
    } catch {
      setLiveMessages(null);
      setBackendOnline(false);
      setActiveTab('jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  const jobThreads = useMemo(() => {
    return jobs
      .filter(j => j.messages && j.messages.length > 0)
      .map(j => {
        const sorted = [...(j.messages || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return { job: j, latest: sorted[0] };
      })
      .sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp));
  }, [jobs]);

  const sendReply = async (to: string) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch(`${API_BASE}/api/openphone/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ to, content: replyText.trim(), phoneNumberId: PHONE_NUMBER_ID }),
      });
      setReplyText('');
      setReplyOpen(null);
      await fetchMessages();
    } catch {
      alert('Send failed — is the backend running?');
    } finally {
      setSending(false);
    }
  };

  const tabs = [
    { id: 'live' as const, label: 'OpenPhone', count: liveMessages?.length ?? 0, disabled: !backendOnline },
    { id: 'jobs' as const, label: 'Job Threads', count: jobThreads.length },
  ];

  return (
    <div className="space-y-5 pb-24 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Client Inbox</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Communication Stream</p>
        </div>
        <div className="flex items-center gap-3">
          {backendOnline && (
            <div className="flex items-center space-x-2 text-green-400 bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/20">
              <Radio size={12} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">OpenPhone Live</span>
            </div>
          )}
          <button
            onClick={fetchMessages}
            disabled={loading}
            className="p-2.5 bg-slate-900 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="px-2 flex bg-slate-900/60 p-1 rounded-2xl border border-white/10 max-w-xs">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            disabled={t.disabled}
            className={`relative flex-1 py-2 px-3 text-xs font-semibold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
              t.disabled ? 'opacity-30 cursor-not-allowed text-slate-500' :
              activeTab === t.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === t.id ? 'bg-white/20' : 'bg-white/5'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3 px-2">
        {/* OpenPhone live messages */}
        {activeTab === 'live' && (
          loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-900/80 p-4 rounded-2xl border border-white/10 animate-pulse h-20" />
            ))
          ) : !liveMessages || liveMessages.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-16 flex flex-col items-center justify-center opacity-30 text-center">
              <Smartphone size={28} className="mb-4 text-blue-500" />
              <p className="text-base font-bold tracking-tight">No messages yet</p>
              <p className="text-xs font-semibold text-slate-400 mt-2">OpenPhone messages will appear here</p>
            </div>
          ) : (
            liveMessages.map((msg) => {
              const isOut = msg.direction === 'outgoing';
              const senderName = msg.contact?.name || (isOut ? 'You' : msg.from);
              const number = isOut ? msg.to : msg.from;
              const time = new Date(msg.createdAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              });

              return (
                <div key={msg.id} className="space-y-2">
                  <div className={`bg-slate-900/80 backdrop-blur-3xl p-4 rounded-2xl border border-white/10 ${isOut ? 'hover:border-blue-500/30' : 'hover:border-green-500/30'} transition-all shadow-xl relative overflow-hidden`}>
                    <div className={`absolute top-0 left-0 w-1 h-full ${isOut ? 'bg-blue-600/40' : 'bg-green-500/40'}`} />
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                          <User size={16} className={isOut ? 'text-blue-500' : 'text-green-500'} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white leading-none">{senderName}</p>
                          <p className="text-xs text-slate-500 font-semibold mt-0.5 tracking-widest uppercase">{number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock size={10} />
                          <span className="text-xs font-bold tabular-nums">{time}</span>
                        </div>
                        {!isOut && (
                          <button
                            onClick={() => setReplyOpen(replyOpen === msg.id ? null : msg.id)}
                            className="p-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all active:scale-90"
                            title="Reply"
                          >
                            <Send size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed pl-13">{msg.body}</p>
                  </div>

                  {/* Inline reply box */}
                  {replyOpen === msg.id && (
                    <div className="bg-slate-800/80 rounded-xl border border-blue-500/20 p-3 flex gap-2 ml-4">
                      <input
                        autoFocus
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply(msg.from)}
                        placeholder={`Reply to ${msg.from}…`}
                        className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => sendReply(msg.from)}
                        disabled={sending || !replyText.trim()}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Send size={12} />
                        {sending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}

        {/* Job-linked message threads */}
        {activeTab === 'jobs' && (
          jobThreads.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-white/10 p-16 flex flex-col items-center justify-center opacity-30 text-center">
              <MessageSquare size={28} className="mb-4 text-blue-500" />
              <p className="text-base font-bold tracking-tight">Inbox Zero</p>
              <p className="text-xs font-semibold text-slate-400 mt-2">No job-linked messages yet</p>
            </div>
          ) : (
            jobThreads.map(({ job, latest }) => (
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
                      <Smartphone size={11} className="text-blue-500" />
                      <p className="text-sm font-medium text-slate-300 truncate italic">
                        {latest.sender === 'technician' ? 'You: ' : ''}
                        "{latest.content}"
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-2 ml-4 shrink-0">
                  <div className="flex items-center space-x-2 text-slate-500">
                    <Clock size={11} />
                    <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{formatTimestamp(latest.timestamp)}</span>
                  </div>
                  <div className="p-2 bg-white/5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <ChevronRight size={15} />
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};
