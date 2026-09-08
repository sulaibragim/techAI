import React from 'react';
import { motion } from 'motion/react';
import { Compass, Check, Play, RotateCcw, Eye } from 'lucide-react';
import { useTourStore } from '../tourStore';
import { localize, toursForRole, UI_TEXT } from '../tours';
import { useCurrentUser, can } from '../authStore';
import { useAppStore } from '../store';
import { LanguageToggle } from './LanguageToggle';
import type { TabId } from '../types';

/** Settings card: replay any tour, un-hide the checklist, switch the onboarding language,
 *  or start the whole thing over. Onboarding that can't be re-opened is a one-shot the
 *  second person on the account never gets to see. */
export const GuidedToursCard: React.FC = () => {
  const currentUser = useCurrentUser();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { startTour, resetProgress, setChecklistDismissed, setLang } = useTourStore();
  const progress = useTourStore((s) => s.progressFor(currentUser?.id));
  const lang = progress.lang;

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
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Compass size={16} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-white truncate">{localize(UI_TEXT.guidedToursTitle, lang)}</h3>
        </div>
        <LanguageToggle lang={lang} onChange={(l) => setLang(currentUser.id, l)} />
      </div>

      <div className="space-y-5">
        <p className="text-xs text-slate-500 leading-relaxed">
          {localize(UI_TEXT.guidedToursDescription, lang)}
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
                  <p className="text-[13px] font-semibold text-white truncate">{localize(tour.label, lang)}</p>
                  <p className="text-[11px] text-slate-500 font-medium truncate">{localize(tour.description, lang)}</p>
                </div>
                <button
                  onClick={() => replay(tour.id, tour.tab)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:border-blue-500/40 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
                >
                  {localize(done ? UI_TEXT.replay : UI_TEXT.start, lang)}
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
            <Eye size={13} /> {localize(UI_TEXT.showChecklistAgain, lang)}
          </button>
        )}

        <button
          onClick={restartAll}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          <RotateCcw size={13} /> {localize(UI_TEXT.restartOnboarding, lang)}
        </button>
        <p className="text-[11px] text-slate-600 leading-relaxed -mt-2">
          {localize(UI_TEXT.restartDescription, lang)}
        </p>
      </div>
    </motion.div>
  );
};
