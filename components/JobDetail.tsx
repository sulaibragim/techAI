
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, MapPin, Phone, Mail, Wrench, Trash2, 
  Save, Package, Clock, User, Refrigerator, Stethoscope, 
  Camera, Activity, Plus, Smartphone, 
  ChevronLeft, CheckCircle2, ShieldCheck,
  PenTool, CreditCard, Zap, Thermometer, Droplets, Microwave, Settings,
  ClipboardList, AirVent, Bot,
  Globe, Building2, Navigation, ChevronRight, MessageSquare, Image as ImageIcon,
  AlertTriangle, Edit2, Check, LayoutGrid, Pen, DollarSign,
  Briefcase, Hammer, PhoneIncoming, PhoneOutgoing, PhoneMissed, Shield,
  Calendar as CalendarIcon, Send, Fingerprint, Percent, RotateCcw
} from 'lucide-react';
import { Job, LineItem, STATUS_COLORS, Appliance, JobStatus, Client, Message } from '../types';
import { useAppStore } from '../store';

const APPLIANCE_ICONS = [
  { id: 'Refrigerator', icon: Refrigerator, label: 'Fridge' },
  { id: 'Washer', icon: Droplets, label: 'Washer' },
  { id: 'Dryer', icon: Thermometer, label: 'Dryer' },
  { id: 'Oven', icon: Settings, label: 'Oven' },
  { id: 'Dishwasher', icon: Droplets, label: 'Dishwasher' },
  { id: 'Microwave', icon: Microwave, label: 'Microwave' },
  { id: 'HVAC', icon: AirVent, label: 'HVAC' },
  { id: 'Other', icon: Wrench, label: 'Other' }
];

const SUBZERO_MODELS = [
  { id: 'PRO4850G', label: 'PRO4850G (Professional High-End)', tier: 'Elite' },
  { id: 'PRO3650G', label: 'PRO3650G (Professional)', tier: 'High' },
  { id: 'BI-48SD/S', label: 'BI-48SD/S (Classic Built-in)', tier: 'High' },
  { id: 'BI-42S/S', label: 'BI-42S/S (Classic)', tier: 'Mid' },
  { id: 'BI-36U/S', label: 'BI-36U/S (Over-and-Under)', tier: 'Mid' },
  { id: 'CL3650U/L', label: 'CL3650U/L (Classic Series)', tier: 'Standard' },
  { id: 'DET3050', label: 'DET3050 (Designer Column)', tier: 'Standard' },
  { id: 'DEC2450W', label: 'DEC2450W (Wine Storage)', tier: 'Specialty' },
  { id: 'UC-24R', label: 'UC-24R (Under-counter)', tier: 'Entry' },
  { id: 'ID-24R', label: 'ID-24R (Drawer Integrated Low-End)', tier: 'Entry' }
];

const BRANDS = ['Sub-Zero', 'Viking', 'Wolf', 'Samsung', 'LG', 'GE', 'KitchenAid', 'Bosch'];

