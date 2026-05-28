import { create } from 'zustand';
import { Job, JobStatus, MissedInteraction, Message, CallRecord, LineItem } from './types';
import { calculateFinancialMetrics } from './financialUtils';

const getDynamicDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

const INITIAL_JOBS: Job[] = [
  {
    id: 'job-1',
    jobNumber: 'LK-8402',
    client: {
      id: 'c-1',
      firstName: 'Sarah',
      lastName: 'Jenkins',
      phone: '(555) 019-8234',
      email: 'sarah.j@example.com',
      address: '4421 Evergreen Terrace, Portland, OR',
    },
    lockDetails: { type: 'Automotive', brand: 'Toyota', modelOrYear: '2019 Camry' },
    complaint: 'Lost all keys at the shopping mall. Push-to-start vehicle.',
    diagnosisNotes: 'Generated new smart key and programmed via OBD-II port. Deleted old keys from system.',
    scheduledDate: getDynamicDate(-1), 
    scheduledTime: '09:00',
    durationMinutes: 90,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '1', type: 'service_call', description: 'Emergency Mobile Service Fee', unitPrice: 85, quantity: 1 },
      { id: '2', type: 'part', description: 'Toyota Smart Proximity Key (OEM)', unitPrice: 195, quantity: 1 },
      { id: '3', type: 'labor', description: 'EEPROM / OBD-II Programming', unitPrice: 120, quantity: 1 }
    ],
    totalAmount: 400
  },
  {
    id: 'job-2',
    jobNumber: 'LK-8411',
    client: {
      id: 'c-2',
      firstName: 'Marcus',
      lastName: 'Chen',
      phone: '(555) 832-1100',
      email: 'mchen@example.com',
      address: '8900 Westheimer Rd, Houston, TX',
    },
    lockDetails: { type: 'Commercial', brand: 'Von Duprin', modelOrYear: '99 Series Exit Device' },
    complaint: 'Panic bar sticking open. Door will not secure at night.',
    diagnosisNotes: 'Center case mechanism fractured. Installed new center case and adjusted dogging rod.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '10:30',
    durationMinutes: 60,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '4', type: 'service_call', description: 'Commercial Service Call', unitPrice: 95, quantity: 1 },
      { id: '5', type: 'part', description: 'Center Case Replacement Part', unitPrice: 280, quantity: 1 },
      { id: '6', type: 'labor', description: 'Labor - Commercial Hardware', unitPrice: 115, quantity: 1 }
    ],
    totalAmount: 490
  },
  {
    id: 'job-3',
    jobNumber: 'LK-8422',
    client: {
      id: 'c-3',
      firstName: 'Julia',
      lastName: 'Robson',
      phone: '(555) 773-4021',
      email: 'julia.rob@example.com',
      address: '112 Oak Tree Ln, Austin, TX',
    },
    lockDetails: { type: 'Residential', brand: 'Schlage', modelOrYear: 'Encode Smart WiFi' },
    complaint: 'Smart lock keypad unresponsive. Locked out of the house.',
    diagnosisNotes: 'Bypassed lock via bottom cylinder. Keypad board fried due to moisture. Replaced entire exterior trim.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '13:00',
    durationMinutes: 120,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '7', type: 'service_call', description: 'Emergency House Lockout', unitPrice: 120, quantity: 1 },
      { id: '8', type: 'part', description: 'Schlage Encode Exterior Trim', unitPrice: 185, quantity: 1 },
      { id: '9', type: 'labor', description: 'Standard Labor', unitPrice: 85, quantity: 1 }
    ],
    totalAmount: 390
  },
  {
    id: 'job-4',
    jobNumber: 'LK-8433',
    client: {
      id: 'c-4',
      firstName: 'David',
      lastName: 'Kim',
      phone: '(555) 443-8199',
      email: 'dkim@example.com',
      address: '2244 River Walk, Chicago, IL',
    },
    lockDetails: { type: 'Secure / Safe', brand: 'Amsec', modelOrYear: 'BF6030' },
    complaint: 'Lost combination to the gun safe. Needs to be opened.',
    diagnosisNotes: 'Dial manipulation unsuccessful. Precision drilled and scoped the lock. Replaced with LaGard electronic keypad.',
    scheduledDate: getDynamicDate(1), 
    scheduledTime: '15:00',
    durationMinutes: 180,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '10', type: 'labor', description: 'Safe Drilling & Defeat', unitPrice: 350, quantity: 1 },
      { id: '11', type: 'part', description: 'LaGard Basic Electronic Lock retrofit', unitPrice: 165, quantity: 1 }
    ],
    totalAmount: 515
  },
  {
    id: 'job-5',
    jobNumber: 'LK-8444',
    client: {
      id: 'c-5',
      firstName: 'Alina',
      lastName: 'Vance',
      phone: '(555) 554-1234',
      email: 'alina.v@example.com',
      address: '400 Pine St, Seattle, WA',
    },
    lockDetails: { type: 'Automotive', brand: 'Ford', modelOrYear: '2021 F-150' },
    complaint: 'Key broke off inside the ignition cylinder.',
    diagnosisNotes: 'Extracted broken blade. Ignition required rebuild. Cut and programmed 2 new transponder keys.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '08:30',
    durationMinutes: 75,
    status: 'completed',
    paymentStatus: 'paid',
    photos: [],
    lineItems: [
      { id: '12', type: 'labor', description: 'Key Extraction', unitPrice: 85, quantity: 1 },
      { id: '13', type: 'part', description: 'Ignition Cylinder Rebuild Kit', unitPrice: 65, quantity: 1 },
      { id: '14', type: 'part', description: 'Ford H92 Transponder Key (x2)', unitPrice: 90, quantity: 2 },
      { id: '15', type: 'labor', description: 'Labor', unitPrice: 110, quantity: 1 }
    ],
    totalAmount: 440
  },
  {
    id: 'job-6',
    jobNumber: 'LK-8451',
    client: {
      id: 'c-6',
      firstName: 'Tom',
      lastName: 'Hanks',
      phone: '(555) 123-9999',
      email: 'thanks@example.com',
      address: '1001 Hollywood Blvd, LA, CA',
    },
    lockDetails: { type: 'Commercial', brand: 'Adams Rite', modelOrYear: 'Deadlatch 4510' },
    complaint: 'Front storefront door won\'t latch shut. Cylinder spins freely.',
    diagnosisNotes: 'Cam broken off the mortise cylinder. Set screw was loose. Replaced mortise cylinder and tightened down.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '11:00',
    durationMinutes: 45,
    status: 'diagnosed',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [
      { id: '16', type: 'service_call', description: 'Commercial Service Call', unitPrice: 95, quantity: 1 },
      { id: '17', type: 'part', description: '1" Mortise Cylinder (SC1 Keyway)', unitPrice: 45, quantity: 1 }
    ],
    totalAmount: 140
  },
  {
    id: 'job-7',
    jobNumber: 'LK-8460',
    client: {
      id: 'c-7',
      firstName: 'Emma',
      lastName: 'Stone',
      phone: '(555) 234-5678',
      email: 'emma.s@example.com',
      address: '777 Sunset Strip, LA, CA',
    },
    lockDetails: { type: 'Residential', brand: 'Kwikset', modelOrYear: 'SmartKey Defiant' },
    complaint: 'Tried to rekey lock myself, now no keys work.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '10:00',
    durationMinutes: 60,
    status: 'enRoute',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-8',
    jobNumber: 'LK-8465',
    client: {
      id: 'c-8',
      firstName: 'Robert',
      lastName: 'Downey',
      phone: '(555) 888-2233',
      email: 'robert.d@example.com',
      address: '12 Malibu Point, Malibu, CA',
    },
    lockDetails: { type: 'Automotive', brand: 'Audi', modelOrYear: '2016 Q5' },
    complaint: 'Keys locked in the trunk. Need emergency access.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '14:30',
    durationMinutes: 45,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-9',
    jobNumber: 'LK-8472',
    client: {
      id: 'c-9',
      firstName: 'Chris',
      lastName: 'Evans',
      phone: '(555) 999-1122',
      email: 'chris.e@example.com',
      address: '45 Brooklyn Ave, NY, NY',
    },
    lockDetails: { type: 'Commercial', brand: 'Simplex', modelOrYear: '1000 Series Pushbutton' },
    complaint: 'Mechanical keypad combination needs to be changed for new management.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(4), 
    scheduledTime: '16:00',
    durationMinutes: 90,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  },
  {
    id: 'job-10',
    jobNumber: 'LK-8480',
    client: {
      id: 'c-10',
      firstName: 'Scarlett',
      lastName: 'Johansson',
      phone: '(555) 333-4455',
      email: 'scarlett.j@example.com',
      address: '88 Broadway, NY, NY',
    },
    lockDetails: { type: 'Secure / Safe', brand: 'SentrySafe', modelOrYear: 'SFW123GDC' },
    complaint: 'Keypad is beeping and flashing but the handle won\'t turn. Changed batteries already.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(5), 
    scheduledTime: '09:00',
    durationMinutes: 60,
    status: 'scheduled',
    paymentStatus: 'unpaid',
    photos: [],
    lineItems: [],
    totalAmount: 0
  }
];

