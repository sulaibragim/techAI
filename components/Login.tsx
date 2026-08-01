import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, ArrowRight, ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuthStore, MIN_PASSWORD_LENGTH } from '../authStore';

type Mode = 'login' | 'forgot' | 'reset' | 'done';

const inputBase =
  'w-full bg-slate-800 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all';
const labelCls = 'block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2';

export const Login: React.FC = () => {
  const { login, requestPasswordReset, resetPassword } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(''); setNotice(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const ok = await login(email, password);
      if (!ok) setError('Incorrect email or password.');
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setLoading(true);
    clearMessages();
    const err = await requestPasswordReset(email.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    // Deliberately generic — the server never reveals whether the email exists.
    setNotice('If an account exists for that email, we sent a 6-digit code to the email or phone on file. It expires in 15 minutes.');
    setMode('reset');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError('Enter the code you received.'); return; }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setLoading(true);
    clearMessages();
    const err = await resetPassword(email.trim(), code.trim(), newPassword);
    setLoading(false);
    if (err) { setError(err); return; }
    setPassword('');
    setCode('');
    setNewPassword('');
    setMode('done');
  };

  const goLogin = () => { clearMessages(); setMode('login'); };

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

        {/* ---------- LOGIN ---------- */}
        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div>
              <label className={labelCls}>Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearMessages(); }}
                  placeholder="you@trustkey.az"
                  autoComplete="email"
                  className={inputBase}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearMessages(); }}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className={inputBase}
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
              onClick={() => { clearMessages(); setMode('forgot'); }}
              className="w-full text-center text-xs text-slate-500 hover:text-blue-400 transition-colors font-semibold pt-1"
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* ---------- FORGOT (request a code) ---------- */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div>
              <h2 className="text-sm font-bold text-white">Reset your password</h2>
              <p className="text-xs text-slate-400 mt-1">Enter your email and we'll send a 6-digit code to the email or phone on file.</p>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearMessages(); }}
                  placeholder="you@trustkey.az"
                  autoComplete="email"
                  autoFocus
                  className={inputBase}
                />
              </div>
            </div>

            {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              {loading ? 'Sending…' : <>Send code <ArrowRight size={16} /></>}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button type="button" onClick={goLogin} className="flex items-center gap-1 text-slate-500 hover:text-white transition-colors font-semibold">
                <ArrowLeft size={13} /> Back to sign in
              </button>
              <button type="button" onClick={() => { clearMessages(); setMode('reset'); }} className="text-slate-500 hover:text-blue-400 transition-colors font-semibold">
                I already have a code
              </button>
            </div>
          </form>
        )}

        {/* ---------- RESET (enter code + new password) ---------- */}
        {mode === 'reset' && (
          <form onSubmit={handleReset} className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div>
              <h2 className="text-sm font-bold text-white">Enter your code</h2>
              <p className="text-xs text-slate-400 mt-1">Paste the 6-digit code and choose a new password.</p>
            </div>

            {notice && <p className="text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">{notice}</p>}

            <div>
              <label className={labelCls}>Code</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearMessages(); }}
                  placeholder="123456"
                  autoFocus
                  className={`${inputBase} tracking-[0.4em] font-mono`}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>New password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); clearMessages(); }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  className={inputBase}
                />
              </div>
            </div>

            {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-wait text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              {loading ? 'Saving…' : <>Set new password <ArrowRight size={16} /></>}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button type="button" onClick={goLogin} className="flex items-center gap-1 text-slate-500 hover:text-white transition-colors font-semibold">
                <ArrowLeft size={13} /> Back to sign in
              </button>
              <button type="button" onClick={() => { clearMessages(); setMode('forgot'); }} className="text-slate-500 hover:text-blue-400 transition-colors font-semibold">
                Resend code
              </button>
            </div>
          </form>
        )}

        {/* ---------- DONE ---------- */}
        {mode === 'done' && (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl text-center">
            <CheckCircle2 size={40} className="text-green-400 mx-auto" />
            <div>
              <h2 className="text-sm font-bold text-white">Password changed</h2>
              <p className="text-xs text-slate-400 mt-1">Sign in with your new password.</p>
            </div>
            <button
              onClick={goLogin}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              Back to sign in <ArrowRight size={16} />
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-slate-600 mt-6">TrustKey Locksmith CRM v1.0</p>
      </motion.div>
    </div>
  );
};