const STATUS_OPTIONS: { id: JobStatus; label: string }[] = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'enRoute', label: 'En Route' },
  { id: 'diagnosed', label: 'Diagnosed' },
  { id: 'sold', label: 'Sold' },
  { id: 'waitingParts', label: 'Waiting Parts' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

const TERM_TYPES = ['1', '10', '15', '20', '30'];

export const JobDetail: React.FC<{ job: Job; onClose: () => void }> = ({ job: initialJob, onClose }) => {
  const { updateJob } = useAppStore();
  const [localJob, setLocalJob] = useState<Job>({ ...initialJob });
  const [isModified, setIsModified] = useState(false);
  
  // UI States
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  
  // Billing Prompt State
  const [billingPrompt, setBillingPrompt] = useState<{ open: boolean, type: LineItem['type'] | null, desc: string, price: string }>({
    open: false, type: null, desc: '', price: ''
  });

  // Payment Settlement States
  const [paymentStep, setPaymentStep] = useState<'idle' | 'split' | 'method' | 'sign'>('idle');
  const [paymentSplit, setPaymentSplit] = useState<1 | 0.5>(1);
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash' | 'Check' | 'Zelle'>('Card');
  const [selectedTerm, setSelectedTerm] = useState('1');
  const [showMoreClientInfo, setShowMoreClientInfo] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    setLocalJob({ ...initialJob }); 
    setIsModified(false); 
  }, [initialJob.id]);

  const handleLocalChange = (updates: Partial<Job>) => {
    setLocalJob(prev => ({ ...prev, ...updates }));
    setIsModified(true);
  };

  const handleApplianceChange = (updates: Partial<Appliance>) => {
    handleLocalChange({ appliance: { ...localJob.appliance, ...updates } });
  };

  const handleAddLineItem = () => {
    if (!billingPrompt.type || !billingPrompt.price) return;
    const newItem: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      type: billingPrompt.type,
      description: billingPrompt.desc || 'Service Action',
      quantity: 1,
      unitPrice: parseFloat(billingPrompt.price)
    };
    handleLocalChange({ lineItems: [...localJob.lineItems, newItem] });
    setBillingPrompt({ open: false, type: null, desc: '', price: '' });
  };

  const subtotal = localJob.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const collectingAmount = subtotal * paymentSplit;

  return (
    <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300 overflow-hidden">
      
      {/* MODAL: BILLING ITEM PROMPT */}
      {billingPrompt.open && (
        <div className="absolute inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#111827] w-full max-w-md rounded-[3rem] border border-white/10 p-10 shadow-2xl animate-in zoom-in-95 space-y-8">
            <h3 className="text-xl font-black text-white uppercase tracking-widest text-center">Add {billingPrompt.type}</h3>
            <div className="space-y-6">
               <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-2">Description / Part</label>
                  <input autoFocus className="w-full bg-transparent text-white font-black outline-none text-sm uppercase" value={billingPrompt.desc} onChange={e => setBillingPrompt({...billingPrompt, desc: e.target.value})} placeholder="E.G. MAIN CONTROL BOARD" />
               </div>
               <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-2">Value ($)</label>
                  <input type="number" className="w-full bg-transparent text-blue-500 font-black outline-none text-2xl" value={billingPrompt.price} onChange={e => setBillingPrompt({...billingPrompt, price: e.target.value})} placeholder="0.00" />
               </div>
            </div>
            <div className="flex space-x-3">
               <button onClick={handleAddLineItem} className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 active:scale-95 shadow-xl">Confirm</button>
               <button onClick={() => setBillingPrompt({ open: false, type: null, desc: '', price: '' })} className="flex-1 bg-white/5 text-gray-500 py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-white">Abort</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SETTLEMENT WORKFLOW */}
      {paymentStep !== 'idle' && (
        <div className="absolute inset-0 z-[400] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[4rem] p-16 shadow-2xl animate-in slide-in-from-bottom-12 space-y-12 text-slate-900 relative">
            <button onClick={() => setPaymentStep('idle')} className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-900"><X size={24} /></button>
            
            {paymentStep === 'split' && (
              <div className="space-y-10 animate-in fade-in">
                <div className="text-center">
                  <h3 className="text-4xl font-black uppercase tracking-tighter mb-2">Settlement Scope</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identify collection tier</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { setPaymentSplit(1); setPaymentStep('method'); }} className="p-10 border-2 border-slate-100 rounded-[3rem] hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center active:scale-95 shadow-sm">
                    <DollarSign size={32} className="text-blue-600 mb-4" />
                    <span className="text-sm font-black uppercase">Full Settlement</span>
                    <span className="text-xl font-black mt-2">${subtotal}</span>
                  </button>
                  <button onClick={() => { setPaymentSplit(0.5); setPaymentStep('method'); }} className="p-10 border-2 border-slate-100 rounded-[3rem] hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center active:scale-95 shadow-sm">
                    <Percent size={32} className="text-amber-600 mb-4" />
                    <span className="text-sm font-black uppercase">50% Deposit</span>
                    <span className="text-xl font-black mt-2">${subtotal * 0.5}</span>
                  </button>
                </div>
              </div>
            )}

            {paymentStep === 'method' && (
              <div className="space-y-10 animate-in slide-in-from-right-8">
                <div className="text-center">
                  <h3 className="text-4xl font-black uppercase tracking-tighter mb-2">Select Method</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total to collect: ${collectingAmount}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {['Card', 'Cash', 'Check', 'Zelle'].map(m => (
                    <button key={m} onClick={() => { setPaymentMethod(m as any); setPaymentStep('sign'); }} className="p-8 border-2 border-slate-100 rounded-3xl hover:border-slate-900 text-sm font-black uppercase active:scale-95 shadow-sm transition-all">{m}</button>
                  ))}
                </div>
              </div>
            )}

            {paymentStep === 'sign' && (
              <div className="space-y-10 animate-in slide-in-from-right-8">
                <div className="text-center">
                  <h3 className="text-4xl font-black uppercase tracking-tighter mb-2">Authorize</h3>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Collecting ${collectingAmount} via {paymentMethod}</p>
                </div>
                
                <div className="space-y-4">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">Service Type Count / Duration</p>
                  <div className="grid grid-cols-5 gap-2">
                    {TERM_TYPES.map(t => (
                      <button key={t} onClick={() => setSelectedTerm(t)} className={`py-4 rounded-xl text-[10px] font-black uppercase border transition-all ${selectedTerm === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{t === '1' ? 'ONE' : t}</button>
                    ))}
                  </div>
                </div>

                <div className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-200 relative overflow-hidden group">
                   <PenTool size={48} className="mb-4 opacity-10 group-hover:scale-110 transition-transform" />
                   <p className="text-[10px] font-black uppercase tracking-[0.4em]">Digital Client Signature</p>
                </div>
                
                <button onClick={() => { handleLocalChange({ paymentStatus: 'paid' }); setPaymentStep('idle'); }} className="w-full bg-slate-900 text-white py-10 rounded-[3.5rem] font-black uppercase tracking-[0.5em] text-lg shadow-2xl active:scale-95 hover:bg-blue-600 transition-all">Execute Transaction</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-[#111827] w-full max-w-[1600px] h-full max-h-[96vh] md:rounded-[4rem] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* HEADER BAR */}
        <header className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-[#111827]/80 z-50 shrink-0">
          <div className="flex items-center space-x-6">
            <button onClick={onClose} className="p-4 bg-[#1F2937] rounded-2xl text-gray-400 hover:text-white transition-all active:scale-90"><ChevronLeft size={24} /></button>
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">System Node <span className="text-blue-500">#{localJob.jobNumber}</span></h2>
              
              <div className="relative">
                <button onClick={() => setShowStatusPicker(!showStatusPicker)} className="px-6 py-2.5 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 flex items-center space-x-3 active:scale-95 transition-all" style={{ color: STATUS_COLORS[localJob.status] }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: STATUS_COLORS[localJob.status] }} />
                  <span>{localJob.status}</span>
                </button>
                {showStatusPicker && (
                  <div className="absolute top-full left-0 mt-3 w-64 bg-[#1F2937] border border-white/10 rounded-[1.5rem] shadow-2xl z-[200] p-2 animate-in slide-in-from-top-2">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.id} onClick={() => { handleLocalChange({ status: s.id }); setShowStatusPicker(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-between active:scale-95 ${localJob.status === s.id ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-gray-400'}`}>
                        <span>{s.label}</span>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.id] }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => { updateJob(localJob); setIsModified(false); }} className={`px-10 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 ${isModified ? 'bg-blue-600 text-white shadow-xl' : 'bg-white/5 text-gray-700'}`}>
            <Save size={16} className="mr-3 inline" /> {isModified ? 'Sync Data Hub' : 'Hub Verified'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch min-h-full">
            
            {/* SIDEBAR ASSET CONTROLS */}
            <div className="lg:col-span-4 flex flex-col space-y-10">
              
              {/* CLIENT INFO CARD */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner overflow-hidden transition-all duration-500">
                <div className="space-y-6">
                  {/* Relevant Job Information First */}
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[8px] font-black text-gray-500 uppercase tracking-[0.3em]">Job Context</span>
                      <div className="px-3 py-1 bg-blue-600/10 rounded-lg border border-blue-500/20">
                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{localJob.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-white uppercase tracking-tight">{localJob.appliance.type}</p>
                        <p className="text-[9px] font-bold text-gray-600 uppercase mt-1">{localJob.appliance.brand || 'Elite Unit'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-blue-500 uppercase tracking-tighter">#{localJob.jobNumber}</p>
                        <p className="text-[9px] font-bold text-gray-600 uppercase mt-1">{localJob.scheduledTime}</p>
                      </div>
                    </div>
                  </div>

                  {/* Client Information */}
                  <div className="flex items-center space-x-6">
                    <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl shrink-0">
                      <img src={localJob.client.photo || `https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" alt="Client" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-3xl font-black text-white uppercase tracking-tighter leading-[0.9] truncate">
                        {localJob.client.firstName}<br/>{localJob.client.lastName}
                      </h4>
                      <div className="flex items-center mt-3 space-x-2">
                        <Phone size={12} className="text-blue-500" />
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{localJob.client.phone}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-3 text-gray-400">
                      <Mail size={14} className="text-blue-500 shrink-0" />
                      <p className="text-[10px] font-bold uppercase tracking-tight truncate">{localJob.client.email}</p>
                    </div>
                    <div className="flex items-start space-x-3 text-gray-400">
                      <MapPin size={14} className="text-blue-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold uppercase tracking-tight leading-relaxed">{localJob.client.address}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localJob.client.address)}`)} 
                      className="flex-1 bg-blue-600 text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-xl transition-all hover:bg-blue-500 flex items-center justify-center space-x-2"
                    >
                      <Navigation size={14} />
                      <span>Navigate</span>
                    </button>
                    <button 
                      onClick={() => setShowMoreClientInfo(!showMoreClientInfo)}
                      className={`w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all active:scale-95 border ${showMoreClientInfo ? 'bg-white text-blue-600 border-white' : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'}`}
                    >
                      <Edit2 size={18} />
                    </button>
                  </div>

                  {/* Expandable Additional Information */}
                  {showMoreClientInfo && (
                    <div className="pt-6 border-t border-white/5 space-y-6 animate-in slide-in-from-top-4 duration-300">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Secondary Phone</label>
                          <p className="text-[10px] font-black text-white uppercase">{localJob.client.secondaryPhone || 'N/A'}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Preferred Contact</label>
                          <p className="text-[10px] font-black text-blue-500 uppercase">{localJob.client.preferredContact || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Client Notes</label>
                        <p className="text-[10px] font-medium text-gray-400 italic leading-relaxed">
                          {localJob.client.notes || 'No additional notes provided for this client.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {localJob.client.tags?.map(tag => (
                          <span key={tag} className="px-3 py-1.5 bg-blue-600/10 text-blue-500 text-[8px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* INTELLIGENT APPLIANCE HUB */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner relative">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Appliance Intelligence</h3>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleApplianceChange({ type: 'Other', brand: '', modelNumber: '', serialNumber: '' })}
                      className="p-3 bg-white/5 text-gray-500 rounded-xl hover:bg-white/10 transition-all active:scale-90"
                      title="Add/Reset Appliance"
                    >
                      <Plus size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" />
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-90"><Camera size={14} /></button>
                  </div>
                </div>

                {localJob.photos && localJob.photos.length > 0 && (
                  <div className="w-full aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                    <img src={localJob.photos[0]} className="w-full h-full object-cover" alt="Appliance" />
                  </div>
                )}
                
                {/* DUAL TYPE/BRAND SELECTOR */}
                <div className="grid grid-cols-2 gap-4">
                  {/* TYPE PICKER WITH ICONS */}
                  <div className="relative">
                    <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full bg-white/5 p-5 rounded-3xl border border-white/5 text-left active:scale-95 transition-all flex items-center justify-between">
                      <div className="min-w-0 overflow-hidden">
                        <label className="text-[8px] font-black text-gray-600 block mb-1 uppercase tracking-widest">Asset Type</label>
                        <span className="text-xs font-black text-white uppercase truncate block">{localJob.appliance.type}</span>
                      </div>
                      <ChevronDown size={14} className="text-gray-700 shrink-0 ml-2" />
                    </button>
                    {showTypePicker && (
                      <div className="absolute top-full left-0 w-[260px] mt-3 p-4 bg-[#1F2937] border border-white/10 rounded-[2rem] z-[300] shadow-2xl grid grid-cols-3 gap-2 animate-in zoom-in-95">
                        {APPLIANCE_ICONS.map(t => (
                          <button key={t.id} onClick={() => { handleApplianceChange({ type: t.id as any }); setShowTypePicker(false); }} className={`p-4 rounded-xl flex flex-col items-center justify-center space-y-2 border transition-all active:scale-95 ${localJob.appliance.type === t.id ? 'bg-blue-600 text-white border-blue-400' : 'bg-white/5 text-gray-500 border-white/5 hover:text-gray-300'}`}>
                            <t.icon size={18} />
                            <span className="text-[6px] font-black uppercase text-center leading-tight">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BRAND SELECTOR */}
                  <div className="relative">
                    <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full bg-white/5 p-5 rounded-3xl border border-white/5 text-left active:scale-95 transition-all flex items-center justify-between">
                      <div className="min-w-0 overflow-hidden">
                        <label className="text-[8px] font-black text-gray-600 block mb-1 uppercase tracking-widest">Manufacturer</label>
                        <span className="text-xs font-black text-blue-500 uppercase truncate block">{localJob.appliance.brand || 'CHOOSE'}</span>
                      </div>
                      <ChevronDown size={14} className="text-gray-700 shrink-0 ml-2" />
                    </button>
                    {showBrandPicker && (
                      <div className="absolute top-full right-0 w-[220px] mt-3 p-4 bg-[#1F2937] border border-white/10 rounded-[2rem] z-[300] shadow-2xl max-h-[300px] overflow-y-auto scrollbar-hide animate-in zoom-in-95">
                        {BRANDS.map(b => (
                          <button key={b} onClick={() => { handleApplianceChange({ brand: b }); setShowBrandPicker(false); }} className="w-full px-5 py-4 text-[10px] font-black text-gray-300 hover:bg-blue-600 hover:text-white rounded-xl text-left uppercase transition-all mb-1 last:mb-0 active:scale-95">{b}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* MANUAL MODEL & SERIAL INPUTS */}
                <div className="space-y-4">
                  <div className="bg-white/5 p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-600 block mb-1 uppercase tracking-widest">Model Number</label>
                    <input 
                      type="text"
                      className="w-full bg-transparent text-sm font-black text-white uppercase outline-none placeholder:text-gray-800"
                      value={localJob.appliance.modelNumber || ''}
                      onChange={e => handleApplianceChange({ modelNumber: e.target.value })}
                      placeholder="ENTER MODEL NUMBER"
                    />
                  </div>
                  <div className="bg-white/5 p-5 rounded-3xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-600 block mb-1 uppercase tracking-widest">Serial Number</label>
                    <input 
                      type="text"
                      className="w-full bg-transparent text-sm font-black text-white uppercase outline-none placeholder:text-gray-800"
                      value={localJob.appliance.serialNumber || ''}
                      onChange={e => handleApplianceChange({ serialNumber: e.target.value })}
                      placeholder="ENTER SERIAL NUMBER"
                    />
                  </div>
                </div>

                {/* VERIFICATION FLAGS - MODEL & SERIAL TAGS */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                   <button onClick={() => handleApplianceChange({ age: localJob.appliance.age === 1 ? 0 : 1 })} className={`flex items-center justify-center space-x-3 p-5 rounded-[2rem] border transition-all active:scale-95 ${localJob.appliance.age === 1 ? 'bg-green-600/10 border-green-600/30 text-green-500' : 'bg-white/5 border-white/5 text-gray-600'}`}>
                      <div className={`w-3 h-3 rounded-full border-2 transition-colors ${localJob.appliance.age === 1 ? 'bg-green-500 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'border-gray-800'}`} />
                      <span className="text-[9px] font-black uppercase tracking-[0.2em]">Model Verified</span>
                   </button>
                   <button onClick={() => handleApplianceChange({ warrantyMonths: localJob.appliance.warrantyMonths === 1 ? 0 : 1 })} className={`flex items-center justify-center space-x-3 p-5 rounded-[2rem] border transition-all active:scale-95 ${localJob.appliance.warrantyMonths === 1 ? 'bg-green-600/10 border-green-600/30 text-green-500' : 'bg-white/5 border-white/5 text-gray-600'}`}>
                      <div className={`w-3 h-3 rounded-full border-2 transition-colors ${localJob.appliance.warrantyMonths === 1 ? 'bg-green-500 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'border-gray-800'}`} />
                      <span className="text-[9px] font-black uppercase tracking-[0.2em]">Serial Verified</span>
                   </button>
                </div>
              </section>
            </div>

            {/* MAIN OPERATIONAL HUB */}
            <div className="lg:col-span-8 flex flex-col space-y-12 h-full">
              <div className="bg-white text-slate-900 rounded-[4.5rem] shadow-2xl flex flex-col flex-1 overflow-hidden relative border border-slate-200">
                <div className="h-4 bg-blue-600" />
                <div className="p-16 flex flex-col h-full space-y-12">
                  
                  {/* INVOICE HEADER */}
                  <header className="flex justify-between items-start pt-4">
                    <div className="flex-1">
                       <h3 className="text-6xl font-black uppercase tracking-tighter leading-none mb-6">{localJob.client.firstName}<br/>{localJob.client.lastName}</h3>
                       <div className="flex items-center space-x-6">
                          <div className="flex items-center space-x-2">
                             <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em]">Node ID: {localJob.jobNumber}</span>
                          </div>
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">• {localJob.scheduledDate}</span>
                       </div>
                    </div>
                    <div className="text-right flex items-center space-x-8">
                       <div className="text-left"><h4 className="text-5xl font-black uppercase tracking-tighter leading-none">Salem AI</h4><p className="text-[10px] font-black text-blue-500 uppercase mt-2 tracking-widest">Fleet Operations Hub</p></div>
                       <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center text-white shadow-xl"><Building2 size={36} /></div>
                    </div>
                  </header>

                  {/* BILLING MATRIX - MODAL PROMPTS */}
                  <div className="py-10 border-y-2 border-slate-100 flex items-center justify-between gap-6 px-4">
                    {[
                      { id: 'labor', label: 'Labor Entry', icon: Hammer, color: 'text-blue-600' },
                      { id: 'part', label: 'Hardware', icon: Package, color: 'text-amber-600' },
                      { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-600' },
                      { id: 'maintenance', label: 'Preventative', icon: Wrench, color: 'text-indigo-600' },
                      { id: 'installation', label: 'System Setup', icon: Zap, color: 'text-green-600' }
                    ].map(btn => (
                      <button key={btn.id} onClick={() => setBillingPrompt({ open: true, type: btn.id as any, desc: '', price: '' })} className="flex-1 py-8 rounded-[2.5rem] border-2 border-slate-50 bg-slate-50/50 hover:bg-slate-900 hover:text-white transition-all flex flex-col items-center space-y-4 active:scale-95 shadow-sm group">
                         <btn.icon size={28} className={`${btn.color} group-hover:text-white transition-colors`} />
                         <span className="text-[10px] font-black uppercase tracking-widest">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* LINE ITEMIZATION */}
                  <div className="flex-1 flex flex-col space-y-8 min-h-0 overflow-hidden">
                    <div className="flex text-[12px] font-black uppercase text-slate-300 px-10">
                      <span className="flex-1 tracking-widest">Operational Detail</span>
                      <span className="w-40 text-right tracking-widest">Settlement</span>
                    </div>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-4 scrollbar-hide min-h-0">
                      {localJob.lineItems.length === 0 ? (
                        <div className="h-48 flex flex-col items-center justify-center border-4 border-dashed border-slate-50 rounded-[3rem] opacity-20">
                          <Package size={48} className="mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest">Ledger Entries Awaiting</p>
                        </div>
                      ) : (
                        localJob.lineItems.map(item => (
                          <div key={item.id} className="flex items-center space-x-10 py-8 px-12 bg-slate-50/80 rounded-[3rem] border-2 border-slate-100 shadow-sm animate-in slide-in-from-left-6 transition-all hover:bg-slate-100 group">
                             <div className="flex-1 min-w-0">
                                <p className="text-3xl font-black text-slate-900 uppercase truncate leading-none mb-2">{item.description}</p>
                                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">{item.type} Analysis</span>
                             </div>
                             <div className="flex items-center space-x-12">
                                <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">${item.unitPrice}</span>
                                <button onClick={() => handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== item.id) })} className="p-4 text-slate-200 hover:text-red-500 active:scale-90 transition-colors group-hover:text-slate-400"><Trash2 size={28} /></button>
                             </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* SETTLEMENT ACTION FOOTER */}
                  <footer className="pt-16 border-t-2 border-slate-100 mt-auto flex justify-between items-end pb-4">
                    <div className="w-1/2">
                       <button 
                        onClick={() => setPaymentStep('split')}
                        disabled={localJob.paymentStatus === 'paid'}
                        className={`w-full py-12 rounded-[3.5rem] font-black uppercase text-xl shadow-2xl transition-all flex items-center justify-center active:scale-95 ${localJob.paymentStatus === 'paid' ? 'bg-green-600 text-white shadow-green-500/20' : 'bg-slate-900 text-white hover:bg-blue-600 shadow-slate-900/40'}`}
                       >
                         {localJob.paymentStatus === 'paid' ? <><CheckCircle2 size={40} className="mr-8" /> Record Settled</> : <><CreditCard size={40} className="mr-8" /> Finalize Settlement</>}
                       </button>
                    </div>
                    <div className="text-right">
                       <p className="text-[20px] font-black uppercase text-blue-600 mb-6 tracking-[0.2em]">Total Valuation</p>
                       <p className="text-9xl font-black text-slate-900 tracking-tighter leading-none tabular-nums">${subtotal}</p>
                    </div>
                  </footer>
                </div>
              </div>

              {/* OPERATIONAL LOGS GRID */}
              <div className="grid grid-cols-2 gap-10 shrink-0">
                 <div className="bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 flex flex-col space-y-8 shadow-2xl">
                    <h3 className="text-[12px] font-black text-gray-600 uppercase tracking-widest flex items-center"><ClipboardList size={20} className="mr-4 text-blue-500" /> Intake Report</h3>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[2.5rem] p-10 text-lg font-medium text-gray-400 italic shadow-inner overflow-y-auto scrollbar-hide">"{localJob.complaint}"</div>
                 </div>
                 <div className="bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 flex flex-col space-y-8 shadow-2xl">
                    <h3 className="text-[12px] font-black text-gray-600 uppercase tracking-widest flex items-center"><Stethoscope size={20} className="mr-4 text-green-500" /> Verified Diagnostic</h3>
                    <textarea 
                      className="flex-1 bg-[#111827] border border-white/5 rounded-[2.5rem] p-10 text-lg font-black text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all shadow-xl placeholder:text-gray-800 placeholder:italic"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input verified technical findings..."
                    />
                 </div>
              </div>

              {/* COMMUNICATION HISTORY */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-12">
                 {/* MESSAGES */}
                 <div className="bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 flex flex-col space-y-8 shadow-2xl">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[12px] font-black text-gray-600 uppercase tracking-widest flex items-center"><MessageSquare size={20} className="mr-4 text-blue-500" /> Message History</h3>
                      <button className="text-[8px] font-black text-blue-500 uppercase tracking-widest hover:text-white transition-colors">Send SMS</button>
                    </div>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[2.5rem] p-6 space-y-4 overflow-y-auto max-h-[400px] scrollbar-hide">
                      {localJob.messages && localJob.messages.length > 0 ? (
                        localJob.messages.map(msg => (
                          <div key={msg.id} className={`flex flex-col ${msg.sender === 'technician' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[80%] p-4 rounded-2xl text-xs font-medium ${msg.sender === 'technician' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/5 text-gray-300 rounded-tl-none border border-white/5'}`}>
                              {msg.content}
                            </div>
                            <span className="text-[7px] font-black text-gray-700 uppercase mt-1 tracking-widest">{msg.timestamp} • {msg.sender}</span>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                          <MessageSquare size={32} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-widest">No Messages</p>
                        </div>
                      )}
                    </div>
                 </div>

                 {/* CALLS */}
                 <div className="bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 flex flex-col space-y-8 shadow-2xl">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[12px] font-black text-gray-600 uppercase tracking-widest flex items-center"><Phone size={20} className="mr-4 text-green-500" /> Call History</h3>
                      <button className="text-[8px] font-black text-green-500 uppercase tracking-widest hover:text-white transition-colors">Call Client</button>
                    </div>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[2.5rem] p-6 space-y-4 overflow-y-auto max-h-[400px] scrollbar-hide">
                      {useAppStore().callHistory.filter(c => c.phone === localJob.client.phone).length > 0 ? (
                        useAppStore().callHistory.filter(c => c.phone === localJob.client.phone).map(call => (
                          <div key={call.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex items-center space-x-4">
                              <div className={`p-2 rounded-lg ${call.type === 'missed' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                {call.type === 'incoming' ? <PhoneIncoming size={14} /> : call.type === 'outgoing' ? <PhoneOutgoing size={14} /> : <PhoneMissed size={14} />}
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{call.type}</p>
                                <p className="text-[8px] font-bold text-gray-600 uppercase">{call.timestamp}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-black text-gray-400 tabular-nums">{call.duration || '--:--'}</span>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                          <Phone size={32} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-widest">No Calls</p>
                        </div>
                      )}
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper components for clean syntax
const ChevronDown: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);
