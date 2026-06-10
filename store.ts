import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Job, JobStatus, MissedInteraction, Message, CallRecord, LineItem, Part, TabId } from './types';
import { useAuthStore } from './authStore';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

const getDynamicDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

// Collision-resistant id (UUID where available, else timestamp+random).
const makeId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const INITIAL_JOBS: Job[] = [];


const INITIAL_MISSED_INTERACTIONS: MissedInteraction[] = [];
const INITIAL_MESSAGES: Message[] = [];
const INITIAL_CALLS: CallRecord[] = [];

const INITIAL_INVENTORY: Part[] = [
  { id: '1', name: 'Schlage SC1 Key Blank', sku: 'KB-SC1-BR', category: 'Key Blanks', stock: 154, reorderPoint: 50, price: 1.5 },
  { id: '2', name: 'Kwikset KW1 Key Blank', sku: 'KB-KW1-BR', category: 'Key Blanks', stock: 212, reorderPoint: 50, price: 1.5 },
  { id: '3', name: 'Toyota Proximity Key (4 Button)', sku: 'RM-TOY-PROX4', category: 'Remotes', stock: 8, reorderPoint: 10, price: 85 },
  { id: '4', name: 'Ford H92 Transponder Key', sku: 'RM-FORD-H92', category: 'Remotes', stock: 12, reorderPoint: 10, price: 25 },
  { id: '5', name: 'Commercial Mortise Cylinder 1-1/8"', sku: 'CY-MORT-118-SC1', category: 'Cylinders', stock: 4, reorderPoint: 5, price: 32 },
  { id: '6', name: 'Schlage Encode Plymouth (Matte Black)', sku: 'HW-SCH-ENC-MB', category: 'Hardware', stock: 2, reorderPoint: 3, price: 245 },
  { id: '7', name: 'Lishi SC1 2-in-1 pick', sku: 'TL-LISHI-SC1', category: 'Tools', stock: 1, reorderPoint: 1, price: 65 },
];

// Tracks jobs with a recent local write the server may not have committed yet. The
// live poll (App.tsx) consults this so an in-flight optimistic update — e.g. "payment
// confirmed", a status change, or a delete — isn't reverted/resurrected before its
// PUT/DELETE lands. Entries auto-expire after PENDING_WRITE_TTL_MS.
const PENDING_WRITE_TTL_MS = 12000;
const pendingJobWrites = new Map<string, number>();
export function markJobPending(id: string) { pendingJobWrites.set(id, Date.now()); }
export function hasPendingJobWrite(id: string): boolean {
  const t = pendingJobWrites.get(id);
  if (t === undefined) return false;
  if (Date.now() - t > PENDING_WRITE_TTL_MS) { pendingJobWrites.delete(id); return false; }
  return true;
}

function pushJobToServer(job: Job) {
  markJobPending(job.id);
  fetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(job),
  }).catch(() => {});
}

function updateJobOnServer(job: Job) {
  markJobPending(job.id);
  fetch(`${API_BASE}/api/jobs/${job.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(job),
  }).catch(() => {});
}

function deleteJobOnServer(id: string) {
  markJobPending(id);
  fetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).catch(() => {});
}

function upsertPartOnServer(part: Part) {
  fetch(`${API_BASE}/api/inventory/${part.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(part),
  }).catch(() => {});
}

