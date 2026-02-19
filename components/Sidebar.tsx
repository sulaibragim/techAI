
import React from 'react';
import { Calendar, Briefcase, BarChart2, Settings, LogOut, BrainCircuit, Phone, MessageSquare, AlertCircle, X } from 'lucide-react';
import { useAppStore } from '../store';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { missedInteractions, clearMissed, jobs } = useAppStore();
  
  const tabs = [
    { id: 'calendar', label: 'Workroom', icon: Calendar },
    { id: 'jobs', label: 'My Jobs', icon: Briefcase },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'analytics', label: 'Financials', icon: BarChart2 },
    { id: 'brain', label: 'AI Brain', icon: BrainCircuit },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const inProgressJob = jobs.find(j => j.status === 'enRoute' || j.status === 'diagnosed');

  return (
    <aside className="hidden md:flex flex-col w-72 bg-[#111827] border-r border-[#1F2937] h-screen sticky top-0 py-10 shadow-2xl z-40">
      <div className="px-8 mb-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">Salem<span className="text-blue-500">AI</span></h1>
        <p className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider mt-3 italic">Field Tech OS v1.2</p>
      </div>

      <nav className="px-4 space-y-2 mb-10 overflow-y-auto scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-500 border border-blue-500/10' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent group-hover:bg-gray-800'}`}>
                <Icon size={18} />
              </div>
              <span className="font-bold uppercase text-[11px] tracking-wider">{tab.label}</span>
              {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3B82F6]" />}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 px-6 space-y-8 overflow-y-auto scrollbar-hide">
        {inProgressJob && (
          <div className="bg-amber-500/[0.05] border border-amber-500/10 rounded-3xl p-6 shadow-xl group transition-all">
            <div className="flex items-center space-x-2 text-amber-500 mb-4">
              <AlertCircle size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Active Task</span>
            </div>
            <p className="text-xs font-bold text-white truncate mb-5 uppercase tracking-normal">{inProgressJob.client.lastName} — {inProgressJob.appliance.type}</p>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold text-white leading-none">28<span className="text-[10px] text-amber-500/80 ml-1 font-bold">m left</span></div>
              <div className="w-16 h-1.5 bg-amber-500/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: '70%' }} />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
           <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-3 flex justify-between">
             <span>Attention</span>
             <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded-lg">{missedInteractions.length}</span>
           </h3>
           <div className="space-y-2">
             {missedInteractions.map(mi => (
               <div key={mi.id} className="bg-gray-800/40 p-4 rounded-2xl border border-white/5 flex items-center space-x-3 group relative hover:bg-gray-800 transition-all">
                 <img src={mi.avatar} className="w-10 h-10 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" alt="" />
                 <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate uppercase">{mi.from}</p>
                    <p className="text-[9px] text-gray-500 font-medium uppercase mt-1">{mi.timestamp}</p>
                 </div>
                 <button onClick={() => clearMissed(mi.id)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-all">
                    <X size={14} />
                 </button>
               </div>
             ))}
           </div>
        </div>
      </div>

      <div className="px-6 mt-6 pt-6 border-t border-white/5">
        <button className="flex items-center space-x-3 text-gray-500 hover:text-red-400 transition-all w-full px-6 py-4 font-bold uppercase text-[11px] tracking-wider bg-white/[0.02] rounded-2xl hover:bg-red-500/10 group">
          <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
          <span>Exit OS</span>
        </button>
      </div>
    </aside>
  );
};
