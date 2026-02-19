
import React, { useState, useEffect } from 'react';
import { 
  X, MapPin, Phone, Mail, Wrench, Trash2, 
  Save, Package, Clock, User, Refrigerator, Stethoscope, 
  Camera, Activity, Plus, Smartphone, 
  ChevronLeft, CheckCircle2, ShieldCheck,
  PenTool, CreditCard, Zap, Thermometer, Droplets, Microwave, Settings,
  ClipboardList, AirVent, Bot,
  Globe, Building2, Navigation, ChevronRight, MessageSquare, Image as ImageIcon,
  Calendar as CalIcon, AlertTriangle, Edit2, Check, LayoutGrid, Pen, DollarSign,
  Briefcase, Hammer, PhoneIncoming, PhoneOutgoing, PhoneMissed, Shield
} from 'lucide-react';
import { Job, LineItem, STATUS_COLORS, Appliance, JobStatus, Client } from '../types';
import { useAppStore } from '../store';

const APPLIANCE_ICONS = [
  { id: 'Refrigerator', icon: Refrigerator, label: 'Fridge' },
  { id: 'Washer', icon: Zap, label: 'Washer' },
  { id: 'Dryer', icon: Thermometer, label: 'Dryer' },
  { id: 'Oven', icon: Settings, label: 'Oven' },
  { id: 'Dishwasher', icon: Droplets, label: 'Dishwasher' },
  { id: 'Microwave', icon: Microwave, label: 'Microwave' },
  { id: 'HVAC', icon: AirVent, label: 'HVAC' },
  { id: 'Other', icon: Wrench, label: 'Other' }
];

const INITIAL_BRANDS = ['Whirlpool', 'GE', 'KitchenAid', 'Maytag', 'Frigidaire', 'Samsung', 'LG', 'Wolf', 'Sub-Zero', 'Bosch'];

const WARRANTY_OPTIONS = [
  { id: 'none', label: 'No Warranty' },
  { id: '1m', label: '1 Month Warranty' },
  { id: '3m', label: '3 Months Warranty' },
  { id: '6m', label: '6 Months Warranty' },
  { id: '1y', label: '1 Year Warranty' },
];

const TIME_WINDOWS = [
  { start: '09:00', end: '11:00', label: '09:00 - 11:00' },
  { start: '11:00', end: '14:00', label: '11:00 - 02:00' },
  { start: '14:00', end: '16:00', label: '02:00 - 04:00' },
  { start: '16:00', end: '18:00', label: '04:00 - 06:00' },
];

const STATUS_OPTIONS: { id: JobStatus; label: string }[] = [
  { id: 'diagnosed', label: 'Diagnosed' },
  { id: 'waitingParts', label: 'Part Waiting' },
  { id: 'completed', label: 'Completed' },
  { id: 'enRoute', label: 'En Route' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'cancelled', label: 'Cancelled' }
];

