import React from 'react';
import { useAppStore } from '../store';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, ChevronRight, User, PhoneCall } from 'lucide-react';

export const CallsList: React.FC = () => {
  const { calls } = useAppStore();
  const callHistory = calls || [];

  const getCallIcon = (type: string) => {
    switch (type) {
      case 'incoming': return <PhoneIncoming size={14} className="text-green-500" />;
      case 'outgoing': return <PhoneOutgoing size={14} className="text-blue-500" />;
      case 'missed': return <PhoneMissed size={14} className="text-red-500" />;
      default: return <Phone size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Call History</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Communication Ledger</p>
        </div>
        <div className="flex items-center space-x-2 text-blue-500 bg-blue-500/5 px-4 py-2.5 rounded-xl border border-blue-500/10">
           <Phone size={15} />
           <span className="text-xs font-bold uppercase tracking-widest">{callHistory.length} Total Records</span>
        </div>
      </div>

      <div className="space-y-3 px-2">
        {callHistory.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl border border-white/10 p-16 flex flex-col items-center justify-center opacity-30 text-center">
            <Phone size={28} className="mb-4 text-blue-500" />
            <p className="text-base font-bold tracking-tight">No call history yet</p>
          </div>
        ) : (
          callHistory.map((call) => (
            <div
              key={call.id}
              className="bg-slate-900/80 backdrop-blur-3xl p-4 rounded-2xl border border-white/10 hover:border-blue-500/30 hover:scale-[1.01] transition-all flex items-center justify-between group shadow-xl relative"
            >
              <div className="flex items-center space-x-5 flex-1 min-w-0">
                <div className="w-12 h-12 bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-white/10 shadow-inner shrink-0">
                  <img src={call.avatar} className="w-full h-full object-cover" alt="" />
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-tight truncate leading-none">
                      {call.from}
                    </h3>
                    <div className="bg-white/5 px-2 py-0.5 rounded-lg">
                      {getCallIcon(call.type)}
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{call.phone}</p>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2 ml-4 shrink-0">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Clock size={11} />
                  <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{call.timestamp}</span>
                </div>
                {call.duration && (
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{call.duration}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${call.phone}`; }}
                  className="p-2 bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white rounded-xl transition-all active:scale-90"
                  title="Call"
                >
                  <PhoneCall size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