const INITIAL_MISSED_INTERACTIONS: MissedInteraction[] = [
  {
    id: 'm-1',
    type: 'call',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    from: 'Elena Rostova',
    avatar: 'https://i.pravatar.cc/150?u=tech2'
  },
  {
    id: 'm-2',
    type: 'message',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    from: 'James Wilson',
    avatar: 'https://i.pravatar.cc/150?u=tech3'
  },
  {
    id: 'm-3',
    type: 'call',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    from: 'Property Management Inc',
    avatar: 'https://i.pravatar.cc/150?u=tech4'
  }
];

const INITIAL_MESSAGES: Message[] = [
  { id: '1', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), sender: 'system', content: 'Inbound message from (555) 293-1124', method: 'sms' },
  { id: '2', timestamp: new Date(Date.now() - 1000 * 60 * 59).toISOString(), sender: 'client', content: 'Hi, are you guys open? I locked my keys in my car.', method: 'sms' },
  { id: '3', timestamp: new Date(Date.now() - 1000 * 60 * 58).toISOString(), sender: 'assistant', content: 'Yes, we are available 24/7. To help me give you an exact quote, what is the year, make, and model of your vehicle?', method: 'sms' },
  { id: '4', timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(), sender: 'client', content: 'It is a 2015 Ford Focus.', method: 'sms' },
  { id: '5', timestamp: new Date(Date.now() - 1000 * 60 * 54).toISOString(), sender: 'assistant', content: 'Thank you! For a 2015 Ford Focus standard lockout, our dispatch/unlock fee is $85 total. Would you like me to send a technician your way now?', method: 'sms' }
];

