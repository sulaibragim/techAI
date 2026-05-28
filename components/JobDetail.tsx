
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
  Calendar as CalendarIcon, Send, Fingerprint, Percent, RotateCcw,
  Car, Home, ChevronDown, Lock, Printer
} from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import { Job, LineItem, STATUS_COLORS, LockDetails, JobStatus, Client, Message } from '../types';
import { useAppStore } from '../store';

const LOCK_ICONS = [
  { id: 'Automotive', icon: Car, label: 'Auto' },
  { id: 'Residential', icon: Home, label: 'Home' },
  { id: 'Commercial', icon: Building2, label: 'Business' },
  { id: 'Secure / Safe', icon: Lock, label: 'Safe/Vault' },
  { id: 'Other', icon: Wrench, label: 'Other' }
];

const BRANDS = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Audi',
  'Schlage', 'Kwikset', 'Yale', 'Medeco', 'Von Duprin', 'Adams Rite',
  'Amsec', 'SentrySafe', 'Corbin Russwin', 'Baldwin', 'Master Lock'
];

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
  const { jobs, updateJob, inventory, updateInventoryItem } = useAppStore();
  const { companyName, technicianName, companyAddress, companyCity, companyPhone, companyEmail, licenseNumber } = useSettingsStore();
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
  const [billingPrompt, setBillingPrompt] = useState<{ open: boolean, type: LineItem['type'] | null, desc: string, price: string, extra?: string, partId?: string }>({
    open: false, type: null, desc: '', price: ''
  });

  // Payment Settlement States
  const [paymentStep, setPaymentStep] = useState<'idle' | 'split' | 'method' | 'sign'>('idle');
  const [paymentSplit, setPaymentSplit] = useState<1 | 0.5>(1);
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash' | 'Check' | 'Zelle'>('Card');
  const [selectedTerm, setSelectedTerm] = useState('1');

  const [showPhotoSource, setShowPhotoSource] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draftMessage, setDraftMessage] = useState('');

  const handleSendMessage = () => {
    if (!draftMessage.trim()) return;
    const newMessage: Message = {
      id: Math.random().toString(),
      sender: 'technician',
      content: draftMessage,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      method: 'sms'
    };
    
    const updatedJob = { ...localJob, messages: [...(localJob.messages || []), newMessage] };
    setLocalJob(updatedJob);
    updateJob(updatedJob);
    setDraftMessage('');
  };

  useEffect(() => { 
    if (localJob.id !== initialJob.id) {
      setLocalJob({ ...initialJob }); 
      setIsModified(false);
      setCalendarDate(initialJob.scheduledDate);
    } else if (!isModified) {
      setLocalJob({ ...initialJob }); 
      setCalendarDate(initialJob.scheduledDate);
    }
  }, [initialJob, isModified, localJob.id]);

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setShowCamera(false);
      alert("Could not access camera");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        handleLocalChange({ photos: [dataUrl, ...(localJob.photos || [])] });
        stopCamera();
        setShowPhotoSource(false);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleLocalChange({ photos: [reader.result as string, ...(localJob.photos || [])] });
        setShowPhotoSource(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLocalChange = (updates: Partial<Job>) => {
    setLocalJob(prev => {
      const next = { ...prev, ...updates };
      if (updates.lineItems) {
        next.totalAmount = next.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      }
      return next;
    });
    setIsModified(true);
  };

  const handleLockDetailsChange = (updates: Partial<LockDetails>) => {
    handleLocalChange({ lockDetails: { ...localJob.lockDetails, ...updates } });
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
      unitPrice: parseFloat(billingPrompt.price),
      partId: billingPrompt.partId
    };
    
    // Decrement stock if part is selected
    if (newItem.partId) {
      const part = inventory.find(p => p.id === newItem.partId);
      if (part) {
        updateInventoryItem({ ...part, stock: Math.max(0, part.stock - 1) });
      }
    }

    handleLocalChange({ lineItems: [...localJob.lineItems, newItem] });
    setBillingPrompt({ open: false, type: null, desc: '', price: '', partId: undefined });
  };

  const handleRemoveLineItem = (itemId: string) => {
    const item = localJob.lineItems.find(li => li.id === itemId);
    if (item && item.partId) {
      const part = inventory.find(p => p.id === item.partId);
      if (part) {
        updateInventoryItem({ ...part, stock: part.stock + 1 });
      }
    }
    handleLocalChange({ lineItems: localJob.lineItems.filter(li => li.id !== itemId) });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Optional: add a toast notification here
  };

  const subtotal = localJob.lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  const handlePrintInvoice = () => {
    const isPaid = localJob.paymentStatus === 'paid';
    const lineRows = localJob.lineItems.map((item, idx) => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:9px 8px;font-size:12px;color:#94a3b8;">${idx + 1}</td>
        <td style="padding:9px 8px;">
          <div style="font-size:13px;font-weight:600;color:#1e293b;">${item.description}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#3b82f6;margin-top:1px;">${item.type.replace('_', ' ')}</div>
        </td>
        <td style="padding:9px 8px;font-size:13px;color:#64748b;text-align:center;">${item.quantity}</td>
        <td style="padding:9px 8px;font-size:13px;color:#64748b;text-align:right;">$${item.unitPrice.toFixed(2)}</td>
        <td style="padding:9px 8px;font-size:13px;font-weight:700;color:#1e293b;text-align:right;">$${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Invoice #${localJob.jobNumber} — ${localJob.client.lastName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  @page{size:A4;margin:18mm 16mm;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{max-width:760px;margin:0 auto;padding:36px 40px;}
  /* Letterhead */
  .lh{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1d4ed8;margin-bottom:24px;}
  .co-name{font-size:26px;font-weight:900;color:#1d4ed8;letter-spacing:-.5px;}
  .co-sub{font-size:11px;color:#64748b;margin-top:4px;}
  .inv-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;text-align:right;}
  .inv-num{font-size:22px;font-weight:900;color:#1e293b;text-align:right;margin-top:2px;}
  .inv-meta{font-size:11px;color:#64748b;text-align:right;margin-top:3px;}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;background:${isPaid ? '#dcfce7' : '#fef3c7'};color:${isPaid ? '#15803d' : '#92400e'};margin-top:6px;}
  /* Parties */
  .parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;padding-bottom:20px;border-bottom:1px solid #f1f5f9;margin-bottom:20px;}
  .sect-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:6px;}
  .sect-val{font-size:13px;font-weight:700;color:#1e293b;}
  .sect-sub{font-size:11px;color:#64748b;margin-top:2px;}
  /* Table */
  table{width:100%;border-collapse:collapse;}
  thead tr{background:#f8fafc;}
  thead th{padding:9px 8px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;border-bottom:2px solid #e2e8f0;}
  thead th:first-child{width:32px;}
  thead th:nth-child(3){text-align:center;}
  thead th:nth-child(4),thead th:nth-child(5){text-align:right;}
  tfoot td{padding:9px 8px;font-size:12px;color:#64748b;text-align:right;}
  /* Totals */
  .totals{margin-top:16px;display:flex;justify-content:flex-end;}
  .totals-box{width:220px;}
  .tot-row{display:flex;justify-content:space-between;font-size:12px;color:#64748b;padding:4px 0;}
  .tot-divider{border-top:2px solid #e2e8f0;margin:6px 0;}
  .tot-main{display:flex;justify-content:space-between;align-items:baseline;}
  .tot-main-label{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1e293b;}
  .tot-main-val{font-size:24px;font-weight:900;color:#1e293b;}
  .tot-paid{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#16a34a;padding-top:4px;}
  /* Payment + terms */
  .pt{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;margin:18px 0;}
  .pmethods{display:flex;gap:6px;margin-top:5px;}
  .pm{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #e2e8f0;color:#64748b;background:#f8fafc;}
  /* Signatures */
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:18px;}
  .sig-box{}
  .sig-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px;}
  .sig-note{font-size:9px;color:#94a3b8;font-style:italic;margin-bottom:10px;}
  .sig-line{border-bottom:1px solid #cbd5e1;height:32px;margin-bottom:4px;}
  .sig-sub{font-size:10px;color:#94a3b8;}
  /* Footer */
  .footer{margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;text-align:center;line-height:1.6;}
  @media print{body{background:#fff;}}
</style></head>
<body><div class="page">

  <!-- LETTERHEAD -->
  <div class="lh">
    <div>
      <div class="co-name">${companyName}</div>
      ${companyAddress ? `<div class="co-sub">${companyAddress}</div>` : ''}
      ${companyCity ? `<div class="co-sub">${companyCity}</div>` : ''}
      <div class="co-sub" style="margin-top:3px;">
        ${companyPhone ? `☎ ${companyPhone}` : ''}${companyPhone && companyEmail ? ' &nbsp;·&nbsp; ' : ''}${companyEmail ? `✉ ${companyEmail}` : ''}
        ${licenseNumber ? `<span style="margin-left:8px;font-weight:700;">Lic# ${licenseNumber}</span>` : ''}
      </div>
    </div>
    <div>
      <div class="inv-title">Invoice</div>
      <div class="inv-num">#${localJob.jobNumber}</div>
      <div class="inv-meta">Date: ${localJob.scheduledDate}</div>
      <div class="inv-meta">Due: Upon Receipt</div>
      <div><span class="badge">${isPaid ? '✓ Paid in Full' : '⏳ Payment Due'}</span></div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div>
      <div class="sect-label">Bill To</div>
      <div class="sect-val">${localJob.client.firstName} ${localJob.client.lastName}</div>
      ${localJob.client.phone ? `<div class="sect-sub">${localJob.client.phone}</div>` : ''}
      ${localJob.client.email ? `<div class="sect-sub">${localJob.client.email}</div>` : ''}
      ${localJob.client.address ? `<div class="sect-sub" style="margin-top:3px;">${localJob.client.address}</div>` : ''}
    </div>
    <div>
      <div class="sect-label">Service Location</div>
      <div class="sect-sub" style="font-size:12px;">${localJob.client.address || '—'}</div>
    </div>
    <div>
      <div class="sect-label">Equipment / Job</div>
      <div class="sect-val" style="font-size:12px;">${localJob.lockDetails.type}</div>
      ${localJob.lockDetails.brand ? `<div class="sect-sub">${localJob.lockDetails.brand}${localJob.lockDetails.modelOrYear ? ' · ' + localJob.lockDetails.modelOrYear : ''}</div>` : ''}
      ${localJob.lockDetails.vinOrKeyCode ? `<div class="sect-sub" style="font-family:monospace;">Key: ${localJob.lockDetails.vinOrKeyCode}</div>` : ''}
      <div class="sect-sub">Tech: ${technicianName}</div>
    </div>
  </div>

  <!-- LINE ITEMS -->
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left;">Description</th>
        <th>Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || '<tr><td colspan="5" style="padding:18px 8px;text-align:center;color:#94a3b8;font-style:italic;font-size:12px;">No line items</td></tr>'}
    </tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals">
    <div class="totals-box">
      <div class="tot-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
      <div class="tot-row"><span>Tax / Fees</span><span>$0.00</span></div>
      <div class="tot-divider"></div>
      <div class="tot-main">
        <span class="tot-main-label">Total Due</span>
        <span class="tot-main-val">$${subtotal.toFixed(2)}</span>
      </div>
      ${isPaid ? `<div class="tot-paid"><span>Amount Paid</span><span>— $${subtotal.toFixed(2)}</span></div>` : ''}
    </div>
  </div>

  <!-- PAYMENT + TERMS -->
  <div class="pt">
    <div>
      <div class="sect-label">Accepted Payment Methods</div>
      <div class="pmethods">
        <span class="pm">Cash</span><span class="pm">Card</span><span class="pm">Check</span><span class="pm">Zelle</span>
      </div>
    </div>
    <div style="text-align:right;">
      <div class="sect-label">Terms</div>
      <div style="font-size:12px;font-weight:600;color:#1e293b;">Due on Receipt</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">All labor carries a 90-day warranty</div>
    </div>
  </div>

  <!-- SIGNATURES -->
  <div class="sigs">
    <div class="sig-box">
      <div class="sig-label">Technician Signature</div>
      <div class="sig-line"></div>
      <div class="sig-sub">${technicianName}${licenseNumber ? ' · Lic# ' + licenseNumber : ''}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Client Authorization</div>
      <div class="sig-note">I authorize the work described above and agree to the payment terms.</div>
      <div class="sig-line"></div>
      <div class="sig-sub">Signature &amp; Date</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    Thank you for choosing <strong>${companyName}</strong>${companyPhone ? ' · ' + companyPhone : ''}${companyEmail ? ' · ' + companyEmail : ''}<br>
    ${localJob.diagnosisNotes ? `<em>Notes: ${localJob.diagnosisNotes.slice(0, 160)}</em>` : 'Professional locksmith services — licensed &amp; insured'}
  </div>

</div></body></html>`;

    const w = window.open('', '_blank', 'width=860,height=1050');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
  };
  const collectingAmount = subtotal * paymentSplit;

  return (
    <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[150] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300 overflow-hidden">
      
      {/* MODAL: PHOTO SOURCE SELECTION */}
      {showPhotoSource && (
        <div className="absolute inset-0 z-[600] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest">Add Photo</h3>
              <button onClick={() => setShowPhotoSource(false)} className="p-2 text-slate-400 hover:text-white"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={startCamera}
                className="w-full bg-blue-600 text-white py-6 rounded-2xl font-bold text-sm uppercase tracking-widest flex items-center justify-center space-x-3 active:scale-95"
              >
                <Camera size={20} />
                <span>Take Photo</span>
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-white/5 text-white py-6 rounded-2xl border border-white/10 font-bold text-sm uppercase tracking-widest flex items-center justify-center space-x-3 active:scale-95"
              >
                <ImageIcon size={20} />
                <span>Choose from Gallery</span>
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileSelect}
            />
          </div>
        </div>
      )}

      {/* MODAL: CAMERA INTERFACE */}
      {showCamera && (
        <div className="absolute inset-0 z-[700] bg-black flex flex-col items-center justify-center">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-10 inset-x-0 flex justify-center items-center space-x-10">
            <button onClick={stopCamera} className="p-6 bg-white/10 rounded-full text-white backdrop-blur-md"><X size={32} /></button>
            <button onClick={takePhoto} className="w-24 h-24 bg-white rounded-full border-8 border-white/30 shadow-2xl active:scale-90 transition-transform" />
            <div className="w-20" /> {/* Spacer */}
          </div>
        </div>
      )}

      {/* MODAL: BILLING PROMPT */}
      {billingPrompt.open && (
        <div className="absolute inset-0 z-[600] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest">Add {billingPrompt.type}</h3>
              <button onClick={() => setBillingPrompt({ ...billingPrompt, open: false })} className="p-2 text-slate-400 hover:text-white"><X size={24} /></button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 relative">
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">
                  {billingPrompt.type === 'labor' ? 'Labor Name' : billingPrompt.type === 'part' ? 'Part Name (Search Inventory)' : 'Description'}
                </label>
                <input 
                  className="w-full bg-transparent text-white font-bold outline-none text-sm" 
                  value={billingPrompt.desc} 
                  onChange={e => {
                    setBillingPrompt({ ...billingPrompt, desc: e.target.value, partId: undefined }); // Clear partId if they type manually
                  }}
                  placeholder="Enter name..."
                />
                {billingPrompt.type === 'part' && billingPrompt.desc && !billingPrompt.partId && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto">
                    {inventory.filter(p => p.name.toLowerCase().includes(billingPrompt.desc.toLowerCase()) || p.sku.toLowerCase().includes(billingPrompt.desc.toLowerCase())).map(part => (
                      <button 
                        key={part.id}
                        onClick={() => setBillingPrompt({ ...billingPrompt, desc: part.name, price: part.price.toString(), partId: part.id })}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm transition-colors border-b border-white/5 last:border-0 flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-white">{part.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{part.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-400">${part.price.toFixed(2)}</p>
                          <p className={`text-xs ${part.stock <= part.reorderPoint ? 'text-amber-500' : 'text-slate-400'}`}>Stock: {part.stock}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {billingPrompt.type === 'service_call' && (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">What was diagnosed?</label>
                  <textarea 
                    className="w-full bg-transparent text-white font-bold outline-none text-sm h-20 resize-none" 
                    value={billingPrompt.extra || ''} 
                    onChange={e => setBillingPrompt({ ...billingPrompt, extra: e.target.value })}
                    placeholder="Describe findings..."
                  />
                </div>
              )}

              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Cost ($)</label>
                <input 
                  type="number"
                  className="w-full bg-transparent text-white font-bold outline-none text-sm" 
                  value={billingPrompt.price} 
                  onChange={e => setBillingPrompt({ ...billingPrompt, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <button onClick={handleAddLineItem} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-bold text-sm uppercase tracking-widest active:scale-95 shadow-2xl">Add to Invoice</button>
          </div>
        </div>
      )}

      {/* MODAL: CLIENT EDIT */}
      {isEditingClient && (
        <div className="absolute inset-0 z-[500] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-2xl rounded-2xl border border-white/10 p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest">Edit Client Records</h3>
              <button onClick={() => setIsEditingClient(false)} className="p-2 text-slate-400 hover:text-white"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">First Name</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.firstName} onChange={e => handleClientChange({ firstName: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Last Name</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.lastName} onChange={e => handleClientChange({ lastName: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Phone</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.phone} onChange={e => handleClientChange({ phone: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Secondary Phone</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.secondaryPhone || ''} onChange={e => handleClientChange({ secondaryPhone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Email</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.email} onChange={e => handleClientChange({ email: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Secondary Email</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.secondaryEmail || ''} onChange={e => handleClientChange({ secondaryEmail: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Address</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.address} onChange={e => handleClientChange({ address: e.target.value })} />
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Secondary Address</label>
                  <input className="w-full bg-transparent text-white font-bold outline-none text-sm" value={localJob.client.secondaryAddress || ''} onChange={e => handleClientChange({ secondaryAddress: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Client Notes</label>
              <textarea className="w-full bg-transparent text-white font-bold outline-none text-sm h-24 resize-none" value={localJob.client.notes || ''} onChange={e => handleClientChange({ notes: e.target.value })} />
            </div>
            <button onClick={() => setIsEditingClient(false)} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-bold text-sm uppercase tracking-widest active:scale-95 shadow-2xl">Save Changes</button>
          </div>
        </div>
      )}

      {/* MODAL: SETTLEMENT WORKFLOW */}
      {paymentStep !== 'idle' && (
        <div className="absolute inset-0 z-[400] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-2xl p-8 shadow-2xl animate-in slide-in-from-bottom-12 space-y-6 text-slate-900 relative">
            <button onClick={() => setPaymentStep('idle')} className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-900"><X size={24} /></button>
            
            {paymentStep === 'split' && (
              <div className="space-y-5 animate-in fade-in">
                <div className="text-center">
                  <h3 className="text-4xl font-bold uppercase tracking-tighter mb-2">Settlement Scope</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Identify collection tier</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { setPaymentSplit(1); setPaymentStep('method'); }} className="p-6 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center active:scale-95 shadow-sm">
                    <DollarSign size={32} className="text-blue-600 mb-4" />
                    <span className="text-sm font-bold uppercase">Full Settlement</span>
                    <span className="text-xl font-bold mt-2">${subtotal}</span>
                  </button>
                  <button onClick={() => { setPaymentSplit(0.5); setPaymentStep('method'); }} className="p-6 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all flex flex-col items-center active:scale-95 shadow-sm">
                    <Percent size={32} className="text-amber-600 mb-4" />
                    <span className="text-sm font-bold uppercase">50% Deposit</span>
                    <span className="text-xl font-bold mt-2">${subtotal * 0.5}</span>
                  </button>
                </div>
              </div>
            )}

            {paymentStep === 'method' && (
              <div className="space-y-5 animate-in slide-in-from-right-8">
                <div className="text-center">
                  <h3 className="text-4xl font-bold uppercase tracking-tighter mb-2">Select Method</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total to collect: ${collectingAmount}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {['Card', 'Cash', 'Check', 'Zelle'].map(m => (
                    <button key={m} onClick={() => { setPaymentMethod(m as any); setPaymentStep('sign'); }} className="p-8 border-2 border-slate-100 rounded-3xl hover:border-slate-900 text-sm font-bold uppercase active:scale-95 shadow-sm transition-all">{m}</button>
                  ))}
                </div>
              </div>
            )}

            {paymentStep === 'sign' && (
              <div className="space-y-5 animate-in slide-in-from-right-8">
                <div className="text-center">
                  <h3 className="text-4xl font-bold uppercase tracking-tighter mb-2">Authorize</h3>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Collecting ${collectingAmount} via {paymentMethod}</p>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Service Type Count / Duration</p>
                  <div className="grid grid-cols-5 gap-2">
                    {TERM_TYPES.map(t => (
                      <button key={t} onClick={() => setSelectedTerm(t)} className={`py-4 rounded-xl text-xs font-bold uppercase border transition-all ${selectedTerm === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{t === '1' ? 'ONE' : t}</button>
                    ))}
                  </div>
                </div>

                <div className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-200 relative overflow-hidden group">
                   <PenTool size={48} className="mb-4 opacity-10 group-hover:scale-110 transition-transform" />
                   <p className="text-xs font-bold uppercase tracking-widest">Digital Client Signature</p>
                </div>
                
                <button onClick={() => { handleLocalChange({ paymentStatus: 'paid' }); setPaymentStep('idle'); }} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold uppercase tracking-widest text-base shadow-2xl active:scale-95 hover:bg-blue-600 transition-all">Execute Transaction</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-900 w-full max-w-[1600px] h-full max-h-[96vh] md:rounded-2xl border border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* HEADER BAR */}
        <header className="px-10 py-6 flex items-center justify-between border-b border-white/10 bg-slate-900/80 z-50 shrink-0">
          <div className="flex items-center space-x-6">
            <button onClick={onClose} className="p-4 bg-[#1F2937] rounded-2xl text-slate-300 hover:text-white transition-all active:scale-90"><ChevronLeft size={24} /></button>
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Job <span className="text-blue-500">#{localJob.jobNumber}</span></h2>
              
              <div className="relative">
                <button onClick={() => setShowStatusPicker(!showStatusPicker)} className="px-6 py-2.5 bg-white/5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 flex items-center space-x-3 active:scale-95 transition-all" style={{ color: STATUS_COLORS[localJob.status] }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: STATUS_COLORS[localJob.status] }} />
                  <span>{localJob.status}</span>
                </button>
                {showStatusPicker && (
                  <div className="absolute top-full left-0 mt-3 w-64 bg-[#1F2937] border border-white/10 rounded-[1.5rem] shadow-2xl z-[200] p-2 animate-in slide-in-from-top-2">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.id} onClick={() => { handleLocalChange({ status: s.id }); setShowStatusPicker(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-between active:scale-95 ${localJob.status === s.id ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-slate-300'}`}>
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
                  className="px-6 py-2.5 bg-blue-600/10 text-blue-500 rounded-xl text-xs font-bold uppercase tracking-wider border border-blue-500/20 flex items-center space-x-3 active:scale-95 transition-all"
                >
                  <CalendarIcon size={14} />
                  <span>{localJob.scheduledDate} @ {localJob.scheduledTime}</span>
                </button>
                {showCalendar && (
                  <div className="absolute top-full left-0 mt-3 w-[400px] bg-[#1F2937] border border-white/10 rounded-[2.5rem] p-8 z-[300] shadow-2xl animate-in zoom-in-95 space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-widest">Select Date & Time</h4>
                      <button onClick={() => setShowCalendar(false)} className="p-2 text-slate-400 hover:text-white"><X size={20} /></button>
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
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center border transition-all active:scale-90 ${isSelected ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                          >
                            <span className="text-xs font-bold uppercase">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <span className="text-xs font-bold">{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* TIME PICKER */}
                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
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
                            className={`py-4 rounded-xl text-xs font-bold uppercase border transition-all active:scale-95 ${isCurrent ? 'bg-blue-600 border-blue-400 text-white' : taken ? 'bg-red-600/20 border-red-600/30 text-red-500 cursor-not-allowed' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'}`}
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
          <button onClick={() => { updateJob(localJob); setIsModified(false); }} className={`px-10 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${isModified ? 'bg-blue-600 text-white shadow-xl' : 'bg-white/5 text-gray-700'}`}>
            <Save size={16} className="mr-3 inline" /> {isModified ? 'Save Changes' : 'Up to Date'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-full">
            
            {/* SIDEBAR: CLIENT, APPLIANCE, MESSAGES */}
            <div className="lg:col-span-4 flex flex-col space-y-8">
              
              {/* CLIENT INFO CARD - NEW LAYOUT */}
              <section className="bg-gray-900 p-8 rounded-2xl border border-slate-700 space-y-6 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full -mr-16 -mt-16" />
                
                <div className="flex justify-between items-start relative z-10">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-bold text-white uppercase tracking-tight leading-none">
                      {localJob.client.firstName} {localJob.client.lastName}
                    </h3>
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: STATUS_COLORS[localJob.status] }}>{localJob.lockDetails.type} · {localJob.lockDetails.brand || 'Unknown'}</p>
                  </div>
                  <button 
                    onClick={() => setIsEditingClient(true)}
                    className="p-3 bg-gray-800 text-slate-300 rounded-xl hover:bg-gray-700 hover:text-white transition-all active:scale-90 flex items-center space-x-2"
                  >
                    <Edit2 size={16} />
                    <span className="text-xs font-bold uppercase">Edit Records</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 py-4 border-y border-slate-700">
                  <div className="w-12 h-12 bg-gray-800 rounded-xl overflow-hidden border border-slate-600 shrink-0">
                    <img src={localJob.client.photo || `https://i.pravatar.cc/150?u=${localJob.client.lastName}`} className="w-full h-full object-cover" alt="Client" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Job #{localJob.jobNumber}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{localJob.scheduledDate} @ {localJob.scheduledTime}</p>
                  </div>
                </div>

                {/* CONTACT ACTIONS */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-2.5 border-b border-slate-700/50 group">
                    <div className="flex items-center space-x-3">
                      <Phone size={13} className="text-blue-500 shrink-0" />
                      <span className="text-xs font-semibold text-white">{localJob.client.phone}</span>
                    </div>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => window.location.href = `tel:${localJob.client.phone}`} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"><Phone size={12} /></button>
                      <button onClick={() => copyToClipboard(localJob.client.phone)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"><Copy size={12} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-b border-slate-700/50 group">
                    <div className="flex items-center space-x-3">
                      <Mail size={13} className="text-blue-500 shrink-0" />
                      <span className="text-xs font-semibold text-white truncate max-w-[200px]">{localJob.client.email}</span>
                    </div>
                    <button onClick={() => copyToClipboard(localJob.client.email)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"><Copy size={12} /></button>
                  </div>
                  <div className="flex items-center justify-between py-2.5 group">
                    <div className="flex items-center space-x-3">
                      <MapPin size={13} className="text-blue-500 shrink-0" />
                      <span className="text-xs font-semibold text-white truncate max-w-[170px]">{localJob.client.address}</span>
                    </div>
                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localJob.client.address)}`)} className="p-1.5 bg-blue-600/10 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Navigation size={12} /></button>
                  </div>
                </div>
              </section>

              {/* LOCKDETAILS HUB */}
              <section className="bg-gray-900 p-8 rounded-2xl border border-slate-700 space-y-6 shadow-md">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hardware Profile</h3>
                  <div className="flex space-x-2">
                    <button onClick={() => setShowPhotoSource(true)} className="p-3 bg-gray-800 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-90"><Camera size={14} /></button>
                  </div>
                </div>

                {/* PHOTO SPACE */}
                <div className="w-full aspect-video bg-gray-800 rounded-3xl overflow-hidden border border-slate-600 shadow-inner flex items-center justify-center group relative text-center">
                  {localJob.photos && localJob.photos.length > 0 ? (
                    <img src={localJob.photos[0]} className="w-full h-full object-cover" alt="LockDetails" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-700">
                      <ImageIcon size={32} className="mb-2 opacity-20" />
                      <span className="text-xs font-bold uppercase tracking-widest">No Visual Data</span>
                    </div>
                  )}
                  <button onClick={() => setShowPhotoSource(true)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Plus size={24} className="text-white" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <button onClick={() => setShowTypePicker(!showTypePicker)} className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 text-left active:scale-95 transition-all">
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1 tracking-widest">Type</label>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white uppercase truncate">{localJob.lockDetails.type}</span>
                        <ChevronDown size={12} className="text-gray-700" />
                      </div>
                    </button>
                    {showTypePicker && (
                      <div className="absolute top-full left-0 w-64 mt-2 p-4 bg-[#1F2937] border border-white/10 rounded-3xl z-[300] shadow-2xl grid grid-cols-2 gap-2 animate-in zoom-in-95">
                        {LOCK_ICONS.map(t => (
                          <button key={t.id} onClick={() => { handleLockDetailsChange({ type: t.id as any }); setShowTypePicker(false); }} className={`p-4 rounded-xl flex flex-col items-center justify-center space-y-2 border transition-all active:scale-95 ${localJob.lockDetails.type === t.id ? 'bg-blue-600 text-white border-blue-400' : 'bg-white/5 text-slate-400 border-white/10 hover:text-gray-300'}`}>
                            <t.icon size={18} />
                            <span className="text-xs font-bold uppercase text-center leading-tight">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button onClick={() => setShowBrandPicker(!showBrandPicker)} className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 text-left active:scale-95 transition-all">
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1 tracking-widest">Brand</label>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-500 uppercase truncate">{localJob.lockDetails.brand || 'Unknown'}</span>
                        <ChevronDown size={12} className="text-gray-700" />
                      </div>
                    </button>
                    {showBrandPicker && (
                      <div className="absolute top-full right-0 w-56 mt-2 p-4 bg-[#1F2937] border border-white/10 rounded-3xl z-[300] shadow-2xl max-h-[300px] overflow-y-auto scrollbar-hide animate-in zoom-in-95">
                        {BRANDS.map(b => (
                          <button key={b} onClick={() => { handleLockDetailsChange({ brand: b }); setShowBrandPicker(false); }} className="w-full px-4 py-3 text-xs font-bold text-gray-300 hover:bg-blue-600 hover:text-white rounded-xl text-left uppercase transition-all mb-1 active:scale-95">{b}</button>
                        ))}
                        <button onClick={() => setShowCustomBrandInput(true)} className="w-full px-4 py-3 text-xs font-bold text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl text-left uppercase transition-all active:scale-95 border border-blue-500/20 mt-2">Add Custom Brand</button>
                        {showCustomBrandInput && (
                          <div className="p-2 mt-2 space-y-2">
                            <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none" placeholder="Enter brand..." value={customBrand} onChange={e => setCustomBrand(e.target.value)} />
                            <button onClick={() => { if(customBrand) { handleLockDetailsChange({ brand: customBrand }); setShowBrandPicker(false); setShowCustomBrandInput(false); setCustomBrand(''); } }} className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-bold uppercase">Save Brand</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1 tracking-widest">Model or Year</label>
                    <input className="w-full bg-transparent text-xs font-bold text-white uppercase outline-none" value={localJob.lockDetails.modelOrYear || ''} onChange={e => handleLockDetailsChange({ modelOrYear: e.target.value })} placeholder="MANUAL INPUT" />
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1 tracking-widest">VIN / Key Code</label>
                    <input className="w-full bg-transparent text-xs font-bold text-white uppercase outline-none" value={localJob.lockDetails.vinOrKeyCode || ''} onChange={e => handleLockDetailsChange({ vinOrKeyCode: e.target.value })} placeholder="MANUAL INPUT" />
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1 tracking-widest">Hardware Finish</label>
                    <input className="w-full bg-transparent text-xs font-bold text-white uppercase outline-none" value={localJob.lockDetails.hardwareFinish || ''} onChange={e => handleLockDetailsChange({ hardwareFinish: e.target.value })} placeholder="E.G. BRUSHED NICKEL" />
                  </div>
                </div>
              </section>

              {/* MESSAGE HISTORY - MOVED TO SIDEBAR */}
              <section className="bg-slate-950 p-8 rounded-2xl border border-white/10 flex flex-col flex-1 min-h-[400px] shadow-2xl">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center">
                  <MessageSquare size={16} className="mr-3 text-blue-500" /> 
                  Message History
                </h3>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                  {localJob.messages && localJob.messages.length > 0 ? (
                    localJob.messages.map(msg => (
                      <div key={msg.id} className={`flex flex-col ${msg.sender === 'technician' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium leading-relaxed ${msg.sender === 'technician' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/5 text-gray-300 rounded-tl-none'}`}>
                          {msg.content}
                        </div>
                        <span className="text-xs font-bold text-gray-700 uppercase mt-1 tracking-widest">{msg.timestamp}</span>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <MessageSquare size={32} className="mb-2" />
                       <p className="text-xs font-bold uppercase tracking-widest">No Messages</p>
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-6 border-t border-white/10">
                   <div className="bg-white/5 rounded-2xl p-4 flex items-center">
                      <input 
                        className="flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-gray-700" 
                        placeholder="Type message..." 
                        value={draftMessage}
                        onChange={e => setDraftMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      />
                      <button onClick={handleSendMessage} className="p-2 text-blue-500 hover:text-white transition-colors"><Send size={16} /></button>
                   </div>
                </div>
              </section>
            </div>

            {/* MAIN OPERATIONAL HUB */}
            <div className="lg:col-span-8 flex flex-col space-y-8">
              
              {/* INVOICE — full A4 professional document */}
              <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10">

                {/* ── TOOLBAR (dark) ── */}
                <div className="bg-slate-900 px-5 py-2.5 flex items-center gap-2 flex-wrap border-b border-white/10">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-1">Add:</span>
                  {([
                    { id: 'labor',        label: 'Labor',      icon: Hammer,   color: 'text-blue-400' },
                    { id: 'part',         label: 'Part',       icon: Package,  color: 'text-amber-400' },
                    { id: 'service_call', label: 'Diagnostic', icon: Activity, color: 'text-red-400' },
                    { id: 'maintenance',  label: 'Other',      icon: Wrench,   color: 'text-indigo-400' },
                  ] as { id: LineItem['type']; label: string; icon: any; color: string }[]).map(btn => (
                    <button key={btn.id}
                      onClick={() => setBillingPrompt({ open: true, type: btn.id, desc: '', price: '' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all active:scale-95">
                      <Plus size={11} className={btn.color} />
                      <span className="text-slate-300 uppercase tracking-wide">{btn.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── PAPER (white A4) ── */}
                <div className="bg-white text-slate-900 px-9 pt-8 pb-7 flex flex-col gap-5">

                  {/* 1 · LETTERHEAD */}
                  <div className="flex items-start justify-between pb-5 border-b-2 border-blue-700">
                    <div className="space-y-0.5">
                      <p className="text-[22px] font-extrabold text-blue-700 tracking-tight leading-none">{companyName}</p>
                      {companyAddress && <p className="text-xs text-slate-500 mt-1">{companyAddress}</p>}
                      {companyCity   && <p className="text-xs text-slate-500">{companyCity}</p>}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {companyPhone && <span className="text-xs text-slate-500">☎ {companyPhone}</span>}
                        {companyEmail && <span className="text-xs text-slate-500">✉ {companyEmail}</span>}
                        {licenseNumber && <span className="text-[10px] font-bold text-slate-400 uppercase">Lic# {licenseNumber}</span>}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5 min-w-[160px]">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Invoice</p>
                      <p className="text-xl font-extrabold text-slate-800 tracking-tight">#{localJob.jobNumber}</p>
                      <p className="text-xs text-slate-500">Date: {localJob.scheduledDate}</p>
                      <p className="text-xs text-slate-500">Due: Upon Receipt</p>
                      <span className={`inline-block mt-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${localJob.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {localJob.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Payment Due'}
                      </span>
                    </div>
                  </div>

                  {/* 2 · PARTIES + JOB INFO */}
                  <div className="grid grid-cols-3 gap-4 pb-5 border-b border-slate-100">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bill To</p>
                      <p className="text-sm font-bold text-slate-800">{localJob.client.firstName} {localJob.client.lastName}</p>
                      {localJob.client.phone   && <p className="text-xs text-slate-500 mt-0.5">{localJob.client.phone}</p>}
                      {localJob.client.email   && <p className="text-xs text-slate-500 mt-0.5">{localJob.client.email}</p>}
                      {localJob.client.address && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{localJob.client.address}</p>}
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Service Location</p>
                      <p className="text-xs text-slate-700 leading-relaxed">{localJob.client.address || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Equipment / Job</p>
                      <p className="text-xs font-semibold text-slate-700">{localJob.lockDetails.type}</p>
                      {localJob.lockDetails.brand && <p className="text-xs text-slate-500 mt-0.5">{localJob.lockDetails.brand}{localJob.lockDetails.modelOrYear ? ` · ${localJob.lockDetails.modelOrYear}` : ''}</p>}
                      {localJob.lockDetails.vinOrKeyCode && <p className="text-xs text-slate-400 mt-0.5 font-mono">Key: {localJob.lockDetails.vinOrKeyCode}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">Tech: {technicianName}</p>
                    </div>
                  </div>

                  {/* 3 · LINE ITEMS */}
                  <div>
                    {/* Table head */}
                    <div className="grid grid-cols-12 gap-1 pb-2 border-b border-slate-300">
                      <p className="col-span-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">#</p>
                      <p className="col-span-5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Description</p>
                      <p className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Qty</p>
                      <p className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Unit Price</p>
                      <p className="col-span-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Amount</p>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-slate-100 min-h-[80px]">
                      {localJob.lineItems.length === 0
                        ? <p className="py-5 text-center text-xs text-slate-300 italic">No line items yet</p>
                        : localJob.lineItems.map((item, idx) => (
                          <div key={item.id} className="grid grid-cols-12 gap-1 py-2.5 items-start group hover:bg-blue-50/30 rounded transition-colors -mx-1 px-1">
                            <p className="col-span-1 text-xs text-slate-400">{idx + 1}</p>
                            <div className="col-span-5 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{item.description}</p>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600/70">{item.type.replace('_', ' ')}</span>
                            </div>
                            <p className="col-span-2 text-xs text-slate-600 text-center pt-0.5">{item.quantity}</p>
                            <p className="col-span-2 text-xs text-slate-600 text-right pt-0.5">${item.unitPrice.toFixed(2)}</p>
                            <div className="col-span-2 flex items-start justify-end gap-0.5">
                              <span className="text-xs font-bold text-slate-800 tabular-nums">${(item.unitPrice * item.quantity).toFixed(2)}</span>
                              <button onClick={() => handleRemoveLineItem(item.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition-all shrink-0 mt-0.5"><Trash2 size={11} /></button>
                            </div>
                          </div>
                        ))
                      }
                    </div>

                    {/* Totals */}
                    <div className="mt-3 pt-3 border-t-2 border-slate-200 flex justify-end">
                      <div className="w-56 space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Subtotal</span>
                          <span>${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Tax / Fees</span>
                          <span>$0.00</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-2 border-t border-slate-300">
                          <span className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">Total Due</span>
                          <span className="text-2xl font-extrabold text-slate-900 tabular-nums">${subtotal.toFixed(2)}</span>
                        </div>
                        {localJob.paymentStatus === 'paid' && (
                          <div className="flex justify-between text-xs text-green-600 font-bold pt-1">
                            <span>Amount Paid</span>
                            <span>— ${subtotal.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4 · PAYMENT METHOD + TERMS */}
                  <div className="flex items-center justify-between py-3 border-y border-slate-100">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Accepted Payment</p>
                      <div className="flex items-center gap-2">
                        {['Cash', 'Card', 'Check', 'Zelle'].map(m => (
                          <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 bg-slate-50">{m}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Terms</p>
                      <p className="text-xs font-semibold text-slate-600">Due on Receipt</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Labor: 90-day warranty</p>
                    </div>
                  </div>

                  {/* 5 · SIGNATURE BLOCK */}
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Technician</p>
                      <div className="h-8 border-b border-slate-300" />
                      <p className="text-xs text-slate-500 mt-1">{technicianName}{licenseNumber ? ` · Lic# ${licenseNumber}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Client Authorization</p>
                      <p className="text-[9px] text-slate-400 italic mb-2">I authorize the work described above and agree to the terms.</p>
                      <div className="h-8 border-b border-slate-300" />
                      <p className="text-[9px] text-slate-400 mt-1">Signature &amp; Date</p>
                    </div>
                  </div>

                  {/* 6 · FOOTER */}
                  <p className="text-[9px] text-slate-300 text-center pt-4 border-t border-slate-100">
                    Thank you for choosing {companyName} · {companyPhone} · {companyEmail}
                  </p>
                </div>

                {/* ── ACTION BAR (dark) ── */}
                <div className="bg-slate-900 px-5 py-3 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPaymentStep('split')}
                    disabled={localJob.paymentStatus === 'paid'}
                    className={`py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 ${
                      localJob.paymentStatus === 'paid'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30'
                    }`}
                  >
                    {localJob.paymentStatus === 'paid' ? <><CheckCircle2 size={14} /> Settled</> : <><CreditCard size={14} /> Collect Payment</>}
                  </button>
                  <button onClick={handlePrintInvoice} className="py-3 rounded-xl font-bold uppercase text-xs tracking-wider bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <Printer size={14} /> Print Invoice
                  </button>
                </div>
              </div>

              {/* OPERATIONAL LOGS */}
              <div className="flex flex-col space-y-8 shrink-0">
                 <div className="bg-gray-900 p-8 rounded-2xl border border-slate-700 flex flex-col space-y-6 shadow-md">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><ClipboardList size={16} className="mr-3 text-blue-500" /> Intake</h3>
                    <div className="h-48 bg-transparent border border-slate-700 rounded-2xl p-6 text-sm font-medium text-gray-300 italic overflow-y-auto scrollbar-hide">"{localJob.complaint}"</div>
                 </div>
                 <div className="bg-gray-900 p-8 rounded-2xl border border-slate-700 flex flex-col space-y-6 shadow-md">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Stethoscope size={16} className="mr-3 text-green-500" /> Diagnostic</h3>
                    <textarea 
                      className="h-48 bg-transparent border border-slate-700 rounded-2xl p-6 text-sm font-bold text-white leading-relaxed resize-none outline-none focus:border-blue-500 transition-all placeholder:text-slate-500"
                      value={localJob.diagnosisNotes}
                      onChange={e => handleLocalChange({ diagnosisNotes: e.target.value })}
                      placeholder="Input findings..."
                    />
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
