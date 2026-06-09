import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Wallet, DollarSign, Package, AlertCircle, Download, ChevronLeft, ChevronRight,
  Receipt, CreditCard, TrendingUp, Percent, CheckCircle2,
} from 'lucide-react';
import { useVisibleJobs } from '../store';
import { useAuthStore, useCurrentUser } from '../authStore';
import { useSettingsStore } from '../settingsStore';
import {
  accountingSummary, paymentMethodBreakdown, revenueByTechnician, accountsReceivable,
  jobsForTechnician, payrollToCSV, periodJobsToCSV, collectedAmount,
  MONTH_FULL,
} from '../financialUtils';
import { formatDate } from '../dateUtils';

const fmt$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const downloadCSV = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const METHOD_STYLE: Record<string, string> = {
  Cash: 'text-green-400',
  Card: 'text-blue-400',
  Check: 'text-amber-400',
  Zelle: 'text-violet-400',
  Unspecified: 'text-slate-400',
};

export const Accounting: React.FC = () => {
  const jobs = useVisibleJobs();
  const users = useAuthStore(s => s.users);
  const currentUser = useCurrentUser();
  const { taxRate, updateSettings } = useSettingsStore();
  const isOwner = currentUser?.role === 'owner';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedTech, setSelectedTech] = useState<string>('');

  const stepMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const summary = useMemo(() => accountingSummary(jobs, year, month, taxRate), [jobs, year, month, taxRate]);
  const methods = useMemo(() => paymentMethodBreakdown(jobs, year, month), [jobs, year, month]);
  const payroll = useMemo(() => revenueByTechnician(jobs, year, month, users), [jobs, year, month, users]);
  const receivables = useMemo(() => accountsReceivable(jobs), [jobs]);
  const techJobs = useMemo(() => selectedTech ? jobsForTechnician(jobs, selectedTech, year, month) : [], [jobs, selectedTech, year, month]);
  const selectedTechEarnings = payroll.find(t => t.userId === selectedTech);

  const totalReceivable = receivables.reduce((s, r) => s + r.balance, 0);
  const periodLabel = `${MONTH_FULL[month]} ${year}`;

  const cards = [
    { label: 'Gross Revenue', value: fmt$(summary.grossRevenue), icon: DollarSign, color: 'text-white', sub: `${summary.jobCount} jobs` },
    { label: 'Collected', value: fmt$(summary.collected), icon: CheckCircle2, color: 'text-green-400', sub: 'Cash in hand' },
    { label: 'Outstanding', value: fmt$(summary.outstanding), icon: AlertCircle, color: 'text-amber-400', sub: 'This period' },
    { label: 'Parts Cost (COGS)', value: fmt$(summary.partsCost), icon: Package, color: 'text-slate-300', sub: 'Materials used' },
    { label: 'Gross Profit', value: fmt$(summary.grossProfit), icon: TrendingUp, color: 'text-blue-400', sub: 'Revenue − parts' },
    { label: `Est. Sales Tax (${taxRate}%)`, value: fmt$(summary.estimatedTax), icon: Percent, color: 'text-violet-400', sub: taxRate > 0 ? 'On gross revenue' : 'Set rate below' },
  ];

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-500">
      {/* HEADER + PERIOD NAV */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Accounting</h2>
          <p className="text-slate-400 text-sm mt-1">Books, payroll, payments & receivables.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl p-1">
          <button onClick={() => stepMonth(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
          <span className="text-sm font-bold text-white uppercase tracking-wide px-2 min-w-[130px] text-center">{periodLabel}</span>
          <button onClick={() => stepMonth(1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-lg"
          >
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <c.icon size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{c.label}</span>
            </div>
            <p className={`text-xl font-black tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PAYMENT METHOD BREAKDOWN */}
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center mb-5"><CreditCard size={16} className="mr-2 text-blue-500" /> Collected by Payment Method</h3>
          {methods.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No payments collected this period.</p>
          ) : (
            <div className="space-y-3">
              {methods.map(m => {
                const pct = summary.collected > 0 ? (m.amount / summary.collected) * 100 : 0;
                return (
                  <div key={m.method}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-bold ${METHOD_STYLE[m.method] || 'text-slate-300'}`}>{m.method}</span>
                      <span className="text-sm font-bold text-white tabular-nums">{fmt$(m.amount)} <span className="text-xs text-slate-500">· {pct.toFixed(0)}%</span></span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* TAX RATE EDITOR */}
          <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sales Tax Rate</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{isOwner ? 'Used to estimate tax owed' : 'Only the owner can change this'}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.01" min="0" disabled={!isOwner}
                value={taxRate}
                onChange={e => updateSettings({ taxRate: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white text-right outline-none focus:border-blue-500/50 disabled:opacity-60"
              />
              <span className="text-sm font-bold text-slate-400">%</span>
            </div>
          </div>
        </div>

        {/* PAYROLL & COMMISSIONS */}
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Wallet size={16} className="mr-2 text-green-500" /> Payroll & Commissions</h3>
            {payroll.length > 0 && (
              <button onClick={() => downloadCSV(`payroll-${year}-${String(month + 1).padStart(2, '0')}.csv`, payrollToCSV(payroll))} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"><Download size={13} /> CSV</button>
            )}
          </div>
          {payroll.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No technicians configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-white/5">
                    <th className="py-2 pr-3">Technician</th>
                    <th className="py-2 px-2 text-right">Jobs</th>
                    <th className="py-2 px-2 text-right">Revenue</th>
                    <th className="py-2 px-2 text-right">Rate</th>
                    <th className="py-2 pl-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payroll.map(t => (
                    <tr key={t.userId} onClick={() => setSelectedTech(t.userId === selectedTech ? '' : t.userId)} className={`cursor-pointer transition-colors ${t.userId === selectedTech ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                      <td className="py-2.5 pr-3 text-sm font-semibold text-white">{t.name}</td>
                      <td className="py-2.5 px-2 text-right text-sm text-slate-300 tabular-nums">{t.jobCount}</td>
                      <td className="py-2.5 px-2 text-right text-sm font-bold text-white tabular-nums">{fmt$(t.revenue)}</td>
                      <td className="py-2.5 px-2 text-right text-xs text-slate-400 tabular-nums">{t.commissionRate}%</td>
                      <td className="py-2.5 pl-2 text-right text-sm font-bold text-green-400 tabular-nums">{fmt$(t.commission)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 text-sm font-bold">
                    <td className="py-2.5 pr-3 text-slate-400 uppercase text-[10px] tracking-widest">Total payroll</td>
                    <td className="py-2.5 px-2 text-right text-slate-300 tabular-nums">{payroll.reduce((s, t) => s + t.jobCount, 0)}</td>
                    <td className="py-2.5 px-2 text-right text-white tabular-nums">{fmt$(payroll.reduce((s, t) => s + t.revenue, 0))}</td>
                    <td></td>
                    <td className="py-2.5 pl-2 text-right text-green-400 tabular-nums">{fmt$(payroll.reduce((s, t) => s + t.commission, 0))}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-[10px] text-slate-500 mt-3">Tap a technician to see their jobs. Commission = revenue × rate (set per-tech in Settings → Team).</p>
            </div>
          )}
        </div>
      </div>

      {/* PER-TECHNICIAN DRILL-DOWN */}
      {selectedTech && selectedTechEarnings && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-white">{selectedTechEarnings.name} — {periodLabel}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedTechEarnings.jobCount} jobs · Revenue {fmt$(selectedTechEarnings.revenue)} · Commission <span className="text-green-400 font-bold">{fmt$(selectedTechEarnings.commission)}</span> ({selectedTechEarnings.commissionRate}%)
              </p>
            </div>
            <button onClick={() => setSelectedTech('')} className="text-xs font-bold text-slate-400 hover:text-white self-start sm:self-auto">Close ✕</button>
          </div>
          {techJobs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No jobs for this technician in {periodLabel}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-white/5">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 px-2">Job #</th>
                    <th className="py-2 px-2">Client</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 pl-2 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {techJobs.map(j => (
                    <tr key={j.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-3 text-xs text-slate-400 tabular-nums">{j.scheduledDate}</td>
                      <td className="py-2.5 px-2 text-xs font-mono text-blue-400">#{j.jobNumber}</td>
                      <td className="py-2.5 px-2 text-sm font-semibold text-white">{j.client.firstName} {j.client.lastName}</td>
                      <td className="py-2.5 px-2"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{j.status}</span></td>
                      <td className="py-2.5 px-2 text-right text-sm font-bold text-white tabular-nums">{fmt$(j.totalAmount)}</td>
                      <td className="py-2.5 pl-2 text-right text-sm text-green-400 tabular-nums">{fmt$(collectedAmount(j))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ACCOUNTS RECEIVABLE */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Receipt size={16} className="mr-2 text-amber-500" /> Outstanding Invoices (A/R) · {fmt$(totalReceivable)}</h3>
          {receivables.length > 0 && (
            <button onClick={() => downloadCSV(`transactions-${year}-${String(month + 1).padStart(2, '0')}.csv`, periodJobsToCSV(jobs, year, month))} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"><Download size={13} /> Transactions CSV</button>
          )}
        </div>
        {receivables.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nothing outstanding — all completed work is paid. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-white/5">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-2">Job #</th>
                  <th className="py-2 px-2">Client</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2 text-right">Paid</th>
                  <th className="py-2 pl-2 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {receivables.map(r => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-3 text-xs text-slate-400">{formatDate(r.date)}</td>
                    <td className="py-2.5 px-2 text-xs font-mono text-blue-400">#{r.jobNumber}</td>
                    <td className="py-2.5 px-2 text-sm font-semibold text-white">{r.client}</td>
                    <td className="py-2.5 px-2 text-right text-sm text-slate-300 tabular-nums">{fmt$(r.total)}</td>
                    <td className="py-2.5 px-2 text-right text-sm text-green-400 tabular-nums">{fmt$(r.paid)}</td>
                    <td className="py-2.5 pl-2 text-right text-sm font-bold text-amber-400 tabular-nums">{fmt$(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
