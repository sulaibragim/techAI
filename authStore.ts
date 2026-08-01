import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Role, AuditEntry, TechStatus } from './types';
import { API_BASE } from './backendUrl';
import { setToken, authHeaders } from './apiClient';
import { resetWriteQueue } from './writeQueue';

/** Must match MIN_PASSWORD_LENGTH in server/routes/auth.js — the server is the authority;
 *  this exists so the UI can say so before making a round-trip. */
export const MIN_PASSWORD_LENGTH = 10;

const DEFAULT_USERS: User[] = [
  { id: 'u-owner', name: 'Sultan',     email: 'owner@trustkey.az',   role: 'owner',      active: true, createdAt: new Date().toISOString() },
  { id: 'u-mgr',   name: 'Manager',    email: 'manager@trustkey.az', role: 'manager',    active: true, createdAt: new Date().toISOString() },
  { id: 'u-tech',  name: 'Technician', email: 'tech@trustkey.az',    role: 'technician', commissionRate: 30, active: true, createdAt: new Date().toISOString(), techStatus: 'available' },
];

const api = (path: string, opts?: RequestInit) =>
  fetch(`${API_BASE}/api/auth${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...opts?.headers },
  }).then((res) => {
    // 401 on an authenticated call means the session is dead. The writeQueue already
    // logs out on that; without the same policy here a Team edit made on an expired
    // session died silently while the UI kept showing it as saved.
    if (res.status === 401 && path !== '/login') useAuthStore.getState().logout();
    return res;
  });

async function syncUsersFromServer(set: (s: Partial<AuthState>) => void) {
  try {
    const res = await api('/users');
    if (res.ok) {
      const users: User[] = await res.json();
      if (users.length > 0) set({ users });
    }
  } catch {}
}

interface AuthState {
  users: User[];
  currentUserId: string | null;
  audit: AuditEntry[];
  dbConnected: boolean;

  login: (email: string, password: string) => Promise<boolean>;
  loginAs: (userId: string) => void;
  logout: () => void;
  /** Owner-only. Returns one freshly generated password PER account, keyed by email. */
  masterReset: () => Promise<Record<string, string> | null>;
  /** Returns null on success, or a message to show the user. */
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  syncUsers: () => Promise<void>;

  /** Returns null on success, or a message to show the owner. */
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<string | null>;
  /** Returns null on success, or a message to show the user. */
  updateUser: (user: User, currentPassword?: string) => Promise<string | null>;
  removeUser: (id: string) => void;

  setTechStatus: (userId: string, status: TechStatus) => void;
  setTechLocation: (userId: string, loc: { lat: number; lng: number; updatedAt: string }) => void;
  logAudit: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName' | 'role'>) => void;
  clearAudit: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: DEFAULT_USERS,
      currentUserId: null,
      audit: [],
      dbConnected: false,

      login: async (email, password) => {
        try {
          const res = await api('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) {
            const { user, token } = await res.json();
            if (token) setToken(token);
            set((state) => ({
              currentUserId: user.id,
              dbConnected: true,
              users: state.users.some(u => u.id === user.id)
                ? state.users.map(u => u.id === user.id ? user : u)
                : [...state.users, user],
            }));
            syncUsersFromServer(set);
            return true;
          }
        } catch {}
        // No offline fallback — authentication requires the server (security).
        return false;
      },

      loginAs: (userId) => set({ currentUserId: userId }),
      // Logout has to actually forget. It used to clear only the token and the current
      // user id, leaving the persisted job list, inventory, messages and the whole
      // settings blob — expenses, stock ledger, price book, client profiles — on the
      // device. On the shop tablet the next person to sign in read all of it, including
      // the keys the server deliberately withholds from technicians.
      logout: () => {
        setToken(null);
        set({ currentUserId: null });
        try {
          resetWriteQueue(); // queued writes belong to the session that made them
          for (const k of ['techai-crm-store-v3', 'techai-settings-v2', 'techai-brain-chat']) {
            localStorage.removeItem(k);
          }
        } catch { /* storage unavailable — nothing to clear */ }
        // Reload so no in-memory copy of the previous user's data survives into the
        // next session. Logout is rare; correctness beats the extra second.
        if (typeof window !== 'undefined') window.location.reload();
      },

      // Returns the generated password the server set, so the caller can show it once.
      // Deliberately does NOT touch `active`: the server doesn't either, and flipping it
      // here would silently re-hire anyone the owner had deactivated.
      masterReset: async () => {
        let passwords: Record<string, string> | null = null;
        try {
          const res = await api('/master-reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET-ALL-PASSWORDS' }) });
          if (res.ok) passwords = (await res.json())?.passwords ?? null;
        } catch {}
        set({ currentUserId: null });
        return passwords;
      },

      syncUsers: async () => {
        await syncUsersFromServer(set);
      },

      // Returns null on success, or a message. The account is added optimistically but
      // REMOVED again if the server refuses: it used to stay in the list either way, so
      // a duplicate email or a rejected password left the owner handing out credentials
      // for an account that does not exist, and nothing said otherwise until next login.
      addUser: async (userData) => {
        const newUser: User = { ...userData, id: `u-${Date.now()}`, createdAt: new Date().toISOString() };
        set((state) => ({ users: [...state.users, newUser] }));
        const drop = () => set((state) => ({ users: state.users.filter(u => u.id !== newUser.id) }));
        return api('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: userData.name,
            email: userData.email,
            password: userData.password, // callers always provide one — the server rejects a blank (no silent '1234')
            role: userData.role,
            phone: userData.phone,
            commissionRate: userData.commissionRate,
            active: userData.active,
            techStatus: userData.techStatus,
          }),
        }).then(async (res) => {
          if (res.ok) {
            const serverUser = await res.json();
            set((state) => ({
              users: state.users.map(u => u.id === newUser.id ? serverUser : u),
            }));
            return null;
          }
          drop();
          const detail = await res.json().catch(() => null);
          return detail?.error || 'The server rejected this account.';
        }).catch(() => {
          drop();
          return 'No connection to the server — the account was not created.';
        });
      },

      // `currentPassword` is required by the server when someone changes their OWN
      // password, so it must be threaded through — it is never stored, only forwarded.
      // The server's verdict is REPORTED, not swallowed: a rejected edit (expired
      // session, too-short password, duplicate email…) used to update only the local
      // list, so a password looked changed until the person tried to sign in with it.
      updateUser: async (user, currentPassword) => {
        set((state) => ({
          users: state.users.map(u => u.id === user.id ? user : u),
        }));
        try {
          const res = await api(`/users/${user.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: user.name,
              email: user.email,
              password: user.password,
              ...(currentPassword ? { currentPassword } : {}),
              role: user.role,
              phone: user.phone,
              commissionRate: user.commissionRate,
              active: user.active,
              techStatus: user.techStatus,
              photo: user.photo,
              skills: user.skills,
              signature: user.signature,
            }),
          });
          if (res.ok) {
            const serverUser = await res.json();
            set((state) => ({
              users: state.users.map(u => u.id === user.id ? serverUser : u),
            }));
            return null;
          }
          // Refused — restore server truth so the optimistic edit doesn't linger.
          syncUsersFromServer(set);
          const detail = await res.json().catch(() => null);
          return detail?.error || 'The server rejected this change.';
        } catch {
          syncUsersFromServer(set);
          return 'No connection to the server — the change was not saved.';
        }
      },

      /**
       * Change your own password. Unlike updateUser this REPORTS the outcome, because a
       * wrong current password must not look like success — the old flow wrote the new
       * password locally and the server silently kept the old one.
       */
      changeOwnPassword: async (currentPassword, newPassword) => {
        const id = get().currentUserId;
        if (!id) return 'Not signed in.';
        try {
          const res = await api(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ password: newPassword, currentPassword }),
          });
          if (res.ok) return null;
          const detail = await res.json().catch(() => null);
          return detail?.error || 'Could not change the password.';
        } catch {
          return 'No connection to the server — password not changed.';
        }
      },

      removeUser: (id) => {
        set((state) => ({
          users: state.users.filter(u => u.id !== id),
          currentUserId: state.currentUserId === id ? null : state.currentUserId,
        }));
        api(`/users/${id}`, { method: 'DELETE' }).catch(() => {});
      },

      setTechStatus: (userId, status) => {
        set((state) => ({
          users: state.users.map(u => u.id === userId ? { ...u, techStatus: status } : u),
        }));
        api(`/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ techStatus: status }),
        }).catch(() => {});
      },

      setTechLocation: (userId, loc) => {
        set((state) => ({
          users: state.users.map(u => u.id === userId ? { ...u, lastLocation: loc } : u),
        }));
        api(`/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ lastLocation: loc }),
        }).catch(() => {});
      },

      logAudit: (entry) => {
        const { users, currentUserId } = get();
        const actor = users.find(u => u.id === currentUserId);
        if (!actor) return;
        const full: AuditEntry = {
          ...entry,
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          userId: actor.id,
          userName: actor.name,
          role: actor.role,
        };
        set((state) => ({ audit: [full, ...state.audit].slice(0, 500) }));
      },
      clearAudit: () => set({ audit: [] }),
    }),
    {
      name: 'techai-auth-v3',
      storage: createJSONStorage(() => localStorage),
      // Never write plaintext passwords to localStorage. Auth is server-side (login
      // returns a token); the client only needs who's logged in + the user list for
      // display. Strip `password` from each user, and don't persist transient flags.
      partialize: (state) => ({
        currentUserId: state.currentUserId,
        audit: state.audit,
        users: state.users.map(({ password, ...u }) => u),
      }),
    }
  )
);

