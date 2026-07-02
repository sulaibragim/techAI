import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { User, Target, Key, RotateCcw, Save, Upload, Info, Building2, AlertTriangle, Users, Plus, Trash2, ShieldCheck, History, Lock, Pencil, Check, X, Tag } from 'lucide-react';
import { useSettingsStore, SETTINGS_DEFAULTS, settingsStorageIsEphemeral } from '../settingsStore';
import { useAuthStore, useCurrentUser, can, ROLE_LABELS } from '../authStore';
import { useAppStore } from '../store';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { Role, TECH_SKILLS, SERVICE_CATEGORIES } from '../types';
import { PushNotificationsCard } from './PushNotificationsCard';

const VERSION = '0.0.0';

const Section = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-slate-900 border border-white/5 rounded-2xl p-6"
  >
    <div className="flex items-center space-x-3 mb-6">
      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
        <Icon size={16} className="text-blue-400" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-widest text-white">{title}</h3>
    </div>
    <div className="space-y-5">{children}</div>
  </motion.div>
);

export const Settings: React.FC = () => {
  const settings = useSettingsStore();
  const currentUser = useCurrentUser();
  const [form, setForm] = useState({
    technicianName: settings.technicianName,
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    companyCity: settings.companyCity,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    googleReviewUrl: settings.googleReviewUrl,
    licenseNumber: settings.licenseNumber,
    profilePhoto: settings.profilePhoto,
    monthlyRevenueTarget: settings.monthlyRevenueTarget,
    dailyRevenueTarget: settings.dailyRevenueTarget,
  });
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [showStartFresh, setShowStartFresh] = useState(false);
  const [freshConfirm, setFreshConfirm] = useState('');
  const [freshBusy, setFreshBusy] = useState(false);
  const [freshError, setFreshError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  const handleStartFresh = async () => {
    setFreshBusy(true);
    setFreshError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reset`, {
        method: 'POST',
        headers: { ...authHeaders() },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        setFreshError(
          res.status === 404
            ? 'The reset feature is still rolling out to the server. Wait a minute for the update to finish, then try again.'
            : res.status === 401 || res.status === 403
            ? 'Only the owner can reset, and your session must be valid. Try logging out and back in.'
            : 'The server refused the reset. Try again in a moment.'
        );
        setFreshBusy(false);
        return;
      }
      // Hard-wipe this device so nothing stale can re-upload or re-render:
      // persisted Zustand stores, AI chat, and the PWA service-worker caches.
      try { (useAppStore as any).persist?.clearStorage?.(); } catch { /* ignore */ }
      try {
        ['techai-crm-store-v3', 'techai-settings-v2', 'techai-brain-chat'].forEach(k => localStorage.removeItem(k));
      } catch { /* ignore */ }
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch { /* ignore */ }
      try {
        const regs = await navigator.serviceWorker?.getRegistrations();
        await Promise.all((regs || []).map(r => r.unregister()));
      } catch { /* ignore */ }
      window.location.reload();
    } catch {
      clearTimeout(timer);
      setFreshError('The server did not respond — it may still be deploying. Wait a minute and try again.');
      setFreshBusy(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Photo must be under 2MB');
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, profilePhoto: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    try {
      settings.updateSettings({
        ...form,
        monthlyRevenueTarget: Math.max(1, form.monthlyRevenueTarget),
        dailyRevenueTarget: Math.max(1, form.dailyRevenueTarget),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        setPhotoError('Storage full — try a smaller photo or clear browser data.');
      }
    }
  };

  const handleReset = () => {
    settings.resetSettings();
    setForm({
      technicianName: SETTINGS_DEFAULTS.technicianName,
      companyName: SETTINGS_DEFAULTS.companyName,
      companyAddress: SETTINGS_DEFAULTS.companyAddress,
      companyCity: SETTINGS_DEFAULTS.companyCity,
      companyPhone: SETTINGS_DEFAULTS.companyPhone,
      companyEmail: SETTINGS_DEFAULTS.companyEmail,
      googleReviewUrl: SETTINGS_DEFAULTS.googleReviewUrl,
      licenseNumber: SETTINGS_DEFAULTS.licenseNumber,
      profilePhoto: SETTINGS_DEFAULTS.profilePhoto,
      monthlyRevenueTarget: SETTINGS_DEFAULTS.monthlyRevenueTarget,
      dailyRevenueTarget: SETTINGS_DEFAULTS.dailyRevenueTarget,
    });
    setShowReset(false);
  };

  const inputCls = "w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all text-sm";
  const labelCls = "block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {settingsStorageIsEphemeral && (
        <div className="flex items-center space-x-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 font-semibold">
          <AlertTriangle size={16} className="shrink-0" />
          <span>Private/incognito mode detected — settings will not persist after this tab is closed.</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">System Core</p>
          <h2 className="text-2xl font-bold text-white">Preferences</h2>
        </div>
        <div className="flex items-center space-x-3">
          {currentUser && currentUser.role !== 'technician' && (
            <button
              onClick={() => setShowReset(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-all text-xs font-semibold uppercase tracking-wider"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all text-xs font-bold uppercase tracking-wider"
          >
            <Save size={14} />
            <span>{saved ? 'Saved!' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notifications — visible to all; techs get assignment pings, dispatch gets message pings */}
        <PushNotificationsCard />

        {/* Profile is visible to all — they can change their own name/photo */}
        <Section icon={User} title="Profile">
          <div className="flex items-center space-x-4 mb-2">
            <div
              onClick={() => photoRef.current?.click()}
              className="w-16 h-16 rounded-2xl bg-slate-800 border border-white/10 overflow-hidden cursor-pointer hover:border-blue-500/40 transition-all flex items-center justify-center shrink-0"
            >
              {form.profilePhoto
                ? <img src={form.profilePhoto} className="w-full h-full object-cover" alt="Profile" />
                : <Upload size={20} className="text-slate-500" />
              }
            </div>
            <div>
              <p className="text-xs font-semibold text-white mb-1">Profile Photo</p>
              <p className="text-xs text-slate-500">Click to upload · Max 2MB</p>
              {photoError && <p className="text-xs text-red-400 mt-1">{photoError}</p>}
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          <div>
            <label className={labelCls}>Technician Name</label>
            <input
              className={inputCls}
              maxLength={50}
              value={form.technicianName}
              onChange={e => setForm(f => ({ ...f, technicianName: e.target.value }))}
              placeholder="Your name"
            />
          </div>

          <div>
            <label className={labelCls}>Company Name</label>
            <input
              className={inputCls}
              maxLength={100}
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="Your company"
            />
          </div>
        </Section>

        {currentUser && currentUser.role !== 'technician' && <Section icon={Building2} title="Company Info">
          <div>
            <label className={labelCls}>Street Address</label>
            <input
              className={inputCls}
              maxLength={120}
              value={form.companyAddress}
              onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))}
              placeholder="123 Main Street, Suite 100"
            />
          </div>
          <div>
            <label className={labelCls}>City, State ZIP</label>
            <input
              className={inputCls}
              maxLength={80}
              value={form.companyCity}
              onChange={e => setForm(f => ({ ...f, companyCity: e.target.value }))}
              placeholder="Portland, OR 97201"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input
                className={inputCls}
                maxLength={20}
                value={form.companyPhone}
                onChange={e => setForm(f => ({ ...f, companyPhone: e.target.value }))}
                placeholder="(503) 555-0100"
              />
            </div>
            <div>
              <label className={labelCls}>License #</label>
              <input
                className={inputCls}
                maxLength={30}
                value={form.licenseNumber}
                onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))}
                placeholder="LK-00000"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Business Email</label>
            <input
              className={inputCls}
              type="email"
              maxLength={100}
              value={form.companyEmail}
              onChange={e => setForm(f => ({ ...f, companyEmail: e.target.value }))}
              placeholder="info@yourbusiness.com"
            />
          </div>
          <p className="text-xs text-slate-500 -mt-1">Appears on all printed invoices</p>
          <div>
            <label className={labelCls}>Google Review Link</label>
            <input
              className={inputCls}
              type="url"
              maxLength={300}
              value={form.googleReviewUrl}
              onChange={e => setForm(f => ({ ...f, googleReviewUrl: e.target.value }))}
              placeholder="https://g.page/r/…/review"
            />
            <p className="text-xs text-slate-500 mt-1">Enables a one-tap “Ask for a review” text on completed jobs. Leave blank to hide it.</p>
          </div>
        </Section>}

        {currentUser && currentUser.role !== 'technician' && <Section icon={Target} title="Business Targets">
          <div>
            <label className={labelCls}>Monthly Revenue Target ($)</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              value={form.monthlyRevenueTarget}
              onChange={e => setForm(f => ({ ...f, monthlyRevenueTarget: Math.max(1, Number(e.target.value) || 1) }))}
            />
            <p className="text-xs text-slate-500 mt-1">Used in Analytics and Workroom KPIs</p>
          </div>

          <div>
            <label className={labelCls}>Daily Revenue Target ($)</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              value={form.dailyRevenueTarget}
              onChange={e => setForm(f => ({ ...f, dailyRevenueTarget: Math.max(1, Number(e.target.value) || 1) }))}
            />
            <p className="text-xs text-slate-500 mt-1">Used in daily goal tracker</p>
          </div>
        </Section>}

        {currentUser && (currentUser.role === 'owner' || currentUser.role === 'manager') && <RatesSection />}

        {currentUser && currentUser.role !== 'technician' && <Section icon={Key} title="AI Configuration">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">AI Brain</p>
              <p className="text-xs text-slate-500 mt-1">
                {settings.aiAvailable
                  ? 'Ключ Gemini хранится на сервере. В браузер не передаётся.'
                  : 'Не настроен. Задайте GEMINI_API_KEY в переменных окружения сервера (Railway).'}
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              settings.aiAvailable
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {settings.aiAvailable ? <Check size={13} /> : <AlertTriangle size={13} />}
              {settings.aiAvailable ? 'Configured' : 'Not set'}
            </span>
          </div>
        </Section>}

        <Section icon={Info} title="About">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-slate-400 uppercase tracking-wider">App</span>
              <span className="text-xs font-semibold text-white">TrustKey Locksmith</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Version</span>
              <span className="text-xs font-mono text-blue-400">v{VERSION}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Stack</span>
              <span className="text-xs text-slate-300">React 19 + Gemini AI</span>
            </div>
          </div>
        </Section>
      </div>

      {currentUser && can.manageUsers(currentUser.role) && (
        <>
          <TeamSection />
          <AuditSection />
        </>
      )}

      {currentUser?.role === 'owner' && (
        <Section icon={AlertTriangle} title="Danger Zone">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Start Fresh</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">Permanently wipes all jobs, inventory and team members (except your owner account), then re-runs onboarding so you can set up the company from scratch.</p>
            </div>
            <button
              onClick={() => { setShowStartFresh(true); setFreshConfirm(''); setFreshError(''); }}
              className="shrink-0 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
            >
              Start Fresh
            </button>
          </div>
        </Section>
      )}

      {showStartFresh && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle className="text-red-500" size={24} /></div>
              <div>
                <h3 className="text-lg font-bold text-white">Start Fresh — wipe everything?</h3>
                <p className="text-xs text-red-400 font-semibold">This cannot be undone.</p>
              </div>
            </div>
            <ul className="text-sm text-slate-300 space-y-1 list-disc pl-5">
              <li>All jobs &amp; invoices</li>
              <li>All inventory</li>
              <li>All team members except your owner account</li>
              <li>Company settings (you'll re-run onboarding)</li>
            </ul>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Type <span className="text-white">RESET</span> to confirm</label>
              <input
                value={freshConfirm}
                onChange={e => setFreshConfirm(e.target.value)}
                placeholder="RESET"
                autoFocus
                className="mt-2 w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500/50"
              />
            </div>
            {freshError && <p className="text-xs font-semibold text-red-400">{freshError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowStartFresh(false)} disabled={freshBusy} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-sm font-semibold hover:bg-white/10 transition-all disabled:opacity-50">Cancel</button>
              <button
                onClick={handleStartFresh}
                disabled={freshConfirm.trim().toUpperCase() !== 'RESET' || freshBusy}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white text-sm font-bold transition-all"
              >
                {freshBusy ? 'Wiping…' : 'Wipe & Start Fresh'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showReset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white mb-2">Reset all settings?</h3>
            <p className="text-sm text-slate-400 mb-6">This will restore all defaults and clear saved preferences.</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowReset(false)}
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-sm font-semibold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white text-sm font-bold transition-all"
              >
                Reset
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

const RatesSection: React.FC = () => {
  const priceBook = useSettingsStore(s => s.priceBook);
  const updateServiceRate = useSettingsStore(s => s.updateServiceRate);
  const addServiceRate = useSettingsStore(s => s.addServiceRate);
  const removeServiceRate = useSettingsStore(s => s.removeServiceRate);
  const fieldCls = 'bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500/50';

  return (
    <Section icon={Tag} title="Service Rates">
      <p className="text-xs text-slate-500 -mt-2">Tap-to-fill prices on invoices. Seeded from trustkeyaz.com — edit anytime; changes apply everywhere.</p>
      {SERVICE_CATEGORIES.map(cat => {
        const rates = priceBook.filter(r => r.category === cat);
        if (rates.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{cat}</p>
            <div className="space-y-2">
              {rates.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <input value={r.name} onChange={e => updateServiceRate({ ...r, name: e.target.value })} className={`${fieldCls} flex-1 min-w-0`} />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-slate-500 text-sm">$</span>
                    <input type="number" value={r.price} onChange={e => updateServiceRate({ ...r, price: Number(e.target.value) || 0 })} className={`${fieldCls} w-20 text-right font-mono text-green-400`} />
                  </div>
                  <button onClick={() => removeServiceRate(r.id)} className="shrink-0 text-slate-500 hover:text-red-400 p-1" aria-label="Remove rate"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button onClick={() => addServiceRate({ name: 'New service', category: 'Lockout', price: 0, type: 'labor' })} className="flex items-center gap-1.5 text-blue-400 text-sm font-bold"><Plus size={15} /> Add rate</button>
    </Section>
  );
};

const ROLES: Role[] = ['owner', 'manager', 'technician', 'accountant'];

const TeamSection: React.FC = () => {
  const { users, addUser, updateUser, removeUser } = useAuthStore();
  const currentUser = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', password: '', phone: '', role: 'technician' as Role, commissionRate: 30 });
  const [err, setErr] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const togglePasswordVisibility = (id: string) => setVisiblePasswords(p => ({ ...p, [id]: !p[id] }));

  const startEditPassword = (u: { id: string }) => {
    setEditingPassword(u.id);
    setNewPassword('');
  };

  const savePassword = (u: any) => {
    if (newPassword.trim()) {
      updateUser({ ...u, password: newPassword.trim() });
    }
    setEditingPassword(null);
    setNewPassword('');
  };

  const startEditEmail = (u: { id: string; email: string }) => {
    setEditingEmail(u.id);
    setNewEmail(u.email);
  };

  const saveEmail = (u: any) => {
    if (newEmail.trim() && newEmail.includes('@')) {
      updateUser({ ...u, email: newEmail.trim() });
    }
    setEditingEmail(null);
    setNewEmail('');
  };

  const startEditPhone = (u: { id: string; phone?: string }) => {
    setEditingPhone(u.id);
    setNewPhone(u.phone || '');
  };

  const savePhone = (u: any) => {
    updateUser({ ...u, phone: newPhone.trim() || undefined });
    setEditingPhone(null);
    setNewPhone('');
  };

  const handleAdd = () => {
    if (!draft.name.trim() || !draft.email.trim() || !draft.password.trim()) { setErr('Name, email and password are required.'); return; }
    if (users.some(u => u.email.trim().toLowerCase() === draft.email.trim().toLowerCase())) { setErr('That email is already in use.'); return; }
    addUser({
      name: draft.name.trim(),
      email: draft.email.trim(),
      password: draft.password,
      phone: draft.phone.trim() || undefined,
      role: draft.role,
      commissionRate: draft.role === 'technician' ? draft.commissionRate : undefined,
      active: true,
    });
    setDraft({ name: '', email: '', password: '', phone: '', role: 'technician', commissionRate: 30 });
    setErr('');
    setShowAdd(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-white/5 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Users size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Team & Access</h3>
            <p className="text-xs text-slate-500 mt-0.5">Owner-only · manage staff, roles & credentials</p>
          </div>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setErr(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          <Plus size={14} /> Add Staff
        </button>
      </div>

      {showAdd && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50" placeholder="Full name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            <input className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50" placeholder="Email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
            <input type="tel" className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50" placeholder="Phone (for SMS alerts, +1...)" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
            <input className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50" placeholder="Password" value={draft.password} onChange={e => setDraft(d => ({ ...d, password: e.target.value }))} />
            <select className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50" value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as Role }))}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            {draft.role === 'technician' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Commission rate (%)</label>
                <input type="number" min={0} max={100} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50" value={draft.commissionRate} onChange={e => setDraft(d => ({ ...d, commissionRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} />
              </div>
            )}
          </div>
          {err && <p className="text-xs font-semibold text-red-400">{err}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setShowAdd(false); setErr(''); }} className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all">Cancel</button>
            <button onClick={handleAdd} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all">Create Account</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.map(u => {
          const isSelf = u.id === currentUser?.id;
          const pwVisible = visiblePasswords[u.id];
          const isEditingPw = editingPassword === u.id;
          const isEditingEm = editingEmail === u.id;
          const isEditingPhone = editingPhone === u.id;
          return (
            <div key={u.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                  {u.photo
                    ? <img src={u.photo} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center bg-blue-600/20 text-blue-300 text-sm font-bold">{(u.name || 'U').slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate flex items-center gap-2">
                    {u.name}
                    {isSelf && <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">You</span>}
                    {!u.active && <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">Disabled</span>}
                  </p>
                  {isEditingEm ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEmail(u)}
                        autoFocus
                        className="bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white w-48 focus:outline-none"
                      />
                      <button onClick={() => saveEmail(u)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                      <button onClick={() => setEditingEmail(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 group/email">
                      {u.email}
                      <button onClick={() => startEditEmail(u)} className="opacity-0 group-hover/email:opacity-100 text-slate-500 hover:text-blue-400 transition-all"><Pencil size={10} /></button>
                    </p>
                  )}
                  {isEditingPhone ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && savePhone(u)}
                        autoFocus
                        placeholder="+1..."
                        className="bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white w-40 focus:outline-none"
                      />
                      <button onClick={() => savePhone(u)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                      <button onClick={() => setEditingPhone(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 group/phone">
                      {u.phone || <span className="italic text-slate-600">No phone — add for SMS</span>}
                      <button onClick={() => startEditPhone(u)} className="opacity-0 group-hover/phone:opacity-100 text-slate-500 hover:text-blue-400 transition-all"><Pencil size={10} /></button>
                    </p>
                  )}
                </div>
                {!isSelf && (
                  <button
                    onClick={() => { if (confirm(`Remove ${u.name}? This cannot be undone.`)) removeUser(u.id); }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-all shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5">
                  <Lock size={12} className="text-slate-500 shrink-0" />
                  {isEditingPw ? (
                    <>
                      <input
                        type="text"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && savePassword(u)}
                        autoFocus
                        placeholder="New password"
                        className="bg-transparent text-sm font-mono text-white w-28 outline-none placeholder:text-slate-600"
                      />
                      <button onClick={() => savePassword(u)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                      <button onClick={() => setEditingPassword(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono text-slate-500 select-none" title="Passwords are hashed on the server and never shown here">••••••</span>
                      <button onClick={() => startEditPassword(u)} className="text-slate-500 hover:text-blue-400 transition-colors" title="Set new password">
                        <Pencil size={12} />
                      </button>
                    </>
                  )}
                </div>

                <select
                  value={u.role}
                  disabled={isSelf}
                  onChange={e => {
                    const role = e.target.value as Role;
                    updateUser({ ...u, role, commissionRate: role === 'technician' ? (u.commissionRate ?? 30) : u.commissionRate });
                  }}
                  className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-300 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                >
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>

                {u.role === 'technician' && (
                  <div className="flex items-center gap-1.5 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Commission</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={u.commissionRate ?? 0}
                      onChange={e => updateUser({ ...u, commissionRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-12 bg-transparent text-sm font-bold text-white text-right outline-none"
                    />
                    <span className="text-sm font-bold text-slate-400">%</span>
                  </div>
                )}

                {!isSelf && (
                  <button
                    onClick={() => updateUser({ ...u, active: !u.active })}
                    className="ml-auto px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
                  >
                    {u.active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>

              {u.role === 'technician' && (
                <div className="border-t border-white/5 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Specialties — used to route the right jobs here</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TECH_SKILLS.map(skill => {
                      const on = (u.skills || []).includes(skill);
                      return (
                        <button
                          key={skill}
                          onClick={() => {
                            const cur = u.skills || [];
                            updateUser({ ...u, skills: on ? cur.filter(s => s !== skill) : [...cur, skill] });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${on ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-white/5 text-slate-500 border-white/10 hover:text-white'}`}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-600 mt-4 flex items-center gap-1.5">
        <ShieldCheck size={12} /> Passwords are hashed on the server (bcrypt) and are never stored in your browser. Setting one here updates it on the server.
      </p>
    </motion.div>
  );
};

const AuditSection: React.FC = () => {
  const { audit, clearAudit } = useAuthStore();

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-white/5 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <History size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Activity Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">Who changed what, and when</p>
          </div>
        </div>
        {audit.length > 0 && (
          <button onClick={() => { if (confirm('Clear the activity log?')) clearAudit(); }} className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-red-400 transition-all">Clear</button>
        )}
      </div>

      {audit.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-4 text-center">No activity recorded yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-hide">
          {audit.map(a => (
            <div key={a.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">{ROLE_LABELS[a.role]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white truncate"><span className="font-semibold">{a.userName}</span> · {a.detail}</p>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">{fmt(a.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
