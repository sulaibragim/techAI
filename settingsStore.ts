import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  technicianName: string;
  companyName: string;
  profilePhoto: string;
  monthlyRevenueTarget: number;
  dailyRevenueTarget: number;
  geminiApiKey: string;
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings'>>) => void;
  resetSettings: () => void;
}

export const SETTINGS_DEFAULTS = {
  technicianName: 'Sultan',
  companyName: 'Salem Locksmith',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
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
      resetSettings: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'techai-settings',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