const INITIAL_CALLS: CallRecord[] = [
  { id: '1', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), duration: '3m 12s', from: 'Robert Johnson', phone: '(555) 882-9402', type: 'missed', avatar: 'https://i.pravatar.cc/150?u=tech5' },
  { id: '2', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), duration: '1m 45s', from: 'Alice Smith', phone: '(555) 112-9938', type: 'incoming', avatar: 'https://i.pravatar.cc/150?u=tech6' },
  { id: '3', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), duration: '5m 20s', from: 'Homeowner', phone: '(555) 304-2001', type: 'incoming', avatar: 'https://i.pravatar.cc/150?u=tech7' }
];

const INITIAL_INVENTORY: Part[] = [
  { id: '1', name: 'Schlage SC1 Key Blank', sku: 'KB-SC1-BR', category: 'Key Blanks', stock: 154, reorderPoint: 50, price: 1.5 },
  { id: '2', name: 'Kwikset KW1 Key Blank', sku: 'KB-KW1-BR', category: 'Key Blanks', stock: 212, reorderPoint: 50, price: 1.5 },
  { id: '3', name: 'Toyota Proximity Key (4 Button)', sku: 'RM-TOY-PROX4', category: 'Remotes', stock: 8, reorderPoint: 10, price: 85 },
  { id: '4', name: 'Ford H92 Transponder Key', sku: 'RM-FORD-H92', category: 'Remotes', stock: 12, reorderPoint: 10, price: 25 },
  { id: '5', name: 'Commercial Mortise Cylinder 1-1/8"', sku: 'CY-MORT-118-SC1', category: 'Cylinders', stock: 4, reorderPoint: 5, price: 32 },
  { id: '6', name: 'Schlage Encode Plymouth (Matte Black)', sku: 'HW-SCH-ENC-MB', category: 'Hardware', stock: 2, reorderPoint: 3, price: 245 },
  { id: '7', name: 'Lishi SC1 2-in-1 pick', sku: 'TL-LISHI-SC1', category: 'Tools', stock: 1, reorderPoint: 1, price: 65 },
];

