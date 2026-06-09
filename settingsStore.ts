import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

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
  monthlyTargets: Record<string, number>;
  geminiApiKey: string;
  onboardingComplete: boolean;
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings' | 'setMonthlyTarget' | 'syncSettings'>>) => void;
  setMonthlyTarget: (monthKey: string, value: number) => void;
  resetSettings: () => void;
  syncSettings: () => Promise<void>;
}

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
  onboardingComplete: false,
};

const DEFAULTS = SETTINGS_DEFAULTS;

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

function pushToServer(patch: Record<string, any>) {
  fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

function migrateOldSettings(): Partial<typeof DEFAULTS> {
  try {
    const old = safeStorage.getItem('techai-settings');
    if (old) {
      const parsed = JSON.parse(old);
      const state = parsed?.state || {};
      safeStorage.removeItem('techai-settings');
      return state;
    }
  } catch {}
  return {};
}

const migrated = migrateOldSettings();

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      ...migrated,

      updateSettings: (patch) => {
        set((state) => ({ ...state, ...patch }));
        const clean = { ...patch } as any;
        delete clean.profilePhoto; // don't send large base64 to server
        if (Object.keys(clean).length > 0) pushToServer(clean);
      },

      setMonthlyTarget: (monthKey, value) => {
        set((state) => ({
          monthlyTargets: { ...state.monthlyTargets, [monthKey]: Math.max(1, value) },
        }));
        const updated = get().monthlyTargets;
        pushToServer({ monthlyTargets: updated });
      },

      resetSettings: () => {
        set({ ...DEFAULTS });
        pushToServer(DEFAULTS);
      },

      syncSettings: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/settings`, { headers: { ...authHeaders() } });
          if (res.ok) {
            const data = await res.json();
            if (data && Object.keys(data).length > 0) {
              set((state) => {
                // Never let the server overwrite a non-empty local value with an empty one
                // (protects the locally-entered Gemini key, profile photo, etc.).
                const merged: Record<string, any> = { ...state };
                for (const [k, v] of Object.entries(data)) {
                  const isEmpty = v === '' || v === null || v === undefined;
                  if (isEmpty && (state as any)[k]) continue;
                  merged[k] = v;
                }
                return merged;
              });
            }
          }
        } catch {}
      },
    }),
    {
      name: 'techai-settings-v2',
      storage: createJSONStorage(() => safeStorage),
    }
  )
);

export function getEffectiveApiKey(): string {
  // Key comes only from Settings (localStorage) — never read from bundled env vars.
  return useSettingsStore.getState().geminiApiKey || '';
}