function deletePartOnServer(id: string) {
  fetch(`${API_BASE}/api/inventory/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).catch(() => {});
}

interface AppState {
  jobs: Job[];
  missedInteractions: MissedInteraction[];
  messages: Message[];
  calls: CallRecord[];
  inventory: Part[];
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  addJob: (job: Omit<Job, 'id' | 'createdAt'>) => Job;
  updateJob: (job: Job) => void;
  removeJob: (id: string) => void;
  updateJobStatus: (id: string, status: JobStatus) => void;
  updateInventoryItem: (part: Part) => void;
  addInventoryItem: (part: Omit<Part, 'id'>) => void;
  removeInventoryItem: (id: string) => void;
  clearMissed: (id: string) => void;
  syncJobs: () => Promise<void>;
  syncInventory: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  jobs: INITIAL_JOBS,
  missedInteractions: INITIAL_MISSED_INTERACTIONS,
  messages: INITIAL_MESSAGES,
  calls: INITIAL_CALLS,
  inventory: INITIAL_INVENTORY,
  activeTab: 'calendar',
  setActiveTab: (tab) => set({ activeTab: tab }),
  addJob: (jobData) => {
    const auth = useAuthStore.getState();
    const creator = auth.users.find(u => u.id === auth.currentUserId);
    const newJob: Job = { ...jobData, id: `job-${makeId()}`, createdAt: new Date().toISOString(), createdBy: creator?.id } as Job;
    set((state) => ({ jobs: [...state.jobs, newJob] }));
    pushJobToServer(newJob);
    return newJob;
  },
  updateJob: (updatedJob) => {
    set((state) => ({ jobs: state.jobs.map(j => j.id === updatedJob.id ? updatedJob : j) }));
    updateJobOnServer(updatedJob);
  },
  removeJob: (id) => {
    set((state) => ({ jobs: state.jobs.filter(j => j.id !== id) }));
    deleteJobOnServer(id);
  },
  updateJobStatus: (id, status) => {
    set((state) => ({ jobs: state.jobs.map(j => {
      if (j.id !== id) return j;
      const next = { ...j, status };
      if (status === 'completed' && !j.completedAt) next.completedAt = new Date().toISOString();
      return next;
    }) }));
    const job = get().jobs.find(j => j.id === id);
    if (job) updateJobOnServer(job);
  },
  updateInventoryItem: (part) => {
    set((state) => ({ inventory: state.inventory.map(p => p.id === part.id ? part : p) }));
    upsertPartOnServer(part);
  },
  addInventoryItem: (part) => {
    const newPart: Part = { ...part, id: `part-${makeId()}` };
    set((state) => ({ inventory: [...state.inventory, newPart] }));
    upsertPartOnServer(newPart);
  },
  removeInventoryItem: (id) => {
    set((state) => ({ inventory: state.inventory.filter(p => p.id !== id) }));
    deletePartOnServer(id);
  },
  clearMissed: (id) => set((state) => ({
    missedInteractions: state.missedInteractions.filter(m => m.id !== id)
  })),
  syncJobs: async () => {
    try {
      const local = get().jobs;
      if (local.length > 0) {
        const res = await fetch(`${API_BASE}/api/jobs/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(local),
        });
        if (res.ok) {
          const merged: Job[] = await res.json();
          set({ jobs: merged });
          return;
        }
      }
      const res = await fetch(`${API_BASE}/api/jobs`, { headers: { ...authHeaders() } });
      if (res.ok) {
        const serverJobs: Job[] = await res.json();
        if (serverJobs.length > 0) set({ jobs: serverJobs });
      }
    } catch {}
  },
  syncInventory: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/inventory`, { headers: { ...authHeaders() } });
      if (!res.ok) return;
      const serverParts: Part[] = await res.json();
      if (serverParts.length > 0) {
        // Server is the source of truth once it has data.
        set({ inventory: serverParts });
      } else {
        // Server empty — seed it from the local default catalog.
        const local = get().inventory;
        if (local.length > 0) {
          const seed = await fetch(`${API_BASE}/api/inventory/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(local),
          });
          if (seed.ok) {
            const merged: Part[] = await seed.json();
            if (merged.length > 0) set({ inventory: merged });
          }
        }
      }
    } catch {}
  },
    }),
    {
      name: 'techai-crm-store-v3',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        jobs: state.jobs,
        inventory: state.inventory,
        messages: state.messages,
        calls: state.calls,
        missedInteractions: state.missedInteractions,
      }),
    }
  )
);

// Jobs visible to the current user. Technicians only see jobs assigned to them;
// owner and manager see everything.
export const useVisibleJobs = (): Job[] => {
  const jobs = useAppStore(s => s.jobs);
  const currentUserId = useAuthStore(s => s.currentUserId);
  const users = useAuthStore(s => s.users);
  const user = users.find(u => u.id === currentUserId) ?? null;
  if (user?.role === 'technician') return jobs.filter(j => j.assignedTo === user.id);
  return jobs;
};

export const useAIActions = () => {
  const handleAction = async (action: string, data: any): Promise<{ status: string; [key: string]: any }> => {
    try {
      if (action === 'navigate_to') {
        if (data?.tab) {
          useAppStore.getState().setActiveTab(data.tab as TabId);
          return { status: 'success', tab: data.tab };
        }
        return { status: 'error', message: 'Missing tab parameter' };
      }
      if (action === 'get_app_state') {
        const state = useAppStore.getState();
        return {
          status: 'success',
          data: {
            jobs: state.jobs.map(j => ({
              id: j.id,
              jobNumber: j.jobNumber,
              clientName: `${j.client.firstName} ${j.client.lastName}`,
              status: j.status,
              scheduledDate: j.scheduledDate,
              scheduledTime: j.scheduledTime,
              totalAmount: j.totalAmount
            })),
            activeTab: state.activeTab,
            totalJobs: state.jobs.length
          }
        };
      }
      if (action === 'create_job') {
        if (data && typeof data === 'object') {
          useAppStore.getState().addJob(data);
          return { status: 'success', message: 'Job created' };
        }
        return { status: 'error', message: 'Invalid job data' };
      }
      if (action === 'update_job') {
        if (data?.jobId) {
          const state = useAppStore.getState();
          const job = state.jobs.find(j => j.id === data.jobId);
          if (job) {
            const { jobId, ...updates } = data;
            state.updateJob({ ...job, ...updates });
            return { status: 'success', message: 'Job updated' };
          }
          return { status: 'error', message: 'Job not found' };
        }
        return { status: 'error', message: 'Missing jobId' };
      }
      return { status: 'pending', message: 'Action not implemented yet' };
    } catch (err: any) {
      return { status: 'error', message: err?.message || 'Unknown error' };
    }
  };
  return { handleAction };
};
