import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound, ArrowRight, ShieldCheck, Briefcase, Wrench } from 'lucide-react';
import { useAuthStore, ROLE_LABELS } from '../authStore';
import { Role } from '../types';

const ROLE_ICON: Record<Role, React.ElementType> = {
  owner: ShieldCheck,
  manager: Briefcase,
  technician: Wrench,
};

export const Login: React.FC = () => {
  const { login, users, loginAs } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(email, password)) {
      setError('Incorrect email or password.');
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
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
          >
            Sign In <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick demo sign-in — prototype only, remove when real accounts exist */}
        <div className="mt-6">
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3 flex items-center justify-center gap-2">
            <KeyRound size={11} /> Demo sign-in
          </p>
          <div className="grid grid-cols-3 gap-2">
            {users.filter(u => u.active).slice(0, 3).map(u => {
              const Icon = ROLE_ICON[u.role];
              return (
                <button
                  key={u.id}
                  onClick={() => loginAs(u.id)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:border-blue-500/40 hover:text-white transition-all active:scale-95"
                >
                  <Icon size={16} className="text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">{ROLE_LABELS[u.role]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
