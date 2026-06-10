import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Role, AuditEntry, TechStatus } from './types';
import { API_BASE } from './backendUrl';
import { setToken, authHeaders } from './apiClient';

const DEFAULT_USERS: User[] = [
  { id: 'u-owner', name: 'Sultan',     email: 'owner@trustkey.az',   role: 'owner',      active: true, createdAt: new Date().toISOString() },
  { id: 'u-mgr',   name: 'Manager',    email: 'manager@trustkey.az', role: 'manager',    active: true, createdAt: new Date().toISOString() },
  { id: 'u-tech',  name: 'Technician', email: 'tech@trustkey.az',    role: 'technician', commissionRate: 30, active: true, createdAt: new Date().toISOString(), techStatus: 'available' },
];

const api = (path: string, opts?: RequestInit) =>
  fetch(`${API_BASE}/api/auth${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...opts?.headers },
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
  masterReset: () => Promise<void>;
  syncUsers: () => Promise<void>;

  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (user: User) => void;
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
      logout: () => { setToken(null); set({ currentUserId: null }); },

      masterReset: async () => {
        try { await api('/master-reset', { method: 'POST' }); } catch {}
        set((state) => ({
          users: state.users.length > 0
            ? state.users.map(u => ({ ...u, password: '1234', active: true }))
            : DEFAULT_USERS,
          currentUserId: null,
        }));
      },

      syncUsers: async () => {
        await syncUsersFromServer(set);
      },

      addUser: (userData) => {
        const newUser: User = { ...userData, id: `u-${Date.now()}`, createdAt: new Date().toISOString() };
        set((state) => ({ users: [...state.users, newUser] }));
        api('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: userData.name,
            email: userData.email,
            password: userData.password || '1234',
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
          }
        }).catch(() => {});
      },

      updateUser: (user) => {
        set((state) => ({
          users: state.users.map(u => u.id === user.id ? user : u),
        }));
        api(`/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: user.name,
            email: user.email,
            password: user.password,
            role: user.role,
            phone: user.phone,
            commissionRate: user.commissionRate,
            active: user.active,
            techStatus: user.techStatus,
            photo: user.photo,
          }),
        }).catch(() => {});
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
  editInventory:  (r: Role) => r === 'owner' || r === 'manager',
  viewAudit:      (r: Role) => r === 'owner',
  useAIBrain:     (r: Role) => r === 'owner' || r === 'manager',
};

// Which tabs a role may see, in display order.
export const visibleTabsFor = (r: Role): string[] => {
  if (r === 'technician') return ['calendar', 'jobs', 'inventory', 'settings'];
  if (r === 'accountant') return ['accounting', 'analytics', 'settings'];
  if (r === 'manager')    return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'accounting', 'inventory', 'brain', 'settings'];
  return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'accounting', 'inventory', 'brain', 'settings'];
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  technician: 'Technician',
  accountant: 'Accountant',
};
