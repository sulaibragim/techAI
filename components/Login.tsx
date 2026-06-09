import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../authStore';

export const Login: React.FC = () => {
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const ok = await login(email, password);
      if (!ok) setError('Incorrect email or password.');
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            {loading ? 'Signing in…' : <>Sign In <ArrowRight size={16} /></>}
          </button>

          <button
            type="button"
            onClick={() => setShowHint(v => !v)}
            className="w-full text-center text-xs text-slate-500 hover:text-blue-400 transition-colors font-semibold pt-1"
          >
            Forgot password?
          </button>

          <AnimatePresence>
            {showHint && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[11px] text-slate-400 text-center leading-relaxed"
              >
                Ask the account owner to reset your password from Settings → Team.
              </motion.p>
            )}
          </AnimatePresence>
        </form>

        <p className="text-center text-[10px] text-slate-600 mt-6">TrustKey Locksmith CRM v1.0</p>
      </motion.div>
    </div>
  );
};
