
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Briefcase, BarChart2, Settings, LogOut, BrainCircuit, Phone, MessageSquare, AlertCircle, X, Activity } from 'lucide-react';
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
    <aside className="hidden md:flex flex-col w-72 bg-slate-900 border-r border-white/10 h-screen sticky top-0 py-10 shadow-2xl z-40">
      <div className="px-8 mb-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none flex items-center gap-2">
          Pulse<span className="text-blue-400">OS</span>
        </h1>
        <p className="text-xs font-medium uppercase text-slate-300 tracking-widest mt-3 flex items-center"><Activity size={12} className="mr-1 text-blue-400" /> Field Dynamics</p>
      </div>

      <nav className="px-4 space-y-2 mb-10 overflow-y-auto scrollbar-hide relative">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-xl transition-all duration-300 group relative ${
                isActive ? 'text-blue-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-tab"
                  className="absolute inset-0 bg-blue-500/10 border border-blue-500/20 rounded-xl"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <div className={`relative z-10 p-2 rounded-lg transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'bg-transparent group-hover:bg-white/5'}`}>
                <Icon size={18} />
              </div>
              <span className="relative z-10 font-semibold uppercase text-xs tracking-wider">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 px-6 space-y-8 overflow-y-auto scrollbar-hide">
        {inProgressJob && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 shadow-lg group transition-all relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="flex items-center space-x-2 text-amber-500 mb-4">
              <AlertCircle size={14} />
              <span className="text-xs font-bold uppercase tracking-widest">Active Task</span>
            </div>
            <p className="text-sm font-semibold text-white truncate mb-5 uppercase tracking-wide">{inProgressJob.client.lastName} — {inProgressJob.appliance.type}</p>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold text-white leading-none">28<span className="text-xs text-amber-500 ml-1 font-semibold">m left</span></div>
              <div className="w-16 h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: '70%' }} />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
           <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-400 px-3 flex justify-between items-center">
             <span>Attention</span>
             {missedInteractions.length > 0 && (
               <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded-lg font-bold">{missedInteractions.length}</span>
             )}
           </h3>
           <div className="space-y-2">
             <AnimatePresence>
               {missedInteractions.map(mi => (
                 <motion.div 
                   key={mi.id} 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center space-x-3 group relative hover:border-white/10 transition-all"
                 >
                   <img src={mi.avatar} className="w-10 h-10 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" alt="" />
                   <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate uppercase">{mi.from}</p>
                      <p className="text-xs text-slate-400 font-medium uppercase mt-1">{mi.timestamp}</p>
                   </div>
                   <button onClick={() => clearMissed(mi.id)} className="opacity-0 group-hover:opacity-100 text-red-500 p-2 hover:bg-red-500/10 rounded-lg transition-all">
                      <X size={14} />
                   </button>
                 </motion.div>
               ))}
             </AnimatePresence>
           </div>
        </div>
      </div>

      <div className="px-6 mt-6 pt-6 border-t border-white/10">
        <button className="flex items-center space-x-3 text-slate-400 hover:text-red-400 transition-all w-full px-6 py-4 font-semibold uppercase text-xs tracking-wider bg-white/5 rounded-xl hover:bg-red-500/10 group">
          <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
          <span>Exit OS</span>
        </button>
      </div>
    </aside>
  );
};
