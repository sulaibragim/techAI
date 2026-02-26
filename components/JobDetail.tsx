
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, MapPin, Phone, Mail, Wrench, Trash2, 
  Save, Package, Clock, User, Refrigerator, Stethoscope, 
  Camera, Activity, Plus, Smartphone, 
  ChevronLeft, CheckCircle2, ShieldCheck,
  PenTool, CreditCard, Zap, Thermometer, Droplets, Microwave, Settings,
  ClipboardList, AirVent, Bot, Copy,
  Globe, Building2, Navigation, ChevronRight, MessageSquare, Image as ImageIcon,
  AlertTriangle, Edit2, Check, LayoutGrid, Pen, DollarSign,
  Briefcase, Hammer, PhoneIncoming, PhoneOutgoing, PhoneMissed, Shield,
  Calendar as CalendarIcon, Send, Fingerprint, Percent, RotateCcw
} from 'lucide-react';
import { Job, LineItem, STATUS_COLORS, Appliance, JobStatus, Client, Message } from '../types';
import { useAppStore } from '../store';

const APPLIANCE_ICONS = [
  { id: 'Refrigerator', icon: Refrigerator, label: 'Refrigerator' },
  { id: 'Washer', icon: Droplets, label: 'Washer' },
  { id: 'Washing Machine', icon: Droplets, label: 'Washing Machine' },
  { id: 'Dryer', icon: Thermometer, label: 'Dryer' },
  { id: 'Dishwasher', icon: Droplets, label: 'Dishwasher' },
  { id: 'Microwave', icon: Microwave, label: 'Microwave' },
  { id: 'Oven', icon: Settings, label: 'Oven' },
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
  const { jobs, updateJob } = useAppStore();
  const [localJob, setLocalJob] = useState<Job>({ ...initialJob });
  const [isModified, setIsModified] = useState(false);
  
  // UI States
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(localJob.scheduledDate);
  const [customBrand, setCustomBrand] = useState('');
  const [showCustomBrandInput, setShowCustomBrandInput] = useState(false);
  
  // Billing Prompt State
  const [billingPrompt, setBillingPrompt] = useState<{ open: boolean, type: LineItem['type'] | null, desc: string, price: string, extra?: string }>({
    open: false, type: null, desc: '', price: ''
  });

  // Payment Settlement States
  const [paymentStep, setPaymentStep] = useState<'idle' | 'split' | 'method' | 'sign'>('idle');
  const [paymentSplit, setPaymentSplit] = useState<1 | 0.5>(1);
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash' | 'Check' | 'Zelle'>('Card');
  const [selectedTerm, setSelectedTerm] = useState('1');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    setLocalJob({ ...initialJob }); 
    setIsModified(false); 
    setCalendarDate(initialJob.scheduledDate);
  }, [initialJob.id]);

  const handleLocalChange = (updates: Partial<Job>) => {
    setLocalJob(prev => ({ ...prev, ...updates }));
    setIsModified(true);
  };

  const handleApplianceChange = (updates: Partial<Appliance>) => {
    handleLocalChange({ appliance: { ...localJob.appliance, ...updates } });
  };

  const handleClientChange = (updates: Partial<Client>) => {
    handleLocalChange({ client: { ...localJob.client, ...updates } });
  };

  const isTimeSlotTaken = (date: string, time: string) => {
    return jobs.some(j => j.id !== localJob.id && j.scheduledDate === date && j.scheduledTime === time);
  };

  const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

  const handleAddLineItem = () => {
    if (!billingPrompt.type || !billingPrompt.price) return;
    
    let finalDesc = billingPrompt.desc || 'Service Action';
    if (billingPrompt.type === 'service_call' && billingPrompt.extra) {
      finalDesc = `${finalDesc} (Diag: ${billingPrompt.extra})`;
    }

    const newItem: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      type: billingPrompt.type,
      description: finalDesc,
      quantity: 1,
      unitPrice: parseFloat(billingPrompt.price)
    };
    handleLocalChange({ lineItems: [...localJob.lineItems, newItem] });
    setBillingPrompt({ open: false, type: null, desc: '', price: '' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Optional: add a toast notification here
  };

  const subtotal = localJob.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const collectingAmount = subtotal * paymentSplit;

  return (
    <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300 overflow-hidden">
      
      {/* MODAL: BILLING PROMPT */}
      {billingPrompt.open && (
        <div className="absolute inset-0 z-[600] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-[#111827] w-full max-w-md rounded-[3rem] border border-white/10 p-10 shadow-2xl space-y-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-widest">Add {billingPrompt.type}</h3>
              <button onClick={() => setBillingPrompt({ ...billingPrompt, open: false })} className="p-2 text-gray-500 hover:text-white"><X size={24} /></button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">
                  {billingPrompt.type === 'labor' ? 'Labor Name' : billingPrompt.type === 'part' ? 'Part Name' : 'Description'}
                </label>
                <input 
                  className="w-full bg-transparent text-white font-black outline-none text-sm" 
                  value={billingPrompt.desc} 
                  onChange={e => setBillingPrompt({ ...billingPrompt, desc: e.target.value })}
                  placeholder="Enter name..."
                />
              </div>

              {billingPrompt.type === 'service_call' && (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">What was diagnosed?</label>
                  <textarea 
                    className="w-full bg-transparent text-white font-black outline-none text-sm h-20 resize-none" 
                    value={billingPrompt.extra || ''} 
                    onChange={e => setBillingPrompt({ ...billingPrompt, extra: e.target.value })}
                    placeholder="Describe findings..."
                  />
                </div>
              )}

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Cost ($)</label>
                <input 
                  type="number"
                  className="w-full bg-transparent text-white font-black outline-none text-sm" 
                  value={billingPrompt.price} 
                  onChange={e => setBillingPrompt({ ...billingPrompt, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <button onClick={handleAddLineItem} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black text-[12px] uppercase tracking-widest active:scale-95 shadow-2xl">Add to Invoice</button>
          </div>
        </div>
      )}

      {/* MODAL: CLIENT EDIT */}
      {isEditingClient && (
        <div className="absolute inset-0 z-[500] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-[#111827] w-full max-w-2xl rounded-[3rem] border border-white/10 p-12 shadow-2xl space-y-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-widest">Edit Client Records</h3>
              <button onClick={() => setIsEditingClient(false)} className="p-2 text-gray-500 hover:text-white"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">First Name</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.firstName} onChange={e => handleClientChange({ firstName: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Last Name</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.lastName} onChange={e => handleClientChange({ lastName: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Phone</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.phone} onChange={e => handleClientChange({ phone: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Secondary Phone</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.secondaryPhone || ''} onChange={e => handleClientChange({ secondaryPhone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Email</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.email} onChange={e => handleClientChange({ email: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Secondary Email</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.secondaryEmail || ''} onChange={e => handleClientChange({ secondaryEmail: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Address</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.address} onChange={e => handleClientChange({ address: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Secondary Address</label>
                  <input className="w-full bg-transparent text-white font-black outline-none text-sm" value={localJob.client.secondaryAddress || ''} onChange={e => handleClientChange({ secondaryAddress: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Client Notes</label>
              <textarea className="w-full bg-transparent text-white font-black outline-none text-sm h-24 resize-none" value={localJob.client.notes || ''} onChange={e => handleClientChange({ notes: e.target.value })} />
            </div>
            <button onClick={() => setIsEditingClient(false)} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black text-[12px] uppercase tracking-widest active:scale-95 shadow-2xl">Save Changes</button>
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

              {/* SCHEDULE BUTTON AT TOP */}
              <div className="relative">
                <button 
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="px-6 py-2.5 bg-blue-600/10 text-blue-500 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-blue-500/20 flex items-center space-x-3 active:scale-95 transition-all"
                >
                  <CalendarIcon size={14} />
                  <span>{localJob.scheduledDate} @ {localJob.scheduledTime}</span>
                </button>
                {showCalendar && (
                  <div className="absolute top-full left-0 mt-3 w-[400px] bg-[#1F2937] border border-white/10 rounded-[2.5rem] p-8 z-[300] shadow-2xl animate-in zoom-in-95 space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-black text-white uppercase tracking-widest">Select Date & Time</h4>
                      <button onClick={() => setShowCalendar(false)} className="p-2 text-gray-500 hover:text-white"><X size={20} /></button>
                    </div>
                    
                    {/* 4 WEEK DATE PICKER */}
                    <div className="grid grid-cols-7 gap-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-hide">
                      {Array.from({ length: 28 }).map((_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() + i);
                        const dateStr = d.toISOString().split('T')[0];
                        const isSelected = calendarDate === dateStr;
                        return (
                          <button 
                            key={dateStr} 
                            onClick={() => setCalendarDate(dateStr)}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center border transition-all active:scale-90 ${isSelected ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/5 text-gray-500 hover:text-white'}`}
                          >
                            <span className="text-[6px] font-black uppercase">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <span className="text-xs font-black">{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* TIME PICKER */}
                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
                      {TIME_SLOTS.map(time => {
                        const taken = isTimeSlotTaken(calendarDate, time);
                        const isCurrent = localJob.scheduledDate === calendarDate && localJob.scheduledTime === time;
                        return (
                          <button 
                            key={time} 
                            disabled={taken}
                            onClick={() => {
                              handleLocalChange({ scheduledDate: calendarDate, scheduledTime: time });
                              setShowCalendar(false);
                            }}
                            className={`py-4 rounded-xl text-[10px] font-black uppercase border transition-all active:scale-95 ${isCurrent ? 'bg-blue-600 border-blue-400 text-white' : taken ? 'bg-red-600/20 border-red-600/30 text-red-500 cursor-not-allowed' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
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
            
            {/* SIDEBAR: CLIENT, APPLIANCE, MESSAGES */}
            <div className="lg:col-span-4 flex flex-col space-y-8">
              
              {/* CLIENT INFO CARD - NEW LAYOUT */}
              <section className="bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full -mr-16 -mt-16" />
                
                <div className="flex justify-between items-start relative z-10">
                  <div className="space-y-1">
                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
                      Martin Eden
                    </h3>
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em]">System not in operation</p>
                  </div>
                  <button 
                    onClick={() => setIsEditingClient(true)}
                    className="p-3 bg-white/5 text-gray-400 rounded-xl hover:bg-white hover:text-slate-900 transition-all active:scale-90 flex items-center space-x-2"
                  >
                    <Edit2 size={16} />
                    <span className="text-[10px] font-black uppercase">Edit Records</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 py-4 border-y border-white/5">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl overflow-hidden border border-white/10 shrink-0">
                    <img src={localJob.client.photo || `https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" alt="Client" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-white uppercase truncate">{localJob.client.lastName}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Node ID: {localJob.jobNumber}</p>
                  </div>
                </div>

                {/* TABS FOR ACTIONS - LINE LAYOUT */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-3 border-b border-white/5 group">
                    <div className="flex items-center space-x-3">
                      <Phone size={14} className="text-blue-500" />
                      <span className="text-[11px] font-black text-white uppercase tracking-widest">{localJob.client.phone}</span>
                    </div>
                    <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => window.location.href = `tel:${localJob.client.phone}`} className="p-2 text-gray-500 hover:text-blue-500 transition-colors"><Phone size={14} /></button>
                      <button onClick={() => copyToClipboard(localJob.client.phone)} className="p-2 text-gray-500 hover:text-blue-500 transition-colors"><Copy size={14} /></button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-white/5 group">
                    <div className="flex items-center space-x-3">
                      <Mail size={14} className="text-blue-500" />
                      <span className="text-[11px] font-black text-white uppercase tracking-widest truncate max-w-[200px]">{localJob.client.email}</span>
                    </div>
                    <button onClick={() => copyToClipboard(localJob.client.email)} className="p-2 text-gray-500 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"><Copy size={14} /></button>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-white/5 group">
                    <div className="flex items-center space-x-3">
                      <MapPin size={14} className="text-blue-500" />
                      <span className="text-[11px] font-black text-white uppercase tracking-widest truncate max-w-[200px]">{localJob.client.address}</span>
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => copyToClipboard(localJob.client.address)} className="p-2 text-gray-500 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"><Copy size={14} /></button>
                      <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localJob.client.address)}`)} className="p-2 bg-blue-600/10 text-blue-500 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Navigation size={14} /></button>
                    </div>
                  </div>
                </div>
              </section>

              {/* APPLIANCE HUB */}
              <section className="bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 space-y-6 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Appliance</h3>
                  <div className="flex space-x-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" />
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-90"><Camera size={14} /></button>
                  </div>
                </div>

                {/* PHOTO SPACE */}
                <div className="w-full aspect-video bg-white/5 rounded-3xl overflow-hidden border border-white/10 shadow-inner flex items-center justify-center group relative text-center">
                  {localJob.photos && localJob.photos.length > 0 ? (
                    <img src={localJob.photos[0]} className="w-full h-full object-cover" alt="Appliance" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-700">
                      <ImageIcon size={32} className="mb-2 opacity-20" />
                      <span className="text-[8px] font-black uppercase tracking-widest">No Visual Data</span>
                    </div>
                  )}
                  <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Plus size={24} className="text-white" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full bg-white/5 p-4 rounded-2xl border border-white/5 text-left active:scale-95 transition-all">
                      <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Type</label>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase truncate">{localJob.appliance.type}</span>
                        <ChevronDown size={12} className="text-gray-700" />
                      </div>
                    </button>
                    {showTypePicker && (
                      <div className="absolute top-full left-0 w-64 mt-2 p-4 bg-[#1F2937] border border-white/10 rounded-3xl z-[300] shadow-2xl grid grid-cols-2 gap-2 animate-in zoom-in-95">
                        {APPLIANCE_ICONS.map(t => (
                          <button key={t.id} onClick={() => { handleApplianceChange({ type: t.id as any }); setShowTypePicker(false); }} className={`p-4 rounded-xl flex flex-col items-center justify-center space-y-2 border transition-all active:scale-95 ${localJob.appliance.type === t.id ? 'bg-blue-600 text-white border-blue-400' : 'bg-white/5 text-gray-500 border-white/5 hover:text-gray-300'}`}>
                            <t.icon size={18} />
                            <span className="text-[6px] font-black uppercase text-center leading-tight">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full bg-white/5 p-4 rounded-2xl border border-white/5 text-left active:scale-95 transition-all">
                      <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Brand</label>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-blue-500 uppercase truncate">{localJob.appliance.brand || 'Unknown'}</span>
                        <ChevronDown size={12} className="text-gray-700" />
                      </div>
                    </button>
                    {showBrandPicker && (
                      <div className="absolute top-full right-0 w-56 mt-2 p-4 bg-[#1F2937] border border-white/10 rounded-3xl z-[300] shadow-2xl max-h-[300px] overflow-y-auto scrollbar-hide animate-in zoom-in-95">
                        {BRANDS.map(b => (
                          <button key={b} onClick={() => { handleApplianceChange({ brand: b }); setShowBrandPicker(false); }} className="w-full px-4 py-3 text-[10px] font-black text-gray-300 hover:bg-blue-600 hover:text-white rounded-xl text-left uppercase transition-all mb-1 active:scale-95">{b}</button>
                        ))}
                        <button onClick={() => setShowCustomBrandInput(true)} className="w-full px-4 py-3 text-[10px] font-black text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl text-left uppercase transition-all active:scale-95 border border-blue-500/20 mt-2">Add Custom Brand</button>
                        {showCustomBrandInput && (
                          <div className="p-2 mt-2 space-y-2">
                            <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none" placeholder="Enter brand..." value={customBrand} onChange={e => setCustomBrand(e.target.value)} />
                            <button onClick={() => { if(customBrand) { handleApplianceChange({ brand: customBrand }); setShowBrandPicker(false); setShowCustomBrandInput(false); setCustomBrand(''); } }} className="w-full bg-blue-600 text-white py-2 rounded-lg text-[8px] font-black uppercase">Save Brand</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Model Number</label>
                    <input className="w-full bg-transparent text-xs font-black text-white uppercase outline-none" value={localJob.appliance.modelNumber || ''} onChange={e => handleApplianceChange({ modelNumber: e.target.value })} placeholder="MANUAL INPUT" />
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Serial Number</label>
                    <input className="w-full bg-transparent text-xs font-black text-white uppercase outline-none" value={localJob.appliance.serialNumber || ''} onChange={e => handleApplianceChange({ serialNumber: e.target.value })} placeholder="MANUAL INPUT" />
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <label className="text-[7px] font-black text-gray-600 uppercase block mb-1 tracking-widest">Part Weight</label>
                    <input className="w-full bg-transparent text-xs font-black text-white uppercase outline-none" value={localJob.appliance.partWeight || ''} onChange={e => handleApplianceChange({ partWeight: e.target.value })} placeholder="E.G. 12.5 LBS" />
                  </div>
                </div>
              </section>

              {/* MESSAGE HISTORY - MOVED TO SIDEBAR */}
              <section className="bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 flex flex-col flex-1 min-h-[400px] shadow-2xl">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em] mb-6 flex items-center">
                  <MessageSquare size={16} className="mr-3 text-blue-500" /> 
                  Message History
                </h3>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                  {localJob.messages && localJob.messages.length > 0 ? (
                    localJob.messages.map(msg => (
                      <div key={msg.id} className={`flex flex-col ${msg.sender === 'technician' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] p-4 rounded-2xl text-[11px] font-medium leading-relaxed ${msg.sender === 'technician' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/5 text-gray-300 rounded-tl-none'}`}>
                          {msg.content}
                        </div>
                        <span className="text-[7px] font-black text-gray-700 uppercase mt-1 tracking-widest">{msg.timestamp}</span>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <MessageSquare size={32} className="mb-2" />
                      <p className="text-[8px] font-black uppercase tracking-widest">No Transmissions</p>
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-6 border-t border-white/5">
                   <div className="bg-white/5 rounded-2xl p-4 flex items-center">
                      <input className="flex-1 bg-transparent text-[11px] font-medium text-white outline-none placeholder:text-gray-700" placeholder="Type transmission..." />
                      <button className="p-2 text-blue-500 hover:text-white transition-colors"><Send size={16} /></button>
                   </div>
                </div>
              </section>
            </div>

            {/* MAIN OPERATIONAL HUB */}
            <div className="lg:col-span-8 flex flex-col space-y-8">
              
              {/* INVOICE & BILLING */}
              <div className="bg-white text-slate-900 rounded-[4rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                <div className="h-3 bg-blue-600" />
                <div className="p-12 flex flex-col space-y-8">
                  <header className="flex justify-between items-start">
                    <div>
                       <h3 className="text-5xl font-black uppercase tracking-tighter leading-none mb-4">{localJob.client.firstName}<br/>{localJob.client.lastName}</h3>
                       <div className="flex items-center space-x-4">
                          <span className="text-[9px] font-black text-blue-600 uppercase tracking-[0.4em]">Node ID: {localJob.jobNumber}</span>
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">• {localJob.scheduledDate}</span>
                       </div>
                    </div>
                    <div className="text-right flex items-center space-x-6">
                       <div className="text-left"><h4 className="text-4xl font-black uppercase tracking-tighter leading-none">Salem AI</h4><p className="text-[9px] font-black text-blue-500 uppercase mt-1 tracking-widest">Fleet Operations</p></div>
                       <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><Building2 size={28} /></div>
                    </div>
                  </header>

                  <div className="py-6 border-y border-slate-100 flex items-center justify-between gap-4">
                    {[
                      { id: 'labor', label: 'Labor', icon: Hammer, color: 'text-blue-600' },
                      { id: 'part', label: 'Hardware', icon: Package, color: 'text-amber-600' },
                      { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-600' },
                      { id: 'maintenance', label: 'Maint', icon: Wrench, color: 'text-indigo-600' }
                    ].map(btn => (
                      <button key={btn.id} onClick={() => setBillingPrompt({ open: true, type: btn.id as any, desc: '', price: '' })} className="flex-1 py-6 rounded-3xl border border-slate-50 bg-slate-50/50 hover:bg-slate-900 hover:text-white transition-all flex flex-col items-center space-y-2 active:scale-95 shadow-sm group">
                         <btn.icon size={20} className={`${btn.color} group-hover:text-white transition-colors`} />
                         <span className="text-[8px] font-black uppercase tracking-widest">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    {localJob.lineItems.map(item => (
                      <div key={item.id} className="flex items-center space-x-6 py-6 px-8 bg-slate-50/80 rounded-3xl border border-slate-100 shadow-sm group">
                         <div className="flex-1 min-w-0">
                            <p className="text-xl font-black text-slate-900 uppercase truncate leading-none mb-1">{item.description}</p>
                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">{item.type}</span>
                         </div>
                         <div className="flex items-center space-x-8">
                            <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">${item.unitPrice}</span>
                            <button onClick={() => handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== item.id) })} className="p-3 text-slate-200 hover:text-red-500 active:scale-90 transition-colors group-hover:text-slate-400"><Trash2 size={20} /></button>
                         </div>
                      </div>
                    ))}
                  </div>

                  <footer className="pt-8 border-t border-slate-100 flex justify-between items-end">
                    <div className="w-1/2">
                       <button 
                        onClick={() => setPaymentStep('split')}
                        disabled={localJob.paymentStatus === 'paid'}
                        className={`w-full py-8 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl transition-all flex items-center justify-center active:scale-95 ${localJob.paymentStatus === 'paid' ? 'bg-green-600 text-white shadow-green-500/20' : 'bg-slate-900 text-white hover:bg-blue-600 shadow-slate-900/40'}`}
                       >
                         {localJob.paymentStatus === 'paid' ? <><CheckCircle2 size={24} className="mr-4" /> Settled</> : <><CreditCard size={24} className="mr-4" /> Finalize Settlement</>}
                       </button>
                    </div>
                    <div className="text-right">
                       <p className="text-[14px] font-black uppercase text-blue-600 mb-2 tracking-[0.2em]">Total</p>
                       <p className="text-7xl font-black text-slate-900 tracking-tighter leading-none tabular-nums">${subtotal}</p>
                    </div>
                  </footer>
                </div>
              </div>

              {/* OPERATIONAL LOGS */}
              <div className="grid grid-cols-2 gap-8 shrink-0">
                 <div className="bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 flex flex-col space-y-6 shadow-2xl">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center"><ClipboardList size={16} className="mr-3 text-blue-500" /> Intake</h3>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-2xl p-6 text-sm font-medium text-gray-400 italic shadow-inner overflow-y-auto scrollbar-hide">"{localJob.complaint}"</div>
                 </div>
                 <div className="bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 flex flex-col space-y-6 shadow-2xl">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center"><Stethoscope size={16} className="mr-3 text-green-500" /> Diagnostic</h3>
                    <textarea 
                      className="flex-1 bg-[#111827] border border-white/5 rounded-2xl p-6 text-sm font-black text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all shadow-xl placeholder:text-gray-800"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input findings..."
                    />
                 </div>
              </div>

              {/* SCHEDULE SECTION - REMOVED FROM BOTTOM, NOW AT TOP */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">Status</p>
                    <p className="text-sm font-black text-amber-500 uppercase">{localJob.status}</p>
                  </div>
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                    <Stethoscope size={20} />
                  </div>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">Part Weight</p>
                    <p className="text-sm font-black text-blue-500 uppercase">{localJob.appliance.partWeight || '0.0 LBS'}</p>
                  </div>
                  <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500">
                    <Package size={20} />
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
