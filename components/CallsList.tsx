import React from 'react';
import { useAppStore } from '../store';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, ChevronRight, User } from 'lucide-react';

export const CallsList: React.FC = () => {
  const { callHistory } = useAppStore();

  const getCallIcon = (type: string) => {
    switch (type) {
      case 'incoming': return <PhoneIncoming size={16} className="text-green-500" />;
      case 'outgoing': return <PhoneOutgoing size={16} className="text-blue-500" />;
      case 'missed': return <PhoneMissed size={16} className="text-red-500" />;
      default: return <Phone size={16} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-10 pb-32 max-w-5xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-white leading-none uppercase">Call History</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-4">Communication Ledger</p>
        </div>
        <div className="flex items-center space-x-3 text-blue-500 bg-blue-500/5 px-6 py-3 rounded-2xl border border-blue-500/10">
           <Phone size={18} />
           <span className="text-xs font-bold uppercase tracking-widest">{callHistory.length} Total Records</span>
        </div>
      </div>

      <div className="space-y-4 px-4">
        {callHistory.length === 0 ? (
          <div className="bg-slate-900 rounded-[3rem] border border-white/10 p-20 flex flex-col items-center justify-center opacity-30 text-center">
            <Phone size={48} className="mb-6 text-blue-500" />
            <p className="text-xl font-bold uppercase tracking-widest">No History</p>
          </div>
        ) : (
          callHistory.map((call) => (
            <div 
              key={call.id} 
              onClick={() => window.location.href = `tel:${call.phone}`}
              className="bg-slate-900/80 backdrop-blur-3xl p-8 rounded-[3rem] border border-white/10 hover:border-blue-500/30 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between group shadow-xl relative"
            >
              <div className="flex items-center space-x-8 flex-1 min-w-0">
                <div className="w-16 h-16 bg-slate-950 rounded-[1.8rem] overflow-hidden flex items-center justify-center border border-white/10 shadow-inner shrink-0">
                  <img src={call.avatar} className="w-full h-full object-cover" alt="" />
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-xl font-bold text-white uppercase tracking-tighter truncate leading-none">
                      {call.from}
                    </h3>
                    <div className="bg-white/5 px-2 py-1 rounded-lg">
                      {getCallIcon(call.type)}
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{call.phone}</p>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-3 ml-6 shrink-0">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Clock size={12} />
                  <span className="text-xs font-bold uppercase tracking-widest tabular-nums">{call.timestamp}</span>
                </div>
                {call.duration && (
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{call.duration}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};