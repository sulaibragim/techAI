
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
  Phone,
  Mail,
  User,
  KeyRound
} from 'lucide-react';
import { Job, Client, LockDetails, LineItem } from '../types';
import { BRANDS as INITIAL_BRANDS, LOCK_TYPES } from '../constants';
import { useAuthStore, useCurrentUser } from '../authStore';

interface JobWizardProps {
  onComplete: (job: Job) => void;
  onCancel: () => void;
}

const JOB_TEMPLATES = [
  {
    id: 'car-lockout',
    icon: Car,
    label: 'Car Lockout',
    lockType: 'Automotive' as const,
    complaint: 'Customer locked keys inside the vehicle.',
    color: 'from-blue-600/20 to-blue-800/10 border-blue-500/30',
    iconColor: 'text-blue-400',
  },
  {
    id: 'home-lockout',
    icon: Home,
    label: 'Home Lockout',
    lockType: 'Residential' as const,
    complaint: 'Customer locked out of their home.',
    color: 'from-green-600/20 to-green-800/10 border-green-500/30',
    iconColor: 'text-green-400',
  },
  {
    id: 'rekey',
    icon: KeyRound,
    label: 'Rekey',
    lockType: 'Residential' as const,
    complaint: 'Customer needs locks rekeyed (moved in / lost key / security).',
    color: 'from-amber-600/20 to-amber-800/10 border-amber-500/30',
    iconColor: 'text-amber-400',
  },
  {
    id: 'commercial',
    icon: Building2,
    label: 'Commercial Lockout',
    lockType: 'Commercial' as const,
    complaint: 'Customer locked out of their business premises.',
    color: 'from-purple-600/20 to-purple-800/10 border-purple-500/30',
    iconColor: 'text-purple-400',
  },
  {
    id: 'safe',
    icon: Lock,
    label: 'Safe Opening',
    lockType: 'Secure / Safe' as const,
    complaint: 'Customer cannot open safe — combination forgotten or malfunction.',
    color: 'from-red-600/20 to-red-800/10 border-red-500/30',
    iconColor: 'text-red-400',
  },
  {
    id: 'lock-install',
    icon: Wrench,
    label: 'Lock Install',
    lockType: 'Residential' as const,
    complaint: 'Customer needs new deadbolt / lock installed.',
    color: 'from-slate-600/20 to-slate-800/10 border-slate-500/30',
    iconColor: 'text-slate-300',
  },
];


