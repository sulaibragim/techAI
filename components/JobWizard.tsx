
import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  MapPin, 
  Camera, 
  Check, 
  DollarSign, 
  Plus, 
  Trash2, 
  X, 
  Wrench, 
  Refrigerator, 
  Zap, 
  Thermometer, 
  Settings, 
  Package,
  Phone,
  Mail,
  User,
  ShieldCheck,
  Stethoscope,
  Clipboard,
  AirVent,
  Droplets
} from 'lucide-react';
import { Job, Client, Appliance, LineItem } from '../types';

interface JobWizardProps {
  onComplete: (job: Job) => void;
  onCancel: () => void;
}

const APPLIANCE_TYPES = [
  { id: 'Refrigerator', icon: Refrigerator, label: 'Fridge' },
  { id: 'Washer', icon: Zap, label: 'Washer' },
  { id: 'Dryer', icon: Thermometer, label: 'Dryer' },
  { id: 'Oven', icon: Settings, label: 'Oven' },
  { id: 'Dishwasher', icon: Droplets, label: 'Dishwasher' },
  { id: 'HVAC', icon: AirVent, label: 'HVAC' },
  { id: 'Other', icon: Wrench, label: 'Other' }
];

const INITIAL_BRANDS = [
  'Whirlpool', 'GE', 'KitchenAid', 'Maytag', 'Frigidaire', 
  'Samsung', 'LG', 'Viking', 'Thermador', 'Sub-Zero', 
  'Bosch', 'Wolf', 'Miele', 'Kenmore', 'Dacor'
];