interface AppState {
  jobs: Job[];
  missedInteractions: MissedInteraction[];
  messages: Message[];
  calls: CallRecord[];
  inventory: Part[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addJob: (job: Omit<Job, 'id' | 'createdAt'>) => void;
  updateJob: (job: Job) => void;
  updateJobStatus: (id: string, status: JobStatus) => void;
  updateInventoryItem: (part: Part) => void;
  addInventoryItem: (part: Omit<Part, 'id'>) => void;
  removeInventoryItem: (id: string) => void;
  clearMissed: (id: string) => void;
  getFinancialMetrics: () => { totalRevenue: number, targetRevenue: number, closeRate: number, paceIndicator: number };
}

export const useAppStore = create<AppState>((set, get) => ({
  jobs: INITIAL_JOBS,
  missedInteractions: INITIAL_MISSED_INTERACTIONS,
  messages: INITIAL_MESSAGES,
  calls: INITIAL_CALLS,
  inventory: INITIAL_INVENTORY,
  activeTab: 'calendar',
  setActiveTab: (tab) => set({ activeTab: tab }),
  addJob: (jobData) => set((state) => ({
    jobs: [...state.jobs, { ...jobData, id: `job-${Date.now()}`, createdAt: new Date().toISOString() }]
  })),
  updateJob: (updatedJob) => set((state) => ({
    jobs: state.jobs.map(j => j.id === updatedJob.id ? updatedJob : j)
  })),
  updateJobStatus: (id, status) => set((state) => ({
    jobs: state.jobs.map(j => j.id === id ? { ...j, status } : j)
  })),
  updateInventoryItem: (part) => set((state) => ({
    inventory: state.inventory.map(p => p.id === part.id ? part : p)
  })),
  addInventoryItem: (part) => set((state) => ({
    inventory: [...state.inventory, { ...part, id: `part-${Date.now()}` }]
  })),
  removeInventoryItem: (id) => set((state) => ({
    inventory: state.inventory.filter(p => p.id !== id)
  })),
  clearMissed: (id) => set((state) => ({
    missedInteractions: state.missedInteractions.filter(m => m.id !== id)
  })),
  getFinancialMetrics: () => {
    const metrics = calculateFinancialMetrics(get().jobs);
    return {
      totalRevenue: metrics.totalRevenue,
      targetRevenue: 5000, // example goal
      closeRate: metrics.closeRate || 75,
      paceIndicator: metrics.jobsSold || 0
    };
  }
}));

export const useAIActions = () => {
  const handleAction = (actionPayload: any) => {
    console.log("AI Action Triggered", actionPayload);
    // In a real implementation this would dispatch to the store based on payload
  };
  return { handleAction };
};