export const JobWizard: React.FC<JobWizardProps> = ({ onComplete, onCancel }) => {
  const currentUser = useCurrentUser();
  // Select the stable users array, then filter via useMemo. Filtering inside the
  // selector returns a new array every render and makes Zustand loop infinitely (React #185).
  const allUsers = useAuthStore(s => s.users);
  const technicians = useMemo(() => allUsers.filter(u => u.role === 'technician' && u.active), [allUsers]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [client, setClient] = useState<Partial<Client>>({
    firstName: '',
    lastName: '',
    phone: '',
    secondaryPhone: '',
    email: '',
    secondaryEmail: '',
    address: ''
  });
  const [lockDetails, setLockDetails] = useState<Partial<LockDetails>>({
    type: 'Automotive',
    brand: '',
    modelOrYear: '',
  });
  const [complaint, setComplaint] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showBrandSearch, setShowBrandSearch] = useState(false);
  
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
          if (videoRef.current) {
            videoRef.current.srcObject = activeStream;
            await videoRef.current.play().catch(e => console.error(e));
          }
        } catch (err) {
          console.error("Camera access failed", err);
          setShowCamera(false);
        }
      }
    };
    start();
    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      }
    };
  }, [showCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setPhotos(prev => [...prev, dataUrl]);
        setShowCamera(false);
      }
    }
  };

  const [assignedTo, setAssignedTo] = useState<string>(
    currentUser?.role === 'technician' ? (currentUser?.id || '') : ''
  );

  const handleComplete = () => {
    const initials = (client.firstName?.[0] || 'J') + (client.lastName?.[0] || 'D');
    const numPart = Math.floor(1000 + Math.random() * 9000).toString();

    // A fresh intake lands on the calendar at the moment it came in: today, current hour.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const scheduledDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const scheduledTime = `${pad(now.getHours())}:00`;

    const fullClient: Client = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      secondaryPhone: client.secondaryPhone,
      secondaryEmail: client.secondaryEmail,
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
      lineItems: [],
      paymentStatus: 'unpaid',
      totalAmount: 0,
      photos,
      assignedTo: assignedTo || undefined,
    };
    onComplete(newJob);
  };

  const applyTemplate = (tpl: typeof JOB_TEMPLATES[0]) => {
    setLockDetails({ type: tpl.lockType, brand: '', modelOrYear: '' });
    setComplaint(tpl.complaint);
    setStep(1);
  };

  const nextStep = () => {
    if (step === 1) {
      if (!client.phone?.trim()) { setError('Phone number is required.'); return; }
      if (!client.firstName?.trim() && !client.lastName?.trim()) { setError('Client name is required.'); return; }
    }
    setError('');
    setStep(s => s + 1);
  };
  const prevStep = () => { setError(''); setStep(s => s - 1); };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8">
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
          <p className="text-xl font-bold text-blue-500 mt-1">{step === 0 ? 'Quick Start' : `Step ${step} of 3`}</p>
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-xl mx-auto">

          {step === 0 && (
            <div className="space-y-5 animate-in slide-in-from-bottom-4">
              <div>
                <h3 className="text-2xl font-bold text-white">Choose a template</h3>
                <p className="text-sm text-slate-400 mt-2">Pre-fills job type & complaint. You can still edit everything.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {JOB_TEMPLATES.map(tpl => {
                  const Icon = tpl.icon;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className={`bg-gradient-to-br ${tpl.color} border rounded-3xl p-6 flex flex-col items-start space-y-3 hover:scale-105 transition-all text-left`}
                    >
                      <Icon size={28} className={tpl.iconColor} />
                      <span className="text-sm font-bold text-white">{tpl.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full py-4 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-all"
              >
                Start from scratch
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                  <h3 className="text-2xl font-bold">Customer Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">First Name</label>
                    <input className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none" value={client.firstName} onChange={e => setClient({...client, firstName: e.target.value})} placeholder="Jane" />
                  </div>
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Last Name</label>
                    <input className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none" value={client.lastName} onChange={e => setClient({...client, lastName: e.target.value})} placeholder="Doe" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Primary Phone</label>
                    <input className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none" value={client.phone} onChange={e => setClient({...client, phone: e.target.value})} placeholder="(555) 000-0000" />
                  </div>
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Primary Email</label>
                    <input className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none" value={client.email} onChange={e => setClient({...client, email: e.target.value})} placeholder="jane@example.com" />
                  </div>
                </div>
                <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Service Address</label>
                  <textarea className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none min-h-[80px] resize-none" value={client.address} onChange={e => setClient({...client, address: e.target.value})} placeholder="123 Main St..." />
                </div>
                {currentUser?.role !== 'technician' && technicians.length > 0 && (
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Assign Technician</label>
                    <select
                      className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                      value={assignedTo}
                      onChange={e => setAssignedTo(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold">Hardware Profile</h3>
                  <button onClick={() => setShowCamera(true)} className="p-4 bg-blue-600/10 text-blue-500 rounded-2xl border border-blue-500/20 hover:bg-blue-600/20 transition-all"><Camera size={20} /></button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {LOCK_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => setLockDetails({...lockDetails, type: t.id as any})} className={`p-6 rounded-3xl border flex flex-col items-center space-y-3 transition-all ${lockDetails.type === t.id ? 'bg-blue-600 border-blue-400 text-white shadow-xl scale-105' : 'bg-slate-900 border-white/10 text-slate-300'}`}>
                        <Icon size={24} /><span className="text-xs font-bold uppercase tracking-widest">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/10 group">
                      <img src={p} className="w-full h-full object-cover" alt="LockDetails" />
                      <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={10} /></button>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <div className="bg-slate-900 p-5 rounded-3xl border border-white/10 mt-6 flex items-center justify-between">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Manufacturer / Make</label>
                      <input className="w-full bg-transparent border-none text-sm font-semibold text-white outline-none uppercase" value={lockDetails.brand} onChange={e => setLockDetails({...lockDetails, brand: e.target.value})} placeholder="E.G. TOYOTA, SCHLAGE" />
                    </div>
                    <button onClick={() => setShowBrandSearch(!showBrandSearch)} className="ml-4 p-3 bg-white/5 rounded-xl text-blue-500"><Plus size={18} /></button>
                  </div>
                  {showBrandSearch && (
                    <div className="absolute top-full left-0 right-0 mt-3 p-4 bg-slate-800 border border-white/10 rounded-3xl z-50 grid grid-cols-2 gap-2 shadow-2xl max-h-48 overflow-y-auto scrollbar-hide">
                       {INITIAL_BRANDS.map(b => (
                         <button key={b} onClick={() => { setLockDetails({...lockDetails, brand: b}); setShowBrandSearch(false); }} className="text-left px-4 py-3 text-xs font-bold uppercase text-slate-300 hover:bg-blue-600 hover:text-white rounded-xl transition-all">{b}</button>
                       ))}
                    </div>
                  )}
                </div>
                <div className="bg-slate-900 p-5 rounded-3xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Model or Year</label>
                  <input className="w-full bg-transparent border-none text-sm font-bold text-white outline-none uppercase" value={lockDetails.modelOrYear} onChange={e => setLockDetails({...lockDetails, modelOrYear: e.target.value})} placeholder="2018 CAMRY, OR DEADBOLT" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Service Complaint</h3>
                <div className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl">
                  <textarea className="w-full bg-slate-950 border border-white/10 rounded-2xl p-6 min-h-[200px] text-base font-medium text-slate-300 resize-none outline-none focus:border-blue-500 transition-all italic" value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="Describe the lock issue or vehicle situation..." />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {step > 0 && (
        <footer className="px-6 py-10 border-t border-white/10 bg-slate-950/90 backdrop-blur-md">
          {error && <p className="max-w-xl mx-auto text-xs font-semibold text-red-400 mb-3 text-center">{error}</p>}
          <div className="max-w-xl mx-auto flex items-center justify-between gap-6">
            {step > 1 ? (
              <button onClick={prevStep} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest flex items-center"><ChevronLeft size={16} className="mr-2" />Back</button>
            ) : (
              <button onClick={() => setStep(0)} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-bold uppercase tracking-widest flex items-center"><ChevronLeft size={16} className="mr-2" />Templates</button>
            )}
            {step < 3 ? (
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
