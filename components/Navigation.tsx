import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Briefcase, BarChart2, BrainCircuit, MessageSquare, Phone, Package, Users, Settings, MoreHorizontal, X, LogOut, Receipt } from 'lucide-react';
import { useAuthStore, useCurrentUser, visibleTabsFor, ROLE_LABELS } from '../authStore';

interface NavigationProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

const PRIMARY_ALL = [
  { id: 'calendar', label: 'Work', icon: Calendar },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'messages', label: 'Inbox', icon: MessageSquare },
  { id: 'analytics', label: 'Stats', icon: BarChart2 },
];

const MORE_ALL = [
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'accounting', label: 'Books', icon: Receipt },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'brain', label: 'AI Brain', icon: BrainCircuit },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  const [showMore, setShowMore] = useState(false);
  const logout = useAuthStore(s => s.logout);
  const currentUser = useCurrentUser();
  const allowed = currentUser ? visibleTabsFor(currentUser.role) : [];
  const PRIMARY = PRIMARY_ALL.filter(t => allowed.includes(t.id));
  const MORE = MORE_ALL.filter(t => allowed.includes(t.id));
  const moreActive = MORE.some(t => t.id === currentTab);

  const select = (id: string) => {
    onTabChange(id);
    setShowMore(false);
  };

  return (
    <>
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMore(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 rounded-t-3xl z-50 pb-20 pt-2 px-4"
            >
              <div className="flex items-center justify-between px-2 py-3">
                <div>
                  <h3 className="text-sm font-bold text-white">More</h3>
                  {currentUser && <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">{currentUser.name} · {ROLE_LABELS[currentUser.role]}</p>}
                </div>
                <button onClick={() => setShowMore(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {MORE.map(tab => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => select(tab.id)}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border transition-colors ${
                        isActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-300'
                      }`}
                    >
                      <Icon size={22} />
                      <span className="text-xs font-semibold">{tab.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => { setShowMore(false); logout(); }}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400"
                >
                  <LogOut size={22} />
                  <span className="text-xs font-semibold">Log Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 px-2 py-2.5 flex justify-around items-center z-40">
        {PRIMARY.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => select(tab.id)}
              className={`flex flex-col items-center gap-1 w-16 py-1 transition-colors ${
                isActive ? 'text-blue-500' : 'text-slate-400'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowMore(v => !v)}
          className={`flex flex-col items-center gap-1 w-16 py-1 transition-colors ${
            moreActive || showMore ? 'text-blue-500' : 'text-slate-400'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className="text-xs font-semibold">More</span>
        </button>
      </nav>
    </>
  );
};
