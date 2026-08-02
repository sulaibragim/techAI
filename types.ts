import type { MasterKeyBrand } from './masterKeyUtils';

export type TabId = 'calendar' | 'jobs' | 'messages' | 'calls' | 'clients' | 'analytics' | 'accounting' | 'marketing' | 'autokey' | 'masterkey' | 'inventory' | 'brain' | 'settings';

// 'warehouse' = кладовщик. He books purchases into stock and hands parts out to the
// technicians. Deliberately blind to clients, money and messages — see visibleTabsFor.
export type Role = 'owner' | 'manager' | 'technician' | 'accountant' | 'warehouse';
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
  // An owner/manager who ALSO works jobs in the field and earns a technician-style
  // commission on the ones they complete. Purely about pay & assignment — it does NOT
  // change their role or grant/remove any permission. Technicians are field workers by
  // definition; this flag lets a non-technician be treated as one for commission/payroll.
  fieldTech?: boolean;
  skills?: string[];        // technician specialties (TECH_SKILLS) for smart assignment
  signature?: string;       // hand-drawn signature (data URL) stamped onto invoices
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

// Two free-form levels, both taken from how the business already keeps its own sheet:
//   group    — the platform the item belongs to ('Ford', 'Toyota', 'Универсал', 'Дома / Kwikset')
//   category — what kind of thing it is ('заготовка', 'транспондер', 'smart', 'fobik')
// Both filter rows in the Inventory tab are derived from the values actually present, so
// importing a platform or type nobody thought of just works. Nothing is hard-coded.
export const PART_GROUP_SUGGESTIONS = [
  'Ford', 'RAM/Dodge/Jeep', 'GM/Chevy', 'Toyota', 'Honda', 'Nissan', 'Hyundai/Kia',
  'Универсал', 'Дома / Kwikset', 'Дома / Schlage',
];

export const PART_CATEGORY_SUGGESTIONS = [
  'заготовка', 'транспондер', 'remote', 'remote head', 'flip', 'smart', 'fobik',
  'чип', 'shell', 'батарейка', 'universal',
];

// Consumables and equipment are different animals and must never be mixed:
//  - 'stock' is bought to be resold — it decrements on a job, carries a sell price and a
//    reorder point, and belongs in stock value, the reorder list and the invoice picker.
//  - 'tool' is equipment we own — a programmator, a Lishi set. It has a serial and a
//    warranty, is never billed to a client, and must stay out of every stock number.
//    `owned: false` means it is still only a purchase plan, not something we have.
export type PartKind = 'stock' | 'tool';

export interface Part {
  id: string;
  name: string;
  sku: string;              // our internal code, we choose it
  category: string;         // what kind of thing (see PART_CATEGORY_SUGGESTIONS)
  group?: string;           // platform it serves (see PART_GROUP_SUGGESTIONS)
  kind?: PartKind;          // undefined = 'stock' (every part predates this field)
  stock: number;
  reorderPoint: number;
  price: number;            // sell price charged to the client
  cost?: number;            // weighted-average purchase cost (себестоимость) — drives margin + valuation
  brand?: string;           // Schlage / Ilco / Kwikset …
  mpn?: string;             // manufacturer part number (артикул завода)
  upc?: string;             // barcode (штрихкод) — scannable, universal
  photo?: string;           // small base64 thumbnail so techs recognise it on the phone
  location?: string;        // default home of this stock — 'shop' unless it lives in a van
  // Who is carrying our stock right now: userId → quantity in that technician's van.
  // `stock` stays the TOTAL we own; what's left on the shelf is stock − sum(held).
  // Handing a part to a tech doesn't change what the company owns, only where it is.
  held?: Record<string, number>;
  // ── tool-only ──
  owned?: boolean;          // false = план закупки, not in hand. Only read when kind === 'tool'.
  serial?: string;          // серийный номер
  warranty?: string;        // '1 год обновлений', 'подписка $600/год'
  purchasedAt?: string;     // YYYY-MM-DD
  note?: string;            // free note from the sheet ('заказ #169133')
}

/** Consumable stock: everything the shelf sells. Equipment is excluded. */
export const isStockPart = (p: Part) => (p.kind ?? 'stock') === 'stock';
/** Equipment we actually own — a purchase plan is not equipment yet. */
export const isOwnedTool = (p: Part) => p.kind === 'tool' && p.owned !== false;

