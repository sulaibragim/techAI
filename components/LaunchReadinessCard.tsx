import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Rocket, Check, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { API_BASE } from '../backendUrl';
import { authHeaders } from '../apiClient';

// Owner-only launch check. Every subsystem here fails SILENTLY when its key is missing —
// SMS just stops sending, Stripe payments never get recorded, the DB quietly falls back to
// memory — so a half-configured deploy looks identical to a working one. This is the screen
// that says out loud whether the app is actually ready to take real money and real clients.

type Status = 'ok' | 'warn' | 'fail';
interface Check { id: string; label: string; status: Status; detail: string }
interface Readiness { ready: boolean; blockers: number; warnings: number; checks: Check[] }

const STYLES: Record<Status, { icon: React.ElementType; dot: string; text: string }> = {
  ok:   { icon: Check,         dot: 'bg-green-500/10 text-green-400', text: 'text-slate-400' },
  warn: { icon: AlertTriangle, dot: 'bg-amber-500/10 text-amber-400', text: 'text-amber-400/80' },
  fail: { icon: XCircle,       dot: 'bg-red-500/10 text-red-400',     text: 'text-red-400/90' },
};

export const LaunchReadinessCard: React.FC = () => {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/readiness`, { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const verdict = !data ? null
    : data.ready && data.warnings === 0 ? { label: 'Ready to launch', cls: 'bg-green-500/10 text-green-400 border-green-500/20' }
    : data.ready ? { label: `Ready — ${data.warnings} warning${data.warnings === 1 ? '' : 's'}`, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
    : { label: `${data.blockers} blocker${data.blockers === 1 ? '' : 's'}`, cls: 'bg-red-500/10 text-red-400 border-red-500/20' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-white/5 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Rocket size={16} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-white truncate">Launch Readiness</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {verdict && (
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${verdict.cls}`}>
              {verdict.label}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh readiness check"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400">Could not run the check: {error}</p>
      )}

      {loading && !data && (
        <p className="text-xs text-slate-500">Checking the live server…</p>
      )}

      {data && (
        <div className="space-y-3">
          {data.checks.map(c => {
            const s = STYLES[c.status];
            const Icon = s.icon;
            return (
              <div key={c.id} className="flex items-start gap-3">
                <span className={`w-5 h-5 mt-0.5 rounded-md flex items-center justify-center shrink-0 ${s.dot}`}>
                  <Icon size={12} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{c.label}</p>
                  <p className={`text-xs mt-0.5 break-words ${s.text}`}>{c.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
