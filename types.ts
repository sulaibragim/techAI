export type TabId = 'calendar' | 'jobs' | 'messages' | 'calls' | 'clients' | 'analytics' | 'accounting' | 'inventory' | 'brain' | 'settings';

export type Role = 'owner' | 'manager' | 'technician' | 'accountant';
export type TechStatus = 'available' | 'onJob' | 'offDuty';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Only set transiently when creating/changing a password; never persisted client-side.
  role: Role;
  phone?: string;
  photo?: string;
  commissionRate?: number; // percent of completed-job revenue, for salary calc
  active: boolean;
  createdAt: string;
  techStatus?: TechStatus;
  lastLocation?: { lat: number; lng: number; updatedAt: string };
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
  zip?: string;
  unit?: string;        // apartment / suite / unit number
  gateCode?: string;    // gate / callbox / building entry code
  accessNotes?: string; // parking, "buzzer broken", where to meet, etc.
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
  priority?: 'emergency' | 'today' | 'scheduled'; // dispatch urgency set at intake
  lineItems: LineItem[];
  paymentStatus: 'paid' | 'unpaid' | 'partial';
  amountPaid?: number; // how much has actually been collected (for deposits / partial payments)
  paymentMethod?: 'Card' | 'Cash' | 'Check' | 'Zelle';
  paidAt?: string;      // ISO timestamp of the first payment received (cash-flow date)
  completedAt?: string; // ISO timestamp set when the job is marked completed/paid (revenue date)
  totalAmount: number;
  photos: string[];
  messages?: Message[];
  distance?: number; // Miles for Kanban card
  warranty?: string;
  assignedTo?: string; // User id of the technician responsible
  acceptanceStatus?: 'pending' | 'accepted' | 'declined'; // tech's response to the assignment
  acceptedAt?: string; // ISO timestamp when the tech accepted
  createdBy?: string;  // User id of whoever created the job
  source?: string;     // Where the job came from, e.g. 'web' for website leads
  isNewLead?: boolean; // Unhandled website lead — surfaced in its own column/banner until taken
  callSummary?: string; // AI-generated summary of the intake call
  callQuality?: {
    rating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
    strengths: string[];
    improvements: string[];
    missedInfo: string[];
  };
  callTranscript?: string; // Raw call transcript for reference
}

export const EXPENSE_CATEGORIES = [
  'Keys & Stock',       // key blanks, remotes, cylinders bought for inventory
  'Fuel',
  'Advertising',
  'Tools & Equipment',
  'Rent',
  'Phone & Software',
  'Other',
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  note?: string;
  createdBy?: string; // user id
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
