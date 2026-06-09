import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, ArrowRight, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../authStore';

const MASTER_PIN = '0000';

export const Login: React.FC = () => {
  const { login, users, masterReset } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [pin, setPin] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(email, password)) {
      setError('Incorrect email or password.');
    }
  };

  const handleMasterReset = () => {
    if (pin !== MASTER_PIN) {
      setResetError('Wrong PIN');
      return;
    }
    masterReset();
    setShowReset(false);
    setPin('');
    setResetError('');
    setResetDone(true);
    setTimeout(() => setResetDone(false), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Trust<span className="text-blue-400">Key</span>
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mt-2">Locksmith CRM</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@trustkey.az"
                autoComplete="email"
                className="w-full bg-slate-800 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••"
                autoComplete="current-password"
                className="w-full bg-slate-800 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            Sign In <ArrowRight size={16} />
          </button>

          <button
            type="button"
            onClick={() => { setShowReset(true); setPin(''); setResetError(''); }}
            className="w-full text-center text-xs text-slate-500 hover:text-blue-400 transition-colors font-semibold pt-1"
          >
            Forgot password?
          </button>
        </form>

        <AnimatePresence>
          {resetDone && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center"
            >
              <p className="text-xs font-bold text-green-400 mb-1">Passwords reset to 1234</p>
              <p className="text-[11px] text-green-400/70">Login: owner@trustkey.az / 1234</p>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-[10px] text-slate-600 mt-6">TrustKey Locksmith CRM v1.0</p>
      </motion.div>

      <AnimatePresence>
        {showReset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-xs w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <ShieldAlert size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Master Reset</h3>
                  <p className="text-[11px] text-slate-400">All passwords → 1234</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Master PIN</label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    value={pin}
                    onChange={e => { setPin(e.target.value); setResetError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleMasterReset()}
                    placeholder="Enter PIN"
                    maxLength={10}
                    autoFocus
                    className="w-full bg-slate-800 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
                  />
                </div>
                {resetError && <p className="text-xs font-semibold text-red-400 mt-2">{resetError}</p>}
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowReset(false)}
                  className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMasterReset}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Reset All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
