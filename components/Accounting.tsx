import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Wallet, DollarSign, Package, AlertCircle, Download, ChevronLeft, ChevronRight,
  Receipt, CreditCard, TrendingUp, Percent, CheckCircle2, Trash2, Plus, BellRing, Scale,
} from 'lucide-react';
import { useAppStore, useVisibleJobs } from '../store';
import { useAuthStore, useCurrentUser } from '../authStore';
import { useSettingsStore } from '../settingsStore';
import {
  accountingSummary, paymentMethodBreakdown, revenueByTechnician, accountsReceivable,
  jobsForTechnician, payrollToCSV, jobsToCSV, jobsInMonths, collectedAmount,
  monthsInPeriod, expensesInMonths, expensesByCategory, expensesToCSV,
  PeriodMode, TechnicianEarnings, MONTH_FULL,
} from '../financialUtils';
import { Job, Message, EXPENSE_CATEGORIES, ExpenseCategory, LeadChannel, LEAD_CHANNELS, LEAD_CHANNEL_LABELS } from '../types';
import { formatDate } from '../dateUtils';
import { sendSms } from '../smsService';

const fmt$ = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned$ = (n: number) => `${n < 0 ? '−' : ''}${fmt$(Math.abs(n))}`;

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

const CATEGORY_STYLE: Record<string, string> = {
  'Keys & Stock': 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  Fuel: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  Advertising: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  'Tools & Equipment': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Rent: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  'Phone & Software': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  Other: 'bg-white/5 text-slate-400 border-white/10',
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ageDays = (dateStr: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000));

