import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  technicianName: string;
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyPhone: string;
  companyEmail: string;
  licenseNumber: string;
  profilePhoto: string;
  monthlyRevenueTarget: number;
  dailyRevenueTarget: number;
  /** Per-month revenue target overrides, keyed "YYYY-MM". Falls back to monthlyRevenueTarget. */
  monthlyTargets: Record<string, number>;
  geminiApiKey: string;
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings' | 'setMonthlyTarget'>>) => void;
  setMonthlyTarget: (monthKey: string, value: number) => void;
  resetSettings: () => void;
}

/** Resolve the effective monthly target for a given year/month (override → global default). */
export function resolveMonthlyTarget(state: Pick<SettingsState, 'monthlyTargets' | 'monthlyRevenueTarget'>, year: number, month: number): number {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return state.monthlyTargets?.[key] ?? state.monthlyRevenueTarget;
}

export const SETTINGS_DEFAULTS = {
  technicianName: 'Sultan',
  companyName: 'Salem Locksmith',
  companyAddress: '123 Main Street, Suite 100',
  companyCity: 'Portland, OR 97201',
  companyPhone: '(503) 555-0100',
  companyEmail: 'info@salemlocksmith.com',
  licenseNumber: 'LK-00000',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
  monthlyTargets: {} as Record<string, number>,
  geminiApiKey: '',
};

const DEFAULTS = SETTINGS_DEFAULTS;

// EC-4: try localStorage, fall back to sessionStorage if unavailable
const { storage: safeStorage, ephemeral: storageIsEphemeral } = (() => {
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return { storage: localStorage, ephemeral: false };
  } catch {
    return { storage: sessionStorage, ephemeral: true };
  }
})();

export const settingsStorageIsEphemeral = storageIsEphemeral;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      updateSettings: (patch) => set((state) => ({ ...state, ...patch })),
      setMonthlyTarget: (monthKey, value) => set((state) => ({
        monthlyTargets: { ...state.monthlyTargets, [monthKey]: Math.max(1, value) },
      })),
      resetSettings: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'techai-settings',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
