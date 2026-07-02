import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { Expense, ClientProfile, StockMovement, ServiceRate } from './types';
import { PRICE_BOOK_SEED } from './priceBook';

export interface SettingsState {
  technicianName: string;
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyPhone: string;
  companyEmail: string;
  googleReviewUrl: string; // "leave us a review" link (Google Business); empty hides the feature
  licenseNumber: string;
  profilePhoto: string;
  monthlyRevenueTarget: number;
  dailyRevenueTarget: number;
  monthlyTargets: Record<string, number>;
  techTargets: Record<string, number>; // per-technician personal monthly revenue goal (user id → $)
  expenses: Expense[]; // business expense ledger (keys & stock, fuel, ads, …)
  stockMovements: StockMovement[]; // inventory ledger — every receive/sale/adjust/return/loss
  priceBook: ServiceRate[]; // standard service rates (seeded from trustkeyaz.com), tap-to-fill on invoices
  clientProfiles: Record<string, ClientProfile>; // reputation/meta keyed by normalized phone
  supplierAliases: Record<string, string>; // "<supplier>|<their code>" → partId; learned once at invoice import, auto-matches after
  importedInvoices: string[]; // supplier invoice numbers already received — duplicate-import guard (capped)
  taxRate: number; // sales-tax percent applied to taxable revenue (0 = none)
  onboardingComplete: boolean;
  aiAvailable: boolean; // runtime flag: is GEMINI_API_KEY configured on the server?
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings' | 'setMonthlyTarget' | 'setTechTarget' | 'addExpense' | 'removeExpense' | 'addStockMovement' | 'addServiceRate' | 'updateServiceRate' | 'removeServiceRate' | 'upsertClientProfile' | 'syncSettings' | 'checkAiAvailable' | 'aiAvailable'>>) => void;
  setMonthlyTarget: (monthKey: string, value: number) => void;
  setTechTarget: (userId: string, value: number) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;
  addStockMovement: (movement: Omit<StockMovement, 'id'>) => void;
  addServiceRate: (rate: Omit<ServiceRate, 'id'>) => void;
  updateServiceRate: (rate: ServiceRate) => void;
  removeServiceRate: (id: string) => void;
  upsertClientProfile: (phoneKey: string, patch: Partial<ClientProfile>) => void;
  learnSupplierAlias: (supplier: string, code: string, partId: string) => void;
  markInvoiceImported: (invoiceNumber: string) => void;
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
  googleReviewUrl: '',
  licenseNumber: 'LK-00000',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
  monthlyTargets: {} as Record<string, number>,
  techTargets: {} as Record<string, number>,
  expenses: [] as Expense[],
  stockMovements: [] as StockMovement[],
  priceBook: PRICE_BOOK_SEED as ServiceRate[],
  clientProfiles: {} as Record<string, ClientProfile>,
  supplierAliases: {} as Record<string, string>,
  importedInvoices: [] as string[],
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

      // Ledger/map fields push DELTAS (just the changed entry/key). The server unions
      // them into its copy, so two managers on different devices can no longer silently
      // erase each other's entries by racing whole-array overwrites.
      setMonthlyTarget: (monthKey, value) => {
        const v = Math.max(1, value);
        set((state) => ({
          monthlyTargets: { ...state.monthlyTargets, [monthKey]: v },
        }));
        pushToServer({ monthlyTargets: { [monthKey]: v } });
      },

      setTechTarget: (userId, value) => {
        set((state) => {
          const next = { ...state.techTargets };
          if (value > 0) next[userId] = value;
          else delete next[userId];
          return { techTargets: next };
        });
        // 0 = "clear this goal" — the server drops zeroed keys.
        pushToServer({ techTargets: { [userId]: value > 0 ? value : 0 } });
      },

      addExpense: (expense) => {
        const entry: Expense = { ...expense, id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((state) => ({ expenses: [entry, ...state.expenses] }));
        pushToServer({ expenses: [entry] });
      },

      removeExpense: (id) => {
        set((state) => ({ expenses: state.expenses.filter(e => e.id !== id) }));
        pushToServer({ removedExpenseIds: [id] });
      },

      addStockMovement: (movement) => {
        const entry: StockMovement = { ...movement, id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        // Newest first; cap the ledger so the synced blob can't grow without bound.
        set((state) => ({ stockMovements: [entry, ...state.stockMovements].slice(0, 2000) }));
        pushToServer({ stockMovements: [entry] });
      },

      addServiceRate: (rate) => {
        const entry: ServiceRate = { ...rate, id: `rate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((state) => ({ priceBook: [...state.priceBook, entry] }));
        pushToServer({ priceBook: [entry] });
      },

      updateServiceRate: (rate) => {
        set((state) => ({ priceBook: state.priceBook.map(r => r.id === rate.id ? rate : r) }));
        pushToServer({ priceBook: [rate] });
      },

      removeServiceRate: (id) => {
        set((state) => ({ priceBook: state.priceBook.filter(r => r.id !== id) }));
        pushToServer({ removedServiceRateIds: [id] });
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
        pushToServer({ clientProfiles: { [phoneKey]: get().clientProfiles[phoneKey] } });
      },

      // Normalized "<supplier>|<code>" → partId. Learned when the user confirms a match
      // during invoice import; the next invoice from that supplier auto-matches the line.
      learnSupplierAlias: (supplier, code, partId) => {
        const key = `${supplier.trim().toLowerCase()}|${code.trim().toLowerCase()}`;
        if (!supplier.trim() || !code.trim() || !partId) return;
        set((state) => ({ supplierAliases: { ...state.supplierAliases, [key]: partId } }));
        pushToServer({ supplierAliases: { [key]: partId } });
      },

      markInvoiceImported: (invoiceNumber) => {
        const no = invoiceNumber.trim();
        if (!no) return;
        set((state) => ({ importedInvoices: [no, ...state.importedInvoices.filter(x => x !== no)].slice(0, 200) }));
        pushToServer({ importedInvoices: [no] });
      },

      resetSettings: () => {
        set({ ...DEFAULTS });
        // replaceLedgers: a factory reset must actually WIPE the ledgers — without the
        // flag the server would union the empty arrays into a no-op.
        pushToServer({ ...DEFAULTS, replaceLedgers: true });
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
