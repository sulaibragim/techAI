import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Field-side state for the Auto-Key tool: which rows the team confirmed on real jobs
// (the "golden" tier that overrides catalog data), per-vehicle gotcha notes, which
// programmers the shop owns (to highlight relevant procedures), and the default
// programming fee used to auto-build a quote. Persisted locally; can move to the
// backend later so the whole team shares it.
export interface VehicleConfirmation {
  confirmed: boolean;
  note?: string;
  updatedAt: string;
  by?: string;
}

interface VehicleKeyState {
  confirmations: Record<string, VehicleConfirmation>; // key = `${make}|${model}|${yearStart}`
  ownedProgrammers: string[];
  programmingFee: number;
  toggleConfirm: (key: string, by?: string) => void;
  setNote: (key: string, note: string) => void;
  toggleProgrammer: (name: string) => void;
  setProgrammingFee: (n: number) => void;
}

export const useVehicleKeyStore = create<VehicleKeyState>()(
  persist(
    (set) => ({
      confirmations: {},
      ownedProgrammers: [],
      programmingFee: 75,
      toggleConfirm: (key, by) =>
        set((s) => {
          const prev = s.confirmations[key];
          return {
            confirmations: {
              ...s.confirmations,
              [key]: { confirmed: !prev?.confirmed, note: prev?.note, by, updatedAt: new Date().toISOString() },
            },
          };
        }),
      setNote: (key, note) =>
        set((s) => ({
          confirmations: {
            ...s.confirmations,
            [key]: { confirmed: s.confirmations[key]?.confirmed ?? false, note, updatedAt: new Date().toISOString() },
          },
        })),
      toggleProgrammer: (name) =>
        set((s) => ({
          ownedProgrammers: s.ownedProgrammers.includes(name)
            ? s.ownedProgrammers.filter((p) => p !== name)
            : [...s.ownedProgrammers, name],
        })),
      setProgrammingFee: (n) => set({ programmingFee: n }),
    }),
    { name: 'techai-autokey-v1', storage: createJSONStorage(() => localStorage) }
  )
);

// Common programmer tools a shop might own — used for the "my tools" selector.
export const COMMON_PROGRAMMERS = [
  'Autel IM508', 'Autel IM608', 'Xhorse VVDI Key Tool Plus', 'AutoProPad G2',
  'Lonsdor K518', 'Smart Pro', 'CGDI', 'Abrites AVDI', 'KeyDIY',
];

export const profileKey = (p: { make: string; model: string; yearStart: number }) =>
  `${p.make}|${p.model}|${p.yearStart}`;
