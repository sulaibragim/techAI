
import { GoogleGenAI, Modality, Type, LiveServerMessage, ThinkingLevel } from "@google/genai";
import { useSettingsStore } from './settingsStore';
import { useAppStore } from './store';
import { useAuthStore } from './authStore';
import { API_BASE } from './backendUrl';

const resolveApiKey = (): string => {
  const key = useSettingsStore.getState().geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
  if (!key) throw new Error('Gemini API key not configured. Go to Settings → AI Configuration to add your key.');
  return key;
};

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encode(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(chunks.join(''));
}

function getBusinessContext(): string {
  const store = useAppStore.getState();
  const auth = useAuthStore.getState();
  const settings = useSettingsStore.getState();
  const jobs = store.jobs;
  const users = auth.users.filter(u => u.active);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todaysJobs = jobs.filter(j => j.scheduledDate === todayStr);
  const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const todayRevenue = todaysJobs.filter(j => j.status === 'completed' || j.status === 'sold').reduce((s, j) => s + (j.totalAmount || 0), 0);
  const totalRevenue = completedJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);

  const techs = users.filter(u => u.role === 'technician');
  const techList = techs.map(t => `${t.name} (${t.techStatus || 'offDuty'}, ID: ${t.id})`).join(', ');

  const recentJobs = jobs.slice(-15).map(j =>
    `[${j.id}] #${j.jobNumber} | ${j.client.firstName} ${j.client.lastName} | ${j.client.phone} | ${j.lockDetails.type}/${j.lockDetails.brand || '?'} | ${j.status} | ${j.scheduledDate} ${j.scheduledTime} | $${j.totalAmount} | assigned: ${j.assignedTo || 'none'}`
  ).join('\n');

  return `
CURRENT BUSINESS STATE (auto-injected, refreshed every message):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' })}
Time: ${today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' })} (Arizona Time)
Company: ${settings.companyName}

TODAY'S JOBS: ${todaysJobs.length} (Revenue: $${todayRevenue} / Target: $${settings.dailyRevenueTarget})
ACTIVE JOBS: ${activeJobs.length}
TOTAL COMPLETED: ${completedJobs.length} (Revenue: $${totalRevenue})
MONTHLY TARGET: $${settings.monthlyRevenueTarget}

TECHNICIANS: ${techList || 'None configured'}

RECENT JOBS (last 15):
${recentJobs || '(no jobs yet)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

const getSystemInstruction = () => `
IDENTITY:
- Your name is "Дурачок" (Durachok). You are Sultan's elite business partner and AI assistant.
- You speak with Sultan ONLY in Russian (русский язык).
- All client names, addresses, messages to clients, and data entries MUST be in ENGLISH.
- You think internally in English for all logic and data operations.

ROLE:
You are the strategic brain of TrustKey Locksmith — a locksmith company in Arizona (AZ).
Services: automotive lockouts, residential rekeying, commercial lock systems, safe opening.
You have FULL access to the CRM data and can perform ANY action Sultan asks.

COMMUNICATION STYLE:
- Be concise. No fluff. Get to the point.
- When reporting data, use structured format (bullets, numbers).
- When Sultan asks "what's up" or "как дела", give a quick business overview: today's jobs, revenue, any issues.
- Never say "I'll help you with that" — just DO it.
- If Sultan says "отправь" / "создай" / "отмени" — execute immediately, no confirmation needed.

TOOL USAGE (CRITICAL):
- You MUST call tools for ANY action. Never claim you did something without calling the function.
- DO NOT ask for permission. If Sultan says to do something, DO IT.
- If you need a job ID, call 'search_jobs' first to find it.
- All client names in tool parameters MUST be in English/Latin script.
- When creating jobs: scheduledDate format is YYYY-MM-DD, scheduledTime is HH:MM.

LANGUAGE RULES:
- Talk to Sultan: RUSSIAN
- Client names in data: ENGLISH (Султан says "Джек" → you write "Jack")
- SMS to clients (send_sms content): ENGLISH, professional, friendly
- Never repeat SMS text back to Sultan. Just confirm: "Отправил сообщение"
- Job descriptions, addresses, notes: ENGLISH

