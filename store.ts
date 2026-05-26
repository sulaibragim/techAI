
import { create } from 'zustand';
import { useCallback } from 'react';
import { Job, JobStatus, MissedInteraction, Message, CallRecord, LineItem } from './types';
import { calculateFinancialMetrics } from './financialUtils';

// Generate dynamic dates around today
const getDynamicDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

const INITIAL_JOBS: Job[] = [
  {
    id: 'job-1',
    jobNumber: '1001SJ',
    client: {
      id: 'c-1',
      firstName: 'Sarah',
      lastName: 'Jenkins',
      phone: '(555) 234-5678',
      email: 's.jenkins88@example.com',
      address: '142 Maple Street, Valley Stream, NY',
      photo: 'https://i.pravatar.cc/150?u=sarahj',
      notes: 'Call 30 mins before arrival.',
      preferredContact: 'phone',
      tags: ['Residential', 'Repeat Customer']
    },
    appliance: { type: 'Refrigerator', brand: 'Whirlpool', modelNumber: 'WRF535SWHZ' },
    complaint: 'Ice maker completely frozen over and not dispensing.',
    diagnosisNotes: 'Defrosted ice maker line, replaced faulty water inlet valve.',
    scheduledDate: getDynamicDate(-1), 
    scheduledTime: '09:00',
    durationMinutes: 90,
    status: 'completed',
    distance: 4.2,
    lineItems: [
      { id: 'l1-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 120 },
      { id: 'l1-2', type: 'part', description: 'Water Inlet Valve', quantity: 1, unitPrice: 85 }
    ],
    paymentStatus: 'paid',
    totalAmount: 205,
    photos: [],
    messages: []
  },
  {
    id: 'job-2',
    jobNumber: '1002MC',
    client: {
      id: 'c-2',
      firstName: 'Michael',
      lastName: 'Chang',
      phone: '(555) 987-6543',
      email: 'm.chang.dev@example.com',
      address: '88 Tech Blvd, Apt 4C, San Jose, CA',
      photo: 'https://i.pravatar.cc/150?u=mchang',
      notes: 'Gate code #4499. Park in visitor spot.',
      preferredContact: 'sms',
      tags: ['Condo']
    },
    appliance: { type: 'Dishwasher', brand: 'Bosch', modelNumber: 'SHPM65Z55N' },
    complaint: 'Leaving white residue on all glasses, not draining properly.',
    diagnosisNotes: 'Cleared drain pump blockage (glass shard). System flushed.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '10:30',
    durationMinutes: 60,
    status: 'completed',
    distance: 7.1,
    lineItems: [
      { id: 'l2-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 150 },
      { id: 'l2-2', type: 'labor', description: 'Pump clearing labor', quantity: 1, unitPrice: 45 }
    ],
    paymentStatus: 'paid',
    totalAmount: 195,
    photos: [],
    messages: []
  },
  {
    id: 'job-3',
    jobNumber: '1003DO',
    client: {
      id: 'c-3',
      firstName: 'David',
      lastName: 'O\'Connor',
      phone: '(555) 456-7890',
      email: 'doconnor.realestate@example.com',
      address: '4452 Highland Dr, Austin, TX',
      photo: 'https://i.pravatar.cc/150?u=davidoc',
      notes: 'Wife will be home to let you in.',
      preferredContact: 'phone',
      tags: ['Premium']
    },
    appliance: { type: 'Oven', brand: 'Wolf', modelNumber: 'DO30TE/S/TH' },
    complaint: 'Lower oven not reaching set temperature.',
    diagnosisNotes: 'Bake element faulty. Replaced bake heating element and calibrated thermostat.',
    scheduledDate: getDynamicDate(0), 
    scheduledTime: '13:00',
    durationMinutes: 120,
    status: 'completed',
    distance: 12.5,
    lineItems: [
      { id: 'l3-1', type: 'service_call', description: 'Premium Diagnostic', quantity: 1, unitPrice: 180 },
      { id: 'l3-2', type: 'part', description: 'Bake Element (OEM)', quantity: 1, unitPrice: 210 },
      { id: 'l3-3', type: 'labor', description: 'Installation & Calibration', quantity: 1.5, unitPrice: 120 }
    ],
    paymentStatus: 'paid',
    totalAmount: 570,
    photos: [],
    messages: []
  },
  {
    id: 'job-4',
    jobNumber: '1004ER',
    client: {
      id: 'c-4',
      firstName: 'Emily',
      lastName: 'Rodriguez',
      phone: '(555) 333-2211',
      email: 'emily.r1990@example.com',
      address: '710 Central Ave, Miami, FL',
      photo: 'https://i.pravatar.cc/150?u=emilyr',
      notes: 'Beware of the small dog, friendly but energetic.',
      preferredContact: 'sms',
      tags: ['Residential']
    },
    appliance: { type: 'Washer', brand: 'LG', modelNumber: 'WM4000HWA' },
    complaint: 'Vibrating violently during spin cycle.',
    diagnosisNotes: 'Leveled the machine and tightened shock absorbers. Running smoothly now.',
    scheduledDate: getDynamicDate(1), 
    scheduledTime: '15:00',
    durationMinutes: 45,
    status: 'completed',
    distance: 2.8,
    lineItems: [
      { id: 'l4-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 129 }
    ],
    paymentStatus: 'paid',
    totalAmount: 129,
    photos: [],
    messages: []
  },
  {
    id: 'job-5',
    jobNumber: '1005RF',
    client: {
      id: 'c-5',
      firstName: 'Robert',
      lastName: 'Foster',
      phone: '(555) 777-6655',
      email: 'rfoster.design@example.com',
      address: '22 Brookside Way, Seattle, WA',
      photo: 'https://i.pravatar.cc/150?u=robertf',
      notes: 'Use side entrance.',
      preferredContact: 'email',
      tags: ['Repeat Customer']
    },
    appliance: { type: 'Dryer', brand: 'Samsung', modelNumber: 'DVE45R6100W' },
    complaint: 'Drum rotating but not producing heat.',
    diagnosisNotes: 'Tested thermal fuse - blown. Heating element good. Replaced thermal fuse and cleared thick lint from exhaust.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '08:30',
    durationMinutes: 75,
    status: 'completed',
    distance: 8.4,
    lineItems: [
      { id: 'l5-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 120 },
      { id: 'l5-2', type: 'part', description: 'Thermal Fuse Kit', quantity: 1, unitPrice: 35 },
      { id: 'l5-3', type: 'labor', description: 'Vent Clearing', quantity: 1, unitPrice: 65 }
    ],
    paymentStatus: 'paid',
    totalAmount: 220,
    photos: [],
    messages: []
  },
  {
    id: 'job-6',
    jobNumber: '1006AW',
    client: {
      id: 'c-6',
      firstName: 'Amanda',
      lastName: 'Wei',
      phone: '(555) 888-9900',
      email: 'amanda.wei.art@example.com',
      address: '3900 Art District Rd, Unit 12, Portland, OR',
      photo: 'https://i.pravatar.cc/150?u=amandaw',
      notes: 'Studio space, ring the bell on the glass door.',
      preferredContact: 'sms',
      tags: ['Commercial']
    },
    appliance: { type: 'Refrigerator', brand: 'Sub-Zero', modelNumber: 'PRO3650G' },
    complaint: 'Condenser fan extremely loud, temps rising.',
    diagnosisNotes: 'Condenser fan motor failing. Ordered replacement part, unit turned off to prevent compressor damage.',
    scheduledDate: getDynamicDate(2), 
    scheduledTime: '11:00',
    durationMinutes: 45,
    status: 'diagnosed',
    distance: 5.0,
    lineItems: [
      { id: 'l6-1', type: 'service_call', description: 'Premium Diagnostic', quantity: 1, unitPrice: 180 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 180,
    photos: [],
    messages: []
  },
  {
    id: 'job-7',
    jobNumber: '1007TM',
    client: {
      id: 'c-7',
      firstName: 'Thomas',
      lastName: 'Miller',
      phone: '(555) 222-3344',
      email: 'tmiller.finance@example.com',
      address: '8910 Broad Street, Philadelphia, PA',
      photo: 'https://i.pravatar.cc/150?u=thomasm',
      notes: 'I work from home, just knock.',
      preferredContact: 'phone',
      tags: ['Residential']
    },
    appliance: { type: 'Dishwasher', brand: 'Miele', modelNumber: 'G 7156 SCVi' },
    complaint: 'Showing Error Code F11, water not draining.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '10:00',
    durationMinutes: 60,
    status: 'enRoute',
    distance: 3.5,
    lineItems: [
      { id: 'l7-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 150 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 150,
    photos: [],
    messages: []
  },
  {
    id: 'job-8',
    jobNumber: '1008RG',
    client: {
      id: 'c-8',
      firstName: 'Rachel',
      lastName: 'Green',
      phone: '(555) 666-7788',
      email: 'r.green.fashion@example.com',
      address: '90 Bedford St, Apt 20, New York, NY',
      photo: 'https://i.pravatar.cc/150?u=rachelg',
      notes: 'Superintendent has the key if I am out.',
      preferredContact: 'sms',
      tags: ['Apartment']
    },
    appliance: { type: 'Microwave', brand: 'GE', modelNumber: 'JVM3160RFSS' },
    complaint: 'Sparks and arcing inside the microwave during heating.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(3), 
    scheduledTime: '14:30',
    durationMinutes: 45,
    status: 'scheduled',
    distance: 6.2,
    lineItems: [
      { id: 'l8-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 120 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 120,
    photos: [],
    messages: []
  },
  {
    id: 'job-9',
    jobNumber: '1009MJ',
    client: {
      id: 'c-9',
      firstName: 'Marcus',
      lastName: 'Johnson',
      phone: '(555) 111-9999',
      email: 'mjohnson.athletic@example.com',
      address: '1500 Sports Arena Blvd, Chicago, IL',
      photo: 'https://i.pravatar.cc/150?u=marcusj',
      notes: 'Park in the west lot. Call when here.',
      preferredContact: 'phone',
      tags: ['Commercial', 'VIP']
    },
    appliance: { type: 'Washer', brand: 'Speed Queen', modelNumber: 'TR7003WN' },
    complaint: 'Machine won\'t agitate, just hums.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(4), 
    scheduledTime: '16:00',
    durationMinutes: 90,
    status: 'scheduled',
    distance: 14.1,
    lineItems: [
      { id: 'l9-1', type: 'service_call', description: 'Commercial Diagnostic', quantity: 1, unitPrice: 180 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 180,
    photos: [],
    messages: []
  },
  {
    id: 'job-10',
    jobNumber: '1010AP',
    client: {
      id: 'c-10',
      firstName: 'Arthur',
      lastName: 'Pendelton',
      phone: '(555) 888-1234',
      email: 'arthur.p.law@example.com',
      address: '200 Legal Avenue, Boston, MA',
      photo: 'https://i.pravatar.cc/150?u=arthurp',
      notes: 'Requires exact timeframe, very busy.',
      preferredContact: 'email',
      tags: ['Residential']
    },
    appliance: { type: 'Oven', brand: 'Thermador', modelNumber: 'PRD366WIG' },
    complaint: 'Display board is completely blank, no buttons respond.',
    diagnosisNotes: '',
    scheduledDate: getDynamicDate(5), 
    scheduledTime: '09:00',
    durationMinutes: 60,
    status: 'scheduled',
    distance: 9.3,
    lineItems: [
      { id: 'l10-1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 150 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 150,
    photos: [],
    messages: []
  }
];

const INITIAL_CALLS: CallRecord[] = [
  { id: 'c1', from: 'Arthur Pendelton', phone: '(555) 888-1234', timestamp: 'Today, 08:15 AM', type: 'incoming', duration: '3m 45s', avatar: 'https://i.pravatar.cc/150?u=arthurp' },
  { id: 'c2', from: 'Rachel Green', phone: '(555) 666-7788', timestamp: 'Today, 09:30 AM', type: 'incoming', duration: '1m 20s', avatar: 'https://i.pravatar.cc/150?u=rachelg' },
  { id: 'c3', from: 'Thomas Miller', phone: '(555) 222-3344', timestamp: 'Today, 09:45 AM', type: 'missed', avatar: 'https://i.pravatar.cc/150?u=thomasm' },
  { id: 'c4', from: 'Amanda Wei', phone: '(555) 888-9900', timestamp: 'Yesterday, 04:20 PM', type: 'outgoing', duration: '5m 12s', avatar: 'https://i.pravatar.cc/150?u=amandaw' }
];

const INITIAL_MISSED: MissedInteraction[] = [
  { id: 'm1', type: 'call', from: 'Marcus Johnson', timestamp: '11:20 AM', avatar: 'https://i.pravatar.cc/150?u=marcusj' },
  { id: 'm2', type: 'message', from: 'Sarah Jenkins', timestamp: '01:05 PM', avatar: 'https://i.pravatar.cc/150?u=sarahj' }
];

interface AppState {
  jobs: Job[];
  missedInteractions: MissedInteraction[];
  callHistory: CallRecord[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addJob: (job: Job) => void;
  updateJobStatus: (jobId: string, status: JobStatus) => void;
  updateJob: (updatedJob: Job) => void;
  addMessageToJob: (jobId: string, message: Message) => void;
  clearMissed: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  jobs: INITIAL_JOBS,
  missedInteractions: INITIAL_MISSED,
  callHistory: INITIAL_CALLS,
  activeTab: 'calendar',
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
  
  updateJobStatus: (jobId, status) => set((state) => ({
    jobs: state.jobs.map(j => j.id === jobId ? { ...j, status } : j)
  })),
  
  updateJob: (updatedJob) => set((state) => ({
    jobs: state.jobs.map(j => j.id === updatedJob.id ? updatedJob : j)
  })),
  
  addMessageToJob: (jobId, message) => set((state) => ({
    jobs: state.jobs.map(j => j.id === jobId ? { ...j, messages: [...(j.messages || []), message] } : j)
  })),
  
  clearMissed: (id) => set((state) => ({
    missedInteractions: state.missedInteractions.filter(m => m.id !== id)
  }))
}));

export function useAIActions() {
  const { jobs, addJob, updateJob, updateJobStatus, addMessageToJob, setActiveTab } = useAppStore();

  const findClientJob = useCallback((searchName: string) => {
    const search = searchName.toLowerCase().trim();
    // Use the latest jobs from Zustand state
    return useAppStore.getState().jobs.find(j => {
      const firstName = j.client.firstName.toLowerCase();
      const lastName = j.client.lastName.toLowerCase();
      const fullName = `${firstName} ${lastName}`;
      const reversedName = `${lastName} ${firstName}`;
      
      return fullName.includes(search) || 
             reversedName.includes(search) || 
             firstName.includes(search) || 
             lastName.includes(search);
    });
  }, []);

  const handleAction = useCallback(async (action: string, data: any) => {
    switch (action) {
      case 'create_job': {
        const newJob: Job = {
          id: Math.random().toString(36).substr(2, 9),
          jobNumber: Math.random().toString(36).substr(2, 6).toUpperCase(),
          client: {
            id: Math.random().toString(36).substr(2, 9),
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email || '',
            address: data.address || '',
            photo: `https://i.pravatar.cc/150?u=${data.lastName}`,
            notes: '',
            preferredContact: 'phone',
            tags: ['AI Created']
          },
          appliance: {
            type: data.applianceType,
            brand: data.brand || '',
            modelNumber: data.modelNumber || ''
          },
          complaint: data.complaint,
          diagnosisNotes: '',
          scheduledDate: data.scheduledDate || new Date().toISOString().split('T')[0],
          scheduledTime: data.scheduledTime || '09:00',
          durationMinutes: 60,
          status: 'scheduled',
          distance: 0,
          lineItems: [],
          paymentStatus: 'unpaid',
          totalAmount: 0,
          photos: [],
          messages: []
        };
        useAppStore.getState().addJob(newJob);
        return { status: "success", jobId: newJob.id };
      }

      case 'update_job': {
        const store = useAppStore.getState();
        const target = store.jobs.find(j => j.id === data.jobId);
        if (target) {
          const updated = { ...target };
          if (data.status) updated.status = data.status;
          if (data.diagnosisNotes) updated.diagnosisNotes = data.diagnosisNotes;
          if (data.brand) updated.appliance.brand = data.brand;
          if (data.modelNumber) updated.appliance.modelNumber = data.modelNumber;
          if (data.serialNumber) updated.appliance.serialNumber = data.serialNumber;
          if (data.scheduledDate) updated.scheduledDate = data.scheduledDate;
          if (data.scheduledTime) updated.scheduledTime = data.scheduledTime;
          store.updateJob(updated);
          return { status: "success" };
        }
        return { status: "error", message: "Job not found" };
      }

      case 'navigate_to': {
        useAppStore.getState().setActiveTab(data.tab);
        return { status: "success" };
      }

      case 'get_app_state': {
        const currentJobs = useAppStore.getState().jobs;
        const financials = calculateFinancialMetrics(currentJobs);
        return {
          jobs: currentJobs.map(j => ({
            id: j.id,
            client: `${j.client.firstName} ${j.client.lastName}`,
            status: j.status,
            appliance: `${j.appliance.brand} ${j.appliance.type}`,
            scheduledDate: j.scheduledDate,
            scheduledTime: j.scheduledTime,
            address: j.client.address,
            phone: j.client.phone,
            complaint: j.complaint
          })),
          metrics: {
            totalJobs: currentJobs.length,
            activeJobs: currentJobs.filter(j => j.status === 'enRoute' || j.status === 'onSite').length,
            financials: financials
          }
        };
      }

      case 'send_message_by_name': {
        const target = findClientJob(data.fullName);
        if (target) {
          useAppStore.getState().addMessageToJob(target.id, {
            id: Math.random().toString(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sender: 'assistant',
            content: data.content,
            method: 'sms'
          });
          return { status: "success" };
        }
        return { status: "error", message: "Client not found" };
      }

      default:
        return { status: "error", message: "Unknown action" };
    }
  }, [findClientJob]);

  return { handleAction };
}
