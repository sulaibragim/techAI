
import { useState, useCallback, useEffect } from 'react';
import { Job, JobStatus, MissedInteraction, Message, CallRecord, LineItem } from './types';
import { calculateFinancialMetrics } from './financialUtils';

// Обновленный список заказов Султана. Добавлен Мартин Иден.
let globalJobs: Job[] = [
  {
    id: 'job-martin',
    jobNumber: '7721ME',
    client: {
      id: 'c-martin',
      firstName: 'Martin',
      lastName: 'Eden',
      phone: '(555) 777-8899',
      secondaryPhone: '(555) 111-2233',
      email: 'martin.eden@writer.com',
      secondaryEmail: 'eden.backup@gmail.com',
      address: '456 Oakland Ave, CA',
      photo: 'https://i.pravatar.cc/150?u=martin',
      notes: 'Prefers morning appointments. Gate code: 1234.',
      preferredContact: 'email',
      tags: ['VIP', 'Repeat Customer']
    },
    appliance: {
      type: 'Refrigerator',
      brand: 'Sub-Zero',
      modelNumber: 'SZ-700'
    },
    complaint: 'Cooling system failure, constant alarm',
    diagnosisNotes: '',
    scheduledDate: '2026-02-13', 
    scheduledTime: '11:00',
    durationMinutes: 60,
    status: 'scheduled',
    distance: 3.1,
    lineItems: [
      { id: 'l-m1', type: 'service_call', description: 'Emergency Diagnostic', quantity: 1, unitPrice: 136 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 136,
    photos: [],
    messages: []
  },
  {
    id: 'job-1',
    jobNumber: '8832RS',
    client: {
      id: 'c1',
      firstName: 'Jason',
      lastName: 'Resinsmit',
      phone: '(602) 555-0101',
      secondaryPhone: '(602) 555-0102',
      email: 'jason.r@example.com',
      address: '123 Phoenix Way, AZ',
      photo: 'https://i.pravatar.cc/150?u=jason',
      notes: 'Beware of dog in backyard.',
      preferredContact: 'phone',
      tags: ['Residential']
    },
    appliance: {
      type: 'Refrigerator',
      brand: 'Samsung',
      modelNumber: 'RF28'
    },
    complaint: 'Ice maker stopped dispensing and clicking noise from back',
    diagnosisNotes: 'Faulty fan motor in freezer compartment.',
    scheduledDate: '2026-02-13', 
    scheduledTime: '09:00',
    durationMinutes: 90,
    status: 'enRoute',
    distance: 2.3,
    lineItems: [
      { id: 'l1', type: 'service_call', description: 'Diagnostic Fee', quantity: 1, unitPrice: 136 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 136,
    photos: [],
    messages: []
  },
  {
    id: 'job-2',
    jobNumber: '9902EM',
    client: {
      id: 'c3',
      firstName: 'Elon',
      lastName: 'Musk',
      phone: '(555) 001-0001',
      secondaryPhone: '(555) 001-0002',
      email: 'elon@spacex.com',
      address: '1 Starship Way, Boca Chica, TX',
      photo: 'https://i.pravatar.cc/150?u=elon',
      notes: 'Check in with security at the gate.',
      preferredContact: 'sms',
      tags: ['High Priority', 'Commercial']
    },
    appliance: {
      type: 'Oven',
      brand: 'Wolf',
      modelNumber: 'X-TREME-OVEN'
    },
    complaint: 'Temperature fluctuations during high-heat testing',
    diagnosisNotes: 'Pending sensor realignment.',
    scheduledDate: '2026-02-13',
    scheduledTime: '13:00',
    durationMinutes: 60,
    status: 'scheduled',
    distance: 4.5,
    lineItems: [
      { id: 'l3', type: 'service_call', description: 'Advanced Diagnostic', quantity: 1, unitPrice: 400 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 400,
    photos: [],
    messages: []
  },
  {
    id: 'job-3',
    jobNumber: '1122AK',
    client: {
      id: 'c4',
      firstName: 'Amelia',
      lastName: 'Kral',
      phone: '(555) 123-4567',
      email: 'amelia.k@kingdom.io',
      address: '7 Royal Blvd, London, UK',
      photo: 'https://i.pravatar.cc/150?u=amelia',
      notes: 'Requires 24h notice.',
      preferredContact: 'email',
      tags: ['International']
    },
    appliance: {
      type: 'Washer',
      brand: 'Miele',
      modelNumber: 'W1'
    },
    complaint: 'Vibration excessive during spin cycle',
    diagnosisNotes: 'Shipping bolts potentially left in or shock absorbers worn.',
    scheduledDate: '2026-02-13',
    scheduledTime: '15:30',
    durationMinutes: 45,
    status: 'scheduled',
    distance: 1.1,
    lineItems: [
      { id: 'l4', type: 'service_call', description: 'Performance Audit', quantity: 1, unitPrice: 200 }
    ],
    paymentStatus: 'unpaid',
    totalAmount: 200,
    photos: [],
    messages: []
  }
];

let globalCalls: CallRecord[] = [
  { id: 'c1', from: 'Jason Resinsmit', phone: '(602) 555-0101', timestamp: 'Today, 10:15 AM', type: 'incoming', duration: '2m 12s', avatar: 'https://i.pravatar.cc/150?u=rs' },
  { id: 'c2', from: 'Amelia Kral', phone: '(555) 123-4567', timestamp: 'Today, 09:45 AM', type: 'missed', avatar: 'https://i.pravatar.cc/150?u=ak' }
];

let globalActiveTab: string = 'calendar';

let globalMissed: MissedInteraction[] = [
  { id: 'm1', type: 'call', from: 'Elon Musk', timestamp: '11:20 AM', avatar: 'https://i.pravatar.cc/150?u=em' }
];

const listeners: Array<(jobs: Job[]) => void> = [];
const missedListeners: Array<(missed: MissedInteraction[]) => void> = [];
const callListeners: Array<(calls: CallRecord[]) => void> = [];
const tabListeners: Array<(tab: string) => void> = [];

const notify = () => {
  listeners.forEach(l => l([...globalJobs]));
};

const notifyMissed = () => {
  missedListeners.forEach(l => l([...globalMissed]));
};

const notifyCalls = () => {
  callListeners.forEach(l => l([...globalCalls]));
};

const notifyTab = () => {
  tabListeners.forEach(l => l(globalActiveTab));
};

export function useAppStore() {
  const [jobs, setJobs] = useState<Job[]>(globalJobs);
  const [missedInteractions, setMissedInteractions] = useState<MissedInteraction[]>(globalMissed);
  const [callHistory, setCallHistory] = useState<CallRecord[]>(globalCalls);
  const [activeTab, setActiveTabState] = useState<string>(globalActiveTab);

  useEffect(() => {
    listeners.push(setJobs);
    missedListeners.push(setMissedInteractions);
    callListeners.push(setCallHistory);
    tabListeners.push(setActiveTabState);
    return () => {
      const index = listeners.indexOf(setJobs);
      if (index > -1) listeners.splice(index, 1);
      const mIndex = missedListeners.indexOf(setMissedInteractions);
      if (mIndex > -1) missedListeners.splice(mIndex, 1);
      const cIndex = callListeners.indexOf(setCallHistory);
      if (cIndex > -1) callListeners.splice(cIndex, 1);
      const tIndex = tabListeners.indexOf(setActiveTabState);
      if (tIndex > -1) tabListeners.splice(tIndex, 1);
    };
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    globalActiveTab = tab;
    notifyTab();
  }, []);

  const addJob = useCallback((job: Job) => {
    globalJobs = [...globalJobs, job];
    notify();
  }, []);

  const updateJobStatus = useCallback((jobId: string, status: JobStatus) => {
    globalJobs = globalJobs.map(j => j.id === jobId ? { ...j, status } : j);
    notify();
  }, []);

  const updateJob = useCallback((updatedJob: Job) => {
    globalJobs = globalJobs.map(j => j.id === updatedJob.id ? updatedJob : j);
    notify();
  }, []);

  const addMessageToJob = useCallback((jobId: string, message: Message) => {
    globalJobs = globalJobs.map(j => 
      j.id === jobId ? { ...j, messages: [...(j.messages || []), message] } : j
    );
    notify();
  }, []);

  const clearMissed = useCallback((id: string) => {
    globalMissed = globalMissed.filter(m => m.id !== id);
    notifyMissed();
  }, []);

  return {
    jobs,
    missedInteractions,
    callHistory,
    addJob,
    updateJobStatus,
    updateJob,
    addMessageToJob,
    clearMissed,
    activeTab,
    setActiveTab
  };
}

export function useAIActions() {
  const { jobs, addJob, updateJob, updateJobStatus, addMessageToJob, setActiveTab } = useAppStore();

  const findClientJob = useCallback((searchName: string) => {
    const search = searchName.toLowerCase().trim();
    return jobs.find(j => `${j.client.firstName} ${j.client.lastName}`.toLowerCase().includes(search));
  }, [jobs]);

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
        addJob(newJob);
        return { status: "success", jobId: newJob.id };
      }

      case 'update_job': {
        const target = jobs.find(j => j.id === data.jobId);
        if (target) {
          const updated = { ...target };
          if (data.status) updated.status = data.status;
          if (data.diagnosisNotes) updated.diagnosisNotes = data.diagnosisNotes;
          if (data.brand) updated.appliance.brand = data.brand;
          if (data.modelNumber) updated.appliance.modelNumber = data.modelNumber;
          if (data.serialNumber) updated.appliance.serialNumber = data.serialNumber;
          if (data.scheduledDate) updated.scheduledDate = data.scheduledDate;
          if (data.scheduledTime) updated.scheduledTime = data.scheduledTime;
          updateJob(updated);
          return { status: "success" };
        }
        return { status: "error", message: "Job not found" };
      }

      case 'navigate_to': {
        setActiveTab(data.tab);
        return { status: "success" };
      }

      case 'get_app_state': {
        const financials = calculateFinancialMetrics(jobs);
        return {
          jobs: jobs.map(j => ({
            id: j.id,
            client: `${j.client.firstName} ${j.client.lastName}`,
            status: j.status,
            appliance: `${j.appliance.brand} ${j.appliance.type}`
          })),
          metrics: {
            totalJobs: jobs.length,
            revenue: financials.totalRevenue,
            activeJobs: jobs.filter(j => j.status === 'enRoute' || j.status === 'onSite').length
          }
        };
      }

      case 'send_message_by_name': {
        const target = findClientJob(data.fullName);
        if (target) {
          addMessageToJob(target.id, {
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
  }, [jobs, addJob, updateJob, updateJobStatus, addMessageToJob, setActiveTab, findClientJob]);

  return { handleAction };
}