WHAT YOU CAN DO:
1. CREATE jobs with full details
2. UPDATE any job field (status, schedule, notes, assignment)
3. SEARCH jobs by name, status, date
4. VIEW dashboard stats and revenue
5. SEND real SMS to clients via OpenPhone
6. CHECK inventory/parts
7. SEE technician status and assignments
8. NAVIGATE between app tabs
9. ANALYZE business performance and give strategic advice

LOCKSMITH DOMAIN KNOWLEDGE:
- Job types: Automotive (car lockouts, key programming, ignition repair), Residential (lockouts, rekeying, smart locks), Commercial (panic bars, access control, master key systems), Safe/Vault (combination changes, drilling, manipulation)
- Common brands: Schlage, Kwikset, Yale, Medeco (residential); Toyota, Honda, Ford, BMW, Audi (automotive); Von Duprin, Adams Rite, Corbin Russwin (commercial); Amsec, SentrySafe (safes)
- Status flow: scheduled → enRoute → onSite → diagnosed → sold → completed
- Urgency levels: emergency (locked out NOW), urgent (same-day), standard (can schedule)

${getBusinessContext()}
`;

const AI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'create_job',
        description: 'Creates a new locksmith job. Returns the created job details.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            firstName: { type: Type.STRING, description: 'Client first name in English' },
            lastName: { type: Type.STRING, description: 'Client last name in English' },
            phone: { type: Type.STRING, description: 'Client phone number' },
            email: { type: Type.STRING, description: 'Client email' },
            address: { type: Type.STRING, description: 'Service address' },
            lockType: { type: Type.STRING, enum: ['Automotive', 'Residential', 'Commercial', 'Secure / Safe', 'Other'] },
            brand: { type: Type.STRING, description: 'Lock or vehicle brand (e.g. Toyota, Schlage)' },
            modelOrYear: { type: Type.STRING, description: 'Model name or year (e.g. 2019 Camry)' },
            complaint: { type: Type.STRING, description: 'Problem description in English' },
            scheduledDate: { type: Type.STRING, description: 'YYYY-MM-DD format' },
            scheduledTime: { type: Type.STRING, description: 'HH:MM format' },
            urgency: { type: Type.STRING, enum: ['standard', 'urgent', 'emergency'] },
            assignedTo: { type: Type.STRING, description: 'Technician user ID to assign' },
          },
          required: ['firstName', 'lastName', 'phone', 'lockType', 'complaint']
        }
      },
      {
        name: 'update_job',
        description: 'Updates an existing job. Use search_jobs first if you need the job ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            jobId: { type: Type.STRING, description: 'The job ID (e.g. job-1234567890)' },
            status: { type: Type.STRING, enum: ['scheduled', 'enRoute', 'onSite', 'diagnosed', 'sold', 'waitingParts', 'completed', 'cancelled'] },
            scheduledDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            scheduledTime: { type: Type.STRING, description: 'HH:MM' },
            diagnosisNotes: { type: Type.STRING },
            complaint: { type: Type.STRING },
            assignedTo: { type: Type.STRING, description: 'Technician user ID' },
            brand: { type: Type.STRING },
            modelOrYear: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
          },
          required: ['jobId']
        }
      },
      {
        name: 'search_jobs',
        description: 'Search jobs by client name, status, date, or phone. Returns matching jobs with their IDs.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Search text (matches client name, phone, job number)' },
            status: { type: Type.STRING, enum: ['scheduled', 'enRoute', 'onSite', 'diagnosed', 'sold', 'waitingParts', 'completed', 'cancelled'] },
            date: { type: Type.STRING, description: 'YYYY-MM-DD to filter by scheduled date' },
          }
        }
      },
      {
        name: 'get_dashboard',
        description: 'Gets comprehensive business dashboard: today stats, revenue, job counts, technician status, recent activity.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_calls',
        description: 'Gets recent call records from OpenPhone (incoming, outgoing, missed).',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_messages',
        description: 'Gets recent SMS messages from OpenPhone.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'send_sms',
        description: 'Sends a real SMS message to a phone number via OpenPhone. Content MUST be in English.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            to: { type: Type.STRING, description: 'Phone number (e.g. +16025551234)' },
            content: { type: Type.STRING, description: 'Message text in ENGLISH' },
          },
          required: ['to', 'content']
        }
      },
      {
        name: 'send_sms_by_name',
        description: 'Sends SMS to a client by their name (searches jobs to find their phone). Content in ENGLISH.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING, description: 'Client full name in English (e.g. "Jack London")' },
            content: { type: Type.STRING, description: 'Message text in ENGLISH' },
          },
          required: ['clientName', 'content']
        }
      },
      {
        name: 'search_inventory',
        description: 'Search parts inventory by name, SKU, or category.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Search text' },
          },
          required: ['query']
        }
      },
      {
        name: 'get_technicians',
        description: 'Gets list of all technicians with their current status (available/onJob/offDuty).',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'navigate_to',
        description: 'Navigates to a specific tab in the CRM application.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tab: { type: Type.STRING, enum: ['calendar', 'jobs', 'messages', 'calls', 'clients', 'analytics', 'inventory', 'brain', 'settings'] }
          },
          required: ['tab']
        }
      },
    ]
  }
];

export async function handleAITool(name: string, args: any): Promise<any> {
  const store = useAppStore.getState();
  const auth = useAuthStore.getState();
  const settings = useSettingsStore.getState();

  switch (name) {
    case 'create_job': {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

      const jobData = {
        jobNumber: `LK-${Math.floor(8000 + Math.random() * 2000)}`,
        client: {
          id: `c-${Date.now()}`,
          firstName: args.firstName || 'Unknown',
          lastName: args.lastName || '',
          phone: args.phone || '',
          email: args.email || '',
          address: args.address || '',
        },
        lockDetails: {
          type: args.lockType || 'Other',
          brand: args.brand || '',
          modelOrYear: args.modelOrYear || '',
        },
        complaint: args.complaint || '',
        diagnosisNotes: '',
        scheduledDate: args.scheduledDate || todayStr,
        scheduledTime: args.scheduledTime || nowTime,
        durationMinutes: 60,
        status: 'scheduled' as const,
        lineItems: [],
        paymentStatus: 'unpaid' as const,
        totalAmount: 0,
        photos: [],
        messages: [],
        assignedTo: args.assignedTo || undefined,
      };

      store.addJob(jobData);
      const allJobs = useAppStore.getState().jobs;
      const created = allJobs[allJobs.length - 1];
      return { status: 'success', message: `Job #${jobData.jobNumber} created`, jobId: created?.id, jobNumber: jobData.jobNumber };
    }

    case 'update_job': {
      const job = store.jobs.find(j => j.id === args.jobId);
      if (!job) return { status: 'error', message: `Job ${args.jobId} not found` };

      const updates: any = {};
      if (args.status) updates.status = args.status;
      if (args.scheduledDate) updates.scheduledDate = args.scheduledDate;
      if (args.scheduledTime) updates.scheduledTime = args.scheduledTime;
      if (args.diagnosisNotes) updates.diagnosisNotes = args.diagnosisNotes;
      if (args.complaint) updates.complaint = args.complaint;
      if (args.assignedTo !== undefined) updates.assignedTo = args.assignedTo;
      if (args.totalAmount !== undefined) updates.totalAmount = args.totalAmount;
      if (args.brand) updates.lockDetails = { ...job.lockDetails, brand: args.brand };
      if (args.modelOrYear) updates.lockDetails = { ...(updates.lockDetails || job.lockDetails), modelOrYear: args.modelOrYear };

      store.updateJob({ ...job, ...updates });
      return { status: 'success', message: `Job #${job.jobNumber} updated`, changes: Object.keys(updates) };
    }

    case 'search_jobs': {
      let results = [...store.jobs];
      if (args.query) {
        const q = args.query.toLowerCase();
        results = results.filter(j =>
          `${j.client.firstName} ${j.client.lastName}`.toLowerCase().includes(q) ||
          j.client.phone.includes(q) ||
          j.jobNumber.toLowerCase().includes(q)
        );
      }
      if (args.status) results = results.filter(j => j.status === args.status);
      if (args.date) results = results.filter(j => j.scheduledDate === args.date);

      return {
        status: 'success',
        count: results.length,
        jobs: results.slice(0, 20).map(j => ({
          id: j.id,
          jobNumber: j.jobNumber,
          client: `${j.client.firstName} ${j.client.lastName}`,
          phone: j.client.phone,
          address: j.client.address,
          type: j.lockDetails.type,
          brand: j.lockDetails.brand,
          status: j.status,
          scheduledDate: j.scheduledDate,
          scheduledTime: j.scheduledTime,
          totalAmount: j.totalAmount,
          assignedTo: j.assignedTo,
        }))
      };
    }

    case 'get_dashboard': {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todaysJobs = store.jobs.filter(j => j.scheduledDate === todayStr);
      const completed = store.jobs.filter(j => j.status === 'completed');
      const active = store.jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
      const todayRevenue = todaysJobs.filter(j => j.status === 'completed' || j.status === 'sold').reduce((s, j) => s + (j.totalAmount || 0), 0);
      const totalRevenue = completed.reduce((s, j) => s + (j.totalAmount || 0), 0);
      const techs = auth.users.filter(u => u.role === 'technician' && u.active);

      return {
        status: 'success',
        today: {
          date: todayStr,
          jobCount: todaysJobs.length,
          revenue: todayRevenue,
          dailyTarget: settings.dailyRevenueTarget,
          jobs: todaysJobs.map(j => ({ jobNumber: j.jobNumber, client: `${j.client.firstName} ${j.client.lastName}`, status: j.status, time: j.scheduledTime, amount: j.totalAmount })),
        },
        overall: {
          totalJobs: store.jobs.length,
          activeJobs: active.length,
          completedJobs: completed.length,
          totalRevenue,
          monthlyTarget: settings.monthlyRevenueTarget,
        },
        technicians: techs.map(t => ({ id: t.id, name: t.name, status: t.techStatus || 'offDuty' })),
      };
    }

    case 'get_calls': {
      try {
        const res = await fetch(`${API_BASE}/api/openphone/calls`);
        if (!res.ok) return { status: 'error', message: 'Failed to fetch calls' };
        const data = await res.json();
        return { status: 'success', calls: data.data?.slice(0, 20) || [], total: data.totalItems || 0 };
      } catch {
        return { status: 'error', message: 'Backend unreachable' };
      }
    }

    case 'get_messages': {
      try {
        const res = await fetch(`${API_BASE}/api/openphone/messages`);
        if (!res.ok) return { status: 'error', message: 'Failed to fetch messages' };
        const data = await res.json();
        return { status: 'success', messages: data.data?.slice(0, 20) || [], total: data.totalItems || 0 };
      } catch {
        return { status: 'error', message: 'Backend unreachable' };
      }
    }

    case 'send_sms': {
      try {
        const res = await fetch(`${API_BASE}/api/openphone/messages/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: args.to,
            content: args.content,
            phoneNumberId: import.meta.env.VITE_OPENPHONE_PHONE_NUMBER_ID || 'PNkhFHiD2G',
          }),
        });
        const data = await res.json();
        return { status: res.ok ? 'success' : 'error', message: res.ok ? `SMS sent to ${args.to}` : data.error };
      } catch {
        return { status: 'error', message: 'Failed to send SMS' };
      }
    }

    case 'send_sms_by_name': {
      const q = (args.clientName || '').toLowerCase();
      const job = store.jobs.find(j =>
        `${j.client.firstName} ${j.client.lastName}`.toLowerCase().includes(q)
      );
      if (!job) return { status: 'error', message: `Client "${args.clientName}" not found in jobs` };
      return handleAITool('send_sms', { to: job.client.phone, content: args.content });
    }

    case 'search_inventory': {
      const q = (args.query || '').toLowerCase();
      const results = store.inventory.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
      return {
        status: 'success',
        count: results.length,
        parts: results.map(p => ({ name: p.name, sku: p.sku, category: p.category, stock: p.stock, price: p.price, lowStock: p.stock <= p.reorderPoint })),
      };
    }

    case 'get_technicians': {
      const techs = auth.users.filter(u => u.role === 'technician' && u.active);
      return {
        status: 'success',
        technicians: techs.map(t => ({
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phone || '',
          status: t.techStatus || 'offDuty',
          commissionRate: t.commissionRate,
        })),
      };
    }

    case 'navigate_to': {
      if (args.tab) {
        store.setActiveTab(args.tab);
        return { status: 'success', tab: args.tab };
      }
      return { status: 'error', message: 'Missing tab parameter' };
    }

    default:
      return { status: 'error', message: `Unknown action: ${name}` };
  }
}

export async function getStrategicBrainResponse(
  message: string,
  history: { text: string, role: 'user' | 'model' }[],
) {
  const ai = new GoogleGenAI({ apiKey: resolveApiKey() });

  const contents: any[] = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction: getSystemInstruction(),
      tools: AI_TOOLS,
    },
  });

  const functionCalls = response.functionCalls;
  if (functionCalls) {
    const results: any[] = [];
    for (const fc of functionCalls) {
      const result = await handleAITool(fc.name, fc.args);
      results.push({
        functionResponse: {
          id: fc.id,
          name: fc.name,
          response: { result }
        }
      });
    }

    const secondResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...contents,
        { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) },
        { role: 'user', parts: results }
      ],
      config: {
        systemInstruction: getSystemInstruction(),
        tools: AI_TOOLS,
      }
    });

    // Handle chained tool calls
    if (secondResponse.functionCalls) {
      const chainedResults: any[] = [];
      for (const fc of secondResponse.functionCalls) {
        const result = await handleAITool(fc.name, fc.args);
        chainedResults.push({
          functionResponse: { id: fc.id, name: fc.name, response: { result } }
        });
      }
      const thirdResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          ...contents,
          { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) },
          { role: 'user', parts: results },
          { role: 'model', parts: secondResponse.functionCalls.map(fc => ({ functionCall: fc })) },
          { role: 'user', parts: chainedResults },
        ],
        config: { systemInstruction: getSystemInstruction(), tools: AI_TOOLS }
      });
      return thirdResponse.text;
    }

    return secondResponse.text;
  }

  return response.text;
}

export class GeminiVoiceAssistant {
  private sessionPromise: Promise<any> | null = null;
  private nextStartTime = 0;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private stream: MediaStream | null = null;

  constructor() {}

  async connect(callbacks: {
    onTranscript: (text: string, role: 'user' | 'assistant', isFinal: boolean) => void;
    onAction: (action: string, data: any) => any | Promise<any>;
  }) {
    const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stream = this.stream;

    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: getSystemInstruction(),
        tools: AI_TOOLS,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            this.sessionPromise?.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
            this.currentOutputTranscription += message.serverContent.outputTranscription.text;
            callbacks.onTranscript(this.currentOutputTranscription, 'assistant', false);
          } else if (message.serverContent?.inputTranscription) {
            this.currentInputTranscription += message.serverContent.inputTranscription.text;
            callbacks.onTranscript(this.currentInputTranscription, 'user', false);
          }
          if (message.serverContent?.interrupted) {
            this.sources.forEach(source => {
              try { source.stop(); } catch (e) {}
            });
            this.sources.clear();
            this.nextStartTime = this.audioContext?.currentTime || 0;
          }
          if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
            if (this.currentInputTranscription) {
              callbacks.onTranscript(this.currentInputTranscription, 'user', true);
              this.currentInputTranscription = '';
            }
            if (this.currentOutputTranscription) {
              callbacks.onTranscript(this.currentOutputTranscription, 'assistant', true);
              this.currentOutputTranscription = '';
            }
          }
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) this.playAudio(audioData);
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              const result = await handleAITool(fc.name, fc.args);
              callbacks.onAction(fc.name, { ...fc.args, _result: result });
              this.sessionPromise?.then(s => s.sendToolResponse({
                functionResponses: [{
                  id: fc.id,
                  name: fc.name,
                  response: { result },
                }]
              }));
            }
          }
        },
        onerror: (e) => console.error(e),
        onclose: () => console.log("Voice Offline"),
      }
    });
  }

  private async playAudio(base64: string) {
    if (!this.audioContext) return;
    if (this.nextStartTime <= this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime + 0.9;
    } else {
      this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    }
    const audioBuffer = await decodeAudioData(decode(base64), this.audioContext, 24000, 1);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.sessionPromise?.then(s => s.close());
  }
}
