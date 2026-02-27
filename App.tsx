import React, { useState, useEffect } from 'react';
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
import { useAppStore } from './store';
import { Bell, AlertCircle, CheckCircle2, X, Menu } from 'lucide-react';

const App: React.FC = () => {
  const { jobs, addJob, activeTab, setActiveTab } = useAppStore();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{msg: string, type: 'info' | 'success'} | null>(null);

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const inProgressJob = jobs.find(j => j.status === 'enRoute' || j.status === 'diagnosed');

  useEffect(() => {
    const timer = setTimeout(() => {
      setNotification({ msg: "System Sync: Barbara K. arrival scheduled for 13:00", type: 'info' });
      setTimeout(() => setNotification(null), 5000);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'calendar': return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => setIsWizardOpen(true)} />;
      case 'jobs': return <JobsList jobs={jobs} onAddJob={() => setIsWizardOpen(true)} onJobSelect={(job) => setSelectedJobId(job.id)} />;
      case 'messages': return <MessagesList onJobSelect={(job) => setSelectedJobId(job.id)} />;
      case 'calls': return <CallsList />;
      case 'analytics': return <Dashboard />;
      case 'brain': return <AIChat />;
      case 'settings': return (
        <div className="flex flex-col items-center justify-center min-h-[500px] text-gray-500">
          <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/5">
            <AlertCircle size={32} className="opacity-20" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.5em]">System Core Preferences</p>
        </div>
      );
      default: return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => setIsWizardOpen(true)} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col md:flex-row font-sans text-gray-100 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Sidebar for Desktop only */}
      <Sidebar currentTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Bottom Nav for Mobile only */}
      <div className="md:hidden">
        <Navigation currentTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Elite Dispatch Bar - Desktop original scale restored */}
        {inProgressJob && (
          <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white px-4 md:px-12 py-3 md:py-4 flex items-center justify-between shadow-2xl z-50 border-b border-white/10 sticky top-0 md:relative">
             <div className="flex items-center space-x-3 md:space-x-6">
                <div className="w-6 h-6 md:w-8 md:h-8 bg-white/20 rounded-lg flex items-center justify-center animate-pulse"><AlertCircle size={14} /></div>
                <div>
                   <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Active Job</span>
                   <p className="text-[10px] md:text-xs font-black uppercase tracking-tight truncate max-w-[120px] md:max-w-none">{inProgressJob.client.lastName}</p>
                </div>
             </div>
             <button onClick={() => setSelectedJobId(inProgressJob.id)} className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] bg-white text-blue-600 px-4 md:px-6 py-2 md:py-2.5 rounded-xl hover:bg-blue-50 transition-all shadow-lg active:scale-95">Record</button>
          </div>
        )}

        {notification && (
          <div className="fixed top-24 right-4 md:right-12 z-[100] bg-[#111827] border border-white/10 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.5)] flex items-center space-x-3 md:space-x-5 animate-in slide-in-from-right-12 duration-500 backdrop-blur-3xl max-w-[90vw] md:max-w-none">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500 shrink-0"><CheckCircle2 size={16} /></div>
            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-gray-200 line-clamp-1">{notification.msg}</span>
            <button onClick={() => setNotification(null)} className="p-1 md:p-2 text-gray-600 hover:text-white transition-colors"><X size={14} /></button>
          </div>
        )}

        {/* Header - Desktop original padding restored */}
        <header className="px-4 md:px-12 py-6 md:py-12 flex items-center justify-between border-b border-white/5 bg-[#0F172A]/50 backdrop-blur-3xl sticky top-0 md:relative z-40">
          <div>
             <h2 className="text-[7px] md:text-[10px] font-black uppercase tracking-[0.5em] text-gray-600 mb-1 md:mb-2">Salem Fleet OS</h2>
             <h3 className="text-xl md:text-4xl font-black capitalize tracking-tighter text-white">{activeTab === 'calendar' ? 'Workroom' : activeTab}</h3>
          </div>
          <div className="flex items-center space-x-3 md:space-x-8">
            <button className="relative group">
                <div className="w-8 h-8 md:w-14 md:h-14 bg-white/5 rounded-lg md:rounded-2xl flex items-center justify-center text-gray-500 group-hover:text-white transition-all border border-white/5 group-hover:border-blue-500/30">
                    <Bell size={18} />
                </div>
                <div className="absolute top-0 right-0 w-2 h-2 md:w-3 md:h-3 bg-red-500 rounded-full border border-[#0F172A] shadow-lg" />
            </button>
            <div className="flex items-center space-x-2 md:space-x-4 pl-0 md:pl-8 border-l-0 md:border-l md:border-white/10">
                <div className="hidden sm:block text-right">
                    <p className="text-[10px] font-black text-white uppercase leading-none">Elite Tech #1</p>
                    <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mt-1">Online</p>
                </div>
                <div className="w-8 h-8 md:w-14 md:h-14 bg-blue-600 rounded-lg md:rounded-2xl overflow-hidden border-2 border-white/10 shadow-xl group cursor-pointer">
                    <img src="https://i.pravatar.cc/150?u=tech1" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Profile" />
                </div>
            </div>
          </div>
        </header>

        {/* Main - Desktop padding restored */}
        <main className="flex-1 p-4 md:p-12 overflow-y-auto scrollbar-hide">
          <div className="max-w-[1600px] mx-auto pb-24 md:pb-0">{renderContent()}</div>
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