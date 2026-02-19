
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, MapPin, Phone, Mail, Wrench, Trash2, 
  Save, Package, Clock, User, Refrigerator, Stethoscope, 
  Camera, Activity, Plus, Smartphone, 
  ChevronLeft, CheckCircle2, ShieldCheck,
  PenTool, CreditCard, Zap, Thermometer, Droplets, Microwave, Settings,
  ClipboardList, AirVent, Bot,
  Globe, Building2, Navigation, ChevronRight, MessageSquare, Image as ImageIcon,
  Calendar as CalIcon, AlertTriangle, Edit2, Check, LayoutGrid, Pen, DollarSign,
  Briefcase, Hammer
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
  const { updateJob, jobs } = useAppStore();
  const [localJob, setLocalJob] = useState<Job>({ ...initialJob });
  const [isModified, setIsModified] = useState(false);
  
  // UI States
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
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
    setLocalJob({ ...initialJob }); 
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

  const clientMessages = localJob.messages || [];

  return (
    <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300">
      
      <div className="bg-[#111827] w-full max-w-[1600px] h-full max-h-[96vh] md:rounded-[4rem] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* COMMAND HEADER */}
        <header className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-[#111827]/80 z-50">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* LEFT COLUMN: DOSSIER (Client, Technical, Communication) (4/12) */}
            <div className="lg:col-span-4 flex flex-col space-y-10">
              
              {/* 1. CLIENT DOSSIER (Editable) */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner relative group">
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
                  {/* Line 1: Name & Avatar */}
                  <div className="flex items-start space-x-6">
                    <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl shrink-0">
                      <img src={`https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" alt="Client Avatar" />
                    </div>
                    <div className="pt-2">
                      <p className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{localJob.client.firstName}<br/>{localJob.client.lastName}</p>
                    </div>
                  </div>
                  
                  {/* Line 2: Contact Matrix */}
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
                    <div className="flex flex-col gap-2 bg-white/[0.02] px-4 py-3 rounded-2xl border border-white/5">
                      <div className="flex items-center space-x-3">
                        <Mail size={14} className="text-blue-500" />
                        <span className="text-[11px] font-black text-gray-300 lowercase select-all truncate">{localJob.client.email}</span>
                      </div>
                      {localJob.client.secondaryEmail && (
                        <div className="flex items-center space-x-3 opacity-60">
                          <Mail size={14} className="text-gray-500" />
                          <span className="text-[11px] font-black text-gray-400 lowercase select-all truncate">{localJob.client.secondaryEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Line 3: Full Selectable Address */}
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

              {/* 2. TECHNICAL HUB */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner">
                <div className="flex items-center space-x-4">
                  <ShieldCheck size={18} className="text-blue-500" />
                  <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Technical Hub</h3>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="relative">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-2 pl-2">Asset Class</p>
                    <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full flex items-center justify-between text-[11px] font-black text-white uppercase bg-white/5 p-4 rounded-2xl border border-white/5 group">
                      <div className="flex items-center space-x-3">
                        <Refrigerator size={14} className="text-blue-500" />
                        <span className="truncate">{localJob.appliance.type}</span>
                      </div>
                      <ChevronRight size={12} className="text-gray-700 group-hover:text-white" />
                    </button>
                    {showTypePicker && (
                      <div className="absolute top-full left-0 mt-3 p-3 bg-[#1F2937] border border-white/10 rounded-2xl grid grid-cols-4 gap-2 z-[200] shadow-2xl w-64 animate-in zoom-in-95">
                        {APPLIANCE_ICONS.map(t => (
                          <button key={t.id} onClick={() => { handleApplianceChange({ type: t.id as any }); setShowTypePicker(false); }} className={`p-3 rounded-xl flex items-center justify-center transition-all ${localJob.appliance.type === t.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}><t.icon size={18} /></button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mb-2 pl-2">Manufacturer</p>
                    <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full flex items-center justify-between text-[11px] font-black text-blue-500 uppercase bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 group">
                      <span className="truncate">{localJob.appliance.brand || 'Elite Unit'}</span>
                      <ChevronRight size={12} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
                    </button>
                    {showBrandPicker && (
                      <div className="absolute top-full right-0 mt-3 p-2 bg-[#1F2937] border border-white/10 rounded-2xl z-[200] shadow-2xl w-56 max-h-64 overflow-y-auto scrollbar-hide flex flex-col space-y-1">
                        {INITIAL_BRANDS.map(b => (
                          <button key={b} onClick={() => { handleApplianceChange({ brand: b }); setShowBrandPicker(false); }} className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase hover:bg-white/10 text-gray-300 rounded-xl">{b}</button>
                        ))}
                        <button className="w-full text-center py-4 text-[9px] font-black uppercase text-blue-500 border-t border-white/5 mt-2 hover:bg-white/5">+ Custom Brand</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-1 focus-within:border-blue-500/30 transition-all">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Model Index</p>
                    <input className="w-full bg-transparent text-lg font-black text-white uppercase outline-none placeholder:text-gray-800" value={localJob.appliance.modelNumber || ''} onChange={e => handleApplianceChange({ modelNumber: e.target.value })} placeholder="MODEL#" />
                  </div>
                  <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-1 focus-within:border-blue-500/30 transition-all">
                    <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Serial Index</p>
                    <input className="w-full bg-transparent text-lg font-black text-white uppercase outline-none placeholder:text-gray-800" value={localJob.appliance.serialNumber || ''} onChange={e => handleApplianceChange({ serialNumber: e.target.value })} placeholder="SERIAL#" />
                  </div>
                </div>

                {/* Photo Gallery Layer */}
                <div className="space-y-6 pt-8 border-t border-white/5">
                   <div className="flex items-center justify-between px-2">
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em] flex items-center">
                         <ImageIcon size={14} className="mr-3 text-blue-500" /> Operational Images
                      </h4>
                      <button className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center hover:text-white transition-colors">
                        <Camera size={12} className="mr-2" /> Add Record
                      </button>
                   </div>
                   <div className="grid grid-cols-3 gap-4">
                      {localJob.photos && localJob.photos.length > 0 ? (
                        localJob.photos.map((photo, idx) => (
                          <div key={idx} className="aspect-square bg-[#111827] rounded-3xl border border-white/10 overflow-hidden group relative shadow-xl">
                             <img src={photo} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" alt={`Job asset ${idx}`} />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                                <button className="p-2 bg-red-500 rounded-xl text-white shadow-xl hover:scale-110 active:scale-90 transition-all"><Trash2 size={14} /></button>
                             </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-3 py-16 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center opacity-10 group hover:opacity-20 transition-opacity">
                           <Camera size={40} className="mb-4" />
                           <span className="text-[10px] font-black uppercase tracking-[0.4em]">No Visual Evidence</span>
                        </div>
                      )}
                      <button className="aspect-square bg-white/[0.02] rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center hover:bg-white/5 transition-all group">
                         <Plus size={24} className="text-gray-700 group-hover:text-blue-500 group-hover:scale-110 transition-all" />
                      </button>
                   </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: INVOICE & SETTLEMENT (8/12) */}
            <div className="lg:col-span-8 flex flex-col space-y-12">
              
              {/* WHITE PRINTABLE INVOICE AREA */}
              <div className="bg-white text-slate-900 rounded-[4rem] shadow-2xl flex flex-col min-h-[1000px] overflow-hidden relative border border-slate-200">
                <div className="h-4 bg-blue-600" />
                
                <div className="p-16 flex flex-col h-full space-y-12">
                  
                  {/* INVOICE HEADER: Symmetrical Symmetry */}
                  <header className="flex justify-between items-start pt-4">
                    <div className="flex-1">
                       <h3 className="text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                         {localJob.client.firstName} {localJob.client.lastName}
                       </h3>
                       <div className="mt-4 space-y-1">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{localJob.client.phone}</p>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{localJob.client.address}</p>
                         <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] pt-1">Record #{localJob.jobNumber}</p>
                       </div>
                    </div>

                    <div className="text-right flex flex-col items-end flex-1">
                       <div className="flex items-center space-x-5">
                          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><Building2 size={24} /></div>
                          <div className="text-left">
                            <h4 className="text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">Salem Online</h4>
                            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1.5">Enterprise OS Node</p>
                          </div>
                       </div>
                       <div className="mt-4 space-y-1 opacity-50">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">salem-online.ai</p>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">(888) 777-0099</p>
                       </div>
                    </div>
                  </header>

                  {/* BILLING ACTION ROW: 5 Buttons */}
                  <div className="py-6 border-y border-slate-100 flex items-center justify-between gap-4">
                    {[
                      { id: 'labor', label: 'Labor', icon: Hammer, color: 'text-blue-600' },
                      { id: 'part', label: 'Part', icon: Package, color: 'text-amber-600' },
                      { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-600' },
                      { id: 'maintenance', label: 'Maint.', icon: Wrench, color: 'text-indigo-600' },
                      { id: 'installation', label: 'Install', icon: Zap, color: 'text-green-600' }
                    ].map((btn) => (
                      <button 
                        key={btn.id}
                        onClick={() => setAddingItemType(btn.id as LineItem['type'])}
                        className="flex-1 py-4 px-2 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-900 hover:text-white transition-all flex flex-col items-center justify-center space-y-2 group shadow-sm active:scale-95"
                      >
                         <btn.icon size={20} className={`${btn.color} group-hover:text-white transition-colors`} />
                         <span className="text-[9px] font-black uppercase tracking-widest">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* COMPACT LINE ITEMS TABLE */}
                  <div className="flex-1 flex flex-col space-y-6">
                    <div className="flex text-[11px] font-black uppercase tracking-[0.4em] text-slate-300 px-6">
                      <span className="flex-1">Description</span>
                      <span className="w-32 text-right">Value</span>
                    </div>
                    
                    <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-hide">
                      {localJob.lineItems.map(item => (
                        <div key={item.id} className="flex items-center space-x-8 py-3 px-6 bg-slate-50/50 rounded-2xl border border-slate-100 group transition-all hover:bg-slate-100">
                           <div className="flex-1 min-w-0">
                              <p className="text-base font-black text-slate-900 uppercase truncate leading-none mb-1">{item.description}</p>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{item.type}</span>
                           </div>
                           <div className="flex items-center space-x-6">
                              <span className="text-xl font-black text-slate-900 tabular-nums">${item.unitPrice.toLocaleString()}</span>
                              <button onClick={() => handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== item.id) })} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                           </div>
                        </div>
                      ))}
                      
                      {localJob.lineItems.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-10">
                           <ClipboardList size={48} className="mb-4" />
                           <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Line Entry</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* INVOICE FOOTER */}
                  <footer className="pt-8 border-t border-slate-100 mt-auto flex justify-between items-end">
                    <div className="w-1/3">
                       <button onClick={() => setPaymentStep('options')} className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase tracking-[0.4em] text-[13px] shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
                         <CreditCard size={24} className="mr-4" /> PROCESS PAY
                       </button>
                    </div>
                    <div className="text-right">
                       <p className="text-[12px] font-black uppercase tracking-[0.4em] text-blue-600 mb-2">Total Outstanding</p>
                       <p className="text-7xl font-black text-slate-900 tracking-tighter leading-none tabular-nums">${subtotal.toLocaleString()}</p>
                    </div>
                  </footer>
                </div>
              </div>

              {/* LOGS: COMPLAINT & DIAGNOSIS */}
              <section className="grid grid-cols-2 gap-8 pb-8">
                 <div className="flex flex-col space-y-4 bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 shadow-2xl">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] flex items-center px-2">
                       <ClipboardList size={14} className="mr-2 text-blue-500" /> Intake Summary
                    </h3>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[2rem] p-6 text-[13px] font-medium text-gray-500 italic shadow-inner overflow-y-auto scrollbar-hide">
                      "{localJob.complaint}"
                    </div>
                 </div>
                 <div className="flex flex-col space-y-4 bg-[#0F172A] p-8 rounded-[3rem] border border-white/5 shadow-2xl">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] flex items-center px-2">
                       <Stethoscope size={14} className="mr-2 text-green-500" /> Verified Data
                    </h3>
                    <textarea 
                      className="flex-1 bg-[#111827] border border-white/5 rounded-[2rem] p-6 text-[13px] font-black text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all shadow-xl placeholder:text-gray-800"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input diagnostic findings..."
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

      {/* EDIT CLIENT OVERLAY */}
      {isEditingClient && (
        <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-[#111827] w-full max-w-2xl rounded-[4rem] p-16 border border-white/10 space-y-10 shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[90vh] scrollbar-hide">
            <h3 className="text-2xl font-black uppercase text-white tracking-[0.3em] text-center flex items-center justify-center">
               <Edit2 size={24} className="mr-4 text-blue-500" /> Client Intelligence
            </h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">First Name</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" value={editClientData.firstName} onChange={e => setEditClientData({...editClientData, firstName: e.target.value})} />
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">Last Name</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" value={editClientData.lastName} onChange={e => setEditClientData({...editClientData, lastName: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">Primary Phone</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" value={editClientData.phone} onChange={e => setEditClientData({...editClientData, phone: e.target.value})} />
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">Additional Phone</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" placeholder="Optional" value={editClientData.secondaryPhone || ''} onChange={e => setEditClientData({...editClientData, secondaryPhone: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">Primary Email</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" value={editClientData.email} onChange={e => setEditClientData({...editClientData, email: e.target.value})} />
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-2 block">Additional Email</label>
                <input className="w-full bg-transparent text-xl font-bold text-white outline-none" placeholder="Optional" value={editClientData.secondaryEmail || ''} onChange={e => setEditClientData({...editClientData, secondaryEmail: e.target.value})} />
              </div>
            </div>

            <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3 block">Deployment Address</label>
              <textarea className="w-full bg-transparent text-lg font-bold text-white outline-none min-h-[100px] resize-none" value={editClientData.address} onChange={e => setEditClientData({...editClientData, address: e.target.value})} />
            </div>

            <div className="flex gap-6">
              <button onClick={() => setIsEditingClient(false)} className="flex-1 py-8 text-gray-600 font-black uppercase text-[12px] tracking-widest">Discard</button>
              <button onClick={saveClientEdits} className="flex-1 bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-transform">Commit Update</button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE PICKER OVERLAY */}
      {showSchedulePicker && (
        <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-[#111827] w-full max-w-lg rounded-[4rem] p-16 border border-white/10 space-y-12 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black uppercase text-white tracking-[0.2em] text-center flex items-center justify-center">
              <CalIcon size={28} className="mr-4 text-blue-500"/>Reschedule System
            </h3>
            
            <div className="space-y-8">
               <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3 block">Deployment Date</label>
                  <input 
                    type="date" 
                    className="w-full bg-transparent text-2xl font-black text-white outline-none focus:text-blue-500 transition-colors" 
                    value={localJob.scheduledDate} 
                    onChange={e => handleLocalChange({ scheduledDate: e.target.value })} 
                  />
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-600 px-4 block">Operational Windows</label>
                  <div className="grid grid-cols-2 gap-4">
                    {TIME_WINDOWS.map((win) => {
                      const isOccupied = checkConflict(localJob.scheduledDate, win.start);
                      const isSelected = localJob.scheduledTime === win.start;
                      
                      return (
                        <button
                          key={win.start}
                          onClick={() => handleLocalChange({ scheduledTime: win.start })}
                          className={`
                            relative p-8 rounded-[2.5rem] border transition-all flex flex-col items-center justify-center space-y-2 group
                            ${isSelected ? 'bg-blue-600 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/5 hover:border-white/20'}
                            ${isOccupied && !isSelected ? 'border-red-500/50 bg-red-500/5' : ''}
                          `}
                        >
                          {isOccupied && (
                            <div className="absolute top-4 right-4 text-red-500 animate-pulse">
                              <AlertTriangle size={14} />
                            </div>
                          )}
                          <Clock size={18} className={isSelected ? 'text-white' : isOccupied ? 'text-red-500' : 'text-gray-500 group-hover:text-blue-500 transition-colors'} />
                          <span className={`text-sm font-black tracking-tighter ${isSelected ? 'text-white' : isOccupied ? 'text-red-500' : 'text-gray-300'}`}>
                            {win.label}
                          </span>
                          {isOccupied && <span className="text-[8px] font-black uppercase text-red-500/80 tracking-widest">Conflict Detected</span>}
                        </button>
                      );
                    })}
                  </div>
               </div>
            </div>

            <div className="flex gap-6">
              <button onClick={() => setShowSchedulePicker(false)} className="flex-1 py-8 text-gray-600 font-black uppercase text-[12px] tracking-widest hover:text-white transition-colors">Dismiss</button>
              <button 
                onClick={() => setShowSchedulePicker(false)} 
                className="flex-1 bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
