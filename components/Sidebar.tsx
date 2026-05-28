
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Briefcase, BarChart2, Settings, LogOut, BrainCircuit, Phone, MessageSquare, AlertCircle, X, Activity, Package, Users } from 'lucide-react';
import { useAppStore } from '../store';

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getTimeRemaining(scheduledDate: string, scheduledTime: string): { label: string; pct: number } {
  const scheduled = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
  const now = Date.now();
  const minsLeft = Math.round((scheduled - now) / 60000);
  if (minsLeft <= 0) return { label: 'overdue', pct: 100 };
  if (minsLeft >= 120) return { label: `${Math.round(minsLeft / 60)}h left`, pct: 10 };
  const pct = Math.max(5, Math.min(95, 100 - (minsLeft / 60) * 100));
  return { label: `${minsLeft}m left`, pct };
}

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { missedInteractions, clearMissed, jobs, inventory } = useAppStore();
  const lowStockCount = inventory.filter(p => p.stock <= p.reorderPoint).length;

  const tabs = [
    { id: 'calendar', label: 'Workroom', icon: Calendar },
    { id: 'jobs', label: 'My Jobs', icon: Briefcase },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'analytics', label: 'Financials', icon: BarChart2 },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'brain', label: 'AI Brain', icon: BrainCircuit },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const inProgressJob = jobs.find(j => j.status === 'enRoute' || j.status === 'diagnosed');

  return (
    <aside className="hidden md:flex flex-col w-56 bg-slate-900 border-r border-white/10 h-screen sticky top-0 py-6 shadow-2xl z-40">
      <div className="px-5 mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none flex items-center gap-2">
          Pulse<span className="text-blue-400">OS</span>
        </h1>
        <p className="text-xs font-medium uppercase text-slate-300 tracking-widest mt-2 flex items-center"><Activity size={11} className="mr-1 text-blue-400" /> Field Dynamics</p>
      </div>

      <nav className="px-3 space-y-1 mb-6 overflow-y-auto scrollbar-hide relative">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 group relative ${
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
              <div className={`relative z-10 p-1.5 rounded-lg transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'bg-transparent group-hover:bg-white/5'}`}>
                <Icon size={16} />
              </div>
              <span className="relative z-10 font-semibold uppercase text-xs tracking-wider flex-1">{tab.label}</span>
              {tab.id === 'inventory' && lowStockCount > 0 && (
                <span className="relative z-10 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {lowStockCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 px-4 space-y-5 overflow-y-auto scrollbar-hide">
        {inProgressJob && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 shadow-lg group transition-all relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="flex items-center space-x-2 text-amber-500 mb-3">
              <AlertCircle size={13} />
              <span className="text-xs font-bold uppercase tracking-widest">Active Task</span>
            </div>
            <p className="text-sm font-semibold text-white truncate mb-3 uppercase tracking-wide">{inProgressJob.client.lastName} — {inProgressJob.lockDetails.type}</p>
            {(() => {
              const { label, pct } = getTimeRemaining(inProgressJob.scheduledDate, inProgressJob.scheduledTime);
              return (
                <div className="flex items-end justify-between">
                  <div className="text-xl font-bold text-white leading-none">
                    <span className="text-xs text-amber-500 font-semibold">{label}</span>
                  </div>
                  <div className="w-12 h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-3">
           <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-400 px-2 flex justify-between items-center">
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
                   className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center space-x-3 group relative hover:border-white/10 transition-all"
                 >
                   <img src={mi.avatar} className="w-8 h-8 rounded-lg object-cover grayscale group-hover:grayscale-0 transition-all" alt="" />
                   <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate uppercase">{mi.from}</p>
                      <p className="text-xs text-slate-400 font-medium uppercase mt-0.5">{formatRelativeTime(mi.timestamp)}</p>
                   </div>
                   <button onClick={() => clearMissed(mi.id)} className="opacity-0 group-hover:opacity-100 text-red-500 p-1.5 hover:bg-red-500/10 rounded-lg transition-all">
                      <X size={13} />
                   </button>
                 </motion.div>
               ))}
             </AnimatePresence>
           </div>
        </div>
      </div>

      <div className="px-4 mt-4 pt-4 border-t border-white/10">
        <button className="flex items-center space-x-3 text-slate-400 hover:text-red-400 transition-all w-full px-4 py-3 font-semibold uppercase text-xs tracking-wider bg-white/5 rounded-xl hover:bg-red-500/10 group">
          <LogOut size={16} className="group-hover:translate-x-1 transition-transform" />
          <span>Exit OS</span>
        </button>
      </div>
    </aside>
  );
};
