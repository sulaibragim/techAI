import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, MessageSquare, KeyRound, X } from 'lucide-react';
import { useTourStore } from '../tourStore';
import { localize, tabTourFor, tourById, welcomeTourFor, UI_TEXT } from '../tours';
import { useCurrentUser, can } from '../authStore';
import { useAppStore } from '../store';
import { TourOverlay } from './TourOverlay';
import { LanguageToggle } from './LanguageToggle';
import type { TabId } from '../types';

interface TourHostProps {
  activeTab: string;
  /** True while a full-screen surface (job card, wizard) is open — nothing may interrupt it. */
  paused?: boolean;
}

/**
 * Runs the onboarding: the welcome card on first sign-in, the role tour it launches, and
 * the short per-tab tours that fire the first time someone opens a screen.
 *
 * Deliberately the only place that decides WHEN a tour appears — components just carry
 * `data-tour` anchors, and the store only records what has been seen.
 */
export const TourHost: React.FC<TourHostProps> = ({ activeTab, paused }) => {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id;
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const {
    activeTourId, stepIndex, showWelcome,
    startTour, nextStep, prevStep, endTour, dismissWelcome, setLang,
    markTabSeen, syncProgress,
  } = useTourStore();

  const tour = activeTourId ? tourById(activeTourId) : undefined;
  const welcomeTour = currentUser ? welcomeTourFor(currentUser.role) : undefined;
  // Subscribed, not read once: "Start onboarding over" has to bring the welcome card back,
  // and a language switch has to re-render every string on screen — neither is a one-time read.
  const progress = useTourStore((s) => s.progressFor(userId));
  const lang = progress.lang;

  // Pull the server copy once per sign-in, so a tour finished on the desktop doesn't
  // replay on the phone.
  useEffect(() => {
    if (userId) void syncProgress(userId);
  }, [userId, syncProgress]);

  // Offer the welcome card once. `welcome-card` is recorded separately from the tour id so
  // that declining the offer and completing the tour are distinguishable.
  useEffect(() => {
    if (!userId || paused || !welcomeTour) return;
    if (useTourStore.getState().activeTourId) return;
    if (progress.completed.includes('welcome-card') || progress.completed.includes(welcomeTour.id)) return;
    const t = setTimeout(() => useTourStore.setState({ showWelcome: true }), 700);
    return () => clearTimeout(t);
  }, [userId, paused, welcomeTour?.id, progress.completed]);

  // First visit to a tab: remember it (this drives the "not opened yet" dots in the nav)
  // and run that tab's short tour, once the welcome flow is out of the way.
  const tabTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !currentUser) return;
    const store = useTourStore.getState();
    const firstVisit = !store.hasSeenTab(userId, activeTab);
    markTabSeen(userId, activeTab);

    if (!firstVisit || paused || store.activeTourId || store.showWelcome) return;
    if (welcomeTour && !store.hasCompleted(userId, welcomeTour.id) && !store.hasCompleted(userId, 'welcome-card')) return;

    const tabTour = tabTourFor(currentUser.role, activeTab);
    if (!tabTour || store.hasCompleted(userId, tabTour.id)) return;

    // Let the screen finish mounting (tabs are code-split) before pointing at it.
    tabTimer.current = window.setTimeout(() => {
      const s = useTourStore.getState();
      if (!s.activeTourId && !s.showWelcome) s.startTour(tabTour.id);
    }, 900);
    return () => { if (tabTimer.current) window.clearTimeout(tabTimer.current); };
  }, [activeTab, userId, currentUser?.role, paused, markTabSeen, welcomeTour?.id]);

  // A step may live on another tab — switch before it is measured.
  useEffect(() => {
    const target = tour?.steps[stepIndex]?.tab;
    if (target) setActiveTab(target as TabId);
  }, [tour?.id, stepIndex, setActiveTab]);

  // A tour must never outlive the screen it explains.
  useEffect(() => {
    if (paused && useTourStore.getState().activeTourId) {
      useTourStore.setState({ activeTourId: null, stepIndex: 0, showWelcome: false });
    }
  }, [paused]);

  if (!currentUser || paused) return null;

  const startWelcome = () => {
    if (!welcomeTour) return;
    dismissWelcome(userId);
    startTour(welcomeTour.id);
  };

  const askAssistant = () => {
    dismissWelcome(userId);
    setActiveTab('brain');
  };

  return (
    <>
      <AnimatePresence>
        {showWelcome && welcomeTour && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-7 shadow-[0_32px_80px_rgba(0,0,0,0.7)] relative"
            >
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <LanguageToggle lang={lang} onChange={(l) => setLang(userId, l)} />
                <button
                  onClick={() => dismissWelcome(userId)}
                  aria-label={localize(UI_TEXT.closeWelcome, lang)}
                  className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mb-5">
                <KeyRound size={24} className="text-blue-400" />
              </div>

              <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
                {localize(UI_TEXT.welcomeHeading(currentUser.name?.split(' ')[0]), lang)}
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                {localize(UI_TEXT.welcomeBody, lang)}
              </p>

              <div className="space-y-2.5">
                <button
                  onClick={startWelcome}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-[0.99] shadow-lg shadow-blue-900/40 text-left"
                >
                  <Compass size={20} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{localize(UI_TEXT.showMeAround, lang)}</span>
                    <span className="block text-xs text-blue-100/80">{localize(UI_TEXT.quickStops(welcomeTour.steps.length), lang)}</span>
                  </span>
                </button>

                {can.useAIBrain(currentUser.role) && (
                  <button
                    onClick={askAssistant}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/40 text-white transition-all active:scale-[0.99] text-left"
                  >
                    <MessageSquare size={20} className="shrink-0 text-blue-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{localize(UI_TEXT.askInstead, lang)}</span>
                      <span className="block text-xs text-slate-400">{localize(UI_TEXT.askInsteadHint, lang)}</span>
                    </span>
                  </button>
                )}

                <button
                  onClick={() => dismissWelcome(userId)}
                  className="w-full py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {localize(UI_TEXT.figureItOut, lang)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {tour && (
        <TourOverlay
          steps={tour.steps}
          stepIndex={Math.min(stepIndex, tour.steps.length - 1)}
          lang={lang}
          onLangChange={(l) => setLang(userId, l)}
          onNext={nextStep}
          onPrev={prevStep}
          onFinish={() => endTour(userId)}
          onSkip={() => endTour(userId)}
        />
      )}
    </>
  );
};
