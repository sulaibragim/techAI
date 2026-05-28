import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { User, Target, Key, Eye, EyeOff, RotateCcw, Save, Upload, Info, Building2 } from 'lucide-react';
import { useSettingsStore, SETTINGS_DEFAULTS, settingsStorageIsEphemeral } from '../settingsStore';

const VERSION = '0.0.0';

export const Settings: React.FC = () => {
  const settings = useSettingsStore();
  const [form, setForm] = useState({
    technicianName: settings.technicianName,
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    companyCity: settings.companyCity,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    licenseNumber: settings.licenseNumber,
    profilePhoto: settings.profilePhoto,
    monthlyRevenueTarget: settings.monthlyRevenueTarget,
    dailyRevenueTarget: settings.dailyRevenueTarget,
    geminiApiKey: settings.geminiApiKey,
  });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

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
      licenseNumber: SETTINGS_DEFAULTS.licenseNumber,
      profilePhoto: SETTINGS_DEFAULTS.profilePhoto,
      monthlyRevenueTarget: SETTINGS_DEFAULTS.monthlyRevenueTarget,
      dailyRevenueTarget: SETTINGS_DEFAULTS.dailyRevenueTarget,
      geminiApiKey: SETTINGS_DEFAULTS.geminiApiKey,
    });
    setShowReset(false);
  };

  const inputCls = "w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all text-sm";
  const labelCls = "block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2";

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

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {settingsStorageIsEphemeral && (
        <div className="flex items-center space-x-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 font-semibold">
          <span>⚠️</span>
          <span>Private/incognito mode detected — settings will not persist after this tab is closed.</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">System Core</p>
          <h2 className="text-2xl font-bold text-white">Preferences</h2>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-all text-xs font-semibold uppercase tracking-wider"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
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

        <Section icon={Building2} title="Company Info">
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
        </Section>

        <Section icon={Target} title="Business Targets">
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
        </Section>

        <Section icon={Key} title="AI Configuration">
          <div>
            <label className={labelCls}>Gemini API Key</label>
            <div className="relative">
              <input
                className={inputCls + ' pr-12'}
                type={showKey ? 'text' : 'password'}
                value={form.geminiApiKey}
                onChange={e => setForm(f => ({ ...f, geminiApiKey: e.target.value }))}
                placeholder="AIza..."
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Overrides VITE_API_KEY from .env.local</p>
          </div>
        </Section>

        <Section icon={Info} title="About">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-slate-400 uppercase tracking-wider">App</span>
              <span className="text-xs font-semibold text-white">techAI — PulseOS</span>
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
