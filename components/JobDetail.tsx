
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
  Calendar as CalendarIcon, Send
} from 'lucide-react';
import { Job, LineItem, STATUS_COLORS, Appliance, JobStatus, Client, Message } from '../types';
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

const INITIAL_BRANDS = [
  'Whirlpool', 'GE', 'KitchenAid', 'Maytag', 'Frigidaire', 
  'Samsung', 'LG', 'Viking', 'Thermador', 'Sub-Zero', 
  'Bosch', 'Wolf', 'Miele', 'Kenmore', 'Dacor'
];

const TIME_WINDOWS = ['09:00', '11:00', '13:00', '15:00', '17:00'];

const STATUS_OPTIONS: { id: JobStatus; label: string }[] = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'enRoute', label: 'En Route' },
  { id: 'diagnosed', label: 'Diagnosed' },
  { id: 'waitingParts', label: 'Part Waiting' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

export const JobDetail: React.FC<{ job: Job; onClose: () => void }> = ({ job: initialJob, onClose }) => {
  const { updateJob, addMessageToJob, callHistory } = useAppStore();
  const [localJob, setLocalJob] = useState<Job>({ ...initialJob });
  const [isModified, setIsModified] = useState(false);
  
  // UI States
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Temporary state for client editing
  const [editClientData, setEditClientData] = useState<Client>({ ...initialJob.client });

  useEffect(() => { 
    setLocalJob({ ...initialJob }); 
    setEditClientData({ ...initialJob.client });
    setIsModified(false); 
    setIsEditingClient(false);
  }, [initialJob.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localJob.messages]);

  const handleLocalChange = (updates: Partial<Job>) => {
    setLocalJob(prev => ({ ...prev, ...updates }));
    setIsModified(true);
  };

  const handleApplianceChange = (updates: Partial<Appliance>) => {
    handleLocalChange({ appliance: { ...localJob.appliance, ...updates } });
  };

  const saveClientEdits = () => {
    handleLocalChange({ client: { ...editClientData } });
    setIsEditingClient(false);
  };

  const handleSave = () => {
    updateJob({ ...localJob, totalAmount: subtotal });
    setIsModified(false);
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sender: 'technician',
      content: newMessage,
      method: 'sms'
    };
    handleLocalChange({ messages: [...(localJob.messages || []), msg] });
    setNewMessage('');
  };

  // Fix: Implemented handleStartNavigation to resolve 'Cannot find name' error
  const handleStartNavigation = () => {
    if (!localJob.client.address) return;
    const address = encodeURIComponent(localJob.client.address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        handleLocalChange({ photos: [...(localJob.photos || []), base64] });
      };
      reader.readAsDataURL(file);
    }
  };

  const subtotal = localJob.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const relevantCalls = callHistory.filter(c => c.phone.includes(localJob.client.phone) || c.from.includes(localJob.client.lastName));

  return (
    <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300 overflow-hidden">
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handlePhotoUpload} 
      />

      <div className="bg-[#111827] w-full max-w-[1600px] h-full max-h-[96vh] md:rounded-[4rem] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* HEADER */}
        <header className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-[#111827]/80 z-50 shrink-0">
          <div className="flex items-center space-x-6">
            <button onClick={onClose} className="p-4 bg-[#1F2937] rounded-2xl text-gray-400 hover:text-white transition-all hover:bg-blue-600"><ChevronLeft size={24} /></button>
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Deployment Record <span className="text-blue-500">#{localJob.jobNumber}</span></h2>
              
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

              {/* SCHEDULE PICKER */}
              <div className="relative">
                <button 
                  onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                  className="px-6 py-2.5 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 flex items-center space-x-3 transition-all hover:bg-white/10 text-gray-400"
                >
                  <CalendarIcon size={14} className="text-blue-500" />
                  <span>{localJob.scheduledDate} @ {localJob.scheduledTime}</span>
                </button>
                {showSchedulePicker && (
                  <div className="absolute top-full left-0 mt-3 w-[280px] bg-[#1F2937] border border-white/10 rounded-[2rem] shadow-2xl z-[200] p-6 animate-in slide-in-from-top-2 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Target Date</label>
                      <input 
                        type="date" 
                        value={localJob.scheduledDate} 
                        onChange={(e) => handleLocalChange({ scheduledDate: e.target.value })}
                        className="w-full bg-[#111827] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Time Window</label>
                      <div className="grid grid-cols-2 gap-2">
                        {TIME_WINDOWS.map(tw => (
                          <button 
                            key={tw} 
                            onClick={() => { handleLocalChange({ scheduledTime: tw }); setShowSchedulePicker(false); }}
                            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all ${localJob.scheduledTime === tw ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                          >
                            {tw}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={handleSave} className={`px-10 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-2xl active:scale-95 ${isModified ? 'bg-blue-600 text-white shadow-[0_20px_40px_rgba(37,99,235,0.3)]' : 'bg-white/5 text-gray-700'}`}>
            <Save size={16} className="mr-3 inline" /> {isModified ? 'Sync Hub Changes' : 'Hub Synchronized'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch min-h-full">
            
            {/* SIDERBAR (4/12) */}
            <div className="lg:col-span-4 flex flex-col space-y-10">
              
              {/* CLIENT INFO */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-inner relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <User size={18} className="text-blue-500" />
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Client Dossier</h3>
                  </div>
                  {!isEditingClient && (
                    <button onClick={() => setIsEditingClient(true)} className="p-3 bg-white/5 text-gray-500 hover:text-white rounded-xl transition-all"><Edit2 size={14} /></button>
                  )}
                </div>

                {isEditingClient ? (
                  <div className="space-y-4 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">First Name</label>
                        <input className="w-full bg-transparent text-white font-black outline-none text-xs" value={editClientData.firstName} onChange={e => setEditClientData({...editClientData, firstName: e.target.value})} />
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Last Name</label>
                        <input className="w-full bg-transparent text-white font-black outline-none text-xs" value={editClientData.lastName} onChange={e => setEditClientData({...editClientData, lastName: e.target.value})} />
                      </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">Primary Phone</label>
                      <input className="w-full bg-transparent text-white font-black outline-none text-xs" value={editClientData.phone} onChange={e => setEditClientData({...editClientData, phone: e.target.value})} />
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <label className="text-[8px] font-black text-gray-500 uppercase block mb-1">System Email</label>
                      <input className="w-full bg-transparent text-white font-black outline-none text-xs" value={editClientData.email} onChange={e => setEditClientData({...editClientData, email: e.target.value})} />
                    </div>
                    <div className="flex space-x-2 pt-4">
                      <button onClick={saveClientEdits} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Commit</button>
                      <button onClick={() => setIsEditingClient(false)} className="flex-1 bg-white/5 text-gray-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Abort</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start space-x-6">
                      <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl shrink-0">
                        <img src={`https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" />
                      </div>
                      <div className="pt-2">
                        <p className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{localJob.client.firstName}<br/>{localJob.client.lastName}</p>
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.4em] mt-3 italic">Verified Node</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3 bg-white/[0.02] p-6 rounded-3xl border border-white/5">
                      <div className="flex items-center space-x-3 text-blue-500"><Phone size={14} /><span className="text-[11px] font-black tracking-widest">{localJob.client.phone}</span></div>
                      <div className="flex items-center space-x-3 text-gray-400"><Mail size={14} /><span className="text-[11px] font-black tracking-widest truncate">{localJob.client.email || 'NO_EMAIL@SECURED'}</span></div>
                      <div className="flex items-start space-x-3 text-gray-500 pt-2 border-t border-white/5"><MapPin size={14} className="mt-1" /><span className="text-[11px] font-black leading-relaxed">{localJob.client.address}</span></div>
                    </div>
                    <button onClick={handleStartNavigation} className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border border-blue-500/20 py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center space-x-4 shadow-xl active:scale-95">
                      <Navigation size={18} />
                      <span>Execute Navigation</span>
                    </button>
                  </div>
                )}
              </section>

              {/* ASSET HUB - UPDATED WITH MODEL/SERIAL */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-6 shadow-inner shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <ShieldCheck size={18} className="text-blue-500" />
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Asset Hub</h3>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><Camera size={14} /></button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-600 uppercase block mb-1">Model Number</label>
                    <input 
                      className="w-full bg-transparent text-white font-black outline-none text-xs uppercase placeholder:text-gray-800" 
                      value={localJob.appliance.modelNumber || ''} 
                      onChange={e => handleApplianceChange({ modelNumber: e.target.value })}
                      placeholder="MODEL_LOG"
                    />
                  </div>
                  <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                    <label className="text-[8px] font-black text-gray-600 uppercase block mb-1">Serial Number</label>
                    <input 
                      className="w-full bg-transparent text-white font-black outline-none text-xs uppercase placeholder:text-gray-800" 
                      value={localJob.appliance.serialNumber || ''} 
                      onChange={e => handleApplianceChange({ serialNumber: e.target.value })}
                      placeholder="SERIAL_TAG"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full flex items-center justify-between text-[11px] font-black text-white uppercase bg-white/5 p-4 rounded-xl border border-white/5 group">
                    <span className="truncate">{localJob.appliance.type}</span>
                    <ChevronRight size={14} className="text-gray-700" />
                  </button>
                  <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full flex items-center justify-between text-[11px] font-black text-blue-500 uppercase bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 group">
                    <span className="truncate">{localJob.appliance.brand || 'MAN_UNSPEC'}</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div className="flex space-x-3 overflow-x-auto scrollbar-hide py-2">
                   {localJob.photos && localJob.photos.map((p, i) => (
                     <div key={i} className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0 shadow-lg relative group">
                        <img src={p} className="w-full h-full object-cover" />
                        <button onClick={() => handleLocalChange({ photos: localJob.photos.filter((_, idx) => idx !== i) })} className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white"><Trash2 size={12} /></button>
                     </div>
                   ))}
                   <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 bg-white/5 border border-dashed border-white/10 rounded-2xl flex items-center justify-center text-gray-700 hover:bg-white/10 shrink-0"><Plus size={18} /></button>
                </div>
              </section>

              {/* MESSAGING LEDGER */}
              <section className="bg-[#0F172A] p-10 rounded-[3.5rem] border border-white/5 space-y-6 shadow-inner flex flex-col flex-grow overflow-hidden min-h-[400px]">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em] flex items-center mb-8"><MessageSquare size={16} className="mr-3 text-blue-500" /> Interaction Engine</h3>
                
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-6 mb-8">
                  {localJob.messages?.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.sender === 'client' ? 'items-start' : 'items-end'}`}>
                       <div className={`max-w-[85%] p-4 rounded-[1.8rem] text-[12px] leading-relaxed font-medium shadow-xl ${m.sender === 'client' ? 'bg-[#111827] text-gray-300 border border-white/5 rounded-bl-none' : 'bg-blue-600 text-white rounded-br-none'}`}>
                         {m.content}
                       </div>
                       <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest mt-2 px-2 opacity-50">{m.sender === 'technician' ? 'TECH' : m.sender.toUpperCase()} — {m.timestamp}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>

                <div className="relative pt-6 border-t border-white/5">
                   <input 
                    className="w-full bg-[#111827] border border-white/5 rounded-2xl px-6 py-4 text-xs font-medium text-white outline-none focus:border-blue-500 transition-all pr-14"
                    placeholder="Dispatch secure message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                   />
                   <button onClick={handleSendMessage} className="absolute right-2 bottom-2 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"><Send size={16} /></button>
                </div>
              </section>
            </div>

            {/* MAIN CONTENT (8/12) */}
            <div className="lg:col-span-8 flex flex-col space-y-12 h-full">
              
              <div className="bg-white text-slate-900 rounded-[4rem] shadow-2xl flex flex-col min-h-[1000px] overflow-hidden relative border border-slate-200 shrink-0">
                <div className="h-4 bg-blue-600" />
                
                <div className="p-20 flex flex-col h-full space-y-16">
                  
                  {/* INVOICE HEADER */}
                  <header className="flex justify-between items-start pt-6">
                    <div className="flex-1">
                       <h3 className="text-6xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-6">{localJob.client.firstName}<br/>{localJob.client.lastName}</h3>
                       <div className="space-y-2">
                         <div className="flex items-center text-slate-400"><Phone size={14} className="mr-3" /><p className="text-[11px] font-bold uppercase tracking-widest">{localJob.client.phone}</p></div>
                         <div className="flex items-start text-slate-400"><MapPin size={14} className="mr-3 mt-0.5" /><p className="text-[11px] font-bold uppercase tracking-widest leading-relaxed max-w-xs">{localJob.client.address}</p></div>
                         <div className="flex items-center space-x-6 pt-4">
                           <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.5em]">Operational Unit #{localJob.jobNumber}</p>
                           <div className="flex items-center space-x-2 text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
                                <Shield size={12} className="text-blue-500" />
                                <span>Warranty Status: {localJob.warranty || 'ACTIVE'}</span>
                             </div>
                         </div>
                       </div>
                    </div>

                    <div className="text-right flex flex-col items-end flex-1">
                       <div className="flex items-center space-x-6">
                          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl"><Building2 size={36} /></div>
                          <div className="text-left"><h4 className="text-5xl font-black uppercase tracking-tighter text-slate-900 leading-none">Salem AI</h4><p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mt-2">Operational Node</p></div>
                       </div>
                    </div>
                  </header>

                  {/* BILLING ACTIONS */}
                  <div className="py-10 border-y-2 border-slate-100 flex items-center justify-between gap-6 px-4 shrink-0">
                    {[
                      { id: 'labor', label: 'Labor Ops', icon: Hammer, color: 'text-blue-600' },
                      { id: 'part', label: 'Hardware', icon: Package, color: 'text-amber-600' },
                      { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-600' },
                      { id: 'maintenance', label: 'Maint.', icon: Wrench, color: 'text-indigo-600' },
                      { id: 'installation', label: 'Install', icon: Zap, color: 'text-green-600' }
                    ].map((btn) => (
                      <button key={btn.id} className="flex-1 py-6 px-2 rounded-3xl border-2 border-slate-100 bg-slate-50/30 hover:bg-slate-900 hover:text-white transition-all flex flex-col items-center justify-center space-y-3 group shadow-sm active:scale-95">
                         <btn.icon size={28} className={`${btn.color} group-hover:text-white transition-colors`} />
                         <span className="text-[10px] font-black uppercase tracking-widest">{btn.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* LINE ITEMS */}
                  <div className="flex-1 flex flex-col space-y-10 min-h-0">
                    <div className="flex text-[13px] font-black uppercase tracking-[0.4em] text-slate-300 px-10 shrink-0">
                      <span className="flex-1">Line Itemization</span>
                      <span className="w-48 text-right">Settlement</span>
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
                              <button onClick={() => handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== item.id) })} className="p-4 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={24} /></button>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* INVOICE FOOTER */}
                  <footer className="pt-16 border-t-2 border-slate-100 mt-auto flex justify-between items-end shrink-0">
                    <div className="w-2/5">
                       <button className="w-full bg-slate-900 text-white py-10 rounded-[3.5rem] font-black uppercase tracking-[0.5em] text-[16px] shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
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

              {/* LOGS */}
              <section className="grid grid-cols-2 gap-12 pb-12 shrink-0 min-h-[500px]">
                 <div className="flex flex-col space-y-8 bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 shadow-2xl h-full">
                    <div className="flex items-center space-x-6 px-4">
                       <div className="w-16 h-16 bg-blue-600/10 rounded-[1.8rem] flex items-center justify-center text-blue-500 border border-blue-500/20"><ClipboardList size={32} /></div>
                       <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Inbound Intake</h3>
                    </div>
                    <div className="flex-1 bg-[#111827] border border-white/5 rounded-[3.5rem] p-12 text-[16px] font-medium text-gray-400 italic shadow-inner overflow-y-auto scrollbar-hide">
                      "{localJob.complaint}"
                    </div>
                 </div>
                 <div className="flex flex-col space-y-8 bg-[#0F172A] p-12 rounded-[4rem] border border-white/5 shadow-2xl h-full">
                    <div className="flex items-center space-x-6 px-4">
                       <div className="w-16 h-16 bg-green-600/10 rounded-[1.8rem] flex items-center justify-center text-green-500 border border-green-500/20"><Stethoscope size={32} /></div>
                       <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Verified Findings</h3>
                    </div>
                    <textarea 
                      className="flex-1 bg-[#111827] border border-white/5 rounded-[3.5rem] p-12 text-[18px] font-black text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all shadow-xl placeholder:text-gray-800"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input verified technical operational findings..."
                    />
                 </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