const AGE_BUCKETS = [
  { label: 'Fresh', test: (d: number) => d < 7, chip: 'bg-white/5 text-slate-300 border-white/10' },
  { label: '7+ days', test: (d: number) => d >= 7 && d < 30, chip: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { label: '30+ days', test: (d: number) => d >= 30, chip: 'bg-red-500/10 text-red-400 border-red-500/30' },
];

export const Accounting: React.FC<{ onJobSelect?: (job: Job) => void }> = ({ onJobSelect }) => {
  const jobs = useVisibleJobs();
  const updateJob = useAppStore(s => s.updateJob);
  const users = useAuthStore(s => s.users);
  const currentUser = useCurrentUser();
  const { taxRate, updateSettings, companyName, expenses, addExpense, removeExpense } = useSettingsStore();
  const isOwner = currentUser?.role === 'owner';
  const canManageMoney = isOwner || currentUser?.role === 'manager';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [mode, setMode] = useState<PeriodMode>('month');
  const [selectedTech, setSelectedTech] = useState<string>('');
  const [remindState, setRemindState] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});

  const [expDate, setExpDate] = useState(todayLocal());
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Keys & Stock');
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');
  const [expChannel, setExpChannel] = useState<LeadChannel | ''>('');

  const stepPeriod = (delta: number) => {
    const size = mode === 'month' ? 1 : mode === 'quarter' ? 3 : 12;
    const d = new Date(year, month + delta * size, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const span = useMemo(() => monthsInPeriod(year, month, mode), [year, month, mode]);
  const periodLabel = mode === 'month'
    ? `${MONTH_FULL[month]} ${year}`
    : mode === 'quarter'
      ? `Q${Math.floor(month / 3) + 1} ${year}`
      : String(year);
  const fileTag = mode === 'month'
    ? `${year}-${String(month + 1).padStart(2, '0')}`
    : mode === 'quarter' ? `${year}-Q${Math.floor(month / 3) + 1}` : String(year);

  const summary = useMemo(() => span.reduce(
    (acc, m) => {
      const s = accountingSummary(jobs, m.year, m.month, taxRate);
      return {
        grossRevenue: acc.grossRevenue + s.grossRevenue,
        collected: acc.collected + s.collected,
        outstanding: acc.outstanding + s.outstanding,
        partsCost: acc.partsCost + s.partsCost,
        grossProfit: acc.grossProfit + s.grossProfit,
        estimatedTax: acc.estimatedTax + s.estimatedTax,
        jobCount: acc.jobCount + s.jobCount,
      };
    },
    { grossRevenue: 0, collected: 0, outstanding: 0, partsCost: 0, grossProfit: 0, estimatedTax: 0, jobCount: 0 }
  ), [jobs, span, taxRate]);

  const methods = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of span)
      for (const x of paymentMethodBreakdown(jobs, m.year, m.month))
        map.set(x.method, (map.get(x.method) || 0) + x.amount);
    return [...map.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  }, [jobs, span]);

  const payroll = useMemo(() => {
    const rows = new Map<string, TechnicianEarnings>();
    for (const m of span)
      for (const t of revenueByTechnician(jobs, m.year, m.month, users)) {
        const cur = rows.get(t.userId);
        if (!cur) rows.set(t.userId, { ...t });
        else { cur.revenue += t.revenue; cur.jobCount += t.jobCount; cur.commission += t.commission; }
      }
    return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
  }, [jobs, span, users]);
  const totalCommission = payroll.reduce((s, t) => s + t.commission, 0);

  const periodExpenses = useMemo(() => expensesInMonths(expenses, span), [expenses, span]);
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = useMemo(() => expensesByCategory(periodExpenses), [periodExpenses]);

  // Card payments ledger — every Stripe charge and card refund in the period, with the
  // processor's fee (exact when the webhook recorded it, estimated 2.9%+30¢ otherwise)
  // so "net to bank" matches the actual payouts.
  const inSpan = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return span.some(m => d.getFullYear() === m.year && d.getMonth() === m.month);
  };
  const cardLedger = useMemo(() => {
    const rows: { at: string; kind: 'payment' | 'refund'; job: Job; gross: number; fee: number; net: number; feeEstimated: boolean }[] = [];
    for (const j of jobs) {
      for (const p of j.stripePayments || []) {
        const at = p.at || j.paidAt || '';
        if (!inSpan(at)) continue;
        const feeKnown = typeof p.fee === 'number';
        const fee = feeKnown ? p.fee! : Math.round((p.amount * 0.029 + 0.30) * 100) / 100;
        const net = typeof p.net === 'number' ? p.net! : Math.round((p.amount - fee) * 100) / 100;
        rows.push({ at, kind: 'payment', job: j, gross: p.amount, fee, net, feeEstimated: !feeKnown });
      }
      for (const r of j.refunds || []) {
        if (r.method !== 'card' || !inSpan(r.at)) continue;
        rows.push({ at: r.at, kind: 'refund', job: j, gross: -r.amount, fee: 0, net: -r.amount, feeEstimated: false });
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, span]);
  const cardTotals = useMemo(() => cardLedger.reduce(
    (acc, r) => ({
      gross: acc.gross + (r.kind === 'payment' ? r.gross : 0),
      fees: acc.fees + r.fee,
      refunds: acc.refunds + (r.kind === 'refund' ? -r.gross : 0),
      net: acc.net + r.net,
    }),
    { gross: 0, fees: 0, refunds: 0, net: 0 }
  ), [cardLedger]);

  const netProfit = summary.grossProfit - totalCommission - totalExpenses - summary.estimatedTax - cardTotals.fees;
  const netMarginPct = summary.grossRevenue > 0 ? (netProfit / summary.grossRevenue) * 100 : 0;

  const receivables = useMemo(() => accountsReceivable(jobs), [jobs]);
  const techJobs = useMemo(
    () => selectedTech ? span.flatMap(m => jobsForTechnician(jobs, selectedTech, m.year, m.month)) : [],
    [jobs, selectedTech, span]
  );
  const selectedTechEarnings = payroll.find(t => t.userId === selectedTech);

  const totalReceivable = receivables.reduce((s, r) => s + r.balance, 0);
  const aging = AGE_BUCKETS.map(b => {
    const rows = receivables.filter(r => b.test(ageDays(r.date)));
    return { ...b, count: rows.length, sum: rows.reduce((s, r) => s + r.balance, 0) };
  });

  const handleAddExpense = () => {
    const amount = parseFloat(expAmount);
    if (!amount || amount <= 0 || !expDate) return;
    addExpense({
      date: expDate,
      category: expCategory,
      amount: Math.round(amount * 100) / 100,
      note: expNote.trim() || undefined,
      createdBy: currentUser?.id,
      ...(expCategory === 'Advertising' && expChannel ? { channel: expChannel } : {}),
    });
    setExpAmount('');
    setExpNote('');
  };

  const handleRemind = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || remindState[jobId] === 'sending') return;
    const balance = Math.max(0, job.totalAmount - collectedAmount(job));
    const text = `Hi ${job.client.firstName}, a friendly reminder from ${companyName}: invoice #${job.jobNumber} has an open balance of ${fmt$(balance)}. You can reply to this message or call us anytime. Thank you!`;
    setRemindState(s => ({ ...s, [jobId]: 'sending' }));
    const ok = await sendSms(job.client.phone, text);
    setRemindState(s => ({ ...s, [jobId]: ok ? 'sent' : 'error' }));
    if (ok) {
      const msg: Message = { id: `msg-${Date.now()}`, timestamp: new Date().toISOString(), sender: 'system', content: text, method: 'sms' };
      updateJob({ ...job, messages: [...(job.messages || []), msg] });
    }
  };

  const cards = [
    { label: 'Gross Revenue', value: fmt$(summary.grossRevenue), icon: DollarSign, color: 'text-white', sub: `${summary.jobCount} jobs` },
    { label: 'Collected', value: fmt$(summary.collected), icon: CheckCircle2, color: 'text-green-400', sub: 'Cash in hand' },
    { label: 'Outstanding', value: fmt$(summary.outstanding), icon: AlertCircle, color: 'text-amber-400', sub: 'This period' },
    { label: 'Parts Cost (COGS)', value: fmt$(summary.partsCost), icon: Package, color: 'text-slate-300', sub: 'Materials used' },
    { label: 'Expenses', value: fmt$(totalExpenses), icon: Receipt, color: 'text-pink-400', sub: `${periodExpenses.length} entries` },
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1">
            {(['month', 'quarter', 'year'] as PeriodMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === m ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl p-1">
            <button onClick={() => stepPeriod(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
            <span className="text-sm font-bold text-white uppercase tracking-wide px-2 min-w-[110px] text-center">{periodLabel}</span>
            <button onClick={() => stepPeriod(1)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><ChevronRight size={18} /></button>
          </div>
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

      {/* NET PROFIT — THE BOTTOM LINE */}
      <section className={`rounded-2xl p-6 shadow-2xl border relative overflow-hidden ${netProfit >= 0 ? 'bg-gradient-to-br from-green-900/40 to-slate-900 border-green-500/25' : 'bg-gradient-to-br from-red-900/40 to-slate-900 border-red-500/25'}`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-3xl -mr-24 -mt-24" />
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 space-y-1.5">
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-3 flex items-center ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <Scale size={14} className="mr-2" /> Net Profit — {periodLabel}
            </h3>
            {[
              { label: 'Gross Revenue', value: summary.grossRevenue, sign: '' },
              { label: 'Parts (COGS)', value: summary.partsCost, sign: '−' },
              { label: 'Technician Commissions', value: totalCommission, sign: '−' },
              { label: 'Expenses', value: totalExpenses, sign: '−' },
              ...(cardTotals.fees > 0 ? [{ label: 'Card Processing Fees (Stripe)', value: cardTotals.fees, sign: '−' }] : []),
              { label: `Est. Sales Tax (${taxRate}%)`, value: summary.estimatedTax, sign: '−' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center text-sm max-w-md">
                <span className="text-slate-400 font-semibold">{r.sign && <span className="text-red-400 mr-1">{r.sign}</span>}{r.label}</span>
                <span className={`font-bold tabular-nums ${r.sign ? 'text-red-300' : 'text-white'}`}>{fmt$(r.value)}</span>
              </div>
            ))}
          </div>
          <div className="lg:text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">What's left for the company</p>
            <p className={`text-4xl font-black tracking-tighter tabular-nums ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(netProfit)}</p>
            <p className="text-xs text-slate-400 font-semibold mt-1">{netMarginPct.toFixed(0)}% net margin</p>
          </div>
        </div>
      </section>

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
                onChange={e => updateSettings({ taxRate: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
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
              <button onClick={() => downloadCSV(`payroll-${fileTag}.csv`, payrollToCSV(payroll))} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"><Download size={13} /> CSV</button>
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
                    <td className="py-2.5 pl-2 text-right text-green-400 tabular-nums">{fmt$(totalCommission)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-[10px] text-slate-500 mt-3">Tap a technician to see their jobs. Commission = revenue × rate (set per-tech in Settings → Team).</p>
            </div>
          )}
        </div>
      </div>

      {/* CARD PAYMENTS — STRIPE LEDGER */}
      {cardLedger.length > 0 && (
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><CreditCard size={16} className="mr-2 text-blue-500" /> Card Payments (Stripe) — {periodLabel}</h3>
            <button
              onClick={() => downloadCSV(`card-payments-${fileTag}.csv`,
                'Date,Job,Client,Type,Gross,Fee,Net\n' + cardLedger.map(r =>
                  `${r.at.slice(0, 10)},#${r.job.jobNumber},"${[r.job.client.firstName, r.job.client.lastName].filter(Boolean).join(' ')}",${r.kind},${r.gross.toFixed(2)},${r.fee.toFixed(2)},${r.net.toFixed(2)}`
                ).join('\n'))}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
            ><Download size={13} /> CSV</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Charged', value: cardTotals.gross, color: 'text-white' },
              { label: 'Stripe Fees', value: -cardTotals.fees, color: 'text-pink-400' },
              { label: 'Refunded', value: -cardTotals.refunds, color: 'text-amber-400' },
              { label: 'Net to Bank', value: cardTotals.net, color: cardTotals.net >= 0 ? 'text-green-400' : 'text-red-400' },
            ].map(c => (
              <div key={c.label} className="bg-slate-950/60 border border-white/5 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{c.label}</p>
                <p className={`text-lg font-black tabular-nums mt-1 ${c.color}`}>{fmtSigned$(c.value)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-white/5">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-2">Job #</th>
                  <th className="py-2 px-2">Client</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2 text-right">Gross</th>
                  <th className="py-2 px-2 text-right">Fee</th>
                  <th className="py-2 pl-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cardLedger.map((r, i) => (
                  <tr key={`${r.job.id}-${r.kind}-${i}`} onClick={() => onJobSelect?.(r.job)} className={`transition-colors hover:bg-white/5 ${onJobSelect ? 'cursor-pointer' : ''}`}>
                    <td className="py-2.5 pr-3 text-xs text-slate-400 tabular-nums">{r.at.slice(0, 10)}</td>
                    <td className="py-2.5 px-2 text-xs font-mono text-blue-400">#{r.job.jobNumber}</td>
                    <td className="py-2.5 px-2 text-sm font-semibold text-white">{r.job.client.firstName} {r.job.client.lastName}</td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${r.kind === 'payment' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className={`py-2.5 px-2 text-right text-sm font-bold tabular-nums ${r.gross >= 0 ? 'text-white' : 'text-amber-400'}`}>{fmtSigned$(r.gross)}</td>
                    <td className="py-2.5 px-2 text-right text-xs text-pink-400/90 tabular-nums">{r.fee > 0 ? `${r.feeEstimated ? '~' : ''}${fmt$(r.fee)}` : '—'}</td>
                    <td className={`py-2.5 pl-2 text-right text-sm font-bold tabular-nums ${r.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtSigned$(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-3">Fees marked ~ are estimated (2.9% + 30¢) — payments taken before fee tracking. Refunds return the full amount to the client; Stripe keeps the original fee.</p>
          </div>
        </div>
      )}

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
                    <tr key={j.id} onClick={() => onJobSelect?.(j)} className={`transition-colors hover:bg-white/5 ${onJobSelect ? 'cursor-pointer' : ''}`}>
                      <td className="py-2.5 pr-3 text-xs text-slate-400 tabular-nums">{formatDate(j.scheduledDate)}</td>
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

      {/* EXPENSES LEDGER */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Receipt size={16} className="mr-2 text-pink-500" /> Expenses — {periodLabel} · {fmt$(totalExpenses)}</h3>
          {periodExpenses.length > 0 && (
            <button onClick={() => downloadCSV(`expenses-${fileTag}.csv`, expensesToCSV(periodExpenses))} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"><Download size={13} /> CSV</button>
          )}
        </div>

        {canManageMoney && (
          <div className="grid grid-cols-2 md:grid-cols-[150px_1fr_120px_1fr_auto] gap-2 mb-5 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Date</label>
              <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50 [color-scheme:dark]" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Category</label>
              <select value={expCategory} onChange={e => setExpCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50 [&>option]:bg-slate-900">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Amount $</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={expAmount} onChange={e => setExpAmount(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-right outline-none focus:border-pink-500/50" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Note</label>
              <input type="text" placeholder="e.g. 50 Schlage blanks" value={expNote} onChange={e => setExpNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExpense(); }}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50" />
            </div>
            {expCategory === 'Advertising' && (
              <div className="col-span-2 md:col-span-full grid grid-cols-2 md:grid-cols-[150px_1fr] gap-2 items-end pt-1">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Channel</label>
                  <select value={expChannel} onChange={e => setExpChannel(e.target.value as LeadChannel | '')}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50 [&>option]:bg-slate-900">
                    <option value="">— unassigned —</option>
                    {LEAD_CHANNELS.map(c => <option key={c} value={c}>{LEAD_CHANNEL_LABELS[c]}</option>)}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight pb-1.5 hidden md:block">Tag ad spend to a channel to see cost-per-lead & ROAS in the Marketing cabinet.</p>
              </div>
            )}
            <button
              onClick={handleAddExpense}
              disabled={!parseFloat(expAmount)}
              className="col-span-2 md:col-span-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-pink-600 text-white hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}

        {periodExpenses.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No expenses recorded for {periodLabel}.{canManageMoney ? ' Log key blanks, fuel, ads — anything the company spends.' : ''}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {periodExpenses.map(e => (
                <div key={e.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
                  <span className="text-xs text-slate-400 tabular-nums w-20 shrink-0">{e.date.slice(5)}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${CATEGORY_STYLE[e.category] || CATEGORY_STYLE.Other}`}>{e.category}</span>
                  <span className="text-xs text-slate-400 truncate flex-1">
                    {e.channel && <span className="text-purple-300 font-semibold">{LEAD_CHANNEL_LABELS[e.channel]}</span>}
                    {e.channel && e.note ? ' · ' : ''}{e.note || (e.channel ? '' : '—')}
                  </span>
                  <span className="text-sm font-bold text-white tabular-nums shrink-0">{fmt$(e.amount)}</span>
                  {canManageMoney && (
                    <button onClick={() => removeExpense(e.id)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0" title="Delete expense">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">By Category</p>
              <div className="space-y-2.5">
                {byCategory.map(c => {
                  const pct = totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0;
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-300">{c.category}</span>
                        <span className="text-white tabular-nums">{fmt$(c.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500/70 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACCOUNTS RECEIVABLE */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Receipt size={16} className="mr-2 text-amber-500" /> Outstanding Invoices (A/R) · {fmt$(totalReceivable)}</h3>
          <button onClick={() => downloadCSV(`transactions-${fileTag}.csv`, jobsToCSV(jobsInMonths(jobs, span)))} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"><Download size={13} /> {periodLabel} CSV</button>
        </div>

        {receivables.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {aging.filter(b => b.count > 0).map(b => (
              <span key={b.label} className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${b.chip}`}>
                {b.label}: {b.count} · {fmt$(b.sum)}
              </span>
            ))}
          </div>
        )}

        {receivables.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nothing outstanding — all completed work is paid. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-white/5">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-2">Age</th>
                  <th className="py-2 px-2">Job #</th>
                  <th className="py-2 px-2">Client</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2 text-right">Paid</th>
                  <th className="py-2 px-2 text-right">Balance Due</th>
                  {canManageMoney && <th className="py-2 pl-2 text-right">Remind</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {receivables.map(r => {
                  const age = ageDays(r.date);
                  const bucket = AGE_BUCKETS.find(b => b.test(age)) || AGE_BUCKETS[0];
                  const state = remindState[r.id];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => { const j = jobs.find(x => x.id === r.id); if (j) onJobSelect?.(j); }}
                      className={`transition-colors hover:bg-white/5 ${onJobSelect ? 'cursor-pointer' : ''}`}
                      title="Open job to collect payment"
                    >
                      <td className="py-2.5 pr-3 text-xs text-slate-400">{formatDate(r.date)}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${bucket.chip}`}>{age}d</span>
                      </td>
                      <td className="py-2.5 px-2 text-xs font-mono text-blue-400">#{r.jobNumber}</td>
                      <td className="py-2.5 px-2 text-sm font-semibold text-white">{r.client}</td>
                      <td className="py-2.5 px-2 text-right text-sm text-slate-300 tabular-nums">{fmt$(r.total)}</td>
                      <td className="py-2.5 px-2 text-right text-sm text-green-400 tabular-nums">{fmt$(r.paid)}</td>
                      <td className="py-2.5 px-2 text-right text-sm font-bold text-amber-400 tabular-nums">{fmt$(r.balance)}</td>
                      {canManageMoney && (
                        <td className="py-2.5 pl-2 text-right">
                          <button
                            onClick={ev => { ev.stopPropagation(); handleRemind(r.id); }}
                            disabled={state === 'sending' || state === 'sent'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                              state === 'sent' ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                : state === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-white/5 text-slate-300 border-white/10 hover:text-white hover:border-blue-500/40'
                            }`}
                          >
                            <BellRing size={11} />
                            {state === 'sending' ? '…' : state === 'sent' ? 'Sent' : state === 'error' ? 'Retry' : 'SMS'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-3">Tap a row to open the job and collect payment. SMS sends a polite balance reminder via OpenPhone.</p>
          </div>
        )}
      </div>
    </div>
  );
};
