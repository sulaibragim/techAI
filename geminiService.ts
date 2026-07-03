
import { GoogleGenAI, Modality, Type, LiveServerMessage, ThinkingLevel } from "@google/genai";
import { useSettingsStore } from './settingsStore';
import { useAppStore } from './store';
import { useAuthStore } from './authStore';
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';
import { buildClients, clientScore, clientFlags, normalizePhone } from './clientUtils';
import { findKeyProfiles, findProcedure, decodeVin, reverseLookup, stockForKeyway } from './vehicleKeyLookup';
import { accountsReceivable } from './financialUtils';
import { LineItem } from './types';

const CHAT_MODEL = 'gemini-2.5-flash';

// One text-chat turn via the backend proxy. The API key never reaches the browser —
// the server injects it. Tool execution stays on the client (data lives in the Zustand store).
async function callModel(contents: any[], systemInstruction: string): Promise<{ text: string; functionCalls: any[] | null }> {
  const res = await fetch(`${API_BASE}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model: CHAT_MODEL,
      contents,
      systemInstruction,
      tools: AI_TOOLS,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'AI request failed');
  }
  return res.json();
}

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
  const currentUser = auth.users.find(u => u.id === auth.currentUserId) ?? null;
  // Technicians only ever see their own assigned jobs in the AI context (defense in depth).
  const jobs = currentUser?.role === 'technician'
    ? store.jobs.filter(j => j.assignedTo === currentUser.id)
    : store.jobs;
  const users = auth.users.filter(u => u.active);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todaysJobs = jobs.filter(j => j.scheduledDate === todayStr);
  const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const todayRevenue = todaysJobs.filter(j => j.status === 'completed' || j.status === 'sold').reduce((s, j) => s + (j.totalAmount || 0), 0);
  const totalRevenue = completedJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);

  const techs = users.filter(u => u.role === 'technician');
  const techList = techs.map(t => `${t.name} (${t.techStatus || 'offDuty'}, ID: ${t.id}${t.skills?.length ? `, specialties: ${t.skills.join('/')}` : ''})`).join(', ');

  // Client reputation context — so the AI knows who's a VIP/Gold, who's difficult, and
  // who must not be served, plus each client's preferred technician.
  const clients = buildClients(jobs, settings.clientProfiles);
  const repByPhone = new Map(clients.map(c => [normalizePhone(c.phone), c]));
  const ranked = clients.map(c => ({ c, sc: clientScore(c) })).sort((a, b) => b.sc.score - a.sc.score);
  const topClients = ranked.slice(0, 6).map(({ c, sc }) => {
    const f = clientFlags(c);
    const fav = c.favoriteTechId ? users.find(u => u.id === c.favoriteTechId)?.name : null;
    const flags = f.allTags.length ? ` [${f.allTags.join(', ')}]` : '';
    return `${c.firstName} ${c.lastName} | ${c.phone} | ${sc.tier} (${sc.score}/100) | ${c.jobs.length} jobs · $${Math.round(c.totalSpend)} | rating: ${c.rating || 'none'}${flags}${fav ? ` | prefers ${fav}` : ''}`;
  }).join('\n');
  const watchlist = ranked
    .filter(({ c }) => { const f = clientFlags(c); return f.doNotService || f.hasNegative; })
    .slice(0, 8)
    .map(({ c }) => { const f = clientFlags(c); return `${c.firstName} ${c.lastName} (${c.phone})${f.doNotService ? ' — DO NOT SERVICE' : ' — difficult/handle with care'}`; })
    .join('\n');

  // Standing instructions Sultan told the AI to remember — owner/manager only.
  const memories = (currentUser?.role !== 'technician' ? (settings.aiMemories || []) : [])
    .slice(0, 30)
    .map(m => `- ${m.text}`)
    .join('\n');

  const recentJobs = jobs.slice(-15).map(j => {
    const rec = repByPhone.get(normalizePhone(j.client.phone));
    const tag = rec ? ` | client: ${clientScore(rec).tier}${rec.rating ? `/${rec.rating}` : ''}` : '';
    return `[${j.id}] #${j.jobNumber} | ${j.client.firstName} ${j.client.lastName} | ${j.client.phone} | ${j.lockDetails.type}/${j.lockDetails.brand || '?'} | ${j.status} | ${j.scheduledDate} ${j.scheduledTime} | $${j.totalAmount} | assigned: ${j.assignedTo || 'none'}${tag}`;
  }).join('\n');

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
${memories ? `\nSTANDING INSTRUCTIONS FROM SULTAN (always honor these; use 'forget' to drop one):\n${memories}\n` : ''}
TOP CLIENTS (by reputation score):
${topClients || '(no clients yet)'}
${watchlist ? `\nWATCHLIST (handle with care / do-not-service):\n${watchlist}` : ''}

