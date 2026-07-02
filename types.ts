export type TabId = 'calendar' | 'jobs' | 'messages' | 'calls' | 'clients' | 'analytics' | 'accounting' | 'autokey' | 'inventory' | 'brain' | 'settings';

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
  skills?: string[];        // technician specialties (TECH_SKILLS) for smart assignment
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
  sku: string;              // our internal code, we choose it
  category: 'Key Blanks' | 'Remotes' | 'Cylinders' | 'Hardware' | 'Tools';
  stock: number;
  reorderPoint: number;
  price: number;            // sell price charged to the client
  cost?: number;            // weighted-average purchase cost (себестоимость) — drives margin + valuation
  brand?: string;           // Schlage / Ilco / Kwikset …
  mpn?: string;             // manufacturer part number (артикул завода)
  upc?: string;             // barcode (штрихкод) — scannable, universal
  photo?: string;           // small base64 thumbnail so techs recognise it on the phone
  location?: string;        // where this stock lives — 'shop' for now; per-van is the Wave 3 hook
}

// Every change to stock is a recorded movement. Current stock = sum of movements.
// No one edits the number by hand — it's derived, and the log is the audit trail.
export type StockMovementType =
  | 'receive'   // purchase / приход (+)
  | 'sale'      // sold on a job / расход (−)
  | 'return'    // came back from a job / возврат (+)
  | 'adjust'    // stocktake correction / инвентаризация (±)
  | 'loss';     // broken, lost, miscut / брак-потеря (−)

export const MOVEMENT_META: Record<StockMovementType, { label: string; tone: 'in' | 'out' | 'neutral' }> = {
  receive: { label: 'Received',   tone: 'in' },
  sale:    { label: 'Sold',       tone: 'out' },
  return:  { label: 'Returned',   tone: 'in' },
  adjust:  { label: 'Adjusted',   tone: 'neutral' },
  loss:    { label: 'Loss',       tone: 'out' },
};

export interface StockMovement {
  id: string;
  partId: string;
  partName: string;       // denormalised so the log still reads if a part is renamed/deleted
  type: StockMovementType;
  qty: number;            // signed: + into stock, − out of stock
  unitCost?: number;      // cost basis at the time (receive/sale) for valuation
  location?: string;      // van/shop the movement happened at
  jobId?: string;         // set for sale/return
  supplierName?: string;  // set for receive (formal Supplier records come in Wave 2)
  note?: string;
  userId?: string;
  userName?: string;
  timestamp: string;      // ISO
}

// Rate card / price book — our standard service prices (seeded from trustkeyaz.com).
// Tapping one on an invoice fills the description + price so the team bills consistently.
export const SERVICE_CATEGORIES = ['Lockout', 'Rekey & Install', 'Smart Locks', 'Car Keys', 'Safes', 'Bundles'] as const;
export type ServiceCategory = typeof SERVICE_CATEGORIES[number];

export interface ServiceRate {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number;            // daytime / base "from" price
  nightPrice?: number;      // after-hours price when it differs
  type: 'part' | 'labor' | 'service_call' | 'maintenance' | 'installation'; // invoice line type it maps to
  note?: string;            // e.g. "+$49 each additional door", "all-in with Schlage"
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
  lat?: number;         // resolved from a verified address pick (Places/geocode)
  lng?: number;
  placeId?: string;     // Google place_id of the verified address (exact map pin + cheap re-lookup)
  geoPrecision?: 'exact' | 'approx' | 'none'; // how trustworthy the pin is — drives the "check address" warning
  unit?: string;        // apartment / suite / unit number
  gateCode?: string;    // gate / callbox / building entry code
  accessNotes?: string; // parking, "buzzer broken", where to meet, etc.
  secondaryAddress?: string;
  photo?: string;
  notes?: string;
  preferredContact?: 'phone' | 'email' | 'sms';
  tags?: string[];
}

// ── Client reputation ───────────────────────────────────────────────────────
export type ClientRating = 'good' | 'neutral' | 'difficult';

