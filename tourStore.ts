import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import type { Lang } from './tours';

/**
 * Onboarding progress: which guided tours a person finished, which tabs they have already
 * opened, whether they hid the first-steps checklist, and which language the onboarding
 * text shows in.
 *
 * Two properties this has to get right:
 *  - It is PER USER, not per company. Settings are one shared blob, so putting it there
 *    would mean the owner finishing the tour hides it from every technician forever.
 *  - It is per user ON THIS DEVICE too: the shop tablet is shared, so progress is keyed by
 *    user id rather than stored flat, and signing in as someone else shows their own state.
 *
 * The server copy (users.tour_progress) is what makes the tour not replay on a second
 * device, and what carries a language choice from one device to another. Local state is
 * the fast path; the server is merged in on sign-in.
 */
export interface TourProgress {
  completed: string[];
  seenTabs: string[];
  checklistDismissed: boolean;
  lang: Lang;
}

const EMPTY: TourProgress = { completed: [], seenTabs: [], checklistDismissed: false, lang: 'en' };

interface TourState {
  /** userId → progress. Keyed so a shared device never leaks one person's state to another. */
  byUser: Record<string, TourProgress>;
  /** The tour currently on screen, if any. */
  activeTourId: string | null;
  stepIndex: number;
  /** Set when the welcome card is showing (it precedes the first tour step). */
  showWelcome: boolean;

  progressFor: (userId: string | null | undefined) => TourProgress;
  hasCompleted: (userId: string | null | undefined, tourId: string) => boolean;
  hasSeenTab: (userId: string | null | undefined, tab: string) => boolean;

  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  /** Ends the run and records it as done — Skip and Finish both land here on purpose:
   *  a tour the person dismissed must not ambush them again on the next screen. */
  endTour: (userId: string | null | undefined) => void;
  dismissWelcome: (userId: string | null | undefined) => void;

  markTabSeen: (userId: string | null | undefined, tab: string) => void;
  setChecklistDismissed: (userId: string | null | undefined, dismissed: boolean) => void;
  /** Switches the onboarding language. Does not touch progress — switching languages
   *  mid-training should not restart the tour the person is already partway through. */
  setLang: (userId: string | null | undefined, lang: Lang) => void;
  /** Clears tour/checklist progress for this user, locally and on the server, so
   *  everything replays — but keeps their language choice; a reset is not a language reset. */
  resetProgress: (userId: string | null | undefined) => Promise<void>;
  /** Pulls the server copy and unions it into the local one. Called after sign-in. */
  syncProgress: (userId: string | null | undefined) => Promise<void>;
}

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