export const JobWizard: React.FC<JobWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [client, setClient] = useState<Partial<Client>>({
    firstName: '',
    lastName: '',
    phone: '',
    secondaryPhone: '',
    email: '',
    secondaryEmail: '',
    address: ''
  });
  const [appliance, setAppliance] = useState<Partial<Appliance>>({
    type: 'Refrigerator',
    brand: '',
    modelNumber: '',
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

  const handleComplete = () => {
    const initials = (client.firstName?.[0] || 'J') + (client.lastName?.[0] || 'D');
    const numPart = Math.floor(1000 + Math.random() * 9000).toString();
    
    const newJob: Job = {
      id: Math.random().toString(36).substr(2, 9),
      jobNumber: `${numPart}${initials.toUpperCase()}`,
      client: client as Client,
      appliance: appliance as Appliance,
      complaint,
      diagnosisNotes: '',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '09:00',
      status: 'diagnosed',
      lineItems: [],
      paymentStatus: 'unpaid',
      totalAmount: 0,
      photos
    };
    onComplete(newJob);
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="fixed inset-0 bg-[#0F172A] z-[200] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8">
      {showCamera && (
        <div className="fixed inset-0 bg-black z-[300] flex flex-col items-center justify-center p-6">
          <div className="relative w-full max-w-lg aspect-[3/4] bg-[#111827] rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-10 flex justify-center space-x-6 px-10">
              <button onClick={() => setShowCamera(false)} className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center text-white"><X size={24} /></button>
              <button onClick={handleCapture} className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl border-4 border-white/20"><Camera size={32} /></button>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      <header className="px-6 py-6 flex items-center justify-between border-b border-white/5 bg-[#0F172A]/90 backdrop-blur-md sticky top-0 z-20">
        <button onClick={onCancel} className="p-3 text-gray-500 hover:text-white transition-colors"><X size={28} /></button>
        <div className="flex-1 text-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-600">New Job Intake</h2>
          <p className="text-xl font-black text-blue-500 mt-1">Step {step} of 3</p>
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-xl mx-auto">
          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <h3 className="text-2xl font-black">Customer Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">First Name</label>
                    <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none" value={client.firstName} onChange={e => setClient({...client, firstName: e.target.value})} placeholder="Jane" />
                  </div>
                  <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Last Name</label>
                    <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none" value={client.lastName} onChange={e => setClient({...client, lastName: e.target.value})} placeholder="Doe" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Primary Phone</label>
                    <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none" value={client.phone} onChange={e => setClient({...client, phone: e.target.value})} placeholder="(555) 000-0000" />
                  </div>
                  <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Primary Email</label>
                    <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none" value={client.email} onChange={e => setClient({...client, email: e.target.value})} placeholder="jane@example.com" />
                  </div>
                </div>
                <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Service Address</label>
                  <textarea className="w-full bg-transparent border-none text-sm font-black text-white outline-none min-h-[80px] resize-none" value={client.address} onChange={e => setClient({...client, address: e.target.value})} placeholder="123 Appliance Way..." />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black">Appliance Info</h3>
                  <button onClick={() => setShowCamera(true)} className="p-4 bg-blue-600/10 text-blue-500 rounded-2xl border border-blue-500/20 hover:bg-blue-600/20 transition-all"><Camera size={20} /></button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {APPLIANCE_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => setAppliance({...appliance, type: t.id as any})} className={`p-6 rounded-3xl border flex flex-col items-center space-y-3 transition-all ${appliance.type === t.id ? 'bg-blue-600 border-blue-400 text-white shadow-xl scale-105' : 'bg-[#111827] border-white/5 text-gray-400'}`}>
                        <Icon size={24} /><span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/10 group">
                      <img src={p} className="w-full h-full object-cover" alt="Appliance" />
                      <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={10} /></button>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <div className="bg-[#111827] p-5 rounded-3xl border border-white/5 mt-6 flex items-center justify-between">
                    <div className="flex-1">
                      <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Manufacturer</label>
                      <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none uppercase" value={appliance.brand} onChange={e => setAppliance({...appliance, brand: e.target.value})} placeholder="E.G. VIKING, THERMADOR" />
                    </div>
                    <button onClick={() => setShowBrandSearch(!showBrandSearch)} className="ml-4 p-3 bg-white/5 rounded-xl text-blue-500"><Plus size={18} /></button>
                  </div>
                  {showBrandSearch && (
                    <div className="absolute top-full left-0 right-0 mt-3 p-4 bg-[#1F2937] border border-white/10 rounded-3xl z-50 grid grid-cols-2 gap-2 shadow-2xl max-h-48 overflow-y-auto scrollbar-hide">
                       {INITIAL_BRANDS.map(b => (
                         <button key={b} onClick={() => { setAppliance({...appliance, brand: b}); setShowBrandSearch(false); }} className="text-left px-4 py-3 text-[10px] font-bold uppercase text-gray-300 hover:bg-blue-600 hover:text-white rounded-xl transition-all">{b}</button>
                       ))}
                    </div>
                  )}
                </div>
                <div className="bg-[#111827] p-5 rounded-3xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1.5">Model Number</label>
                  <input className="w-full bg-transparent border-none text-sm font-black text-white outline-none uppercase" value={appliance.modelNumber} onChange={e => setAppliance({...appliance, modelNumber: e.target.value})} placeholder="MODEL#" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <h3 className="text-2xl font-black">Service Complaint</h3>
                <div className="bg-[#111827] p-8 rounded-[3rem] border border-white/5 shadow-2xl">
                  <textarea className="w-full bg-[#0F172A] border border-white/10 rounded-2xl p-6 min-h-[200px] text-base font-medium text-gray-300 resize-none outline-none focus:border-blue-500 transition-all italic" value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="Describe the unit failure..." />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="px-6 py-10 border-t border-white/5 bg-[#0F172A]/90 backdrop-blur-md">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-6">
          {step > 1 ? (
            <button onClick={prevStep} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-black uppercase tracking-widest flex items-center"><ChevronLeft size={16} className="mr-2" />Back</button>
          ) : (
            <button onClick={onCancel} className="px-8 py-5 rounded-2xl border border-white/10 text-xs font-black uppercase tracking-widest">Cancel</button>
          )}
          {step < 3 ? (
            <button onClick={nextStep} className="flex-1 bg-blue-600 hover:bg-blue-700 px-8 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-xl flex items-center justify-center">Next Step<ChevronRight size={16} className="ml-2" /></button>
          ) : (
            <button onClick={handleComplete} className="flex-1 bg-green-600 hover:bg-green-700 px-8 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-white shadow-[0_20px_40px_rgba(22,163,74,0.3)] flex items-center justify-center animate-pulse"><Check size={16} className="mr-2" />Secure Record</button>
          )}
        </div>
      </footer>
    </div>
  );
};
