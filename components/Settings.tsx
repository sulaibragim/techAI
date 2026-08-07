import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { User, Target, Key, RotateCcw, Save, Upload, Info, Building2, AlertTriangle, Users, Plus, Trash2, ShieldCheck, History, Lock, Pencil, Check, X, Tag, BrainCircuit, MessageSquare, BellRing, Wrench } from 'lucide-react';
import { useSettingsStore, SETTINGS_DEFAULTS, settingsStorageIsEphemeral } from '../settingsStore';
import { useAuthStore, useCurrentUser, can, worksField, ROLE_LABELS, MIN_PASSWORD_LENGTH } from '../authStore';
import { useAppStore } from '../store';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';
import { Role, TECH_SKILLS, SERVICE_CATEGORIES, CLIENT_SMS_META, CLIENT_SMS_DEFAULTS, STAFF_NOTIFY_META, STAFF_NOTIFY_DEFAULTS } from '../types';
import { PushNotificationsCard } from './PushNotificationsCard';
import { LaunchReadinessCard } from './LaunchReadinessCard';
import { SMS_TEMPLATES, resolveSmsTemplate, fillSmsTemplate, SmsLang } from '../smsTemplates';
import { smsInfo, sanitizeSms } from '../smsText';

const VERSION = '1.0.0';

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
  const [resetConfirm, setResetConfirm] = useState('');
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
    if (resetConfirm.trim().toUpperCase() !== 'RESET') return;
    settings.resetSettings();
    setResetConfirm('');
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
          {/* Owner only: Reset does not just clear UI preferences — it wipes the company's
              expense ledger, stock-movement history, price book and client profiles from
              the SERVER, for every device, with no undo. That is not a manager's call. */}
          {currentUser && currentUser.role === 'owner' && (
            <button
              onClick={() => { setResetConfirm(''); setShowReset(true); }}
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

          {currentUser && <SignaturePad />}
        </Section>

        {currentUser && isBackOffice(currentUser.role) && <Section icon={Building2} title="Company Info">
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

        {currentUser && isBackOffice(currentUser.role) && <Section icon={MessageSquare} title="Client Messages">
          <p className="text-xs text-slate-400 -mt-1">
            Automatic texts the customer receives. Turn off anything you don’t want them to get — manual buttons (On My Way, pay link, receipt, review) are never affected.
          </p>
          <div className="space-y-2">
            {CLIENT_SMS_META.map(m => {
              const on = (settings.clientSms || CLIENT_SMS_DEFAULTS)[m.key];
              return (
                <div key={m.key} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{m.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">{m.stage}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={m.label}
                    onClick={() => {
                      const cur = settings.clientSms || CLIENT_SMS_DEFAULTS;
                      settings.updateSettings({ clientSms: { ...cur, [m.key]: !cur[m.key] } });
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Section>}

        {currentUser && (currentUser.role === 'owner' || currentUser.role === 'manager') && <SmsTemplatesSection />}

        {currentUser && isBackOffice(currentUser.role) && <Section icon={BellRing} title="Notifications to us">
          <p className="text-xs text-slate-400 -mt-1">
            Automatic messages the <span className="text-white font-semibold">team</span> receives — not the customer. Turning one off stops that alert for everyone; nothing here changes what clients get.
          </p>
          <div className="space-y-2">
            {STAFF_NOTIFY_META.map(m => {
              const on = (settings.staffNotify || STAFF_NOTIFY_DEFAULTS)[m.key];
              return (
                <div key={m.key} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{m.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">{m.who}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={m.label}
                    onClick={() => {
                      const cur = settings.staffNotify || STAFF_NOTIFY_DEFAULTS;
                      settings.updateSettings({ staffNotify: { ...cur, [m.key]: !cur[m.key] } });
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Section>}

        {currentUser && isBackOffice(currentUser.role) && <Section icon={Target} title="Business Targets">
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

        {currentUser?.role === 'owner' && <LaunchReadinessCard />}

        {currentUser && (currentUser.role === 'owner' || currentUser.role === 'manager') && <RatesSection />}

        {currentUser && (currentUser.role === 'owner' || currentUser.role === 'manager') && <MemoriesSection />}

        {currentUser && isBackOffice(currentUser.role) && <Section icon={Key} title="AI Configuration">
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
            <h3 className="text-lg font-bold text-white mb-2">Factory reset — this destroys data</h3>
            <p className="text-sm text-slate-400 mb-3">
              This permanently deletes the following <span className="text-red-300 font-semibold">from the server, on every device</span>:
            </p>
            <ul className="text-sm text-slate-300 mb-4 space-y-1 list-disc list-inside">
              <li>every expense in the accounting ledger</li>
              <li>the entire stock-movement history</li>
              <li>your custom price book (back to defaults)</li>
              <li>all client reputation profiles &amp; notes</li>
              <li>company info, targets and AI standing instructions</li>
            </ul>
            <p className="text-xs text-slate-500 mb-2">Jobs and inventory counts are not affected. There is no undo.</p>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Type RESET to confirm
            </label>
            <input
              value={resetConfirm}
              onChange={e => setResetConfirm(e.target.value)}
              autoFocus
              placeholder="RESET"
              className="w-full mb-6 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500/50"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => { setShowReset(false); setResetConfirm(''); }}
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-sm font-semibold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetConfirm.trim().toUpperCase() !== 'RESET'}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl text-white text-sm font-bold transition-all"
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

// Owner-editable texts behind the one-tap client SMS buttons (On my way, ETA update…).
// The counter previews the real cost with sample values: 1 SMS is the goal — an emoji
// or a long edit silently makes every send 2-3x pricier, so the price is shown here too.
const SmsTemplatesSection: React.FC = () => {
  const overrides = useSettingsStore(s => s.smsTemplates);
  const companyName = useSettingsStore(s => s.companyName);
  const setSmsTemplate = useSettingsStore(s => s.setSmsTemplate);
  const resetSmsTemplate = useSettingsStore(s => s.resetSmsTemplate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftEn, setDraftEn] = useState('');
  const [draftEs, setDraftEs] = useState('');

  const sample = { name: 'John', tech: 'Alex', company: companyName || 'TrustKey', eta: 15 };
  const costChip = (template: string, lang: SmsLang) => {
    const info = smsInfo(sanitizeSms(fillSmsTemplate(template, sample, lang)));
    const tone = info.encoding === 'UCS-2' || info.segments > 2 ? 'text-red-400'
      : info.segments === 2 ? 'text-amber-400' : 'text-emerald-400';
    return <span className={`text-[10px] font-bold tabular-nums ${tone}`}>{info.segments || 1} SMS</span>;
  };

  return (
    <Section icon={MessageSquare} title="SMS Templates">
      <p className="text-xs text-slate-400 -mt-1">
        The one-tap texts on the job card. Placeholders fill automatically: {'{name}'} client, {'{tech}'} technician, {'{company}'}, {'{eta}'} minutes.
        Keep a template at <span className="text-emerald-400 font-bold">1 SMS</span> — longer texts and emoji multiply what each send costs.
      </p>
      <div className="space-y-2">
        {SMS_TEMPLATES.map(def => {
          const en = resolveSmsTemplate(def, overrides, 'en');
          const es = resolveSmsTemplate(def, overrides, 'es');
          const customized = !!overrides?.[def.id];
          const editing = editingId === def.id;
          return (
            <div key={def.id} className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{def.label}</span>
                {customized && <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">edited</span>}
                <span className="flex-1" />
                {!editing && (
                  <button
                    onClick={() => { setEditingId(def.id); setDraftEn(en); setDraftEs(es); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    aria-label={`Edit ${def.label}`}
                  ><Pencil size={13} /></button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  {([['EN', draftEn, setDraftEn], ['ES', draftEs, setDraftEs]] as const).map(([lang, value, setValue]) => (
                    <div key={lang}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{lang}</span>
                        {costChip(value, lang === 'ES' ? 'es' : 'en')}
                      </div>
                      <textarea
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-xs font-medium text-white outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setSmsTemplate(def.id, { en: draftEn, es: draftEs }); setEditingId(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all active:scale-95"
                    ><Check size={12} /> Save</button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold hover:text-white transition-all active:scale-95"
                    >Cancel</button>
                    {customized && (
                      <button
                        onClick={() => { resetSmsTemplate(def.id); setEditingId(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-amber-300 text-[11px] font-bold hover:bg-amber-500/10 transition-all active:scale-95 ml-auto"
                      ><RotateCcw size={12} /> Default</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-slate-400 leading-relaxed flex-1">{en}</p>
                    {costChip(en, 'en')}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-slate-500 leading-relaxed flex-1 italic">{es}</p>
                    {costChip(es, 'es')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

const MemoriesSection: React.FC = () => {
  const aiMemories = useSettingsStore(s => s.aiMemories);
  const addAiMemory = useSettingsStore(s => s.addAiMemory);
  const removeAiMemory = useSettingsStore(s => s.removeAiMemory);
  const [draft, setDraft] = useState('');
  const fieldCls = 'bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500/50';

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    addAiMemory(t);
    setDraft('');
  };

  return (
    <Section icon={BrainCircuit} title="AI Memory">
      <p className="text-xs text-slate-500 -mt-2">Standing instructions Дурачок remembers on every session — e.g. «ночью Майка не ставить», «с новых клиентов брать предоплату». Say «запомни …» in chat, or add here.</p>
      {aiMemories.length === 0 && <p className="text-sm text-slate-600 italic">Пока ничего не запомнено.</p>}
      <div className="space-y-2">
        {aiMemories.map(m => (
          <div key={m.id} className="flex items-start gap-2 bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2">
            <span className="flex-1 min-w-0 text-sm text-slate-200 break-words">{m.text}</span>
            <button onClick={() => removeAiMemory(m.id)} className="shrink-0 text-slate-500 hover:text-red-400 p-0.5" aria-label="Forget"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Новая инструкция…"
          className={`${fieldCls} flex-1 min-w-0`}
        />
        <button onClick={add} disabled={!draft.trim()} className="flex items-center gap-1.5 text-blue-400 text-sm font-bold disabled:text-slate-600"><Plus size={15} /> Add</button>
      </div>
    </Section>
  );
};

const ROLES: Role[] = ['owner', 'manager', 'technician', 'accountant', 'warehouse'];

// Who sees the company-wide sections (identity, targets, AI, automatic texts). A technician
// and a кладовщик both work one screen and neither runs the business.
const isBackOffice = (r: Role) => r !== 'technician' && r !== 'warehouse';

// Hand-drawn signature saved to the user's profile — it gets stamped onto the
// Technician line of every invoice for jobs assigned to them. Until one is drawn,
// invoices fall back to the name in a script font.
const SignaturePad: React.FC = () => {
  const { updateUser } = useAuthStore();
  const currentUser = useCurrentUser();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [saved, setSaved] = useState(false);
  const [drawn, setDrawn] = useState(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    dirty.current = true; setDrawn(true);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false; setDrawn(false); setSaved(false);
  };
  const save = () => {
    if (!currentUser || !dirty.current) return;
    updateUser({ ...currentUser, signature: canvasRef.current!.toDataURL('image/png') });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!currentUser) return null;
  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">My Signature <span className="normal-case font-normal text-slate-500">· stamped on your invoices</span></label>
      {currentUser.signature && !drawn && (
        <div className="mb-2 bg-white rounded-xl p-2 inline-block"><img src={currentUser.signature} alt="Saved signature" className="h-10" /></div>
      )}
      <div className="relative bg-white rounded-xl overflow-hidden border border-white/10">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full h-[110px] touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-300">Sign here</span>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={save} disabled={!drawn} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 ${saved ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40' : 'bg-blue-600 text-white'}`}>
          {saved ? 'Saved ✓' : 'Save signature'}
        </button>
        <button onClick={clear} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 text-slate-400 border border-white/10 active:scale-95 transition-all">Clear</button>
      </div>
    </div>
  );
};

const TeamSection: React.FC = () => {
  const { users, addUser, updateUser, removeUser, changeOwnPassword } = useAuthStore();
  const currentUser = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', password: '', phone: '', role: 'technician' as Role, commissionRate: 30 });
  const [err, setErr] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const togglePasswordVisibility = (id: string) => setVisiblePasswords(p => ({ ...p, [id]: !p[id] }));

  const startEditPassword = (u: { id: string }) => {
    setEditingPassword(u.id);
    setNewPassword('');
    setCurrentPasswordInput('');
    setPwError('');
  };

  // Changing YOUR OWN password now requires the current one (a borrowed phone shouldn't
  // become a permanent takeover), and the result is reported — a rejected change used to
  // be written locally while the server kept the old password, so the user believed it
  // had worked until the next sign-in.
  const savePassword = async (u: any) => {
    const next = newPassword.trim();
    setPwError('');
    if (!next) { setEditingPassword(null); return; }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setPwError(`At least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (u.id === currentUser?.id) {
      if (!currentPasswordInput.trim()) { setPwError('Enter your current password.'); return; }
      const err = await changeOwnPassword(currentPasswordInput.trim(), next);
      if (err) { setPwError(err); return; }
    } else {
      const err = await updateUser({ ...u, password: next });
      if (err) { setPwError(err); return; }
    }
    setEditingPassword(null);
    setNewPassword('');
    setCurrentPasswordInput('');
  };

  const startEditEmail = (u: { id: string; email: string }) => {
    setEditingEmail(u.id);
    setNewEmail(u.email);
    setEmailError('');
  };

  // Email IS the login identifier — a silently rejected change (e.g. duplicate email)
  // left people signing in with an address the server never accepted.
  const saveEmail = async (u: any) => {
    const next = newEmail.trim();
    if (!next || !next.includes('@')) { setEditingEmail(null); setNewEmail(''); setEmailError(''); return; }
    const err = await updateUser({ ...u, email: next });
    if (err) { setEmailError(err); return; }
    setEditingEmail(null);
    setNewEmail('');
    setEmailError('');
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

  const handleAdd = async () => {
    if (!draft.name.trim() || !draft.email.trim() || !draft.password.trim()) { setErr('Name, email and password are required.'); return; }
    // Validation used to be presence-only, so email: "bob" and a 1-character password
    // both went through — and email IS the login identifier.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim())) { setErr('That does not look like a valid email address.'); return; }
    if (draft.password.length < MIN_PASSWORD_LENGTH) { setErr(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (users.some(u => u.email.trim().toLowerCase() === draft.email.trim().toLowerCase())) { setErr('That email is already in use.'); return; }
    // Only clear the form and close once the SERVER has accepted it. Previously the
    // panel closed regardless, so a rejected account still appeared in the list and the
    // owner handed out a password for something that didn't exist.
    setErr('');
    setAdding(true);
    const failure = await addUser({
      name: draft.name.trim(),
      email: draft.email.trim(),
      password: draft.password,
      phone: draft.phone.trim() || undefined,
      role: draft.role,
      commissionRate: draft.role === 'technician' ? draft.commissionRate : undefined,
      active: true,
    });
    setAdding(false);
    if (failure) { setErr(failure); return; }
    setDraft({ name: '', email: '', password: '', phone: '', role: 'technician', commissionRate: 30 });
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
            <button onClick={handleAdd} disabled={adding} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all">{adding ? 'Creating…' : 'Create Account'}</button>
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
                    <div className="mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="email"
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEmail(u)}
                          autoFocus
                          className="bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white w-48 focus:outline-none"
                        />
                        <button onClick={() => saveEmail(u)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                        <button onClick={() => { setEditingEmail(null); setEmailError(''); }} className="text-slate-400 hover:text-white"><X size={14} /></button>
                      </div>
                      {emailError && <p className="text-[11px] font-semibold text-red-400 mt-1">{emailError}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 group/email">
                      {u.email}
                      {/* Reachable on touch. Hidden behind hover, the owner had no way on a
                          phone to add the tech phone number that SMS + push alerts need. */}
                      <button aria-label="Edit email" onClick={() => startEditEmail(u)} className="p-1.5 -m-1 opacity-100 md:opacity-0 md:group-hover/email:opacity-100 text-slate-400 md:text-slate-500 hover:text-blue-400 transition-all"><Pencil size={12} /></button>
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
                      <button aria-label="Edit phone" onClick={() => startEditPhone(u)} className="p-1.5 -m-1 opacity-100 md:opacity-0 md:group-hover/phone:opacity-100 text-slate-400 md:text-slate-500 hover:text-blue-400 transition-all"><Pencil size={12} /></button>
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
                      {/* Your own password needs the current one; the owner setting
                          someone else's is a deliberate admin act and doesn't. */}
                      {u.id === currentUser?.id && (
                        <input
                          type="password"
                          value={currentPasswordInput}
                          onChange={e => setCurrentPasswordInput(e.target.value)}
                          autoFocus
                          placeholder="Current"
                          className="bg-transparent text-sm font-mono text-white w-20 outline-none placeholder:text-slate-600 border-r border-white/10 pr-2 mr-1"
                        />
                      )}
                      <input
                        type="text"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && savePassword(u)}
                        autoFocus={u.id !== currentUser?.id}
                        placeholder={`New (${MIN_PASSWORD_LENGTH}+ chars)`}
                        className="bg-transparent text-sm font-mono text-white w-32 outline-none placeholder:text-slate-600"
                      />
                      <button onClick={() => savePassword(u)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                      <button onClick={() => { setEditingPassword(null); setPwError(''); }} className="text-slate-400 hover:text-white"><X size={14} /></button>
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
                {isEditingPw && pwError && (
                  <p className="w-full text-[11px] font-semibold text-red-400">{pwError}</p>
                )}

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

                {/* Owner/manager who also works jobs. Turning it on lets them be assigned
                    to jobs and earn a technician-style commission (defaults to 45%) —
                    without changing their role or any permission. Technicians are field
                    workers by definition, so the toggle only shows for owner/manager. */}
                {(u.role === 'owner' || u.role === 'manager') && (
                  <button
                    onClick={() => updateUser({ ...u, fieldTech: !u.fieldTech, commissionRate: !u.fieldTech ? (u.commissionRate || 45) : u.commissionRate })}
                    title="Owner/manager who also works jobs and earns a technician commission"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${u.fieldTech ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                  >
                    <Wrench size={12} /> Works in field
                  </button>
                )}

                {worksField(u) && (
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

              {worksField(u) && (
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