// Every change to stock is a recorded movement. Current stock = sum of movements.
// No one edits the number by hand — it's derived, and the log is the audit trail.
export type StockMovementType =
  | 'receive'   // purchase / приход (+)
  | 'sale'      // sold on a job / расход (−)
  | 'return'    // came back from a job / возврат (+)
  | 'adjust'    // stocktake correction / инвентаризация (±)
  | 'loss'      // broken, lost, miscut / брак-потеря (−)
  | 'transfer'; // handed to a tech / выдача в фургон (total unchanged, location moves)

export const MOVEMENT_META: Record<StockMovementType, { label: string; tone: 'in' | 'out' | 'neutral' }> = {
  receive: { label: 'Received',   tone: 'in' },
  sale:    { label: 'Sold',       tone: 'out' },
  return:  { label: 'Returned',   tone: 'in' },
  adjust:  { label: 'Adjusted',   tone: 'neutral' },
  loss:    { label: 'Loss',       tone: 'out' },
  transfer:{ label: 'Выдано',     tone: 'neutral' },
};

/** Who is carrying this part, always a map (never undefined) so callers can just read it. */
export const heldOf = (p: Part): Record<string, number> => p.held ?? {};
/** Total handed out to technicians. */
export const heldTotal = (p: Part) => Object.values(heldOf(p)).reduce((a, n) => a + (n || 0), 0);
/** How many units are still on the shelf — the total minus whatever the techs carry. */
export const shelfQty = (p: Part) => Math.max(0, (p.stock || 0) - heldTotal(p));

/**
 * What a technician's held count becomes after handing them `qty` (negative = taking it
 * back). Clamped twice, because both mistakes are easy to make in a hurry: you cannot hand
 * out what isn't on the shelf, and you cannot take back more than that person is carrying.
 * The server mirrors this in SQL — see POST /api/inventory/:id/transfer.
 */
export const nextHeldFor = (p: Part, userId: string, qty: number): number => {
  const held = heldOf(p);
  const current = held[userId] || 0;
  const others = heldTotal(p) - current;
  return Math.max(0, Math.min(current + qty, Math.max(0, (p.stock || 0) - others)));
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
  toUserId?: string;      // set for transfer — the technician who took it
  toUserName?: string;
  // A technician saying "this never reached me". The numbers do NOT move on his word
  // alone — the flag is a claim, and whoever runs the shelf resolves it.
  disputed?: { by: string; byName: string; at: string };
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

// A standing instruction the AI assistant ("Дурачок") remembers across chat clears
// and devices — e.g. "don't schedule Mike after 9pm", "always collect upfront from cash clients".
export interface AiMemory {
  id: string;
  text: string;             // the instruction, in whatever language Sultan gave it
  createdAt: string;        // ISO
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
  // A second location for the same client (e.g. home + office). Autocompleted and pinned
  // just like the primary, so the "drive to which address?" chooser can route to its exact
  // spot instead of geocoding raw text.
  secondaryAddress?: string;
  secondaryZip?: string;
  secondaryLat?: number;
  secondaryLng?: number;
  secondaryPlaceId?: string;
  secondaryGeoPrecision?: 'exact' | 'approx' | 'none';
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
  // 'tip' is the client's money for the technician, not the company's revenue: it is
  // charged and collected like any other line, but it is not taxed, not part of the
  // commission base, and it goes to the tech in full.
  type: 'part' | 'labor' | 'service_call' | 'maintenance' | 'installation' | 'tip';
  description: string;
  quantity: number;
  unitPrice: number;   // price charged to the client
  partId?: string;
  unitCost?: number;   // cost basis snapshot from inventory at sale time (для COGS / прибыли)
}

// ── Marketing attribution ───────────────────────────────────────────────────
// Where a job came from, as a normalized channel we can slice revenue by. The
// website webhook derives this from UTM/gclid; for phone/walk-in jobs the owner
// or dispatcher picks it by hand ("откуда узнали"). 'unknown' is never stored —
// it's what channelOf() returns for an un-tagged job, so old jobs read cleanly.
export type LeadChannel =
  | 'google_ads'    // paid Google search / Local Services Ads
  | 'facebook'      // Facebook / Meta ads
  | 'instagram'     // Instagram ads
  | 'google_maps'   // Google Business Profile / organic maps
  | 'website'       // site form / SEO, no ad click
  | 'referral'      // word of mouth, another business, partner
  | 'repeat'        // returning customer
  | 'other';        // Yelp, signage, truck wrap, anything else

export const LEAD_CHANNELS: LeadChannel[] = ['google_ads', 'facebook', 'instagram', 'google_maps', 'website', 'referral', 'repeat', 'other'];

export const LEAD_CHANNEL_LABELS: Record<LeadChannel | 'unknown', string> = {
  google_ads:  'Google Ads',
  facebook:    'Facebook',
  instagram:   'Instagram',
  google_maps: 'Google Maps',
  website:     'Website',
  referral:    'Referral',
  repeat:      'Repeat client',
  other:       'Other',
  unknown:     'Not set',
};

// Whether spend on this channel is something we pay for — drives which channels
// show a CAC/ROAS row vs. a plain "free leads" row in the marketing cabinet.
export const PAID_CHANNELS = new Set<LeadChannel>(['google_ads', 'facebook', 'instagram', 'other']);

// Raw tracking params captured at intake (mostly from the website form). Kept as
// a snapshot so we can re-derive channel or drill into a specific campaign later.
export interface LeadAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;       // Google Ads click id
  fbclid?: string;      // Facebook click id
  referrer?: string;    // document.referrer
  landingPage?: string; // first page URL the visitor hit
}