export const JobDetail: React.FC<{ job: Job; onClose: () => void }> = ({ job: initialJob, onClose }) => {
  const { updateJob, jobs, callHistory } = useAppStore();
  const [localJob, setLocalJob] = useState<Job>({ ...initialJob });
  const [isModified, setIsModified] = useState(false);
  
  // UI States
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showWarrantyPicker, setShowWarrantyPicker] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [addingItemType, setAddingItemType] = useState<LineItem['type'] | null>(null);
  const [newItemDetails, setNewItemDetails] = useState({ description: '', price: 0 });

  // Payment Workflow States
  const [paymentStep, setPaymentStep] = useState<'idle' | 'options' | 'signature'>('idle');
  const [paymentAmountType, setPaymentAmountType] = useState<'full' | 'half'>('full');
  const [paymentMethod, setPaymentMethod] = useState<'tap' | 'card' | 'check' | 'cash' | null>(null);
  const [tipPercentage, setTipPercentage] = useState<number | null>(null);

  // Temporary state for client editing
  const [editClientData, setEditClientData] = useState<Client>({ ...localJob.client });

  useEffect(() => { 
    setLocalJob({ ...initialJob, warranty: initialJob.warranty || 'none' }); 
    setEditClientData({ ...initialJob.client });
    setIsModified(false); 
  }, [initialJob.id]);

  const handleLocalChange = (updates: Partial<Job>) => {
    setLocalJob(prev => ({ ...prev, ...updates }));
    setIsModified(true);
  };

  const handleApplianceChange = (updates: Partial<Appliance>) => {
    handleLocalChange({ appliance: { ...localJob.appliance, ...updates } });
  };

  const subtotal = localJob.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const handleSave = () => {
    updateJob({ ...localJob, totalAmount: subtotal });
    setIsModified(false);
  };

  const handleStartNavigation = () => {
    const addr = encodeURIComponent(localJob.client.address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank');
  };

  const checkConflict = (date: string, time: string) => {
    return jobs.some(j => j.id !== localJob.id && j.scheduledDate === date && j.scheduledTime === time);
  };

  const saveClientEdits = () => {
    handleLocalChange({ client: { ...editClientData } });
    setIsEditingClient(false);
  };

  // Filter call history relevant to this client
  const relevantCalls = callHistory.filter(c => c.from.includes(localJob.client.lastName) || localJob.client.phone.includes(c.phone));
  const clientMessages = localJob.messages || [];

  return (
    <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300 overflow-hidden">
      
      <div className="bg-[#111827] w-full max-w-[1600px] h-full max-h-[96vh] md:rounded-[4rem] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* COMMAND HEADER */}
        <header className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-[#111827]/80 z-50 shrink-0">
          <div className="flex items-center space-x-6">
            <button onClick={onClose} className="p-4 bg-[#1F2937] rounded-2xl text-gray-400 hover:text-white transition-all"><ChevronLeft size={24} /></button>
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">System Record <span className="text-blue-500">#{localJob.jobNumber}</span></h2>
              
              {/* STATUS PICKER */}
              <div className="relative">
                <button 
                  onClick={() => setShowStatusPicker(!showStatusPicker)}
                  className="px-6 py-2.5 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 flex items-center space-x-3 transition-all hover:bg-white/10"
                  style={{ color: STATUS_COLORS[localJob.status] }}
                >
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: STATUS_COLORS[localJob.status] }} />
                  <span>{localJob.status}</span>
                </button>
                {showStatusPicker && (
                  <div className="absolute top-full left-0 mt-3 w-64 bg-[#1F2937] border border-white/10 rounded-[1.5rem] shadow-2xl z-[200] p-2 animate-in slide-in-from-top-2">
                    {STATUS_OPTIONS.map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => { handleLocalChange({ status: s.id }); setShowStatusPicker(false); }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${localJob.status === s.id ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-gray-400'}`}
                      >
                        <span>{s.label}</span>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.id] }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* QUICK SCHEDULE ACCESS */}
              <button 
                onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                className="px-6 py-2.5 bg-blue-600/10 text-blue-500 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-blue-500/10 hover:bg-blue-600/20 transition-all flex items-center space-x-3"
              >
                <CalIcon size={14} />
                <span>{localJob.scheduledDate} @ {localJob.scheduledTime}</span>
              </button>
            </div>
          </div>
          <button onClick={handleSave} className={`px-10 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${isModified ? 'bg-blue-600 text-white shadow-xl' : 'bg-white/5 text-gray-700'}`}>
            <Save size={16} className="mr-3 inline" /> {isModified ? 'Sync Changes' : 'Ledger Synced'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            
            {/* LEFT COLUMN: DOSSIER, TECH HUB, COMMUNICATION HISTORY (4/12) */}
            <div className="lg:col-span-4 flex flex-col space-y-10">
              
              {/* 1. CLIENT DOSSIER */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner relative group shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <User size={18} className="text-blue-500" />
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Client Dossier</h3>
                  </div>
                  <button 
                    onClick={() => setIsEditingClient(true)}
                    className="p-3 bg-white/5 text-gray-500 hover:text-white hover:bg-blue-600 rounded-xl transition-all"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start space-x-6">
                    <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl shrink-0">
                      <img src={`https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" alt="Client Avatar" />
                    </div>
                    <div className="pt-2">
                      <p className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{localJob.client.firstName}<br/>{localJob.client.lastName}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-2 bg-white/[0.02] px-4 py-3 rounded-2xl border border-white/5">
                      <div className="flex items-center space-x-3">
                        <Phone size={14} className="text-blue-500" />
                        <span className="text-[11px] font-black text-gray-300 tracking-widest select-all">{localJob.client.phone}</span>
                      </div>
                      {localJob.client.secondaryPhone && (
                        <div className="flex items-center space-x-3 opacity-60">
                          <Phone size={14} className="text-gray-500" />
                          <span className="text-[11px] font-black text-gray-400 tracking-widest select-all">{localJob.client.secondaryPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5">
                    <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-3">Geographic Location</p>
                    <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 group/addr hover:border-blue-500/20 transition-all">
                       <p className="text-sm font-bold text-gray-300 leading-relaxed select-all cursor-text group-hover/addr:text-white">
                         {localJob.client.address}
                       </p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleStartNavigation}
                  className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border border-blue-500/20 py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center space-x-4 shadow-xl active:scale-95"
                >
                  <Navigation size={18} />
                  <span>Start Navigation</span>
                </button>
              </section>

              {/* 2. TECHNICAL HUB (-20% Height Adjust) */}
              <section className="bg-[#0F172A] p-6 rounded-[3rem] border border-white/5 space-y-4 shadow-inner shrink-0">
                <div className="flex items-center space-x-4">
                  <ShieldCheck size={18} className="text-blue-500" />
                  <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Technical Hub</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-1 pl-2">Asset Class</p>
                    <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full flex items-center justify-between text-[11px] font-black text-white uppercase bg-white/5 p-3 rounded-xl border border-white/5 group">
                      <div className="flex items-center space-x-3">
                        <Refrigerator size={14} className="text-blue-500" />
                        <span className="truncate">{localJob.appliance.type}</span>
                      </div>
                    </button>
                  </div>
                  <div className="relative">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-1 pl-2">Manufacturer</p>
                    <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full flex items-center justify-between text-[11px] font-black text-blue-500 uppercase bg-blue-500/5 p-3 rounded-xl border border-blue-500/10 group">
                      <span className="truncate">{localJob.appliance.brand || 'Elite Unit'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5 focus-within:border-blue-500/30 transition-all">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-0.5">Model Index</p>
                    <input className="w-full bg-transparent text-sm font-black text-white uppercase outline-none placeholder:text-gray-800" value={localJob.appliance.modelNumber || ''} onChange={e => handleApplianceChange({ modelNumber: e.target.value })} placeholder="MODEL#" />
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5 focus-within:border-blue-500/30 transition-all">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-0.5">Serial Index</p>
                    <input className="w-full bg-transparent text-sm font-black text-white uppercase outline-none placeholder:text-gray-800" value={localJob.appliance.serialNumber || ''} onChange={e => handleApplianceChange({ serialNumber: e.target.value })} placeholder="SERIAL#" />
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-white/5">
                   <div className="flex items-center justify-between px-1">
                      <h4 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.4em]">Hub Data</h4>
                      <Camera size={12} className="text-blue-500" />
                   </div>
                   <div className="grid grid-cols-4 gap-2">
                      {localJob.photos && localJob.photos.slice(0, 3).map((photo, idx) => (
                        <div key={idx} className="aspect-square bg-[#111827] rounded-xl border border-white/10 overflow-hidden shadow-lg">
                           <img src={photo} className="w-full h-full object-cover" alt={`Asset ${idx}`} />
                        </div>
                      ))}
                      <button className="aspect-square bg-white/[0.02] rounded-xl border border-dashed border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
                         <Plus size={16} className="text-gray-700" />
                      </button>
                   </div>
                </div>
              </section>

              {/* 3. COMMUNICATION LEDGER (DYNAMICALLY EXPANDED TO BOTTOM) */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 flex flex-col flex-1 shadow-inner overflow-hidden min-h-[300px]">
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em] flex items-center">
                    <MessageSquare size={16} className="mr-3 text-blue-500" /> Communication Ledger
                  </h3>
                  <div className="bg-blue-600/10 px-3 py-1 rounded-full border border-blue-500/10">
                     <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{clientMessages.length + relevantCalls.length} Logs</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-6 min-h-0">
                  {/* Call Logs Integration */}
                  {relevantCalls.map(call => (
                    <div key={call.id} className="flex items-center space-x-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all group">
                       <div className={`p-3 rounded-xl ${call.type === 'incoming' ? 'bg-green-600/10 text-green-500' : 'bg-blue-600/10 text-blue-500'}`}>
                          {call.type === 'incoming' ? <PhoneIncoming size={14} /> : <PhoneOutgoing size={14} />}
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white uppercase tracking-tighter truncate">{call.type === 'incoming' ? 'Incoming System Call' : 'Outgoing Operator Call'}</p>
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">{call.timestamp} • {call.duration || '0:00'}</p>
                       </div>
                    </div>
                  ))}

                  {/* Chat Bubbles */}
                  {clientMessages.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.sender === 'client' ? 'items-start' : 'items-end'}`}>
                       <div className={`max-w-[90%] p-4 rounded-[1.8rem] text-[12px] leading-relaxed font-medium shadow-xl ${m.sender === 'client' ? 'bg-[#111827] text-gray-300 border border-white/5 rounded-bl-none' : 'bg-blue-600 text-white rounded-br-none'}`}>
                         {m.content}
                       </div>
                       <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest mt-2 px-2">{m.timestamp}</span>
                    </div>
                  ))}

                  {clientMessages.length === 0 && relevantCalls.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 py-10 space-y-4">
                      <Bot size={48}/><p className="text-[10px] font-black uppercase tracking-widest">Awaiting Engagement</p>
                    </div>
                  )}
                </div>

                <div className="relative mt-8 shrink-0">
                  <input className="w-full bg-[#111827] border border-white/5 rounded-2xl px-6 py-4 text-xs font-bold text-white outline-none focus:border-blue-500 shadow-inner" placeholder="Initiate comms..." />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-xl shadow-xl active:scale-90 transition-transform"><Plus size={16}/></button>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: INVOICE & LOGS (8/12) */}
            <div className="lg:col-span-8 flex flex-col space-y-12 h-full">
              
              {/* WHITE EXTENDED INVOICE AREA */}
              <div className="bg-white text-slate-900 rounded-[4rem] shadow-2xl flex flex-col min-h-[1200px] overflow-hidden relative border border-slate-200 shrink-0">
                <div className="h-4 bg-blue-600" />
                
                <div className="p-20 flex flex-col h-full space-y-16">
                  
                  {/* INVOICE HEADER */}
                  <header className="flex justify-between items-start pt-6">
                    <div className="flex-1">
                       <h3 className="text-6xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-6">
                         {localJob.client.firstName}<br/>{localJob.client.lastName}
                       </h3>
                       <div className="space-y-2">
                         <div className="flex items-center text-slate-400">
                           <Phone size={14} className="mr-3" />
                           <p className="text-[11px] font-bold uppercase tracking-widest">{localJob.client.phone}</p>
                         </div>
                         <div className="flex items-start text-slate-400">
                           <MapPin size={14} className="mr-3 mt-0.5" />
                           <p className="text-[11px] font-bold uppercase tracking-widest leading-relaxed max-w-xs">{localJob.client.address}</p>
                         </div>
                         <div className="flex items-center space-x-6 pt-4">
                           <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.5em]">Record #{localJob.jobNumber}</p>
                           
                           {/* WARRANTY INDICATOR IN INVOICE */}
                           <div className="relative">
                             <button 
                               onClick={() => setShowWarrantyPicker(!showWarrantyPicker)}
                               className="flex items-center space-x-2 text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] bg-slate-100 px-4 py-2 rounded-full hover:bg-slate-200 transition-all border border-slate-200"
                             >
                                <Shield size={12} className="text-blue-500" />
                                <span>{WARRANTY_OPTIONS.find(o => o.id === localJob.warranty)?.label || 'No Warranty'}</span>
                             </button>
                             {showWarrantyPicker && (
                               <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-3xl shadow-2xl z-[300] p-2 animate-in slide-in-from-top-2">
                                 {WARRANTY_OPTIONS.map(opt => (
                                   <button 
                                     key={opt.id}
                                     onClick={() => { handleLocalChange({ warranty: opt.id }); setShowWarrantyPicker(false); }}
                                     className={`w-full text-left px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${localJob.warranty === opt.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
                                   >
                                     {opt.label}
                                   </button>
                                 ))}
                               </div>
                             )}
                           </div>
                         </div>
                       </div>
                    </div>

                    <div className="text-right flex flex-col items-end flex-1">
                       <div className="flex items-center space-x-6">
                          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl"><Building2 size={36} /></div>
                          <div className="text-left">
                            <h4 className="text-5xl font-black uppercase tracking-tighter text-slate-900 leading-none">Salem Online</h4>
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mt-2">Enterprise Infrastructure Node</p>
                          </div>
                       </div>
                       <div className="mt-8 space-y-2 opacity-40">
                         <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">salem-online.ai</p>
                         <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">(888) 777-0099</p>
                       </div>
                    </div>
                  </header>

                  {/* BILLING ACTION ROW */}
                  <div className="py-10 border-y-2 border-slate-100 flex items-center justify-between gap-6 px-4 shrink-0">
                    {[
                      { id: 'labor', label: 'Labor Ops', icon: Hammer, color: 'text-blue-600' },
                      { id: 'part', label: 'Hardware', icon: Package, color: 'text-amber-600' },
                      { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-600' },
                      { id: 'maintenance', label: 'Maint.', icon: Wrench, color: 'text-indigo-600' },
                      { id: 'installation', label: 'Install', icon: Zap, color: 'text-green-600' }
                    ].map((btn) => (
                      <button 
                        key={btn.id}
                        onClick={() => setAddingItemType(btn.id as LineItem['type'])}
                        className="flex-1 py-6 px-2 rounded-3xl border-2 border-slate-100 bg-slate-50/30 hover:bg-slate-900 hover:text-white transition-all flex flex-col items-center justify-center space-y-3 group shadow-sm active:scale-95"
                      >
                         <btn.icon size={28} className={`${btn.color} group-hover:text-white transition-colors`} />
                         <span className="text-[10px] font-black uppercase tracking-widest">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* SPACIOUS LINE ITEMS TABLE */}
                  <div className="flex-1 flex flex-col space-y-10 min-h-0">
                    <div className="flex text-[13px] font-black uppercase tracking-[0.4em] text-slate-300 px-10 shrink-0">
                      <span className="flex-1">Strategic Itemization</span>
                      <span className="w-48 text-right">Settlement Amount</span>
                    </div>
                    
                    <div className="space-y-4 flex-1 overflow-y-auto pr-4 scrollbar-hide min-h-0">
                      {localJob.lineItems.map(item => (
                        <div key={item.id} className="flex items-center space-x-12 py-8 px-10 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 group transition-all hover:bg-slate-100 shadow-sm">
                           <div className="flex-1 min-w-0">
                              <p className="text-2xl font-black text-slate-900 uppercase truncate leading-none mb-2 tracking-tight">{item.description}</p>
                              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.4em]">{item.type}</span>
                           </div>
                           <div className="flex items-center space-x-12">
                              <span className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter">${item.unitPrice.toLocaleString()}</span>
                              <button onClick={() => handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== item.id) })} className="p-4 text-slate-200 hover:text-red-500 transition-colors hover:scale-110"><Trash2 size={24} /></button>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* INVOICE FOOTER */}
                  <footer className="pt-16 border-t-2 border-slate-100 mt-auto flex justify-between items-end shrink-0">
                    <div className="w-2/5">
                       <button onClick={() => setPaymentStep('options')} className="w-full bg-slate-900 text-white py-10 rounded-[3.5rem] font-black uppercase tracking-[0.5em] text-[16px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
                         <CreditCard size={32} className="mr-6" /> COMMENCE SETTLEMENT
                       </button>
                    </div>
                    <div className="text-right">
                       <p className="text-[18px] font-black uppercase tracking-[0.6em] text-blue-600 mb-6">Aggregate Settlement</p>
                       <p className="text-9xl font-black text-slate-900 tracking-tighter leading-none tabular-nums">${subtotal.toLocaleString()}</p>
                    </div>
                  </footer>
                </div>
              </div>

              {/* LOGS: COMPLAINT & DIAGNOSIS (+20% Height Adjust) */}
              <section className="grid grid-cols-2 gap-12 pb-12 shrink-0">
                 <div className="flex flex-col space-y-8 bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 shadow-2xl min-h-[450px]">
                    <div className="flex items-center space-x-6 px-4">
                       <div className="w-16 h-16 bg-blue-600/10 rounded-[1.8rem] flex items-center justify-center text-blue-500 border border-blue-500/20"><ClipboardList size={32} /></div>
                       <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Inbound Intake Report</h3>
                    </div>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[3.5rem] p-12 text-[16px] font-medium text-gray-400 italic shadow-inner overflow-y-auto scrollbar-hide leading-relaxed">
                      "{localJob.complaint}"
                    </div>
                 </div>
                 <div className="flex flex-col space-y-8 bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 shadow-2xl min-h-[450px]">
                    <div className="flex items-center space-x-6 px-4">
                       <div className="w-16 h-16 bg-green-600/10 rounded-[1.8rem] flex items-center justify-center text-green-500 border border-green-500/20"><Stethoscope size={32} /></div>
                       <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Operational Findings</h3>
                    </div>
                    <textarea 
                      className="flex-1 bg-[#111827] border border-white/5 rounded-[3.5rem] p-12 text-[18px] font-black text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all shadow-xl placeholder:text-gray-800"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input verified technical findings..."
                    />
                 </div>
              </section>

            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT WORKFLOW MODAL */}
      {paymentStep !== 'idle' && (
        <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-[#111827] w-full max-w-2xl rounded-[4rem] p-16 border border-white/10 space-y-12 shadow-2xl animate-in zoom-in-95 overflow-hidden">
            
            {paymentStep === 'options' ? (
              <>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black uppercase text-white tracking-[0.3em]">Operational Settlement</h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Select methodology and tranche</p>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                     <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-4">Amount Configuration</p>
                     <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => setPaymentAmountType('full')}
                          className={`p-6 rounded-[2.5rem] border transition-all text-left group ${paymentAmountType === 'full' ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/5'}`}
                        >
                           <p className={`text-[10px] font-black uppercase tracking-widest ${paymentAmountType === 'full' ? 'text-white' : 'text-gray-500'}`}>Full Settlement</p>
                           <p className="text-2xl font-black text-white mt-1">${subtotal.toLocaleString()}</p>
                        </button>
                        <button 
                          onClick={() => setPaymentAmountType('half')}
                          className={`p-6 rounded-[2.5rem] border transition-all text-left group ${paymentAmountType === 'half' ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/5'}`}
                        >
                           <p className={`text-[10px] font-black uppercase tracking-widest ${paymentAmountType === 'half' ? 'text-white' : 'text-gray-500'}`}>50% Deposit</p>
                           <p className="text-2xl font-black text-white mt-1">${(subtotal/2).toLocaleString()}</p>
                        </button>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-4">Payment Vector</p>
                     <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'tap', label: 'Tap to Pay', icon: Smartphone },
                          { id: 'card', label: 'Card', icon: CreditCard },
                          { id: 'check', label: 'Check', icon: Pen },
                          { id: 'cash', label: 'Cash', icon: DollarSign }
                        ].map(method => (
                          <button 
                            key={method.id}
                            onClick={() => setPaymentMethod(method.id as any)}
                            className={`p-6 rounded-3xl border transition-all flex flex-col items-center justify-center space-y-2 ${paymentMethod === method.id ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/5'}`}
                          >
                             <method.icon size={20} className={paymentMethod === method.id ? 'text-white' : 'text-blue-500'} />
                             <span className="text-[9px] font-black uppercase tracking-widest">{method.label}</span>
                          </button>
                        ))}
                     </div>
                  </div>
                </div>

                <div className="flex gap-8 pt-4">
                  <button onClick={() => setPaymentStep('idle')} className="flex-1 py-8 text-gray-600 font-black uppercase text-[12px] tracking-widest">Discard</button>
                  <button 
                    disabled={!paymentMethod}
                    onClick={() => setPaymentStep('signature')} 
                    className={`flex-1 py-8 rounded-[3rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all ${paymentMethod ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-800'}`}
                  >
                    Proceed to Authorization
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black uppercase text-white tracking-[0.3em]">Client Authorization</h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Sign below and select appreciation</p>
                </div>

                {/* Signature Pad Placeholder */}
                <div className="bg-white rounded-[3rem] h-[220px] relative overflow-hidden group border-4 border-slate-900 shadow-inner">
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                      <p className="text-slate-900 text-xl font-black uppercase tracking-[0.5em] italic">Electronic Signature Required</p>
                   </div>
                   <div className="absolute bottom-6 inset-x-10 border-t border-slate-200" />
                </div>

                {/* Tips Section */}
                <div className="space-y-4">
                   <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-4 text-center">Service Appreciation (Tips)</p>
                   <div className="flex items-center justify-center gap-4">
                      {[10, 15, 20, 0].map(val => (
                        <button 
                          key={val}
                          onClick={() => setTipPercentage(val)}
                          className={`px-8 py-5 rounded-2xl border transition-all font-black text-sm ${tipPercentage === val ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/5 text-gray-500'}`}
                        >
                           {val === 0 ? 'No Tip' : `${val}%`}
                        </button>
                      ))}
                   </div>
                </div>

                <div className="flex gap-8 pt-4">
                  <button onClick={() => setPaymentStep('options')} className="flex-1 py-8 text-gray-600 font-black uppercase text-[12px] tracking-widest">Back</button>
                  <button 
                    onClick={() => {
                      handleLocalChange({ status: 'completed', paymentStatus: 'paid' });
                      setPaymentStep('idle');
                    }} 
                    className="flex-1 bg-green-600 text-white py-8 rounded-[3rem] font-black uppercase tracking-widest shadow-[0_32px_64px_-16px_rgba(16,185,129,0.5)] active:scale-95 transition-transform"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ITEM ADD OVERLAY */}
      {addingItemType && (
        <div className="fixed inset-0 bg-black/95 z-[800] flex items-center justify-center p-4 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-[#111827] w-full max-w-lg rounded-[4rem] p-20 border border-white/10 space-y-12 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black uppercase text-white tracking-[0.3em] text-center">Append {addingItemType}</h3>
            <div className="space-y-8">
              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3 block">Service Summary</label>
                <input autoFocus className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-gray-800" placeholder="Summary..." value={newItemDetails.description} onChange={e => setNewItemDetails({...newItemDetails, description: e.target.value})} />
              </div>
              <div className="relative bg-white/5 p-10 rounded-[3rem] border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3 block">Settlement Value</label>
                <div className="flex items-center">
                  <span className="text-blue-500 text-6xl font-black mr-4">$</span>
                  <input type="number" className="w-full bg-transparent text-8xl font-black text-blue-500 outline-none" placeholder="0" value={newItemDetails.price} onChange={e => setNewItemDetails({...newItemDetails, price: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex gap-8">
              <button onClick={() => setAddingItemType(null)} className="flex-1 py-8 text-gray-600 font-black uppercase text-[14px] tracking-widest">Discard</button>
              <button onClick={() => {
                const item: LineItem = { id: Math.random().toString(), type: addingItemType, description: newItemDetails.description || addingItemType, quantity: 1, unitPrice: newItemDetails.price };
                handleLocalChange({ lineItems: [...localJob.lineItems, item] });
                setAddingItemType(null);
                setNewItemDetails({ description: '', price: 0 });
              }} className="flex-1 bg-blue-600 text-white py-8 rounded-[3rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-transform">Confirm Append</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
