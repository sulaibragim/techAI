import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Users, Target, ChevronRight, ChevronLeft, Check, Plus, Trash2, KeyRound } from 'lucide-react';
import { useSettingsStore } from '../settingsStore';
import { useAuthStore } from '../authStore';

type Step = 'company' | 'team' | 'targets';

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 'company', label: 'Company', icon: <Building2 size={16} /> },
  { id: 'team', label: 'Team', icon: <Users size={16} /> },
  { id: 'targets', label: 'Targets', icon: <Target size={16} /> },
];

// Every tech gets their own generated password, shown to the owner to hand over. The wizard
// used to create all of them with "1234" and print that on screen.
const generatePassword = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);

interface NewTech {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export const OnboardingWizard: React.FC = () => {
  const { updateSettings } = useSettingsStore();
  const { users, updateUser, addUser, removeUser } = useAuthStore();
  const owner = users.find(u => u.role === 'owner');

  const [step, setStep] = useState<Step>('company');
  const stepIdx = STEPS.findIndex(s => s.id === step);

  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  const [ownerName, setOwnerName] = useState(owner?.name || '');
  const [ownerEmail, setOwnerEmail] = useState(owner?.email || '');
  const [ownerPassword, setOwnerPassword] = useState(owner?.password || '');

  const [techs, setTechs] = useState<NewTech[]>([{ name: '', email: '', phone: '', password: generatePassword() }]);

  const [monthlyTarget, setMonthlyTarget] = useState(5000);
  const [dailyTarget, setDailyTarget] = useState(1500);

  const addTech = () => setTechs(prev => [...prev, { name: '', email: '', phone: '', password: generatePassword() }]);
  const removeTech = (i: number) => setTechs(prev => prev.filter((_, idx) => idx !== i));
  const updateTech = (i: number, field: keyof NewTech, value: string) => {
    setTechs(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  const canProceed = () => {
    if (step === 'company') return companyName.trim().length > 0;
    if (step === 'team') return ownerName.trim().length > 0 && ownerEmail.trim().length > 0;
    return true;
  };

  const next = () => {
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1].id);
  };

