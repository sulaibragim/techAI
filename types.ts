
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

export interface Appliance {
  name?: string;
  type: 'Refrigerator' | 'Washer' | 'Dryer' | 'Oven' | 'Dishwasher' | 'HVAC' | 'Other';
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  partWeight?: string;
  age?: number; 
  warrantyMonths?: number;
}

export interface LineItem {
  id: string;
  type: 'part' | 'labor' | 'service_call' | 'maintenance' | 'installation';
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Job {
  id: string;
  jobNumber: string;
  client: Client;
  appliance: Appliance;
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
