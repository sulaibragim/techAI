import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { Expense, ClientProfile, StockMovement } from './types';

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
  techTargets: Record<string, number>; // per-technician personal monthly revenue goal (user id → $)
  expenses: Expense[]; // business expense ledger (keys & stock, fuel, ads, …)
  stockMovements: StockMovement[]; // inventory ledger — every receive/sale/adjust/return/loss
  clientProfiles: Record<string, ClientProfile>; // reputation/meta keyed by normalized phone
  taxRate: number; // sales-tax percent applied to taxable revenue (0 = none)
  onboardingComplete: boolean;
  aiAvailable: boolean; // runtime flag: is GEMINI_API_KEY configured on the server?
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings' | 'setMonthlyTarget' | 'setTechTarget' | 'addExpense' | 'removeExpense' | 'addStockMovement' | 'upsertClientProfile' | 'syncSettings' | 'checkAiAvailable' | 'aiAvailable'>>) => void;
  setMonthlyTarget: (monthKey: string, value: number) => void;
  setTechTarget: (userId: string, value: number) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;
  addStockMovement: (movement: Omit<StockMovement, 'id'>) => void;
  upsertClientProfile: (phoneKey: string, patch: Partial<ClientProfile>) => void;
  resetSettings: () => void;
  syncSettings: () => Promise<void>;
  checkAiAvailable: () => Promise<void>;
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
  techTargets: {} as Record<string, number>,
  expenses: [] as Expense[],
  stockMovements: [] as StockMovement[],
  clientProfiles: {} as Record<string, ClientProfile>,
  taxRate: 0,
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
      aiAvailable: false,

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

      setTechTarget: (userId, value) => {
        set((state) => {
          const next = { ...state.techTargets };
          if (value > 0) next[userId] = value;
          else delete next[userId];
          return { techTargets: next };
        });
        pushToServer({ techTargets: get().techTargets });
      },

      addExpense: (expense) => {
        const entry: Expense = { ...expense, id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((state) => ({ expenses: [entry, ...state.expenses] }));
        pushToServer({ expenses: get().expenses });
      },

      removeExpense: (id) => {
        set((state) => ({ expenses: state.expenses.filter(e => e.id !== id) }));
        pushToServer({ expenses: get().expenses });
      },

      addStockMovement: (movement) => {
        const entry: StockMovement = { ...movement, id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        // Newest first; cap the ledger so the synced blob can't grow without bound.
        set((state) => ({ stockMovements: [entry, ...state.stockMovements].slice(0, 2000) }));
        pushToServer({ stockMovements: get().stockMovements });
      },

      upsertClientProfile: (phoneKey, patch) => {
        if (!phoneKey) return;
        set((state) => {
          const prev = state.clientProfiles[phoneKey];
          const next: ClientProfile = {
            phoneKey,
            tags: [],
            createdAt: prev?.createdAt || new Date().toISOString(),
            ...prev,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return { clientProfiles: { ...state.clientProfiles, [phoneKey]: next } };
        });
        pushToServer({ clientProfiles: get().clientProfiles });
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

      checkAiAvailable: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/ai/status`, { headers: { ...authHeaders() } });
          if (res.ok) {
            const data = await res.json();
            set({ aiAvailable: !!data.enabled });
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
