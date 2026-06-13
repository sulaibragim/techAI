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
import { Accounting } from './components/Accounting';
import { useAppStore, useVisibleJobs, hasPendingJobWrite } from './store';
import { useSettingsStore } from './settingsStore';
import { useCurrentUser, useAuthStore, visibleTabsFor, ROLE_LABELS } from './authStore';
import { getToken, authHeaders } from './apiClient';
import { API_BASE } from './backendUrl';
import type { Job, TechStatus } from './types';
import { Settings } from './components/Settings';
import { ClientsList } from './components/ClientsList';
import { AutoKey } from './components/AutoKey';
import { Login } from './components/Login';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Bell, AlertCircle, CheckCircle2, X, Menu } from 'lucide-react';
import type { TabId } from './types';

const App: React.FC = () => {
  const { addJob, activeTab, setActiveTab } = useAppStore();
  const { profilePhoto } = useSettingsStore();
  const { setTechStatus, setTechLocation } = useAuthStore();
  const currentUser = useCurrentUser();
  const jobs = useVisibleJobs();
  const allowedTabs = currentUser ? visibleTabsFor(currentUser.role) : [];
  const effectiveTab = (allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] || 'calendar')) as TabId;
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<{ phone?: string; name?: string }>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [clientFocusId, setClientFocusId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{msg: string, type: 'info' | 'success'} | null>(null);

  const openClient = (clientId: string) => { setClientFocusId(clientId); setActiveTab('clients'); };
  const openWizard = (seed?: { phone?: string; name?: string }) => { setWizardSeed(seed || {}); setIsWizardOpen(true); };
  // Caller with no client record yet → start a job prefilled with their number, so
  // one tap turns an unknown call into a saved client + job.
  const newJobFromCall = (phone: string, name?: string) => openWizard({ phone, name });

  // When a technician marks themselves Available, grab their current GPS so dispatch
  // can rank them by distance to a client. Permission denial / no-GPS just no-ops.
  const handleTechStatusChange = (status: TechStatus) => {
    if (!currentUser) return;
    setTechStatus(currentUser.id, status);
    if (status === 'available' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setTechLocation(currentUser.id, { lat: pos.coords.latitude, lng: pos.coords.longitude, updatedAt: new Date().toISOString() }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);
  const ACTIVE_STATUSES = ['enRoute', 'onSite', 'diagnosed', 'sold', 'waitingParts'];
  const inProgressJob = jobs.find(j => ACTIVE_STATUSES.includes(j.status));

  useEffect(() => {
    if (!currentUser) return;
    useAuthStore.getState().syncUsers();
    useSettingsStore.getState().syncSettings();
    useSettingsStore.getState().checkAiAvailable();
    useAppStore.getState().syncJobs();
    useAppStore.getState().syncInventory();
    // Ongoing live updates (including new website leads) are handled by the pull-only
    // job poll below — no periodic two-way syncJobs here, which could overwrite a
    // teammate's newer server update with a stale local copy.
  }, [currentUser?.id]);

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

      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openWizard(); return; }
      if (e.key === 'Escape') { setSelectedJobId(null); setIsWizardOpen(false); return; }
      if (TAB_KEYS[e.key]) {
        const target = TAB_KEYS[e.key];
        if (!currentUser || !visibleTabsFor(currentUser.role).includes(target)) return;
        e.preventDefault();
        setActiveTab(target as TabId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab, currentUser]);

  // Auto-dismiss toast notifications after a few seconds.
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(t);
  }, [notification]);

  // Live sync: poll the server for job changes made on other devices (a tech finishing a
  // job, collecting payment, accepting/declining) so the dispatcher sees them without a
  // manual refresh. Pull-only — never push a stale local job over a teammate's update.
  useEffect(() => {
    if (!currentUser) return;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`${API_BASE}/api/jobs`, { headers: { ...authHeaders() } });
        if (!res.ok || stopped) return;
        const serverJobs: Job[] = await res.json();
        const local = useAppStore.getState().jobs;
        const localById = new Map(local.map(j => [j.id, j]));
        const users = useAuthStore.getState().users;
        const techName = (id?: string) => users.find(u => u.id === id)?.name || 'Technician';

        const notes: string[] = [];
        for (const sj of serverJobs) {
          const lj = localById.get(sj.id);
          if (!lj) continue; // brand-new jobs just appear in the list
          if (hasPendingJobWrite(sj.id)) continue; // our own in-flight change — don't self-notify
          if (sj.status === 'completed' && lj.status !== 'completed') {
            notes.push(`${techName(sj.assignedTo)} completed #${sj.jobNumber}`);
          } else if ((sj.amountPaid || 0) > (lj.amountPaid || 0) && (sj.paymentStatus === 'paid' || sj.paymentStatus === 'partial')) {
            notes.push(`Payment on #${sj.jobNumber}: $${(sj.amountPaid || sj.totalAmount || 0).toLocaleString()}`);
          } else if (sj.status === 'enRoute' && lj.status !== 'enRoute') {
            notes.push(`${techName(sj.assignedTo)} is on the way to #${sj.jobNumber}`);
          } else if (sj.acceptanceStatus === 'accepted' && lj.acceptanceStatus !== 'accepted') {
            notes.push(`${techName(sj.assignedTo)} accepted #${sj.jobNumber}`);
          } else if (sj.acceptanceStatus === 'declined' && lj.acceptanceStatus !== 'declined') {
            notes.push(`#${sj.jobNumber} was declined — reassign`);
          }
        }

        // Merge rather than blindly replace: for any job with an in-flight local write,
        // keep the optimistic local version (or drop it if we just deleted it locally) so
        // the poll can't revert a "payment confirmed"/status change before its PUT lands.
        const merged: Job[] = serverJobs.flatMap(sj => {
          if (hasPendingJobWrite(sj.id)) {
            const lj = localById.get(sj.id);
            return lj ? [lj] : []; // keep our edit; or honor our local delete
          }
          return [sj];
        });
        const serverIds = new Set(serverJobs.map(j => j.id));
        const localPendingNew = local.filter(lj => !serverIds.has(lj.id) && hasPendingJobWrite(lj.id));
        const nextJobs = [...merged, ...localPendingNew];
        if (JSON.stringify(local) !== JSON.stringify(nextJobs)) {
          useAppStore.setState({ jobs: nextJobs });
        }
        if (notes.length && !stopped) {
          setNotification({ msg: notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0], type: 'success' });
        }
      } catch { /* offline — retry next tick */ }
    };
    const id = setInterval(poll, 8000);
    return () => { stopped = true; clearInterval(id); };
  }, [currentUser?.id]);

  const { onboardingComplete } = useSettingsStore();

  // Require both an identity and a valid server-issued token. A stale localStorage
  // session without a token (e.g. after the auth upgrade) is forced to re-login.
  if (!currentUser || !getToken()) return <Login />;

  // Onboarding shows for any owner who hasn't completed it (e.g. fresh install or after a reset).
  if (!onboardingComplete && currentUser.role === 'owner') return <OnboardingWizard />;

  const renderContent = () => {
    // No AnimatePresence/exit here on purpose: mode="wait" holds the outgoing tab
    // until its exit animation finishes, so if rAF ever stalls (backgrounded tab,
    // low-power device) the incoming tab never mounts and the screen looks frozen.
    // A keyed enter-only fade swaps instantly and can never get stuck.
    return (
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          className="h-full"
        >
          {(() => {
            switch (effectiveTab) {
              case 'calendar': return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => openWizard()} />;
              case 'jobs': return <JobsList jobs={jobs} onAddJob={() => openWizard()} onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'messages': return <MessagesList onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'calls': return <CallsList onClientSelect={openClient} onCreateJobFromCall={newJobFromCall} />;
              case 'clients': return <ClientsList onJobSelect={(job) => setSelectedJobId(job.id)} focusClientId={clientFocusId} onFocusConsumed={() => setClientFocusId(null)} />;
              case 'analytics': return <Dashboard />;
              case 'accounting': return <Accounting onJobSelect={(job) => setSelectedJobId(job.id)} />;
              case 'autokey': return <AutoKey />;
              case 'inventory': return <Inventory />;
              case 'brain': return <AIChat />;
              case 'settings': return <Settings />;
              default: return <WorkroomDashboard onJobSelect={(j) => setSelectedJobId(j.id)} onAddJob={() => openWizard()} />;
            }
          })()}
        </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row font-sans text-gray-100 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Sidebar for Desktop only */}
      <Sidebar currentTab={effectiveTab} onTabChange={setActiveTab} />

      {/* Bottom Nav for Mobile only */}
      <div className="md:hidden">
        <Navigation currentTab={effectiveTab} onTabChange={setActiveTab} />
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
             <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-0.5">TrustKey</h2>
             <h3 className="text-lg md:text-2xl font-bold capitalize tracking-tight text-white">{effectiveTab === 'calendar' ? 'Workroom' : effectiveTab}</h3>
          </div>
          <div className="flex items-center space-x-3 md:space-x-6">
            <button onClick={() => setActiveTab('calendar')} title="New-lead alerts (Workroom)" className="relative group">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-7 h-7 md:w-9 md:h-9 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-blue-400 transition-all"
                >
                    <Bell size={15} />
                </motion.div>
                {jobs.some(j => j.isNewLead) && (
                  <div className="absolute top-0 right-0 w-2 h-2 bg-blue-600 rounded-full border-2 border-[#030303] animate-pulse shadow-lg" />
                )}
            </button>
            {currentUser.role === 'technician' && (
              <select
                value={currentUser.techStatus || 'offDuty'}
                onChange={e => handleTechStatusChange(e.target.value as TechStatus)}
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  currentUser.techStatus === 'available' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                  currentUser.techStatus === 'onJob' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                  'bg-slate-800 border-white/10 text-slate-400'
                }`}
              >
                <option value="available">Available</option>
                <option value="onJob">On Job</option>
                <option value="offDuty">Off Duty</option>
              </select>
            )}
            <div className="flex items-center space-x-2 md:space-x-3 pl-0 md:pl-6 border-l-0 md:border-l md:border-white/10">
                <div className="hidden sm:block text-right">
                    <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                    <p className="text-xs font-medium text-blue-400 uppercase tracking-widest mt-0.5">{ROLE_LABELS[currentUser.role]}</p>
                </div>
                <motion.div
                  onClick={() => setActiveTab('settings')}
                  role="button"
                  title="Open settings"
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
          initialPhone={wizardSeed.phone}
          initialName={wizardSeed.name}
          onCancel={() => { setIsWizardOpen(false); setWizardSeed({}); }}
          onComplete={(job) => { addJob(job); setIsWizardOpen(false); setWizardSeed({}); }}
        />
      )}
      {selectedJob && <JobDetail key={selectedJob.id} job={selectedJob} onClose={() => setSelectedJobId(null)} onOpenJob={(j) => setSelectedJobId(j.id)} />}
    </div>
  );
};

export default App;