// Manual flags a manager can stick on a client. Positive ones read green/gold,
// negative ones read red on the caller ID so the team is ready before "hello".
export const CLIENT_TAGS = [
  'VIP', 'Frequent', 'Referrer', 'Big ticket',
  'Difficult', 'Grumpy', 'Slow payer', 'Haggler', 'Cancel risk', 'Do not service',
] as const;
export type ClientTag = typeof CLIENT_TAGS[number];
export const NEGATIVE_TAGS = new Set<string>(['Difficult', 'Grumpy', 'Slow payer', 'Haggler', 'Cancel risk', 'Do not service']);
export const POSITIVE_TAGS = new Set<string>(['VIP', 'Frequent', 'Referrer', 'Big ticket']);

// Per-client reputation/meta, keyed by normalized phone so it follows the person
// across every job. Lives in the settings blob (server-synced like techTargets).
export interface ClientProfile {
  phoneKey: string;          // normalizePhone(phone) — the join key
  rating?: ClientRating;
  tags: string[];            // manual flags (CLIENT_TAGS or custom)
  notes?: string;            // private manager note shown to the assigned tech
  favoriteTechId?: string;   // client prefers this technician
  contact?: {                // set when the client was added without a job yet
    firstName: string; lastName: string; phone: string;
    email?: string; address?: string; zip?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

// Technician specialties — drive smart assignment (e.g. send a high-end car job to
// whoever is marked for it). Editable per-tech in Settings → Team.
export const TECH_SKILLS = ['Automotive', 'High-end cars', 'Residential', 'Commercial', 'Safes', 'Smart locks'] as const;
export type TechSkill = typeof TECH_SKILLS[number];

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
  unitPrice: number;   // price charged to the client
  partId?: string;
  unitCost?: number;   // cost basis snapshot from inventory at sale time (для COGS / прибыли)
}

export interface Job {
  id: string;
  jobNumber: string;
  createdAt?: string;
  updatedAt?: string; // freshness stamp — bulk /sync only overwrites a stored job with a newer one
  paymentReminders?: string[]; // ISO stamps of unpaid-balance reminder SMS the server has sent (max 2)
  stripeSessions?: string[];   // processed Stripe checkout session ids (webhook idempotency)
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
  signature?: string; // PNG data URL of the client's on-site authorization signature
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
  callSummaryRu?: string; // cached Russian translation of callSummary (filled on first RU toggle)
  callQualityRu?: { strengths: string[]; improvements: string[]; missedInfo: string[] };
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

// ── Авто-Ключ: vehicle key reference ─────────────────────────────────────────
// Given a car (VIN or make/model/year) the app shows everything to make/program
// a key: keyway/blade, transponder chip, FCC/remote, immobilizer, how to program.
export type KeyType = 'Mechanical' | 'Transponder' | 'RemoteHead' | 'Flip' | 'Smart';
export type ChipClonable = 'yes' | 'no' | 'token';

// Trust tier shown on every row so the tech always knows what to believe.
// verified  = cross-checked against 2+ live catalogs (✅)
// single-source / unverified / ai = weaker or AI-drafted — verify on the fob (⚠️/🤖)
// owner     = Sultan confirmed it from a real job (highest trust)
export type KeyConfidence = 'verified' | 'single-source' | 'unverified' | 'ai' | 'owner';

export interface KeyVariant {
  keyType: KeyType;
  trimDependent?: boolean;     // this variant only on some trims
  keyway?: string;             // e.g. 'HU101'
  bladeIlco?: string;
  bladeSilca?: string;
  bladeJma?: string;
  transponderChip?: string;    // e.g. '128-bit Hitag-Pro (NXP PCF7939)'
  chipClonable?: ChipClonable;
  fccId?: string;
  partNumber?: string;
  frequency?: string;          // '315' | '433' | '868' | '313.8'
}

export interface VehicleKeyProfile {
  id?: string;                 // set for field-added rows
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number | null;      // null = present
  region?: string;             // 'US'
  variants: KeyVariant[];
  immobilizer?: string;
  pinRequired?: boolean;
  programming?: string;        // plain-English method
  programmerHint?: string[];   // every compatible programmer
  notes?: string;
  confidence: KeyConfidence;
  sources?: string[];
  dataSource?: string;         // provenance label
  lastVerified?: string;       // ISO date
}