// One member of a job's crew and their cut of its commission (percent).
export interface CrewMember {
  userId: string;
  share: number; // percent of the job's commission credited to this person
}

export interface Job {
  id: string;
  jobNumber: string;
  createdAt?: string;
  updatedAt?: string; // freshness stamp — bulk /sync only overwrites a stored job with a newer one
  scheduledAhead?: boolean;    // booked for a future slot (not ASAP) → client gets a booking-confirmation SMS
  paymentReminders?: string[]; // ISO stamps of unpaid-balance reminder SMS the server has sent (max 2)
  stripeSessions?: string[];   // processed Stripe checkout session ids (webhook idempotency)
  stripePayments?: { intent: string; amount: number; fee?: number; net?: number; at?: string }[]; // card charges on file (refund targets; fee/net from the balance transaction)
  refunds?: { id: string; intent?: string; amount: number; at: string; by?: string; method: 'card' | 'manual' }[];
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
  assignedTo?: string; // User id of the technician responsible (the lead on a crew job)
  // Two (or more) techs who ran the job together, and how its commission splits between
  // them. Percentages, normalized on read (so they need not sum to exactly 100). Absent /
  // single-entry ⇒ 100% to `assignedTo` — the ordinary solo job. The lead is included.
  crew?: CrewMember[];
  acceptanceStatus?: 'pending' | 'accepted' | 'declined'; // tech's response to the assignment
  acceptedAt?: string; // ISO timestamp when the tech accepted
  signature?: string; // PNG data URL of the client's on-site authorization signature
  createdBy?: string;  // User id of whoever created the job
  source?: string;     // Where the job came from, e.g. 'web' for website leads
  channel?: LeadChannel;          // normalized marketing channel for revenue attribution
  attribution?: LeadAttribution;  // raw UTM/gclid snapshot captured at intake
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

// Owner-controlled switches for the automatic texts that go to the CLIENT. Manual
// buttons (On My Way, pay link, receipt button, review request) are never gated here —
// they're explicit sends. Keys mirror server/services/businessSettings.js.
export interface ClientSmsSettings {
  booking: boolean;   // "you're booked for …" on a future appointment
  arrived: boolean;   // "your technician has arrived"
  receipt: boolean;   // "we received your payment / receipt" after a card charge
  reminders: boolean; // 3-/10-day unpaid-balance nudges
  etaReply: boolean;  // auto-answer when the client texts "where's the tech?"
  refund: boolean;    // "we issued a refund of …"
}

// Restrained defaults — the arrival ping and dunning reminders are OFF so a client
// isn't over-texted; the owner opts into them. Must match the server defaults.
export const CLIENT_SMS_DEFAULTS: ClientSmsSettings = {
  booking: true,
  arrived: false,
  receipt: true,
  reminders: false,
  etaReply: true,
  refund: true,
};

// Human labels + the lifecycle stage each message belongs to, for the Settings panel.
export const CLIENT_SMS_META: { key: keyof ClientSmsSettings; label: string; desc: string; stage: string }[] = [
  { key: 'booking',   label: 'Booking confirmation', desc: '“You’re booked for …” on future appointments', stage: 'Booking' },
  { key: 'arrived',   label: 'Technician arrived',   desc: '“Your technician has arrived” — duplicates On My Way', stage: 'On the way' },
  { key: 'etaReply',  label: 'Auto ETA reply',       desc: 'Answers the client when they text “where’s the tech?”', stage: 'On the way' },
  { key: 'receipt',   label: 'Payment receipt',      desc: '“We received your payment” + receipt link after a card charge', stage: 'Payment' },
  { key: 'reminders', label: 'Unpaid reminders',     desc: 'Friendly nudges on day 3 and 10 if a balance is still open', stage: 'Payment' },
  { key: 'refund',    label: 'Refund notice',        desc: '“We issued a refund of …” when you refund a card', stage: 'Payment' },
];

// Automatic messages sent to STAFF (you and the crew), not to clients. These had no
// switches at all — the only off-button was SCHEDULER_DISABLED, which also stopped the
// payment reminders going to customers.
export interface StaffNotifySettings {
  dailyDigest: boolean;     // 20:00 "daily wrap" SMS + push to owners
  jobAssigned: boolean;     // the tech is told a job landed on them
  techEnRoute: boolean;     // dispatchers told a tech is on the way
  techAccepted: boolean;    // dispatchers told a tech accepted
  techDeclined: boolean;    // dispatchers told a tech DECLINED
  newLead: boolean;         // website lead arrived
  clientReply: boolean;     // a client texted us back
  paymentReceived: boolean; // card payment landed
  refund: boolean;          // refund issued / chargeback opened
}

// Must match STAFF_NOTIFY_DEFAULTS on the server. The digest is off by default: it is a
// nightly text nobody asked for, and everything in it is on the dashboard already.
export const STAFF_NOTIFY_DEFAULTS: StaffNotifySettings = {
  dailyDigest: false,
  jobAssigned: true,
  techEnRoute: true,
  techAccepted: true,
  techDeclined: true,
  newLead: true,
  clientReply: true,
  paymentReceived: true,
  refund: true,
};

export const STAFF_NOTIFY_META: { key: keyof StaffNotifySettings; label: string; desc: string; who: string }[] = [
  { key: 'dailyDigest',     label: 'Daily wrap-up',        desc: 'One text at 20:00: today’s revenue, unpaid count, tomorrow’s bookings', who: 'You' },
  { key: 'newLead',         label: 'New website lead',     desc: 'A lead came in from the website form', who: 'Dispatch' },
  { key: 'clientReply',     label: 'Client texted back',   desc: 'Push when a customer replies to us', who: 'Dispatch' },
  { key: 'jobAssigned',     label: 'Job assigned',         desc: 'The technician is told a job landed on them', who: 'Technician' },
  { key: 'techEnRoute',     label: 'Tech on the way',      desc: 'A technician set a job to En Route', who: 'Dispatch' },
  { key: 'techAccepted',    label: 'Tech accepted',        desc: 'A technician accepted a job', who: 'Dispatch' },
  { key: 'techDeclined',    label: 'Tech declined',        desc: 'A technician declined — the job needs reassigning', who: 'Dispatch' },
  { key: 'paymentReceived', label: 'Payment received',     desc: 'Push when a card payment lands', who: 'You' },
  { key: 'refund',          label: 'Refund / chargeback',  desc: 'Push when money goes back out, or a card is disputed', who: 'You' },
];

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  note?: string;
  createdBy?: string; // user id
  channel?: LeadChannel; // for Advertising spend: which channel the money went to (ROAS/CAC)
  campaign?: string;     // optional free-text campaign name for the ad spend
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

// --- Master-key systems (residential: one master over a flat list of doors) ---

export type MasterKeyDoorStatus = 'planned' | 'inProgress' | 'pinned';

export interface MasterKeyDoor {
  id: string;
  name: string;                // 'Кв. 2 — вход'
  /** null in a slot means that depth has not been gauged yet. */
  bitting: (number | null)[];
  status: MasterKeyDoorStatus;
  note?: string;
}

export interface MasterKeySystem {
  id: string;
  name: string;                // building or client label
  address?: string;
  brand: MasterKeyBrand;
  chambers: number;
  masterBitting: (number | null)[];
  doors: MasterKeyDoor[];
  createdAt: string;
  updatedAt: string;
}
