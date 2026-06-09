import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, Role, AuditEntry, TechStatus } from './types';

// NOTE: This is a client-only prototype auth layer. Passwords are stored in
// localStorage in plaintext. Before launch, swap this store's backing calls for
// a real backend (hashed passwords, sessions/JWT). The UI and permission model
// stay the same — only login()/users persistence move server-side.

const DEFAULT_USERS: User[] = [
  { id: 'u-owner', name: 'Sultan',     email: 'owner@trustkey.az',   password: '1234', role: 'owner',      active: true, createdAt: new Date().toISOString() },
  { id: 'u-mgr',   name: 'Manager',    email: 'manager@trustkey.az', password: '1234', role: 'manager',    active: true, createdAt: new Date().toISOString() },
  { id: 'u-tech',  name: 'Technician', email: 'tech@trustkey.az',    password: '1234', role: 'technician', commissionRate: 30, active: true, createdAt: new Date().toISOString(), techStatus: 'available' },
];

interface AuthState {
  users: User[];
  currentUserId: string | null;
  audit: AuditEntry[];

  login: (email: string, password: string) => boolean;
  loginAs: (userId: string) => void;
  logout: () => void;
  masterReset: () => void;

  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (user: User) => void;
  removeUser: (id: string) => void;

  setTechStatus: (userId: string, status: TechStatus) => void;
  logAudit: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'userName' | 'role'>) => void;
  clearAudit: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: DEFAULT_USERS,
      currentUserId: null,
      audit: [],

      login: (email, password) => {
        const user = get().users.find(
          u => u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.password === password && u.active
        );
        if (user) {
          set({ currentUserId: user.id });
          return true;
        }
        return false;
      },
      loginAs: (userId) => set({ currentUserId: userId }),
      logout: () => set({ currentUserId: null }),
      masterReset: () => set((state) => ({
        users: state.users.length > 0
          ? state.users.map(u => ({ ...u, password: '1234', active: true }))
          : DEFAULT_USERS,
        currentUserId: null,
      })),

      addUser: (userData) => set((state) => ({
        users: [...state.users, { ...userData, id: `u-${Date.now()}`, createdAt: new Date().toISOString() }]
      })),
      updateUser: (user) => set((state) => ({
        users: state.users.map(u => u.id === user.id ? user : u)
      })),
      removeUser: (id) => set((state) => ({
        users: state.users.filter(u => u.id !== id),
        currentUserId: state.currentUserId === id ? null : state.currentUserId,
      })),

      setTechStatus: (userId, status) => set((state) => ({
        users: state.users.map(u => u.id === userId ? { ...u, techStatus: status } : u)
      })),

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
      name: 'techai-auth-v2',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Convenience hook — returns the currently logged-in user object (or null).
export const useCurrentUser = (): User | null =>
  useAuthStore(s => s.users.find(u => u.id === s.currentUserId) ?? null);

// Permission matrix — single source of truth for what each role may do.
export const can = {
  viewAllJobs:   (r: Role) => r !== 'technician',
  deleteJob:     (r: Role) => r === 'owner',
  reopenJob:     (r: Role) => r !== 'technician',
  assignJobs:    (r: Role) => r !== 'technician',
  manageUsers:   (r: Role) => r === 'owner',
  viewAnalytics: (r: Role) => r !== 'technician',
  viewCalls:     (r: Role) => r !== 'technician',
  viewMessages:  (r: Role) => r !== 'technician',
  editInventory: (r: Role) => r !== 'technician',
  viewAudit:     (r: Role) => r === 'owner',
  useAIBrain:    (r: Role) => r !== 'technician',
};

// Which tabs a role may see, in display order.
export const visibleTabsFor = (r: Role): string[] => {
  if (r === 'technician') return ['calendar', 'jobs', 'inventory', 'settings'];
  if (r === 'manager')    return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'inventory', 'brain', 'settings'];
  return ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'inventory', 'brain', 'settings'];
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  technician: 'Technician',
};
