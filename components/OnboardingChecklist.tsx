import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronRight, Rocket, X, Building2, Users, Briefcase, CircleCheck, CreditCard } from 'lucide-react';
import { useAppStore } from '../store';
import { useAuthStore, useCurrentUser, can } from '../authStore';
import { useSettingsStore } from '../settingsStore';
import { useTourStore } from '../tourStore';
import { localize, CHECKLIST_ITEMS, UI_TEXT } from '../tours';
import type { TabId } from '../types';

interface ChecklistProps {
  onAddJob: () => void;
}

/**
 * The path from an empty system to the first paid job. Every item is DERIVED from real
 * data — nothing here is a checkbox someone can tick without doing the work, so it can't
 * drift out of step with the account it describes.
 */
export const OnboardingChecklist: React.FC<ChecklistProps> = ({ onAddJob }) => {
  const currentUser = useCurrentUser();
  const users = useAuthStore((s) => s.users);
  const jobs = useAppStore((s) => s.jobs);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const companyName = useSettingsStore((s) => s.companyName);
  const dismissed = useTourStore((s) => s.progressFor(currentUser?.id).checklistDismissed);
  const lang = useTourStore((s) => s.progressFor(currentUser?.id).lang);
  const setChecklistDismissed = useTourStore((s) => s.setChecklistDismissed);

  const items = useMemo(() => {
    const teammates = users.filter((u) => u.id !== currentUser?.id && u.active !== false).length;
    return [
      {
        id: 'company',
        icon: Building2,
        done: companyName.trim().length > 0,
        go: () => setActiveTab('settings' as TabId),
      },
      {
        id: 'team',
        icon: Users,
        done: teammates > 0,
        go: () => setActiveTab('settings' as TabId),
      },
      {
        id: 'job',
        icon: Briefcase,
        done: jobs.length > 0,
        go: onAddJob,
      },
      {
        id: 'complete',
        icon: CircleCheck,
        done: jobs.some((j) => j.status === 'completed'),
        go: () => setActiveTab('jobs' as TabId),
      },
      {
        id: 'paid',
        icon: CreditCard,
        done: jobs.some((j) => (j.amountPaid || 0) > 0),
        go: () => setActiveTab('accounting' as TabId),
      },
    ];
  }, [users, currentUser?.id, companyName, jobs, setActiveTab, onAddJob]);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Setup guidance belongs to whoever can actually do the setup.
  if (!currentUser || !can.viewAllJobs(currentUser.role)) return null;
  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        data-tour="checklist"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className="bg-slate-900 border border-blue-500/25 rounded-2xl p-5 shadow-[0_0_30px_rgba(59,130,246,0.06)] relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 h-full w-1 bg-blue-500" />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <Rocket size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white tracking-tight">
                {localize(allDone ? UI_TEXT.checklistDoneTitle : UI_TEXT.checklistTitle, lang)}
              </p>
              <p className="text-xs text-slate-400 font-medium">
                {localize(allDone ? UI_TEXT.checklistDoneSubtitle : UI_TEXT.checklistProgress(doneCount, items.length), lang)}
              </p>
            </div>
          </div>
          <button
            onClick={() => setChecklistDismissed(currentUser.id, true)}
            aria-label={localize(UI_TEXT.hideChecklist, lang)}
            className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
          <motion.div
            className={`h-full rounded-full ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
            initial={false}
            animate={{ width: `${(doneCount / items.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>

        <div className="space-y-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            const text = CHECKLIST_ITEMS[item.id];
            return (
              <button
                key={item.id}
                onClick={item.done ? undefined : item.go}
                disabled={item.done}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  item.done
                    ? 'opacity-50 cursor-default'
                    : 'bg-white/5 border border-white/5 hover:border-blue-500/40 hover:bg-white/[0.07] active:scale-[0.995]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    item.done ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/10 text-blue-400'
                  }`}
                >
                  {item.done ? <Check size={13} /> : <Icon size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold ${item.done ? 'text-slate-400 line-through' : 'text-white'}`}>
                    {localize(text.label, lang)}
                  </span>
                  {!item.done && <span className="block text-[11px] text-slate-500 font-medium truncate">{localize(text.hint, lang)}</span>}
                </span>
                {!item.done && <ChevronRight size={14} className="text-slate-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        {allDone && (
          <button
            onClick={() => setChecklistDismissed(currentUser.id, true)}
            className="w-full mt-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.99]"
          >
            {localize(UI_TEXT.hideThis, lang)}
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