// Convenience hook — returns the currently logged-in user object (or null).
export const useCurrentUser = (): User | null =>
  useAuthStore(s => s.users.find(u => u.id === s.currentUserId) ?? null);

// Permission matrix — single source of truth for what each role may do.
export const can = {
  viewAllJobs:    (r: Role) => r === 'owner' || r === 'manager',
  deleteJob:      (r: Role) => r === 'owner',
  reopenJob:      (r: Role) => r === 'owner' || r === 'manager',
  assignJobs:     (r: Role) => r === 'owner' || r === 'manager',
  manageUsers:    (r: Role) => r === 'owner',
  viewAnalytics:  (r: Role) => r === 'owner' || r === 'manager' || r === 'accountant',
  viewAccounting: (r: Role) => r === 'owner' || r === 'manager' || r === 'accountant',
  viewCalls:      (r: Role) => r === 'owner' || r === 'manager',
  viewMessages:   (r: Role) => r === 'owner' || r === 'manager',
  editInventory:  (r: Role) => r === 'owner' || r === 'manager' || r === 'warehouse',
  // Handing stock to a technician is a warehouse job, not a money or client job.
  handOutStock:   (r: Role) => r === 'owner' || r === 'manager' || r === 'warehouse',
  viewAudit:      (r: Role) => r === 'owner',
  useAIBrain:     (r: Role) => r === 'owner' || r === 'manager',
};

// Which tabs a role may see, in display order.
export const visibleTabsFor = (r: Role): string[] => {
  if (r === 'technician') return ['calendar', 'jobs', 'autokey', 'masterkey', 'inventory', 'settings'];
  if (r === 'accountant') return ['accounting', 'analytics', 'settings'];
  // The кладовщик lives on one screen: the shelf. No clients, no money, no messages.
  if (r === 'warehouse')  return ['inventory', 'settings'];
  if (r === 'manager')    return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'accounting', 'marketing', 'autokey', 'masterkey', 'inventory', 'brain', 'settings'];
  return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'accounting', 'marketing', 'autokey', 'masterkey', 'inventory', 'brain', 'settings'];
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  technician: 'Technician',
  accountant: 'Accountant',
  warehouse: 'Кладовщик',
};
