
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Camera,
  Check,
  Plus,
  Trash2,
  X,
  Wrench,
  Car,
  Home,
  Building2,
  Lock,
  KeyRound,
  Zap,
  CalendarClock,
  Mic,
  MapPin,
  History,
} from 'lucide-react';
import { Job, Client, LockDetails } from '../types';
import { BRANDS as INITIAL_BRANDS, LOCK_TYPES } from '../constants';
import { useAuthStore, useCurrentUser } from '../authStore';
import { useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import { buildClients, findClientByPhone, toE164US, normalizePhone, ClientRecord } from '../clientUtils';
import { formatDate } from '../dateUtils';
import { TechPicker } from './TechPicker';
import { AutoKeyPanel } from './AutoKeyPanel';
import { decodeVin } from '../vehicleKeyLookup';
import { VinScanner } from './VinScanner';

interface JobWizardProps {
  onComplete: (job: Job) => void;
  onCancel: () => void;
  initialPhone?: string;
  initialName?: string;
}

const JOB_TEMPLATES = [
  { id: 'car-lockout', icon: Car, label: 'Car Lockout', lockType: 'Automotive' as const, complaint: 'Customer locked keys inside the vehicle.', color: 'from-blue-600/20 to-blue-800/10 border-blue-500/30', iconColor: 'text-blue-400' },
  { id: 'home-lockout', icon: Home, label: 'Home Lockout', lockType: 'Residential' as const, complaint: 'Customer locked out of their home.', color: 'from-green-600/20 to-green-800/10 border-green-500/30', iconColor: 'text-green-400' },
  { id: 'rekey', icon: KeyRound, label: 'Rekey', lockType: 'Residential' as const, complaint: 'Customer needs locks rekeyed (moved in / lost key / security).', color: 'from-amber-600/20 to-amber-800/10 border-amber-500/30', iconColor: 'text-amber-400' },
  { id: 'commercial', icon: Building2, label: 'Commercial Lockout', lockType: 'Commercial' as const, complaint: 'Customer locked out of their business premises.', color: 'from-purple-600/20 to-purple-800/10 border-purple-500/30', iconColor: 'text-purple-400' },
  { id: 'safe', icon: Lock, label: 'Safe Opening', lockType: 'Secure / Safe' as const, complaint: 'Customer cannot open safe — combination forgotten or malfunction.', color: 'from-red-600/20 to-red-800/10 border-red-500/30', iconColor: 'text-red-400' },
  { id: 'lock-install', icon: Wrench, label: 'Lock Install', lockType: 'Residential' as const, complaint: 'Customer needs new deadbolt / lock installed.', color: 'from-slate-600/20 to-slate-800/10 border-slate-500/30', iconColor: 'text-slate-300' },
];

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const PRIORITIES = [
  { id: 'emergency' as const, label: 'Emergency', cls: 'bg-red-500/15 border-red-500/50 text-red-300', dot: 'bg-red-500' },
  { id: 'today' as const, label: 'Today', cls: 'bg-amber-500/15 border-amber-500/50 text-amber-300', dot: 'bg-amber-400' },
  { id: 'scheduled' as const, label: 'Scheduled', cls: 'bg-blue-500/15 border-blue-500/50 text-blue-300', dot: 'bg-blue-400' },
];

const SpeechRecognition = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

export const JobWizard: React.FC<JobWizardProps> = ({ onComplete, onCancel, initialPhone, initialName }) => {
  const currentUser = useCurrentUser();
  const allUsers = useAuthStore(s => s.users);
  const technicians = useMemo(() => allUsers.filter(u => u.role === 'technician' && u.active), [allUsers]);
  const jobs = useVisibleJobs();
  const clientProfiles = useSettingsStore(s => s.clientProfiles);
  const clients = useMemo(() => buildClients(jobs, clientProfiles), [jobs, clientProfiles]);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  // A name passed in from a call (when OpenPhone knew the contact) seeds first/last.
  const initialNameParts = (initialName || '').trim().split(/\s+/);
  const [client, setClient] = useState<Partial<Client>>({
    firstName: initialNameParts[0] || '', lastName: initialNameParts.slice(1).join(' ') || '',
    phone: initialPhone || '', email: '', address: '', zip: '', unit: '', gateCode: '', accessNotes: '',
  });
  const [lockDetails, setLockDetails] = useState<Partial<LockDetails>>({ type: 'Automotive', brand: '', modelOrYear: '' });
  const [vinInput, setVinInput] = useState('');
  const [vinBusy, setVinBusy] = useState(false);
  const [showVinScan, setShowVinScan] = useState(false);
  const [complaint, setComplaint] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showBrandSearch, setShowBrandSearch] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>(currentUser?.role === 'technician' ? (currentUser?.id || '') : '');

  // Schedule + priority
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'later'>('asap');
  const [schedDate, setSchedDate] = useState<string>(todayStr());
  const [schedTime, setSchedTime] = useState<string>('10:00');
  const [priority, setPriority] = useState<'emergency' | 'today' | 'scheduled'>('today');

  // Returning-customer match by phone
  const [matchedClient, setMatchedClient] = useState<ClientRecord | null>(null);
  const [prefilledId, setPrefilledId] = useState<string | null>(null);
  useEffect(() => {
    const m = findClientByPhone(clients, client.phone);
    setMatchedClient(m && m.id !== prefilledId ? m : null);
  }, [client.phone, clients, prefilledId]);

  const prefillFromClient = (rec: ClientRecord) => {
    const latest = [...rec.jobs].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))[0];
    const c = latest?.client || ({} as Client);
    setClient(prev => ({
      ...prev,
      firstName: c.firstName || rec.firstName,
      lastName: c.lastName || rec.lastName,
      email: c.email || rec.email,
      address: c.address || rec.address,
      zip: c.zip || '',
      unit: c.unit || '',
      gateCode: c.gateCode || '',
      accessNotes: c.accessNotes || '',
    }));
    setPrefilledId(rec.id);
    setMatchedClient(null);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    const start = async () => {
      if (showCamera) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!videoRef.current) return;
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) { videoRef.current.srcObject = activeStream; await videoRef.current.play().catch(e => console.error(e)); }
        } catch (err) { console.error('Camera access failed', err); setShowCamera(false); }
      }
    };
    start();
    return () => { if (activeStream) activeStream.getTracks().forEach(t => { t.stop(); t.enabled = false; }); };
  }, [showCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        setPhotos(prev => [...prev, canvasRef.current!.toDataURL('image/jpeg', 0.8)]);
        setShowCamera(false);
      }
    }
  };

  // Voice dictation for the complaint
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch {} }, []);
  const toggleDictation = () => {
    if (!SpeechRecognition) return;
    if (listening) { try { recognitionRef.current?.stop(); } catch {} setListening(false); return; }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US'; rec.interimResults = false; rec.continuous = true;
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      if (text.trim()) setComplaint(prev => (prev ? prev.trim() + ' ' : '') + text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch {}
  };

  const handleComplete = () => {
    const initials = (client.firstName?.[0] || 'J') + (client.lastName?.[0] || 'D');
    const numPart = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date();
    const scheduledDate = scheduleMode === 'asap' ? todayStr() : schedDate;
    const scheduledTime = scheduleMode === 'asap' ? `${pad(now.getHours())}:00` : schedTime;

    const fullClient: Client = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      phone: toE164US(client.phone) || client.phone || '',
      email: client.email || '',
      address: client.address || '',
      zip: client.zip || '',
      unit: client.unit || '',
      gateCode: client.gateCode || '',
      accessNotes: client.accessNotes || '',
    };

    const newJob: Job = {
      id: Math.random().toString(36).substr(2, 9),
      jobNumber: `${numPart}${initials.toUpperCase()}`,
      client: fullClient,
      lockDetails: lockDetails as LockDetails,
      complaint,
      diagnosisNotes: '',
      scheduledDate,
      scheduledTime,
      status: 'scheduled',
      priority,
      lineItems: [],
      paymentStatus: 'unpaid',
      totalAmount: 0,
      photos,
      assignedTo: assignedTo || undefined,
      acceptanceStatus: assignedTo ? (assignedTo === currentUser?.id ? 'accepted' : 'pending') : undefined,
      acceptedAt: (assignedTo && assignedTo === currentUser?.id) ? new Date().toISOString() : undefined,
    };
    onComplete(newJob);
  };

  const applyTemplate = (tpl: typeof JOB_TEMPLATES[0]) => {
    setLockDetails({ type: tpl.lockType, brand: '', modelOrYear: '' });
    setComplaint(tpl.complaint);
    setPriority(tpl.id === 'rekey' || tpl.id === 'lock-install' ? 'scheduled' : tpl.lockType === 'Automotive' || tpl.id.includes('lockout') ? 'emergency' : 'today');
    setStep(1);
  };

  const nextStep = () => {
    if (step === 1) {
      if (!client.phone?.trim()) { setError('Phone number is required.'); return; }
      if (!client.firstName?.trim() && !client.lastName?.trim()) { setError('Client name is required.'); return; }
      if (!client.zip?.trim()) { setError('ZIP code is required.'); return; }
    }
    setError('');
    setStep(s => s + 1);
  };
  const prevStep = () => { setError(''); setStep(s => s - 1); };

  // VIN → auto-fill make + model/year (free NHTSA decode) for automotive jobs.
  const decodeVinToFields = async (override?: string) => {
    const raw = (override ?? vinInput).trim();
    if (raw.length < 17) return;
    if (override) setVinInput(override);
    setVinBusy(true);
    const d = await decodeVin(raw);
    setVinBusy(false);
    if (!d) { setError('Could not decode that VIN — enter make & year manually.'); return; }
    setError('');
    setLockDetails(prev => ({
      ...prev,
      brand: d.make ? d.make.toUpperCase() : prev.brand,
      modelOrYear: [d.year, d.model].filter(Boolean).join(' ').toUpperCase() || prev.modelOrYear,
      vinOrKeyCode: d.vin,
    }));
  };

  const fieldCls = 'w-full bg-transparent border-none text-sm font-semibold text-white outline-none';
  const cardCls = 'bg-slate-900 p-4 rounded-2xl border border-white/10';
  const labelCls = 'text-xs font-bold text-slate-400 uppercase block mb-1.5';

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8">
      {showVinScan && <VinScanner onResult={(v) => { setShowVinScan(false); decodeVinToFields(v); }} onClose={() => setShowVinScan(false)} />}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col items-center justify-center p-6">
          <div className="relative w-full max-w-lg aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-10 flex justify-center space-x-6 px-10">
              <button onClick={() => setShowCamera(false)} className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center text-white"><X size={24} /></button>
              <button onClick={handleCapture} className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl border-4 border-white/20"><Camera size={32} /></button>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      <header className="px-6 py-6 flex items-center justify-between border-b border-white/10 bg-slate-950/90 backdrop-blur-md sticky top-0 z-20">
        <button onClick={onCancel} className="p-3 text-slate-400 hover:text-white transition-colors"><X size={28} /></button>
        <div className="flex-1 text-center">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">New Job Intake</h2>
          <p className="text-xl font-bold text-blue-500 mt-1">{step === 0 ? 'Quick Start' : `Step ${step} of 2`}</p>
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-xl mx-auto">

          {step === 0 && (
            <div className="space-y-5 animate-in slide-in-from-bottom-4">
              <div>
                <h3 className="text-2xl font-bold text-white">Choose a template</h3>
                <p className="text-sm text-slate-400 mt-2">Pre-fills job type, complaint & priority. You can still edit everything.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {JOB_TEMPLATES.map(tpl => {
                  const Icon = tpl.icon;
                  return (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)} className={`bg-gradient-to-br ${tpl.color} border rounded-3xl p-6 flex flex-col items-start space-y-3 hover:scale-105 transition-all text-left`}>
                      <Icon size={28} className={tpl.iconColor} />
                      <span className="text-sm font-bold text-white">{tpl.label}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(1)} className="w-full py-4 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-all">Start from scratch</button>
            </div>
          )}

          {/* ───────── STEP 1 — CUSTOMER & DISPATCH ───────── */}
          {step === 1 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <h3 className="text-2xl font-bold">Customer & Dispatch</h3>

              {/* Phone first — drives returning-customer lookup */}
              <div className={cardCls}>
                <label className={labelCls}>Primary Phone *</label>
                <input className={fieldCls} value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} placeholder="(555) 000-0000" inputMode="tel" autoFocus />
              </div>

              {matchedClient && (
                <button
                  onClick={() => prefillFromClient(matchedClient)}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 hover:bg-emerald-500/20 transition-all active:scale-[0.99] text-left animate-in fade-in"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <History size={16} className="text-emerald-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white truncate">Returning customer: {matchedClient.firstName} {matchedClient.lastName}</span>
                      <span className="block text-xs text-emerald-300/80">{matchedClient.jobs.length} past job{matchedClient.jobs.length !== 1 ? 's' : ''} · last {formatDate(matchedClient.lastJobDate)}</span>
                    </span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 rounded-xl shrink-0">Use info</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className={cardCls}>
                  <label className={labelCls}>First Name *</label>
                  <input className={fieldCls} value={client.firstName} onChange={e => setClient({ ...client, firstName: e.target.value })} placeholder="Jane" />
                </div>
                <div className={cardCls}>
                  <label className={labelCls}>Last Name</label>
                  <input className={fieldCls} value={client.lastName} onChange={e => setClient({ ...client, lastName: e.target.value })} placeholder="Doe" />
                </div>
              </div>

              <div className={cardCls}>
                <label className={labelCls}>Email <span className="text-slate-600 normal-case font-medium">· optional</span></label>
                <input className={fieldCls} value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} placeholder="jane@example.com" inputMode="email" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`md:col-span-2 ${cardCls}`}>
                  <label className={labelCls}>Service Address *</label>
                  <textarea className={`${fieldCls} min-h-[64px] resize-none`} value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} placeholder="123 Main St..." />
                </div>
                <div className={cardCls}>
                  <label className={labelCls}>ZIP Code *</label>
                  <input inputMode="numeric" className={fieldCls} value={client.zip} onChange={e => setClient({ ...client, zip: e.target.value })} placeholder="33139" />
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">Pins the address for accurate distance.</p>
                </div>
              </div>

              {/* Access details for the tech */}
              <div className={cardCls}>
                <label className={`${labelCls} flex items-center gap-1.5`}><MapPin size={12} className="text-blue-400" /> Access for the technician</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <input className={`${fieldCls} bg-white/5 rounded-lg px-3 py-2`} value={client.unit} onChange={e => setClient({ ...client, unit: e.target.value })} placeholder="Unit / Apt #" />
                  <input className={`${fieldCls} bg-white/5 rounded-lg px-3 py-2`} value={client.gateCode} onChange={e => setClient({ ...client, gateCode: e.target.value })} placeholder="Gate / callbox code" />
                </div>
                <input className={`${fieldCls} bg-white/5 rounded-lg px-3 py-2 mt-3`} value={client.accessNotes} onChange={e => setClient({ ...client, accessNotes: e.target.value })} placeholder="Note: where to park, buzzer broken, dog on site…" />
              </div>

              {/* Schedule */}
              <div className={cardCls}>
                <label className={labelCls}>When</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setScheduleMode('asap')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${scheduleMode === 'asap' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300'}`}><Zap size={15} /> Now (ASAP)</button>
                  <button onClick={() => setScheduleMode('later')} className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all active:scale-95 ${scheduleMode === 'later' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300'}`}><CalendarClock size={15} /> Schedule</button>
                </div>
                {scheduleMode === 'later' && (
                  <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in">
                    <input type="date" min={todayStr()} value={schedDate} onChange={e => setSchedDate(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-semibold text-white outline-none [color-scheme:dark]" />
                    <select value={schedTime} onChange={e => setSchedTime(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-semibold text-white outline-none">
                      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Priority */}
              <div className={cardCls}>
                <label className={labelCls}>Priority</label>
                <div className="grid grid-cols-3 gap-3">
                  {PRIORITIES.map(p => (
                    <button key={p.id} onClick={() => setPriority(p.id)} className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${priority === p.id ? p.cls : 'bg-white/5 border-white/10 text-slate-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${p.dot}`} /> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assign tech */}
              {currentUser?.role !== 'technician' && technicians.length > 0 && (
                <div className={cardCls}>
                  <label className={`${labelCls} mb-3`}>Assign Technician — who’s closest</label>
                  <TechPicker
                    technicians={technicians}
                    address={[client.address, client.zip].filter(Boolean).join(', ')}
                    value={assignedTo}
                    onChange={id => setAssignedTo(id || '')}
                    jobType={lockDetails.type}
                    favoriteTechId={clientProfiles[normalizePhone(client.phone)]?.favoriteTechId}
                  />
                </div>
              )}
            </div>
          )}

          {/* ───────── STEP 2 — THE JOB ───────── */}
          {step === 2 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">The Job</h3>
                <button onClick={() => setShowCamera(true)} className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl border border-blue-500/20 hover:bg-blue-600/20 transition-all" title="Add photo (optional)"><Camera size={18} /></button>
              </div>

              <div>
                <label className={`${labelCls} mb-3`}>Job Type</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {LOCK_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => setLockDetails({ ...lockDetails, type: t.id as any })} className={`p-4 rounded-2xl border flex flex-col items-center space-y-2 transition-all ${lockDetails.type === t.id ? 'bg-blue-600 border-blue-400 text-white shadow-xl' : 'bg-slate-900 border-white/10 text-slate-300'}`}>
                        <Icon size={20} /><span className="text-[11px] font-bold uppercase tracking-wider">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {photos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 group">
                      <img src={p} className="w-full h-full object-cover" alt="Job" />
                      <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={10} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <div className={`${cardCls} flex items-center justify-between`}>
                    <div className="flex-1 min-w-0">
                      <label className={labelCls}>Make / Brand</label>
                      <input className={`${fieldCls} uppercase`} value={lockDetails.brand} onChange={e => setLockDetails({ ...lockDetails, brand: e.target.value })} placeholder="TOYOTA, SCHLAGE" />
                    </div>
                    <button onClick={() => setShowBrandSearch(!showBrandSearch)} className="ml-3 p-2.5 bg-white/5 rounded-xl text-blue-500 shrink-0"><Plus size={16} /></button>
                  </div>
                  {showBrandSearch && (
                    <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-slate-800 border border-white/10 rounded-2xl z-50 grid grid-cols-2 gap-2 shadow-2xl max-h-44 overflow-y-auto scrollbar-hide">
                      {INITIAL_BRANDS.map(b => (
                        <button key={b} onClick={() => { setLockDetails({ ...lockDetails, brand: b }); setShowBrandSearch(false); }} className="text-left px-3 py-2 text-xs font-bold uppercase text-slate-300 hover:bg-blue-600 hover:text-white rounded-lg transition-all">{b}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={cardCls}>
                  <label className={labelCls}>Model / Year</label>
                  <input className={`${fieldCls} uppercase`} value={lockDetails.modelOrYear} onChange={e => setLockDetails({ ...lockDetails, modelOrYear: e.target.value })} placeholder="2018 CAMRY / DEADBOLT" />
                </div>
              </div>

              {lockDetails.type === 'Automotive' && (
                <div className="space-y-4">
                  <div className={`${cardCls} flex items-end gap-3`}>
                    <div className="flex-1 min-w-0">
                      <label className={labelCls}>VIN <span className="text-slate-600 normal-case font-medium">· auto-fills make & year</span></label>
                      <input className={`${fieldCls} uppercase`} value={vinInput} onChange={e => setVinInput(e.target.value)} maxLength={17} placeholder="17-CHARACTER VIN" />
                    </div>
                    <button onClick={() => setShowVinScan(true)} className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 shrink-0" title="Scan VIN barcode"><Camera size={16} /></button>
                    <button onClick={() => decodeVinToFields()} disabled={vinBusy || vinInput.trim().length < 17} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider shrink-0">{vinBusy ? '…' : 'Decode'}</button>
                  </div>
                  <AutoKeyPanel make={lockDetails.brand} modelOrYear={lockDetails.modelOrYear} />
                </div>
              )}

              <div className={cardCls}>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + ' mb-0'}>What's the problem?</label>
                  {SpeechRecognition && (
                    <button onClick={toggleDictation} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600/10 text-blue-400 border border-blue-500/20'}`}>
                      <Mic size={12} /> {listening ? 'Listening…' : 'Dictate'}
                    </button>
                  )}
                </div>
                <textarea className="w-full bg-slate-950 border border-white/10 rounded-xl p-4 min-h-[160px] text-base font-medium text-slate-200 resize-none outline-none focus:border-blue-500 transition-all" value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="Describe the lock issue or vehicle situation… or tap Dictate and speak." />
              </div>
            </div>
          )}
        </div>
      </div>

      {step > 0 && (
        <footer className="px-6 py-6 border-t border-white/10 bg-slate-950/90 backdrop-blur-md" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          {error && <p className="max-w-xl mx-auto text-xs font-semibold text-red-400 mb-3 text-center">{error}</p>}
          <div className="max-w-xl mx-auto flex items-center justify-between gap-6">
            {step > 1 ? (
              <button onClick={prevStep} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest flex items-center"><ChevronLeft size={16} className="mr-2" />Back</button>
            ) : (
              <button onClick={() => setStep(0)} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest flex items-center"><ChevronLeft size={16} className="mr-2" />Templates</button>
            )}
            {step < 2 ? (
              <button onClick={nextStep} className="flex-1 bg-blue-600 hover:bg-blue-700 px-8 py-5 rounded-2xl text-sm font-bold uppercase tracking-widest text-white shadow-xl flex items-center justify-center">Next Step<ChevronRight size={16} className="ml-2" /></button>
            ) : (
              <button onClick={handleComplete} className="flex-1 bg-green-600 hover:bg-green-700 px-8 py-5 rounded-2xl text-sm font-bold uppercase tracking-widest text-white shadow-lg flex items-center justify-center"><Check size={16} className="mr-2" />Create Job</button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
};