  const prev = () => {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1].id);
  };

  const finish = () => {
    updateSettings({
      companyName,
      companyPhone,
      companyEmail,
      companyAddress,
      companyCity,
      licenseNumber,
      technicianName: ownerName,
      monthlyRevenueTarget: monthlyTarget,
      dailyRevenueTarget: dailyTarget,
      onboardingComplete: true,
    });

    if (owner) {
      updateUser({ ...owner, name: ownerName, email: ownerEmail, password: ownerPassword || owner.password });
    }

    // If the owner added real techs, drop the seeded demo technician (weak default
    // password 1234) so it doesn't linger in the live roster.
    const addingRealTechs = techs.some(t => t.name.trim());
    if (addingRealTechs) {
      users
        .filter(u => u.role === 'technician' && u.name === 'Technician' && u.email === 'tech@trustkey.az')
        .forEach(u => removeUser(u.id));
    }

    techs.forEach(t => {
      if (t.name.trim()) {
        addUser({
          name: t.name.trim(),
          email: t.email.trim() || `${t.name.trim().toLowerCase().replace(/\s+/g, '.')}@${companyName.trim().toLowerCase().replace(/\s+/g, '')}.com`,
          password: t.password || generatePassword(),
          role: 'technician',
          phone: t.phone,
          active: true,
          techStatus: 'available',
        });
      }
    });
  };

  const inputCls = 'w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all';
  const labelCls = 'block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound size={28} className="text-blue-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Trust<span className="text-blue-400">Key</span>
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mt-2">Setup Your Workspace</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => i <= stepIdx && setStep(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  s.id === step
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : i < stepIdx
                    ? 'bg-blue-500/10 text-blue-400 cursor-pointer hover:bg-blue-500/20'
                    : 'bg-white/5 text-slate-500'
                }`}
              >
                {i < stepIdx ? <Check size={12} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px ${i < stepIdx ? 'bg-blue-500/40' : 'bg-white/10'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl min-h-[380px] flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 space-y-4"
            >
              {step === 'company' && (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Company Information</h3>
                    <p className="text-xs text-slate-400">Tell us about your locksmith business</p>
                  </div>
                  <div>
                    <label className={labelCls}>Company Name *</label>
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. TrustKey Locksmith" className={inputCls} autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} placeholder="(555) 000-0000" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="info@company.com" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Main Street" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>City, State ZIP</label>
                      <input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder="Phoenix, AZ 85001" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>License #</label>
                      <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="LK-00000" className={inputCls} />
                    </div>
                  </div>
                </>
              )}

              {step === 'team' && (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Your Team</h3>
                    <p className="text-xs text-slate-400">Set up your account and add technicians</p>
                  </div>

                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Owner Account</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Your Name *</label>
                        <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Sultan" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Email *</label>
                        <input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Password</label>
                      <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="••••" className={inputCls} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Technicians</p>
                      <button onClick={addTech} className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors">
                        <Plus size={12} /> Add
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-hide">
                      {techs.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl p-3">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input value={t.name} onChange={e => updateTech(i, 'name', e.target.value)} placeholder="Name" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500/50" />
                            <input value={t.email} onChange={e => updateTech(i, 'email', e.target.value)} placeholder="Email" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500/50" />
                            <input value={t.phone} onChange={e => updateTech(i, 'phone', e.target.value)} placeholder="Phone" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500/50" />
                            <input value={t.password} onChange={e => updateTech(i, 'password', e.target.value)} placeholder="Password" className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500/50 sm:col-span-3" />
                          </div>
                          {techs.length > 1 && (
                            <button onClick={() => removeTech(i)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">Each tech gets their own password — copy it now and hand it over. You can edit it before finishing.</p>
                  </div>
                </>
              )}

              {step === 'targets' && (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Revenue Targets</h3>
                    <p className="text-xs text-slate-400">Set your goals to track performance</p>
                  </div>
                  <div>
                    <label className={labelCls}>Monthly Revenue Target ($)</label>
                    <input type="number" value={monthlyTarget} onChange={e => setMonthlyTarget(Number(e.target.value))} className={inputCls} />
                    <p className="text-[10px] text-slate-500 mt-1">Your target revenue per month</p>
                  </div>
                  <div>
                    <label className={labelCls}>Daily Revenue Target ($)</label>
                    <input type="number" value={dailyTarget} onChange={e => setDailyTarget(Number(e.target.value))} className={inputCls} />
                    <p className="text-[10px] text-slate-500 mt-1">Your target revenue per day</p>
                  </div>

                  <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check size={14} className="text-green-400" />
                      <p className="text-xs font-bold uppercase tracking-widest text-green-400">Ready to Launch</p>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      You can always update these settings later. Your workspace will be configured with the information you provided.
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              {stepIdx > 0 ? (
                <button onClick={prev} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors px-4 py-2">
                  <ChevronLeft size={14} /> Back
                </button>
              ) : (
                <button
                  onClick={() => updateSettings({
                    onboardingComplete: true,
                    // Clear the seeded demo company so a skipped setup doesn't print a fake
                    // "Salem Locksmith / Portland" on every invoice. Owner can fill these in Settings.
                    companyName: '', companyAddress: '', companyCity: '', companyPhone: '', companyEmail: '',
                  })}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors px-4 py-2"
                >
                  Skip Setup
                </button>
              )}
            </div>

            {stepIdx < STEPS.length - 1 ? (
              <button
                onClick={next}
                disabled={!canProceed()}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all active:scale-95"
              >
                Continue <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-green-900/30"
              >
                <Check size={14} /> Launch TrustKey
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6">TrustKey Locksmith CRM v1.0</p>
      </motion.div>
    </div>
  );
};
