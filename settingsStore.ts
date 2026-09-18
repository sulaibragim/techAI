import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { sendWrite } from './writeQueue';
import { Expense, ClientProfile, StockMovement, ServiceRate, AiMemory, ClientSmsSettings, CLIENT_SMS_DEFAULTS, StaffNotifySettings, STAFF_NOTIFY_DEFAULTS, ReviewLink, LostCall, TrainingResult } from './types';
import { PRICE_BOOK_SEED, PRICE_BOOK_VERSION, planPriceBookUpgrade, applyPriceBookUpgrade, priceBookUpgradePatch } from './priceBook';
import type { ScriptOverrides } from './callScripts';

export interface SettingsState {
  technicianName: string;
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyPhone: string;
  companyEmail: string;
  googleReviewUrl: string; // legacy single review link; the server serves it as reviewLinks until that list is edited
  reviewLinks: ReviewLink[]; // pages a client lands on to leave a review (Google, Yelp…); empty hides the review texts
  licenseNumber: string;
  profilePhoto: string;
  monthlyRevenueTarget: number;
  dailyRevenueTarget: number;
  monthlyTargets: Record<string, number>;
  techTargets: Record<string, number>; // per-technician personal monthly revenue goal (user id → $)
  expenses: Expense[]; // business expense ledger (keys & stock, fuel, ads, …)
  stockMovements: StockMovement[]; // inventory ledger — every receive/sale/adjust/return/loss
  priceBook: ServiceRate[]; // standard service rates (seeded from trustkeyaz.com), tap-to-fill on invoices
  priceBookVersion: number; // PRICE_BOOK_VERSION the server's price book is at — only a sync sets it (0 = not upgraded)
  aiMemories: AiMemory[]; // standing instructions the AI assistant remembers across chat clears
  clientProfiles: Record<string, ClientProfile>; // reputation/meta keyed by normalized phone
  supplierAliases: Record<string, string>; // "<supplier>|<their code>" → partId; learned once at invoice import, auto-matches after
  importedInvoices: string[]; // supplier invoice numbers already received — duplicate-import guard (capped)
  taxRate: number; // sales-tax percent applied to taxable revenue (0 = none)
  clientSms: ClientSmsSettings; // owner switches for automatic client-facing texts
  staffNotify: StaffNotifySettings; // owner switches for automatic messages to US, not clients
  smsTemplates: Record<string, { en?: string; es?: string }>; // owner overrides of the one-tap client texts (template id → texts)
  lostCalls: LostCall[]; // calls that ended without a booking, and why (newest first, capped)
  scriptOverrides: ScriptOverrides; // the owner's wording for call-script lines (stepKey/answerKey → texts)
  trainingResults: Record<string, TrainingResult>; // user id → admission test + role-play record
  onboardingComplete: boolean;
  aiAvailable: boolean; // runtime flag: is GEMINI_API_KEY configured on the server?
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings' | 'setMonthlyTarget' | 'setTechTarget' | 'addExpense' | 'removeExpense' | 'addStockMovement' | 'clearStockLedger' | 'setMovementDispute' | 'addServiceRate' | 'updateServiceRate' | 'removeServiceRate' | 'importServiceRates' | 'upsertClientProfile' | 'addAiMemory' | 'removeAiMemory' | 'setSmsTemplate' | 'resetSmsTemplate' | 'addReviewLink' | 'updateReviewLink' | 'removeReviewLink' | 'addLostCall' | 'removeLostCall' | 'setScriptOverride' | 'resetScriptOverride' | 'saveTrainingResult' | 'syncSettings' | 'upgradePriceBook' | 'checkAiAvailable' | 'aiAvailable'>>) => void;
  setMonthlyTarget: (monthKey: string, value: number) => void;
  setTechTarget: (userId: string, value: number) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;
  addStockMovement: (movement: Omit<StockMovement, 'id'>) => void;
  /** Local half of a catalog wipe. The server clears its own copy in DELETE /api/inventory. */
  clearStockLedger: () => void;
  /** A technician disputes a handover, or the shelf owner clears the flag. */
  setMovementDispute: (id: string, dispute: StockMovement['disputed']) => void;
  addServiceRate: (rate: Omit<ServiceRate, 'id'>) => void;
  updateServiceRate: (rate: ServiceRate) => void;
  removeServiceRate: (id: string) => void;
  /** Bulk price-list import: add new services and re-price existing ones in one write. */
  importServiceRates: (plan: { add: Omit<ServiceRate, 'id'>[]; update: ServiceRate[] }) => { added: number; updated: number };
  upsertClientProfile: (phoneKey: string, patch: Partial<ClientProfile>) => void;
  /** Override one one-tap SMS template (both languages at once). */
  setSmsTemplate: (id: string, texts: { en?: string; es?: string }) => void;
  /** Back to the built-in default text for this template. */
  resetSmsTemplate: (id: string) => void;
  addReviewLink: (link: Omit<ReviewLink, 'id'>) => ReviewLink;
  updateReviewLink: (link: ReviewLink) => void;
  removeReviewLink: (id: string) => void;
  /** Mark a call that ended without a booking. */
  addLostCall: (entry: Omit<LostCall, 'id' | 'timestamp'>) => LostCall;
  removeLostCall: (id: string) => void;
  /** Reword one call-script line (a step or a ready answer). */
  setScriptOverride: (key: string, texts: { say?: string; hint?: string }) => void;
  /** Back to the built-in wording for this line. */
  resetScriptOverride: (key: string) => void;
  /** Store one person's training record (the whole entry for that user). */
  saveTrainingResult: (userId: string, result: TrainingResult) => void;
  addAiMemory: (text: string) => AiMemory;
  removeAiMemory: (id: string) => void;
  learnSupplierAlias: (supplier: string, code: string, partId: string) => void;
  markInvoiceImported: (invoiceNumber: string) => void;
  resetSettings: () => void;
  /** Pull the server copy. Resolves to what the server sent — null offline or on an error. */
  syncSettings: () => Promise<Record<string, unknown> | null>;
  /** Bring the shared price book to PRICE_BOOK_VERSION. Only on freshly synced data, only by a role that may write settings. */
  upgradePriceBook: (serverHasPriceBook: boolean) => void;
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
  reviewLinks: [] as ReviewLink[],
  licenseNumber: 'LK-00000',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
  monthlyTargets: {} as Record<string, number>,
  techTargets: {} as Record<string, number>,
  expenses: [] as Expense[],
  stockMovements: [] as StockMovement[],
  priceBook: PRICE_BOOK_SEED as ServiceRate[],
  priceBookVersion: 0,
  aiMemories: [] as AiMemory[],
  clientProfiles: {} as Record<string, ClientProfile>,
  supplierAliases: {} as Record<string, string>,
  importedInvoices: [] as string[],
  taxRate: 0,
  clientSms: { ...CLIENT_SMS_DEFAULTS },
  staffNotify: { ...STAFF_NOTIFY_DEFAULTS },
  smsTemplates: {} as Record<string, { en?: string; es?: string }>,
  lostCalls: [] as LostCall[],
  scriptOverrides: {} as ScriptOverrides,
  trainingResults: {} as Record<string, TrainingResult>,
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

// Settings writes are deltas, so they must NOT be deduped against each other — losing an
// older queued patch would lose whichever keys only it carried. Each goes out on its own.
function pushToServer(patch: Record<string, any>) {
  const keys = Object.keys(patch);
  const label = keys.length === 1 ? `your ${humanKey(keys[0])}` : 'your settings';
  void sendWrite({ url: '/api/settings', method: 'PUT', body: patch, label });
}

const KEY_WORDS: Record<string, string> = {
  expenses: 'expense', stockMovements: 'stock movement', priceBook: 'price book',
  clientProfiles: 'client profile', monthlyTargets: 'monthly target', techTargets: 'technician target',
  aiMemories: 'AI instruction', taxRate: 'tax rate', adSpend: 'ad spend',
  smsTemplates: 'SMS template', removedSmsTemplateIds: 'SMS template',
  reviewLinks: 'review link', removedReviewLinkIds: 'review link',
  lostCalls: 'call note', removedLostCallIds: 'call note',
  scriptOverrides: 'call script', removedScriptOverrideIds: 'call script',
  trainingResults: 'training result',
};
const humanKey = (k: string) =>
  KEY_WORDS[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

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

      // No pushToServer here: settings writes are deltas that the server UNIONS in, so an
      // empty array would be a no-op. The wipe endpoint clears the server ledger itself.
      clearStockLedger: () => set({ stockMovements: [] }),

      // Re-pushing an entry under its existing id replaces the server's copy (unionById
      // takes the incoming one first), so a disputed flag reaches every device.
      setMovementDispute: (id, dispute) => {
        const entry = get().stockMovements.find(m => m.id === id);
        if (!entry) return;
        const updated: StockMovement = { ...entry, disputed: dispute };
        if (!dispute) delete updated.disputed;
        set((state) => ({ stockMovements: state.stockMovements.map(m => m.id === id ? updated : m) }));
        pushToServer({ stockMovements: [updated] });
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

      // One import = one delta write. Sending the whole price book instead would let a
      // stale device's copy overwrite rates another device just changed.
      importServiceRates: ({ add, update }) => {
        const stamp = Date.now();
        const added: ServiceRate[] = add.map((rate, i) => ({
          ...rate,
          id: `rate-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        }));
        const byId = new Map(update.map(r => [r.id, r]));
        set((state) => ({
          priceBook: [...state.priceBook.map(r => byId.get(r.id) || r), ...added],
        }));
        const touched = [...update, ...added];
        if (touched.length > 0) pushToServer({ priceBook: touched });
        return { added: added.length, updated: update.length };
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

      setSmsTemplate: (id, texts) => {
        if (!id) return;
        const entry = { en: (texts.en || '').trim(), es: (texts.es || '').trim() };
        set((state) => ({ smsTemplates: { ...state.smsTemplates, [id]: entry } }));
        pushToServer({ smsTemplates: { [id]: entry } });
      },

      resetSmsTemplate: (id) => {
        set((state) => {
          const next = { ...state.smsTemplates };
          delete next[id];
          return { smsTemplates: next };
        });
        pushToServer({ removedSmsTemplateIds: [id] });
      },

      // Deltas like the price book: the server unions entries by id, so a link added on
      // one phone can't be erased by another phone saving its older copy of the list.
      addReviewLink: (link) => {
        const entry: ReviewLink = { ...link, id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((state) => ({ reviewLinks: [...state.reviewLinks, entry] }));
        pushToServer({ reviewLinks: [entry] });
        return entry;
      },

      updateReviewLink: (link) => {
        set((state) => ({ reviewLinks: state.reviewLinks.map(l => l.id === link.id ? link : l) }));
        pushToServer({ reviewLinks: [link] });
      },

      removeReviewLink: (id) => {
        set((state) => ({ reviewLinks: state.reviewLinks.filter(l => l.id !== id) }));
        pushToServer({ removedReviewLinkIds: [id] });
      },

      // A ledger like expenses: one entry per write, unioned by id on the server.
      addLostCall: (lost) => {
        const entry: LostCall = { ...lost, id: `lost-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString() };
        set((state) => ({ lostCalls: [entry, ...state.lostCalls].slice(0, 1000) }));
        pushToServer({ lostCalls: [entry] });
        return entry;
      },

      removeLostCall: (id) => {
        set((state) => ({ lostCalls: state.lostCalls.filter(l => l.id !== id) }));
        pushToServer({ removedLostCallIds: [id] });
      },

      // Keyed map like the SMS templates: the server merges keys, so two edits don't erase each other.
      setScriptOverride: (key, texts) => {
        if (!key) return;
        const entry = { say: (texts.say || '').trim(), hint: (texts.hint ?? '').trim() };
        set((state) => ({ scriptOverrides: { ...state.scriptOverrides, [key]: entry } }));
        pushToServer({ scriptOverrides: { [key]: entry } });
      },

      resetScriptOverride: (key) => {
        set((state) => {
          const next = { ...state.scriptOverrides };
          delete next[key];
          return { scriptOverrides: next };
        });
        pushToServer({ removedScriptOverrideIds: [key] });
      },

      // Keyed by user: each person writes only their own entry, the server merges the keys.
      saveTrainingResult: (userId, result) => {
        if (!userId) return;
        set((state) => ({ trainingResults: { ...state.trainingResults, [userId]: result } }));
        pushToServer({ trainingResults: { [userId]: result } });
      },

      addAiMemory: (text) => {
        const entry: AiMemory = { id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), createdAt: new Date().toISOString() };
        set((state) => ({ aiMemories: [entry, ...state.aiMemories].slice(0, 100) }));
        pushToServer({ aiMemories: [entry] });
        return entry;
      },

      removeAiMemory: (id) => {
        set((state) => ({ aiMemories: state.aiMemories.filter(m => m.id !== id) }));
        pushToServer({ removedAiMemoryIds: [id] });
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
            return data && typeof data === 'object' ? data : {};
          }
        } catch {}
        return null;
      },

      // Same deltas an owner would make by hand in Settings → Service Rates. The version
      // travels with them, and is NOT marked here: it comes back with the server's copy once
      // the write lands. Until then every sync re-applies the plan (it only touches old seeded
      // values, so a repeat is a no-op) — a sync racing this write can't leave the old book on screen.
      upgradePriceBook: (serverHasPriceBook) => {
        const { priceBook, priceBookVersion } = get();
        if (priceBookVersion >= PRICE_BOOK_VERSION) return;
        const plan = planPriceBookUpgrade(priceBook, priceBookVersion);
        const next = applyPriceBookUpgrade(priceBook, plan);
        set({ priceBook: next });
        pushToServer(priceBookUpgradePatch(plan, next, serverHasPriceBook));
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
