import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

/**
 * Onboarding progress: which guided tours a person finished, which tabs they have already
 * opened, and whether they hid the first-steps checklist.
 *
 * Two properties this has to get right:
 *  - It is PER USER, not per company. Settings are one shared blob, so putting it there
 *    would mean the owner finishing the tour hides it from every technician forever.
 *  - It is per user ON THIS DEVICE too: the shop tablet is shared, so progress is keyed by
 *    user id rather than stored flat, and signing in as someone else shows their own state.
 *
 * The server copy (users.tour_progress) is what makes the tour not replay on a second
 * device. Local state is the fast path; the server is merged in on sign-in.
 */
export interface TourProgress {
  completed: string[];
  seenTabs: string[];
  checklistDismissed: boolean;
}

const EMPTY: TourProgress = { completed: [], seenTabs: [], checklistDismissed: false };

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
  /** Clears everything for this user, locally and on the server, so tours replay. */
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

        resetProgress: async (userId) => {
          if (!userId) return;
          set((state) => ({
            byUser: { ...state.byUser, [userId]: { ...EMPTY } },
            activeTourId: null,
            stepIndex: 0,
            showWelcome: false,
          }));
          // replace:true — the server unions by default, which would restore every id we
          // just cleared on the next sync and make "Restart tours" do nothing.
          await pushProgress({ replace: true, completed: [], seenTabs: [], checklistDismissed: false });
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
    }
  )
);