RECENT JOBS (last 15):
${recentJobs || '(no jobs yet)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// Who is talking to the AI right now — shapes identity, permissions language, and tone.
function currentActor(): { role: 'owner' | 'manager' | 'technician'; name: string } {
  const auth = useAuthStore.getState();
  const u = auth.users.find(x => x.id === auth.currentUserId) ?? null;
  return { role: (u?.role as any) || 'owner', name: u?.name || 'Sultan' };
}

const OWNER_IDENTITY = (name: string) => `
IDENTITY:
- Your name is "Дурачок" (Durachok). You are ${name}'s elite business partner and AI dispatcher.
- You speak with ${name} ONLY in Russian (русский язык).
- All client names, addresses, messages to clients, and data entries MUST be in ENGLISH.
- You think internally in English for all logic and data operations.

ROLE:
You are the strategic brain AND front-desk dispatcher of TrustKey Locksmith — a mobile locksmith company in Arizona (AZ).
Services: automotive lockouts & key programming, residential rekeying, commercial lock systems, safe opening.
You have FULL access to CRM data and can perform ANY action ${name} asks. You have TWO jobs:
1. STRATEGIST — when ${name} plans his day/week: revenue, debtors, who's slacking, what to fix.
2. LIVE DISPATCH — when a client is ON THE PHONE: quote a price from the price book in seconds, book the job, assign the right tech. Speed wins the sale.`;

const TECH_IDENTITY = (name: string) => `
IDENTITY:
- Your name is "Дурачок" (Durachok). You are ${name}'s field assistant — a locksmith tech out on jobs.
- You speak with ${name} ONLY in Russian (русский язык).
- All client-facing text and data entries MUST be in ENGLISH.

ROLE:
You are a hands-busy field helper for a TrustKey Locksmith technician in Arizona.
${name} is usually driving or working a lock — keep it SHORT and practical.
You help with: updating job status ("еду"→enRoute, "на месте"→onSite, "готово"→completed),
looking up car-key info (chip/keyway/programming) and whether the blank is in stock,
adding line items to bill the job, and checking parts.
${name} sees ONLY his own jobs. Never mention other techs' jobs, clients, earnings, or the shop's totals.`;

const COMMS_OWNER = (name: string) => `
COMMUNICATION STYLE:
- Be concise. No fluff. Get to the point.
- Structured output for data (bullets, short numbers). Money as $NNN.
- "как дела" / "что по дню" → quick overview: today's jobs, revenue vs target, debtors, low stock, unhandled leads.
- Never say "сейчас сделаю" — just DO it, then report the result.
- Execute immediately for reads, job create/update, billing, navigation. Confirm only the outward/irreversible actions in PROTOCOLS.`;

const COMMS_TECH = `
COMMUNICATION STYLE (FIELD):
- ONE or TWO sentences max. He's driving. No long lists, no lectures.
- For a status change just confirm: "Отметил — еду к Jack".
- For a car-key lookup give only what he needs on the job: chip, keyway/blade, program method, and "на складе есть/нет".
- Never read out a wall of numbers. If there's more, say "подробнее — открой заказ".`;

const COMMS_VOICE = `
VOICE MODE (spoken aloud — CRITICAL):
- You are being SPOKEN, not read. No markdown, no bullets, no asterisks — plain spoken Russian sentences.
- Keep answers to 1-3 short sentences. Say the one thing that matters, then stop.
- Prices spoken naturally: "сто тридцать девять долларов", not "$139".
- Confirm actions in a few words: "Готово, отметил на месте".`;

const PROTOCOLS = (name: string) => `
PROTOCOLS (follow strictly):
1. CONFIRM before outward / irreversible actions — sending a client SMS, sending a payment link, or cancelling a job. First state exactly what you'll do (recipient + gist, or which job), then ask "Подтверди?". Act only after ${name} confirms. Everything else (reads, create/update jobs, billing, navigation) — do immediately.
2. ROLE AWARENESS — a technician sees ONLY their own jobs and clients. Never mention, list, or imply other technicians' jobs, clients, schedules, or earnings to a technician.
3. CLIENT ESCALATION — before booking or acting for a client who is "Do not service", on the watchlist, or carrying a large unpaid balance, WARN first and wait. Use get_client when unsure.
4. NO GUESSING — never invent prices, stock counts, job IDs, addresses, key/chip data, or client details. If you lack it, call the right tool (get_price_book, car_key_lookup, search_jobs, search_inventory, get_client). If the tool has no answer, say so plainly.
5. PRICING — quote ONLY from get_price_book. After 9:00 PM or before 7:00 AM Arizona time, quote the nightPrice when one exists and say it's the after-hours rate. Never invent prices, never offer discounts. "from" prices are a starting point — say "от $NNN".
6. HONEST ERRORS — if a tool errors or you couldn't finish, say exactly what failed. Never say "Готово" for an action that didn't succeed.`;

const LANGUAGE_RULES = (name: string) => `
LANGUAGE RULES:
- Talk to ${name}: RUSSIAN
- Client names in data: ENGLISH (${name} says "Джек" → you write "Jack")
- SMS to clients: ENGLISH, professional, friendly
- Never repeat SMS/payment-link text back to ${name}. Just confirm: "Отправил".
- Job descriptions, addresses, notes: ENGLISH`;

const DOMAIN_KNOWLEDGE = `
LOCKSMITH DOMAIN KNOWLEDGE:
- Job types: Automotive (car lockouts, key programming, ignition repair), Residential (lockouts, rekeying, smart locks), Commercial (panic bars, access control, master key systems), Safe/Vault (combination changes, drilling, manipulation)
- Common brands: Schlage, Kwikset, Yale, Medeco (residential); Toyota, Honda, Ford, BMW, Audi (automotive); Von Duprin, Adams Rite, Corbin Russwin (commercial); Amsec, SentrySafe (safes)
- Status flow: scheduled → enRoute → onSite → diagnosed → sold → completed
- Urgency: emergency (locked out NOW), urgent (same-day), standard (can schedule)
- CAR KEYS: for any "какой ключ / чип / как прописать" question call car_key_lookup (by make+model+year, by VIN, or reverse by FCC/blade). It also tells you if the blank is in our stock.`;

const OWNER_PLAYBOOK = `
DISPATCH PLAYBOOK (client on the phone):
1. Caller's number/name known? get_client first — lead with their standing (VIP/Gold → treat well; "Do not service" → warn BEFORE booking; Slow payer → collect upfront).
2. Quote from get_price_book. Car key? car_key_lookup for the real part + stock, then price it.
3. Book with create_job (get date/time; default urgency from how they talk — "прямо сейчас" = emergency).
4. Assign by specialty + the client's preferred tech; mention the tech's status (available/onJob).
5. Unpaid balance owed? Offer to send a Stripe payment link (send_payment_link, confirm first).

CLIENT REPUTATION (use it actively):
- Tiers Gold/Silver/Bronze/New/Watch/Blocked, 0-100 score, rating, flags (VIP, Frequent, Big ticket, Referrer, Difficult, Grumpy, Slow payer, Haggler, Cancel risk, Do not service), preferred tech — injected below and via get_client.
- Reputation guides priority and care, NOT price. Do not discount.

TECHNICIAN ASSIGNMENT: match job type to a specialist (Automotive/high-end → car; Safe → safe/vault; Commercial → commercial; Residential/smart → home). Prefer the client's favorite tech; note availability.`;

const CAPABILITIES = `
WHAT YOU CAN DO (call the tool — never fake it):
create_job, update_job, search_jobs, get_dashboard, get_calls, get_messages,
send_sms / send_sms_by_name (confirm first), search_inventory, get_reorder_list,
get_technicians, get_client, set_client_reputation, get_leads, get_debtors,
get_price_book (real service rates, day/night), car_key_lookup (chip/keyway/blade/programming + stock),
send_payment_link (Stripe link to a client, confirm first), add_line_item, adjust_inventory, navigate_to,
remember / forget / list_memories (persist Sultan's standing instructions across sessions).

MEMORY:
- When Sultan says "запомни" / "всегда" / "никогда" / "на будущее" and it's a durable rule, call 'remember'. Confirm briefly: "Запомнил".
- Honor every STANDING INSTRUCTION shown in the business state below. If one no longer applies and Sultan says to drop it, call 'forget'.`;

// Build the system prompt for whoever is currently signed in.
// includeContext=false is used on tool-result follow-up rounds (context already in the history);
// voice=true swaps in the spoken-output rules.
const getSystemInstruction = (includeContext = true, voice = false) => {
  const { role, name } = currentActor();
  const isTech = role === 'technician';

  const identity = isTech ? TECH_IDENTITY(name) : OWNER_IDENTITY(name);
  const comms = isTech ? COMMS_TECH : COMMS_OWNER(name);
  const playbook = isTech ? '' : OWNER_PLAYBOOK;

  return `
${identity}
${comms}
${voice ? COMMS_VOICE : ''}

TOOL USAGE (CRITICAL):
- You MUST call tools for ANY action. Never claim you did something without calling the function.
- Don't ask permission for routine actions — just do them. Confirm only the outward/irreversible actions in PROTOCOLS.
- If you need a job ID, call 'search_jobs' first. All client names in tool parameters MUST be English/Latin.

DATES & TIME (Arizona, no daylight saving — use the date/time shown in the business state below):
- scheduledDate is always YYYY-MM-DD; scheduledTime is 24-hour HH:MM.
- "сегодня"/"today" = the date below. "завтра"/"tomorrow" = +1 day. "послезавтра" = +2 days. "через неделю" = +7 days.
- A weekday ("в пятницу"/"on Friday") = the NEXT occurrence of that weekday (today only if it matches and the time hasn't passed yet).
- "в конце месяца" = last day of the current month. "утром" ≈ 09:00, "днём" ≈ 13:00, "вечером" ≈ 18:00 unless a time is given.
- Worked example: if today below is Wednesday 2026-07-08, then "в пятницу в 3 дня" → scheduledDate 2026-07-10, scheduledTime 15:00.
- Never leave scheduledTime as a blind guess — if a booking has no time and none is implied, ask for it briefly.
${PROTOCOLS(name)}
${LANGUAGE_RULES(name)}
${CAPABILITIES}
${DOMAIN_KNOWLEDGE}
${playbook}
${includeContext ? getBusinessContext() : ''}
`;
};

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
            status: { type: Type.STRING, enum: ['scheduled', 'enRoute', 'onSite', 'diagnosed', 'sold', 'coffee', 'waitingParts', 'completed', 'cancelled'] },
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
            status: { type: Type.STRING, enum: ['scheduled', 'enRoute', 'onSite', 'diagnosed', 'sold', 'coffee', 'waitingParts', 'completed', 'cancelled'] },
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
        description: 'Gets list of all technicians with their current status (available/onJob/offDuty) and specialties (skills) for smart job routing.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_client',
        description: "Look up one client's full reputation: tier, 0-100 score, rating, flags, preferred technician, lifetime spend and recent jobs. Use before advising who to send or how to handle a caller.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            nameOrPhone: { type: Type.STRING, description: 'Client full name (English) or phone number' },
          },
          required: ['nameOrPhone']
        }
      },
      {
        name: 'add_line_item',
        description: 'Adds a billing line (labor/part/service) to a job and recomputes its total. Use search_jobs first to get the job ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            jobId: { type: Type.STRING, description: 'The job ID' },
            description: { type: Type.STRING, description: 'Line description in English (e.g. "Car lockout")' },
            unitPrice: { type: Type.NUMBER, description: 'Price per unit in USD' },
            quantity: { type: Type.NUMBER, description: 'Quantity (default 1)' },
            type: { type: Type.STRING, enum: ['part', 'labor', 'service_call', 'maintenance', 'installation'] },
          },
          required: ['jobId', 'description', 'unitPrice']
        }
      },
      {
        name: 'adjust_inventory',
        description: 'Receive new stock (+) or record parts used on a job (−). Finds the part by SKU or name.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Part SKU or name' },
            action: { type: Type.STRING, enum: ['receive', 'use'], description: 'receive = add stock, use = consume stock' },
            quantity: { type: Type.NUMBER, description: 'How many units' },
            unitCost: { type: Type.NUMBER, description: 'Purchase cost per unit (for receive)' },
            jobId: { type: Type.STRING, description: 'Job the parts were used on (for use)' },
          },
          required: ['query', 'action', 'quantity']
        }
      },
      {
        name: 'set_client_reputation',
        description: "Set a client's reputation: rating, add a flag/tag, or a private note. Owner/manager only.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            nameOrPhone: { type: Type.STRING, description: 'Client full name (English) or phone' },
            rating: { type: Type.STRING, enum: ['good', 'neutral', 'difficult'] },
            addTag: { type: Type.STRING, description: 'A flag to add, e.g. VIP, Slow payer, Do not service' },
            note: { type: Type.STRING, description: 'Private note about the client (English)' },
          },
          required: ['nameOrPhone']
        }
      },
      {
        name: 'get_leads',
        description: 'Lists recent unhandled website leads (new jobs from the web form). Owner/manager only.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_price_book',
        description: "The company's real service rates (day and after-hours night price). ALWAYS call this to quote a price — never invent one. Optionally filter by category or search text.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Optional: service name or category to filter (e.g. "lockout", "car key", "rekey")' },
          }
        }
      },
      {
        name: 'car_key_lookup',
        description: "Look up car-key data for a vehicle: transponder chip, keyway/blade, FCC ID, immobilizer, and step-by-step programming — plus whether the key blank is in our stock. Provide make+model+year, OR a 17-char vin, OR a reverse search (FCC ID / blade / part number of a key in hand).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            make: { type: Type.STRING, description: 'Vehicle make, e.g. Toyota' },
            model: { type: Type.STRING, description: 'Vehicle model, e.g. Camry' },
            year: { type: Type.NUMBER, description: 'Model year, e.g. 2019' },
            vin: { type: Type.STRING, description: '17-character VIN — decoded to make/model/year automatically' },
            reverse: { type: Type.STRING, description: 'Reverse search: an FCC ID, OEM part number, or blade code of a key in hand' },
          }
        }
      },
      {
        name: 'send_payment_link',
        description: 'Creates a secure Stripe card-payment link for a job\'s outstanding balance and texts it to the client. CONFIRM first. Use search_jobs to get the job ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            jobId: { type: Type.STRING, description: 'The job ID with an unpaid balance' },
            sms: { type: Type.BOOLEAN, description: 'Text the link to the client (default true). false = just return the URL.' },
          },
          required: ['jobId']
        }
      },
      {
        name: 'get_debtors',
        description: 'Lists clients who owe money: completed/sold jobs that are unpaid or partially paid, with balance and how many days overdue. Owner/manager only.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_reorder_list',
        description: 'Lists inventory parts at or below their reorder point (what to buy). Sorted by how far below the point they are.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'remember',
        description: "Save a standing instruction to remember permanently (survives chat clears and shows on every future session), e.g. \"don't schedule Mike after 9pm\", \"collect cash upfront from new clients\". Only save durable rules Sultan asks you to remember — NOT one-off tasks. Owner/manager only.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: 'The instruction to remember, phrased clearly. Keep the original language.' },
          },
          required: ['text']
        }
      },
      {
        name: 'forget',
        description: "Remove a saved standing instruction. Provide either its exact id (from list_memories) or matching text. Owner/manager only.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: 'The memory id to remove' },
            match: { type: Type.STRING, description: 'Text that identifies which memory to remove (substring match)' },
          }
        }
      },
      {
        name: 'list_memories',
        description: 'List all saved standing instructions with their ids. Owner/manager only.',
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

  // Role gate (defense in depth): technicians may only see/act on their OWN jobs and
  // clients through the AI tools — never other techs' jobs, clients, or commissions.
  // The injected context already filters jobs by role; this enforces the same on the
  // executable tools so a technician can't read everything by asking the AI directly.
  const currentUser = auth.users.find(u => u.id === auth.currentUserId) ?? null;
  const isTech = currentUser?.role === 'technician';
  const visibleJobs = isTech && currentUser
    ? store.jobs.filter(j => j.assignedTo === currentUser.id)
    : store.jobs;

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
        assignedTo: args.assignedTo || (isTech ? currentUser?.id : undefined),
      };

      store.addJob(jobData);
      const allJobs = useAppStore.getState().jobs;
      const created = allJobs[allJobs.length - 1];
      return { status: 'success', message: `Job #${jobData.jobNumber} created`, jobId: created?.id, jobNumber: jobData.jobNumber };
    }

    case 'update_job': {
      const job = visibleJobs.find(j => j.id === args.jobId);
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
      let results = [...visibleJobs];
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

      const repClients = buildClients(visibleJobs, settings.clientProfiles);
      const repByPhone = new Map(repClients.map(c => [normalizePhone(c.phone), c]));

      return {
        status: 'success',
        count: results.length,
        jobs: results.slice(0, 20).map(j => {
          const rec = repByPhone.get(normalizePhone(j.client.phone));
          return {
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
            clientTier: rec ? clientScore(rec).tier : undefined,
            clientRating: rec?.rating,
            clientFlags: rec ? clientFlags(rec).allTags : undefined,
          };
        })
      };
    }

    case 'get_dashboard': {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todaysJobs = visibleJobs.filter(j => j.scheduledDate === todayStr);
      const completed = visibleJobs.filter(j => j.status === 'completed');
      const active = visibleJobs.filter(j => !['completed', 'cancelled'].includes(j.status));
      const todayRevenue = todaysJobs.filter(j => j.status === 'completed' || j.status === 'sold').reduce((s, j) => s + (j.totalAmount || 0), 0);
      const totalRevenue = completed.reduce((s, j) => s + (j.totalAmount || 0), 0);
      const techs = isTech && currentUser
        ? auth.users.filter(u => u.id === currentUser.id)
        : auth.users.filter(u => u.role === 'technician' && u.active);

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
          totalJobs: visibleJobs.length,
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
        const res = await fetch(`${API_BASE}/api/openphone/calls`, { headers: { ...authHeaders() } });
        if (!res.ok) return { status: 'error', message: 'Failed to fetch calls' };
        const data = await res.json();
        return { status: 'success', calls: data.data?.slice(0, 20) || [], total: data.totalItems || 0 };
      } catch {
        return { status: 'error', message: 'Backend unreachable' };
      }
    }

    case 'get_messages': {
      try {
        const res = await fetch(`${API_BASE}/api/openphone/messages`, { headers: { ...authHeaders() } });
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
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      const job = visibleJobs.find(j =>
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
      const techs = isTech && currentUser
        ? auth.users.filter(u => u.id === currentUser.id)
        : auth.users.filter(u => u.role === 'technician' && u.active);
      return {
        status: 'success',
        technicians: techs.map(t => ({
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phone || '',
          status: t.techStatus || 'offDuty',
          commissionRate: t.commissionRate,
          skills: t.skills || [],
        })),
      };
    }

    case 'get_client': {
      const q = (args.nameOrPhone || '').trim();
      const phoneKey = normalizePhone(q);
      const clients = buildClients(visibleJobs, settings.clientProfiles);
      const rec = (phoneKey.length >= 7 && clients.find(c => normalizePhone(c.phone) === phoneKey))
        || clients.find(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q.toLowerCase()));
      if (!rec) return { status: 'error', message: `No client found for "${q}"` };
      const sc = clientScore(rec);
      const f = clientFlags(rec);
      const favTech = rec.favoriteTechId ? auth.users.find(u => u.id === rec.favoriteTechId)?.name : null;
      return {
        status: 'success',
        client: {
          name: `${rec.firstName} ${rec.lastName}`.trim(),
          phone: rec.phone,
          tier: sc.tier,
          score: sc.score,
          scoreReasons: sc.reasons,
          rating: rec.rating || 'none',
          flags: f.allTags,
          doNotService: f.doNotService,
          preferredTechnician: favTech || null,
          note: rec.notes || null,
          jobCount: rec.jobs.length,
          lifetimeSpend: Math.round(rec.totalSpend),
          outstandingBalance: Math.round(rec.outstanding),
          recentJobs: rec.jobs.slice(-5).map(j => ({ jobNumber: j.jobNumber, type: j.lockDetails.type, status: j.status, date: j.scheduledDate, amount: j.totalAmount })),
        },
      };
    }

    case 'navigate_to': {
      if (args.tab) {
        store.setActiveTab(args.tab);
        return { status: 'success', tab: args.tab };
      }
      return { status: 'error', message: 'Missing tab parameter' };
    }

    case 'add_line_item': {
      const job = visibleJobs.find(j => j.id === args.jobId);
      if (!job) return { status: 'error', message: `Job ${args.jobId} not found` };
      const quantity = Math.max(1, Math.round(Number(args.quantity) || 1));
      const unitPrice = Number(args.unitPrice) || 0;
      const item: LineItem = {
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: args.type || 'labor',
        description: args.description || '',
        quantity,
        unitPrice,
      };
      const lineItems = [...(job.lineItems || []), item];
      const totalAmount = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      store.updateJob({ ...job, lineItems, totalAmount });
      return { status: 'success', message: `Added "${item.description}" ×${quantity} ($${unitPrice}) to #${job.jobNumber}`, total: totalAmount };
    }

    case 'adjust_inventory': {
      const q = (args.query || '').toLowerCase();
      const part = store.inventory.find(p =>
        p.id === args.query || p.sku.toLowerCase() === q || p.name.toLowerCase().includes(q)
      );
      if (!part) return { status: 'error', message: `Part "${args.query}" not found` };
      const qty = Math.max(1, Math.round(Number(args.quantity) || 0));
      if (qty <= 0) return { status: 'error', message: 'quantity must be greater than 0' };
      if (args.action === 'receive') {
        store.receiveStock(part.id, qty, Number(args.unitCost) || part.cost || 0);
        return { status: 'success', message: `Received ${qty} × ${part.name}`, newStock: (part.stock || 0) + qty };
      }
      store.consumePart(part.id, qty, args.jobId);
      return { status: 'success', message: `Used ${qty} × ${part.name}`, newStock: Math.max(0, (part.stock || 0) - qty) };
    }

    case 'set_client_reputation': {
      if (isTech) return { status: 'error', message: 'Reputation can only be set by an owner or manager' };
      const q = (args.nameOrPhone || '').trim();
      const phoneKey = normalizePhone(q);
      const clients = buildClients(store.jobs, settings.clientProfiles);
      const rec = (phoneKey.length >= 7 && clients.find(c => normalizePhone(c.phone) === phoneKey))
        || clients.find(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q.toLowerCase()));
      if (!rec) return { status: 'error', message: `No client found for "${q}"` };
      const key = normalizePhone(rec.phone);
      const prev = settings.clientProfiles[key];
      const patch: any = {};
      if (args.rating) patch.rating = args.rating;
      if (args.note) patch.notes = args.note;
      if (args.addTag) patch.tags = Array.from(new Set([...(prev?.tags || []), args.addTag]));
      if (Object.keys(patch).length === 0) return { status: 'error', message: 'Nothing to set — provide rating, addTag, or note' };
      settings.upsertClientProfile(key, patch);
      return { status: 'success', message: `Updated reputation for ${rec.firstName} ${rec.lastName}`, applied: patch };
    }

    case 'get_leads': {
      if (isTech) return { status: 'error', message: 'Leads are visible to owner/manager only' };
      const leads = store.jobs.filter(j => j.isNewLead || j.source === 'web');
      return {
        status: 'success',
        count: leads.length,
        leads: leads.slice(0, 20).map(j => ({
          id: j.id,
          jobNumber: j.jobNumber,
          client: `${j.client.firstName} ${j.client.lastName}`,
          phone: j.client.phone,
          type: j.lockDetails.type,
          complaint: j.complaint,
          status: j.status,
          scheduledDate: j.scheduledDate,
          scheduledTime: j.scheduledTime,
          assignedTo: j.assignedTo || 'none',
          isNew: !!j.isNewLead,
        })),
      };
    }

    case 'get_price_book': {
      const now = new Date();
      const hourAZ = Number(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Phoenix' }));
      const afterHours = hourAZ >= 21 || hourAZ < 7;
      const q = (args.query || '').toLowerCase().trim();
      let rates = settings.priceBook || [];
      if (q) rates = rates.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
      return {
        status: 'success',
        afterHoursNow: afterHours,
        note: afterHours ? 'It is after-hours in Arizona — quote nightPrice where present.' : 'Daytime in Arizona — quote the standard price.',
        count: rates.length,
        rates: rates.map(r => ({
          name: r.name,
          category: r.category,
          price: r.price,
          nightPrice: r.nightPrice ?? null,
          type: r.type,
          note: r.note || null,
        })),
      };
    }

    case 'car_key_lookup': {
      let make = (args.make || '').trim();
      let model = (args.model || '').trim();
      let year: number | null = args.year ? Number(args.year) : null;
      let decoded: any = null;

      if (args.reverse) {
        const hits = reverseLookup(String(args.reverse));
        if (hits.length === 0) return { status: 'error', message: `No key matches "${args.reverse}"` };
        return {
          status: 'success',
          matchedBy: 'reverse',
          count: hits.length,
          vehicles: hits.slice(0, 12).map(p => ({
            vehicle: `${p.make} ${p.model} ${p.yearStart}-${p.yearEnd ?? 'now'}`,
            variants: (p.variants || []).map(v => ({ keyType: v.keyType, keyway: v.keyway, chip: v.transponderChip, fccId: v.fccId, partNumber: v.partNumber })),
          })),
        };
      }

      if (args.vin) {
        decoded = await decodeVin(String(args.vin));
        if (!decoded) return { status: 'error', message: `Could not decode VIN "${args.vin}" — enter make/model/year instead` };
        make = decoded.make || make; model = decoded.model || model; year = decoded.year ?? year;
      }
      if (!make) return { status: 'error', message: 'Provide a make (and model/year), a vin, or a reverse search' };

      const profiles = findKeyProfiles({ make, model, year });
      if (profiles.length === 0) {
        return { status: 'error', message: `No key data for ${make} ${model || ''} ${year || ''}`.trim() + ' — not in our dataset yet', decodedVin: decoded };
      }
      const p = profiles[0];
      const proc = findProcedure(make, model, year);
      const keyway = p.variants?.[0]?.keyway;
      const inStock = stockForKeyway(keyway, store.inventory);

      return {
        status: 'success',
        decodedVin: decoded,
        vehicle: `${p.make} ${p.model} ${p.yearStart}-${p.yearEnd ?? 'now'}`,
        immobilizer: p.immobilizer || null,
        pinRequired: p.pinRequired ?? proc?.pinRequired ?? null,
        programming: p.programming || null,
        variants: (p.variants || []).map(v => ({
          keyType: v.keyType, keyway: v.keyway, chip: v.transponderChip,
          blade: v.bladeIlco || v.bladeSilca || v.bladeJma || null,
          fccId: v.fccId, partNumber: v.partNumber, frequency: v.frequency,
        })),
        procedure: proc ? { onboard: proc.onboard, addKey: proc.addKey, allKeysLost: proc.allKeysLost, pinSource: proc.pinSource, specialTool: proc.specialTool } : null,
        stock: inStock.length ? inStock.map(s => ({ name: s.name, sku: s.sku, qty: s.stock })) : 'no matching blank in stock',
        confidence: p.confidence,
      };
    }

    case 'send_payment_link': {
      const job = visibleJobs.find(j => j.id === args.jobId);
      if (!job) return { status: 'error', message: `Job ${args.jobId} not found` };
      try {
        const res = await fetch(`${API_BASE}/api/payments/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ jobId: args.jobId, sms: args.sms !== false }),
        });
        const data = await res.json();
        if (!res.ok) return { status: 'error', message: data.error || 'Could not create payment link' };
        return { status: 'success', message: `Payment link for #${job.jobNumber} (balance $${data.balance})${data.smsSent ? ' — texted to client' : ''}`, url: data.url, balance: data.balance };
      } catch {
        return { status: 'error', message: 'Backend unreachable' };
      }
    }

    case 'get_debtors': {
      if (isTech) return { status: 'error', message: 'Debtors are visible to owner/manager only' };
      const today = new Date();
      const rows = accountsReceivable(store.jobs).sort((a, b) => b.balance - a.balance);
      const daysOld = (d: string) => {
        const t = Date.parse(d);
        return Number.isFinite(t) ? Math.max(0, Math.round((today.getTime() - t) / 86400000)) : null;
      };
      return {
        status: 'success',
        count: rows.length,
        totalOutstanding: Math.round(rows.reduce((s, r) => s + r.balance, 0)),
        debtors: rows.slice(0, 25).map(r => ({
          jobId: r.id,
          jobNumber: r.jobNumber,
          client: r.client,
          balance: r.balance,
          total: r.total,
          paid: r.paid,
          daysOverdue: daysOld(r.date),
        })),
      };
    }

    case 'get_reorder_list': {
      const low = store.inventory
        .filter(p => p.stock <= p.reorderPoint)
        .map(p => ({ name: p.name, sku: p.sku, category: p.category, stock: p.stock, reorderPoint: p.reorderPoint, deficit: p.reorderPoint - p.stock, price: p.price }))
        .sort((a, b) => b.deficit - a.deficit);
      return { status: 'success', count: low.length, parts: low };
    }

    case 'remember': {
      if (isTech) return { status: 'error', message: 'Only an owner or manager can save standing instructions' };
      const text = (args.text || '').trim();
      if (!text) return { status: 'error', message: 'Nothing to remember — provide the instruction text' };
      const existing = (settings.aiMemories || []).find(m => m.text.toLowerCase() === text.toLowerCase());
      if (existing) return { status: 'success', message: 'Already remembered', id: existing.id };
      const entry = settings.addAiMemory(text);
      return { status: 'success', message: `Remembered: "${text}"`, id: entry.id };
    }

    case 'forget': {
      if (isTech) return { status: 'error', message: 'Only an owner or manager can manage standing instructions' };
      const list = settings.aiMemories || [];
      let target = args.id ? list.find(m => m.id === args.id) : null;
      if (!target && args.match) {
        const q = String(args.match).toLowerCase();
        target = list.find(m => m.text.toLowerCase().includes(q)) || null;
      }
      if (!target) return { status: 'error', message: 'No matching memory found' };
      settings.removeAiMemory(target.id);
      return { status: 'success', message: `Forgot: "${target.text}"` };
    }

    case 'list_memories': {
      if (isTech) return { status: 'error', message: 'Standing instructions are owner/manager only' };
      const list = settings.aiMemories || [];
      return { status: 'success', count: list.length, memories: list.map(m => ({ id: m.id, text: m.text, createdAt: m.createdAt })) };
    }

    default:
      return { status: 'error', message: `Unknown action: ${name}` };
  }
}

