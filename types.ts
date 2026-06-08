export type TabId = 'calendar' | 'jobs' | 'messages' | 'calls' | 'clients' | 'analytics' | 'inventory' | 'brain' | 'settings';

export type Role = 'owner' | 'manager' | 'technician';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // NOTE: prototype only — plaintext local storage. Replace with backend auth before production.
  role: Role;
  phone?: string;
  photo?: string;
  commissionRate?: number; // percent of completed-job revenue, for salary calc
  active: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: Role;
  action: string;   // e.g. 'job.update', 'job.delete', 'payment.collect', 'price.change'
  detail: string;
  jobId?: string;
}

export interface Part {
  id: string;
  name: string;
  sku: string;
  category: 'Key Blanks' | 'Remotes' | 'Cylinders' | 'Hardware' | 'Tools';
  stock: number;
  reorderPoint: number;
  price: number;
}

export type JobStatus = 
  | 'scheduled' 
  | 'enRoute' 
  | 'onSite'
  | 'diagnosed' 
  | 'sold' 
  | 'coffee' 
  | 'waitingParts' 
  | 'completed' 
  | 'cancelled';

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  secondaryPhone?: string;
  email: string;
  secondaryEmail?: string;
  address: string;
  secondaryAddress?: string;
  photo?: string;
  notes?: string;
  preferredContact?: 'phone' | 'email' | 'sms';
  tags?: string[];
}

export interface Message {
  id: string;
  timestamp: string;
  sender: 'technician' | 'system' | 'client' | 'assistant';
  content: string;
  method: 'sms' | 'email' | 'voice';
}

export interface CallRecord {
  id: string;
  from: string;
  phone: string;
  timestamp: string;
  type: 'incoming' | 'outgoing' | 'missed';
  duration?: string;
  avatar: string;
}

export interface LockDetails {
  type: 'Automotive' | 'Residential' | 'Commercial' | 'Secure / Safe' | 'Other';
  brand: string;
  modelOrYear: string;
  vinOrKeyCode?: string;
  hardwareFinish?: string;
}

export interface LineItem {
  id: string;
  type: 'part' | 'labor' | 'service_call' | 'maintenance' | 'installation';
  description: string;
  quantity: number;
  unitPrice: number;
  partId?: string;
}

export interface Job {
  id: string;
  jobNumber: string;
  createdAt?: string;
  client: Client;
  lockDetails: LockDetails;
  complaint: string;
  diagnosisNotes: string;
  scheduledDate: string; // ISO format YYYY-MM-DD
  scheduledTime: string; // HH:mm format
  durationMinutes?: number; 
  status: JobStatus;
  lineItems: LineItem[];
  paymentStatus: 'paid' | 'unpaid';
  totalAmount: number;
  photos: string[];
  messages?: Message[];
  distance?: number; // Miles for Kanban card
  warranty?: string;
  assignedTo?: string; // User id of the technician responsible
  createdBy?: string;  // User id of whoever created the job
}

export interface MissedInteraction {
  id: string;
  type: 'call' | 'message';
  from: string;
  timestamp: string;
  avatar: string;
}

export const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: '#94A3B8',   // Slate
  enRoute: '#3B82F6',     // Blue
  onSite: '#F59E0B',      // Amber (using same as diagnosed for now or similar)
  diagnosed: '#F59E0B',   // Amber
  sold: '#10B981',        // Green
  coffee: '#EF4444',      // Red
  waitingParts: '#8B5CF6', // Purple
  completed: '#10B981',   // Green
  cancelled: '#64748B'    // Slate
};
