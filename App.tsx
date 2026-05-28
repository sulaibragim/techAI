import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { JobsList } from './components/JobsList';
import { WorkroomDashboard } from './components/WorkroomDashboard';
import { JobWizard } from './components/JobWizard';
import { VoiceAssistant } from './components/VoiceAssistant';
import { AIChat } from './components/AIChat';
import { JobDetail } from './components/JobDetail';
import { MessagesList } from './components/MessagesList';
import { CallsList } from './components/CallsList';
import { Inventory } from './components/Inventory';
import { useAppStore } from './store';
import { useSettingsStore } from './settingsStore';
import { Settings } from './components/Settings';
import { ClientsList } from './components/ClientsList';
import { Bell, AlertCircle, CheckCircle2, X, Menu } from 'lucide-react';

const App: React.FC = () => {
  const { jobs, addJob, activeTab, setActiveTab } = useAppStore();
  const { technicianName, profilePhoto } = useSettingsStore();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{msg: string, type: 'info' | 'success'} | null>(null);

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const inProgressJob = jobs.find(j => j.status === 'enRoute' || j.status === 'diagnosed');


  // Keyboard shortcuts
  useEffect(() => {
    const TAB_KEYS: Record<string, string> = {
      '1': 'calendar', '2': 'jobs', '3': 'messages', '4': 'calls',
      '5': 'clients', '6': 'analytics', '7': 'inventory', '8': 'brain', '9': 'settings',
    };
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setIsWizardOpen(true); return; }
      if (e.key === 'Escape') { setSelectedJobId(null); setIsWizardOpen(false); return; }
      if (TAB_KEYS[e.key]) { e.preventDefault(); setActiveTab(TAB_KEYS[e.key]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab]);

  const renderContent = () => {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: -20, filter: "blur(2px)", scale: 0.98 }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)", scale: 1 }}
          exit={{ opacity: 0, x: 20, filter: "blur(2px)", scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 1 }}
          className="h-full"
        >
          {(() => {
            switch (activeTab) {
              case 'calendar': return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => setIsWizardOpen(true)} />;
              case 'jobs': return <JobsList jobs={jobs} onAddJob={() => setIsWizardOpen(true)} onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'messages': return <MessagesList onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'calls': return <CallsList />;
              case 'clients': return <ClientsList onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'analytics': return <Dashboard />;
              case 'inventory': return <Inventory />;
              case 'brain': return <AIChat />;
              case 'settings': return <Settings />;
              default: return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => setIsWizardOpen(true)} />;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row font-sans text-gray-100 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Sidebar for Desktop only */}
      <Sidebar currentTab={activeTab} onTabChange={setActiveTab} />

      {/* Bottom Nav for Mobile only */}
      <div className="md:hidden">
        <Navigation currentTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Elite Dispatch Bar */}
        {inProgressJob && (
          <div className="bg-gradient-to-r from-[#00E5FF]/20 to-transparent border-b border-blue-500/20 text-white px-4 md:px-8 py-2 md:py-3 flex items-center justify-between shadow-[0_0_20px_rgba(0,229,255,0.1)] z-50 sticky top-0 md:relative backdrop-blur-xl">
             <div className="flex items-center space-x-3 md:space-x-5">
                <div className="w-6 h-6 md:w-7 md:h-7 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center animate-pulse"><AlertCircle size={13} /></div>
                <div>
                   <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 opacity-80">Active Dispatch</span>
                   <p className="text-xs font-bold uppercase tracking-tight truncate max-w-[120px] md:max-w-none">{inProgressJob.client.lastName}</p>
                </div>
             </div>
             <button onClick={() => setSelectedJobId(inProgressJob.id)} className="text-xs font-bold uppercase tracking-wider bg-blue-600 text-white px-4 md:px-5 py-1.5 md:py-2 rounded-xl hover:bg-blue-500/90 transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] active:scale-95">Engage</button>
          </div>
        )}

        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              className="fixed top-20 right-4 md:right-8 z-[100] bg-slate-900/80 border border-t-blue-500/40 border-blue-500/10 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.8)] flex items-center space-x-3 backdrop-blur-3xl max-w-[90vw] md:max-w-none"
            >
              <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 shrink-0"><CheckCircle2 size={14} /></div>
              <span className="text-xs font-bold uppercase tracking-widest text-gray-200 line-clamp-1">{notification.msg}</span>
              <button onClick={() => setNotification(null)} className="p-1 text-slate-500 hover:text-blue-400 transition-colors"><X size={13} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="px-4 md:px-8 py-4 md:py-6 flex items-center justify-between border-b border-white/10 bg-slate-950/80 backdrop-blur-3xl sticky top-0 md:relative z-40 shadow-sm">
          <div>
             <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-0.5">PulseOS</h2>
             <h3 className="text-lg md:text-2xl font-bold capitalize tracking-tight text-white">{activeTab === 'calendar' ? 'Workroom' : activeTab}</h3>
          </div>
          <div className="flex items-center space-x-3 md:space-x-6">
            <button className="relative group">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-7 h-7 md:w-9 md:h-9 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-blue-400 transition-all"
                >
                    <Bell size={15} />
                </motion.div>
                <div className="absolute top-0 right-0 w-2 h-2 bg-blue-600 rounded-full border-2 border-[#030303] animate-pulse shadow-lg" />
            </button>
            <div className="flex items-center space-x-2 md:space-x-3 pl-0 md:pl-6 border-l-0 md:border-l md:border-white/10">
                <div className="hidden sm:block text-right">
                    <p className="text-xs font-semibold text-white">{technicianName}</p>
                    <p className="text-xs font-medium text-blue-400 uppercase tracking-widest mt-0.5 animate-pulse">Online</p>
                </div>
                <motion.div
                  whileHover={{ scale: 1.05, borderColor: "rgba(0, 229, 255, 0.5)" }}
                  className="w-7 h-7 md:w-9 md:h-9 bg-gray-900 border border-white/10 rounded-lg overflow-hidden shadow-md group cursor-pointer transition-all"
                >
                    <img src={profilePhoto || "https://i.pravatar.cc/150?u=tech1"} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Profile" />
                </motion.div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-3 md:p-8 overflow-y-auto scrollbar-hide bg-slate-950">
          <div className="max-w-[1600px] mx-auto pb-20 md:pb-0">{renderContent()}</div>
        </main>
      </div>

      <VoiceAssistant />

      {isWizardOpen && (
        <JobWizard
          onCancel={() => setIsWizardOpen(false)}
          onComplete={(job) => { addJob(job); setIsWizardOpen(false); }}
        />
      )}
      {selectedJob && <JobDetail job={selectedJob} onClose={() => setSelectedJobId(null)} />}
    </div>
  );
};

export default App;
