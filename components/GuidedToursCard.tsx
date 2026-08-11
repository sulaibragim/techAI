import React from 'react';
import { motion } from 'motion/react';
import { Compass, Check, Play, RotateCcw, Eye } from 'lucide-react';
import { useTourStore } from '../tourStore';
import { toursForRole } from '../tours';
import { useCurrentUser, can } from '../authStore';
import { useAppStore } from '../store';
import type { TabId } from '../types';

/** Settings card: replay any tour, un-hide the checklist, or start the whole thing over.
 *  Onboarding that can't be re-opened is a one-shot the second person on the account
 *  never gets to see. */
export const GuidedToursCard: React.FC = () => {
  const currentUser = useCurrentUser();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { startTour, resetProgress, setChecklistDismissed } = useTourStore();
  const progress = useTourStore((s) => s.progressFor(currentUser?.id));

  if (!currentUser) return null;
  const tours = toursForRole(currentUser.role);

  const replay = (tourId: string, tab?: string) => {
    if (tab) setActiveTab(tab as TabId);
    // Give the tab a beat to mount before the overlay starts measuring its anchors.
    setTimeout(() => startTour(tourId), tab ? 350 : 0);
  };

  const restartAll = async () => {
    await resetProgress(currentUser.id);
    setActiveTab('calendar' as TabId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-white/5 rounded-2xl p-6"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Compass size={16} className="text-blue-400" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-white">Guided Tours</h3>
      </div>

      <div className="space-y-5">
        <p className="text-xs text-slate-500 leading-relaxed">
          Short walkthroughs that run on their own the first time you open a screen. Replay any of them
          here — handy when a new person joins and needs to be shown around.
        </p>

        <div className="space-y-1.5">
          {tours.map((tour) => {
            const done = progress.completed.includes(tour.id);
            return (
              <div
                key={tour.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5"
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    done ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {done ? <Check size={12} /> : <Play size={11} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white truncate">{tour.label}</p>
                  <p className="text-[11px] text-slate-500 font-medium truncate">{tour.description}</p>
                </div>
                <button
                  onClick={() => replay(tour.id, tour.tab)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:border-blue-500/40 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
                >
                  {done ? 'Replay' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>

        {can.viewAllJobs(currentUser.role) && progress.checklistDismissed && (
          <button
            onClick={() => setChecklistDismissed(currentUser.id, false)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            <Eye size={13} /> Show the first-steps checklist again
          </button>
        )}

        <button
          onClick={restartAll}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          <RotateCcw size={13} /> Start onboarding over
        </button>
        <p className="text-[11px] text-slate-600 leading-relaxed -mt-2">
          Brings back the welcome screen, every tour, and the “not opened yet” markers on the tabs — as if
          you were signing in for the first time. It touches nothing but your own onboarding: no job,
          client, setting, or teammate is affected.
        </p>
      </div>
    </motion.div>
  );
};