export async function getStrategicBrainResponse(
  message: string,
  history: { text: string, role: 'user' | 'model' }[],
) {
  const contents: any[] = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  // Gemini requires the first turn to be 'user'. The proactive morning brief leaves a
  // leading 'model' message in history — drop any leading model turns so the next real
  // user message isn't rejected with "First content should be with role 'user'".
  while (contents.length && contents[0].role === 'model') contents.shift();
  contents.push({ role: 'user', parts: [{ text: message }] });

  // Loop: keep relaying turns through the backend while the model asks for tool calls.
  // Tools run locally (handleAITool) against the Zustand store; results feed the next turn.
  // Full business context only on the first turn; a slim system instruction on the
  // follow-up tool-result rounds (the data the model needs is already in `contents`).
  // Cuts tokens on rounds 2..N where the heavy snapshot would otherwise be re-sent.
  const fullSystem = getSystemInstruction(true);
  const slimSystem = getSystemInstruction(false);

  const MAX_ROUNDS = 4;
  let lastText = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { text, functionCalls } = await callModel(contents, round === 0 ? fullSystem : slimSystem);
    lastText = text || lastText;
    if (!functionCalls || functionCalls.length === 0) return text;

    contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) });

    const results: any[] = [];
    for (const fc of functionCalls) {
      const result = await handleAITool(fc.name, fc.args);
      results.push({ functionResponse: { id: fc.id, name: fc.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: results });
  }

  // Tool budget exhausted — one final turn to summarize.
  const final = await callModel(contents, slimSystem);
  return final.text || lastText;
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
    // Fetch a short-lived ephemeral token from the backend — the real key stays server-side.
    const tokenRes = await fetch(`${API_BASE}/api/ai/live-token`, {
      method: 'POST',
      headers: { ...authHeaders() },
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to start voice session');
    }
    const { token, model } = await tokenRes.json();
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stream = this.stream;

    this.sessionPromise = ai.live.connect({
      model: model || 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: getSystemInstruction(true, true),
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