async function pushProgress(patch: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/tour`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(patch),
    });
  } catch {
    // Losing a tour checkbox to a flaky network is not worth a retry queue: the worst
    // case is one extra tooltip on another device, and local state already has it.
  }
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => {
      const patchUser = (userId: string | null | undefined, fn: (p: TourProgress) => TourProgress) => {
        if (!userId) return;
        set((state) => ({
          byUser: { ...state.byUser, [userId]: fn(state.byUser[userId] || EMPTY) },
        }));
      };

      return {
        byUser: {},
        activeTourId: null,
        stepIndex: 0,
        showWelcome: false,

        // Returns a STABLE reference when nothing has changed: byUser[userId] (once
        // migrated at hydration, see `merge` below) or the module-level EMPTY constant.
        // A selector like `useTourStore(s => s.progressFor(id))` re-runs this on every
        // render, so allocating a fresh object here — e.g. `{...EMPTY, ...p}` — would hand
        // back a new reference each time and spin the component into an infinite
        // render loop ("getSnapshot should be cached").
        progressFor: (userId) => (userId && get().byUser[userId]) || EMPTY,
        hasCompleted: (userId, tourId) => get().progressFor(userId).completed.includes(tourId),
        hasSeenTab: (userId, tab) => get().progressFor(userId).seenTabs.includes(tab),

        startTour: (tourId) => set({ activeTourId: tourId, stepIndex: 0, showWelcome: false }),
        nextStep: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
        prevStep: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),

        endTour: (userId) => {
          const id = get().activeTourId;
          set({ activeTourId: null, stepIndex: 0 });
          if (!id || !userId) return;
          patchUser(userId, (p) => ({ ...p, completed: union(p.completed, [id]) }));
          void pushProgress({ completed: [id] });
        },

        // Declining the welcome card must also count as "seen", or it reappears on the
        // next reload and starts feeling like a popup ad for your own software.
        dismissWelcome: (userId) => {
          set({ showWelcome: false });
          if (!userId) return;
          patchUser(userId, (p) => ({ ...p, completed: union(p.completed, ['welcome-card']) }));
          void pushProgress({ completed: ['welcome-card'] });
        },

        markTabSeen: (userId, tab) => {
          if (!userId || get().hasSeenTab(userId, tab)) return;
          patchUser(userId, (p) => ({ ...p, seenTabs: union(p.seenTabs, [tab]) }));
          void pushProgress({ seenTabs: [tab] });
        },

        setChecklistDismissed: (userId, dismissed) => {
          patchUser(userId, (p) => ({ ...p, checklistDismissed: dismissed }));
          void pushProgress({ checklistDismissed: dismissed });
        },

        setLang: (userId, lang) => {
          patchUser(userId, (p) => ({ ...p, lang }));
          void pushProgress({ lang });
        },

        resetProgress: async (userId) => {
          if (!userId) return;
          const lang = get().progressFor(userId).lang;
          set((state) => ({
            byUser: { ...state.byUser, [userId]: { ...EMPTY, lang } },
            activeTourId: null,
            stepIndex: 0,
            showWelcome: false,
          }));
          // replace:true — the server unions by default, which would restore every id we
          // just cleared on the next sync and make "Restart tours" do nothing. `lang` rides
          // along unchanged: resetting the tour is not the same thing as resetting the
          // language someone deliberately picked.
          await pushProgress({ replace: true, completed: [], seenTabs: [], checklistDismissed: false, lang });
        },

        syncProgress: async (userId) => {
          if (!userId) return;
          try {
            const res = await fetch(`${API_BASE}/api/auth/tour`, { headers: { ...authHeaders() } });
            if (!res.ok) return;
            const remote = (await res.json()) as Partial<TourProgress> | null;
            if (!remote || typeof remote !== 'object') return;
            patchUser(userId, (p) => ({
              completed: union(p.completed, remote.completed || []),
              seenTabs: union(p.seenTabs, remote.seenTabs || []),
              checklistDismissed: p.checklistDismissed || !!remote.checklistDismissed,
              // The server is the cross-device source of truth for language: whichever
              // device picked one last should win on the others, not "OR" like the booleans.
              lang: remote.lang === 'ru' || remote.lang === 'en' ? remote.lang : p.lang,
            }));
          } catch {
            // Offline sign-in: local progress stands on its own.
          }
        },
      };
    },
    {
      name: 'techai-tours-v1',
      storage: createJSONStorage(() => {
        try {
          localStorage.setItem('__tour_test__', '1');
          localStorage.removeItem('__tour_test__');
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      // Never persist which step is on screen — a reload mid-tour should not reopen the
      // overlay on top of whatever the person came back to do.
      partialize: (state) => ({ byUser: state.byUser }),
      // Backfills `lang` (added after this store shipped) onto any record saved before it
      // existed. Runs ONCE, when the persisted blob is read off disk — not on every
      // `progressFor` call — so every entry in `byUser` is a complete, stable TourProgress
      // by the time any component reads it.
      merge: (persisted, current) => {
        const stored = (persisted as { byUser?: Record<string, Partial<TourProgress>> } | null)?.byUser || {};
        const byUser: Record<string, TourProgress> = {};
        for (const [userId, progress] of Object.entries(stored)) byUser[userId] = { ...EMPTY, ...progress };
        return { ...current, byUser };
      },
    }
  )
);
