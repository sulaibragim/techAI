import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, Target as TargetIcon, BrainCircuit, Activity,
  CheckCircle2, Clock, Briefcase, XCircle, ChevronLeft, ChevronRight, GitCompareArrows,
  Download, Trophy, Coffee, Users, CalendarDays, Sparkles, Flame, AlertTriangle, AlertCircle
} from 'lucide-react';
import { useAppStore, useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import {
  calculatePeriodMetrics, buildMonthlyTrend, buildYearlyTrend, revenueByJobType,
  topClients, revenueByDayOfWeek, computeRecords, coffeeAnalysis, availableMonths,
  periodJobsToCSV, MONTH_FULL, MONTH_LABELS, FinancialMetrics
} from '../financialUtils';

const TYPE_COLORS: Record<string, string> = {
  Automotive: '#3B82F6',
  Residential: '#10B981',
  Commercial: '#F59E0B',
  'Secure / Safe': '#8B5CF6',
  Other: '#64748B',
};

const ALERT_COLORS = {
  excellent: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', icon: Flame },
  good: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: CheckCircle2 },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: AlertTriangle },
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: AlertCircle },
};

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const stepMonth = (year: number, month: number, delta: number) => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

const chartTooltip = {
  contentStyle: { backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '10px' },
  itemStyle: { fontWeight: 700, fontSize: '11px' },
  labelStyle: { color: '#94A3B8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' as const },
};

// ---- Reusable bits -----------------------------------------------------------

const MonthPicker: React.FC<{
  year: number; month: number;
  months: { year: number; month: number }[];
  onChange: (y: number, m: number) => void;
  accent?: string;
}> = ({ year, month, months, onChange, accent = 'blue' }) => (
  <div className={`flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-${accent}-500/30 shadow-lg`}>
    <button
      onClick={() => { const s = stepMonth(year, month, -1); onChange(s.year, s.month); }}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
    ><ChevronLeft size={16} /></button>
    <select
      value={`${year}-${month}`}
      onChange={e => { const [y, m] = e.target.value.split('-').map(Number); onChange(y, m); }}
      className="bg-transparent text-white text-xs font-bold uppercase tracking-wider px-2 py-1.5 outline-none cursor-pointer min-w-[130px] text-center [&>option]:bg-slate-900"
    >
      {(() => {
        const has = months.some(mm => mm.year === year && mm.month === month);
        const list = has ? months : [{ year, month }, ...months];
        return list.map(mm => (
          <option key={`${mm.year}-${mm.month}`} value={`${mm.year}-${mm.month}`}>
            {MONTH_FULL[mm.month]} {mm.year}
          </option>
        ));
      })()}
    </select>
    <button
      onClick={() => { const s = stepMonth(year, month, 1); onChange(s.year, s.month); }}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
    ><ChevronRight size={16} /></button>
  </div>
);

const Card: React.FC<{ title?: string; icon?: React.ElementType; className?: string; children: React.ReactNode }> =
  ({ title, icon: Icon, className = '', children }) => (
    <section className={`bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl ${className}`}>
      {title && (
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
          {Icon && <Icon size={13} className="mr-2 text-blue-400" />} {title}
        </h3>
      )}
      {children}
    </section>
  );

// ---- Main --------------------------------------------------------------------

export const Dashboard: React.FC = () => {
  const jobs = useVisibleJobs();
  const { monthlyRevenueTarget, monthlyTargets, setMonthlyTarget } = useSettingsStore();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [compareMode, setCompareMode] = useState(false);
  const prevDefault = stepMonth(now.getFullYear(), now.getMonth(), -1);
  const [cmpYear, setCmpYear] = useState(prevDefault.year);
  const [cmpMonth, setCmpMonth] = useState(prevDefault.month);

  const keyOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const targetGoal = monthlyTargets[keyOf(viewYear, viewMonth)] ?? monthlyRevenueTarget;
  const setTargetGoal = (val: number) => setMonthlyTarget(keyOf(viewYear, viewMonth), Math.max(1, val));
  const targetB = monthlyTargets[keyOf(cmpYear, cmpMonth)] ?? monthlyRevenueTarget;

  const months = useMemo(() => availableMonths(jobs), [jobs]);

  const A = useMemo(() => calculatePeriodMetrics(jobs, viewYear, viewMonth, targetGoal), [jobs, viewYear, viewMonth, targetGoal]);
  const B = useMemo(() => calculatePeriodMetrics(jobs, cmpYear, cmpMonth, targetB), [jobs, cmpYear, cmpMonth, targetB]);
  const trend = useMemo(() => buildMonthlyTrend(jobs, viewYear, viewMonth), [jobs, viewYear, viewMonth]);
  const yearly = useMemo(() => buildYearlyTrend(jobs, viewYear), [jobs, viewYear]);
  const byType = useMemo(() => revenueByJobType(jobs, viewYear, viewMonth), [jobs, viewYear, viewMonth]);
  const clients = useMemo(() => topClients(jobs, viewYear, viewMonth), [jobs, viewYear, viewMonth]);
  const dow = useMemo(() => revenueByDayOfWeek(jobs, viewYear, viewMonth), [jobs, viewYear, viewMonth]);
  const records = useMemo(() => computeRecords(jobs), [jobs]);
  const coffee = useMemo(() => coffeeAnalysis(jobs, viewYear, viewMonth), [jobs, viewYear, viewMonth]);

  const prevMonth = useMemo(() => stepMonth(viewYear, viewMonth, -1), [viewYear, viewMonth]);
  const prevMetrics = useMemo(() => calculatePeriodMetrics(jobs, prevMonth.year, prevMonth.month, monthlyTargets[keyOf(prevMonth.year, prevMonth.month)] ?? monthlyRevenueTarget), [jobs, prevMonth, monthlyTargets, monthlyRevenueTarget]);

  const velocityPct = prevMetrics.totalRevenue > 0
    ? ((A.totalRevenue - prevMetrics.totalRevenue) / prevMetrics.totalRevenue) * 100
    : null;

  const insights = useMemo(() => {
    const out: string[] = [];
    if (velocityPct !== null) {
      out.push(`Revenue is ${velocityPct >= 0 ? 'up' : 'down'} ${Math.abs(velocityPct).toFixed(0)}% vs ${MONTH_FULL[prevMonth.month]} (${fmt$(prevMetrics.totalRevenue)} → ${fmt$(A.totalRevenue)}).`);
    }
    if (A.totalCount > 0) {
      out.push(`Close rate ${A.closeRate.toFixed(0)}% — ${A.closeRate >= 70 ? 'strong conversion' : 'room to improve'}. ${A.coffeeCount} no-sale visit${A.coffeeCount === 1 ? '' : 's'} this period.`);
    }
    if (byType.length && A.totalRevenue > 0) {
      const top = byType[0];
      out.push(`${top.type} is your top earner — ${fmt$(top.revenue)} (${Math.round((top.revenue / A.totalRevenue) * 100)}% of revenue).`);
    }
    if (A.isCurrentMonth && A.daysElapsed > 0) {
      out.push(`At current pace you'll finish ~${fmt$(A.projectedRevenue)} — ${A.projectedRevenue >= targetGoal ? 'above' : 'below'} your ${fmt$(targetGoal)} target.`);
    }
    if (A.margin > 0 && A.totalRevenue > 0) {
      out.push(`Net margin ${A.marginPct.toFixed(0)}% after ${fmt$(A.partsCost)} parts cost — ${fmt$(A.margin)} kept.`);
    }
    return out.slice(0, 4);
  }, [velocityPct, prevMonth, prevMetrics, A, byType, targetGoal]);

  const handleExport = () => {
    const csv = periodJobsToCSV(jobs, viewYear, viewMonth);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${viewYear}-${String(viewMonth + 1).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const periodLabel = `${MONTH_FULL[viewMonth]} ${viewYear}`;

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto animate-in fade-in duration-500">

      {/* HEADER + PERIOD CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none">Financial Performance</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">
            {compareMode ? 'Comparison Mode' : periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!compareMode && <MonthPicker year={viewYear} month={viewMonth} months={months} onChange={(y, m) => { setViewYear(y); setViewMonth(m); }} />}
          <button
            onClick={() => setCompareMode(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${compareMode ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-white/10 hover:text-white hover:border-blue-500/40'}`}
          >
            <GitCompareArrows size={14} /> {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          {!compareMode && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-900 text-slate-300 border border-white/10 hover:text-white hover:border-blue-500/40 transition-all"
            >
              <Download size={14} /> Export
            </button>
          )}
        </div>
      </div>

      {compareMode ? (
        <CompareView
          jobs={jobs} months={months} target={targetGoal}
          A={A} B={B} viewYear={viewYear} viewMonth={viewMonth} cmpYear={cmpYear} cmpMonth={cmpMonth}
          setView={(y, m) => { setViewYear(y); setViewMonth(m); }}
          setCmp={(y, m) => { setCmpYear(y); setCmpMonth(m); }}
        />
      ) : (
        <>
          {/* PLANNING + CONVERSION  |  SALES PACE + TRAJECTORY */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 space-y-5">
              <Card className="!border-blue-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl -mr-16 -mt-16" />
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-5 flex items-center">
                  <TargetIcon size={13} className="mr-2" /> {A.isPastMonth ? 'Final Results' : 'Operational Planning'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-2 pl-1">Target — {MONTH_FULL[viewMonth]} {viewYear}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        value={targetGoal}
                        onChange={e => setTargetGoal(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-10 py-3 text-xl font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                      />
                    </div>
                  </div>
                  {A.isPastMonth ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Final Revenue</p>
                        <p className="text-lg font-bold text-white">{fmt$(A.totalRevenue)}</p>
                      </div>
                      <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">vs Target</p>
                        <p className={`text-lg font-bold ${A.totalRevenue >= targetGoal ? 'text-green-400' : 'text-amber-400'}`}>{A.progress.toFixed(0)}%</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Daily Need</p>
                        {A.remainingRevenue <= 0
                          ? <p className="text-sm font-bold text-green-400">Target met</p>
                          : <p className="text-lg font-bold text-white">{fmt$(A.requiredDailyRevenue)}</p>}
                      </div>
                      <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Jobs/Day</p>
                        {A.remainingRevenue <= 0
                          ? <p className="text-sm font-bold text-green-400">Done</p>
                          : <p className="text-lg font-bold text-white">{A.requiredSalesPerDay}</p>}
                      </div>
                    </div>
                  )}
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Progress to Milestone</span>
                      <span className="text-lg font-bold text-blue-400">{A.progress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div className="h-full bg-blue-600 rounded-full shadow-[0_0_10px_#3b82f6] transition-all duration-1000" style={{ width: `${Math.min(A.progress, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col items-center justify-center space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest w-full text-left">Conversion Efficiency</h3>
                <div className="relative w-36 h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: 'Sold', value: A.jobsSold }, { name: 'Coffee', value: A.coffeeCount }]} innerRadius={44} outerRadius={62} paddingAngle={8} dataKey="value">
                        <Cell fill="#10B981" stroke="none" />
                        <Cell fill="#EF4444" stroke="none" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-white tracking-tighter">{A.closeRate.toFixed(0)}%</span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Close</span>
                  </div>
                </div>
                <div className="flex gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-green-400"><span className="w-2 h-2 rounded-full bg-green-500" />Sold {A.jobsSold}</span>
                  <span className="flex items-center gap-1.5 text-red-400"><span className="w-2 h-2 rounded-full bg-red-500" />Coffee {A.coffeeCount}</span>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-8 space-y-5">
              <Card className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex-1 space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Sales Pace — {periodLabel}</h3>
                  <div className="flex items-baseline space-x-3">
                    <p className="text-3xl font-bold text-white tracking-tighter">{fmt$(A.totalRevenue)}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase">/ {fmt$(A.monthlyTarget)}</p>
                  </div>
                  <div className={`mt-3 inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${ALERT_COLORS[A.planStatus].bg} ${ALERT_COLORS[A.planStatus].text} border ${ALERT_COLORS[A.planStatus].border}`}>
                    {(() => { const Icon = ALERT_COLORS[A.planStatus].icon; return <Icon size={12} />; })()}
                    <span>Status: {A.planStatus}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 text-right pr-2">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Avg Ticket</p>
                    <p className="text-xl font-bold text-blue-400">{fmt$(A.averageTicket)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">{A.isCurrentMonth ? 'Projected' : 'Jobs'}</p>
                    <p className="text-xl font-bold text-white">{A.isCurrentMonth ? fmt$(A.projectedRevenue) : A.totalCount}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">{A.isPastMonth ? 'Margin' : 'Days Left'}</p>
                    <p className="text-xl font-bold text-white">{A.isPastMonth ? fmt$(A.margin) : A.daysRemaining}</p>
                  </div>
                </div>
              </Card>

              <Card className="h-[280px] flex flex-col">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue Trajectory — {periodLabel}</h3>
                  {velocityPct !== null && (
                    <div className={`flex items-center space-x-2 ${velocityPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {velocityPct >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      <span className="text-xs font-bold uppercase tracking-widest">{velocityPct >= 0 ? '+' : ''}{velocityPct.toFixed(1)}% vs prev</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} interval={4} />
                      <Tooltip {...chartTooltip} formatter={(v: number) => [fmt$(v), 'Revenue']} labelFormatter={l => `Day ${l}`} />
                      <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} fill="url(#colorRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card title="Pace & Projection" icon={TargetIcon}>
                {(() => {
                  const headline = A.isCurrentMonth ? A.projectedRevenue : A.totalRevenue;
                  const onTrack = headline >= targetGoal;
                  const short = Math.max(0, targetGoal - headline);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">{A.isCurrentMonth ? 'Projected Month-End' : 'Final Revenue'}</p>
                        <p className="text-2xl font-bold text-white tracking-tighter">{fmt$(headline)}</p>
                        <p className={`text-xs font-bold mt-1 ${onTrack ? 'text-green-400' : 'text-amber-400'}`}>
                          {onTrack ? 'On track for goal' : `${fmt$(short)} short of goal`}
                        </p>
                      </div>
                      <div className="sm:col-span-2 space-y-3">
                        <div>
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span className="text-slate-400 uppercase tracking-wider">Actual</span>
                            <span className="text-blue-400">{A.progress.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(A.progress, 100)}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span className="text-slate-400 uppercase tracking-wider">{A.isCurrentMonth ? `Expected pace · day ${A.daysElapsed}/${A.daysInMonth}` : 'Month complete'}</span>
                            <span className="text-slate-300">{A.expectedProgress.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-slate-400 rounded-full transition-all duration-700" style={{ width: `${Math.min(A.expectedProgress, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </Card>
            </div>
          </div>

          {/* KPI GRID */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { label: 'Gross', value: fmt$(A.totalRevenue) },
              { label: 'Net Margin', value: fmt$(A.margin), accent: 'text-green-400' },
              { label: 'Close Rate', value: `${A.closeRate.toFixed(0)}%` },
              { label: 'Avg Ticket', value: fmt$(A.averageTicket) },
              { label: 'Jobs Done', value: String(A.totalCount) },
              { label: 'Variance', value: `${A.variance >= 0 ? '+' : ''}${A.variance.toFixed(1)}%`, accent: A.variance >= 0 ? 'text-green-400' : 'text-red-400' },
            ].map((kpi, i) => (
              <div key={i} className="bg-slate-900 p-4 rounded-2xl border border-white/10 shadow-xl hover:border-blue-500/30 transition-all group">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 group-hover:text-blue-400 transition-colors">{kpi.label}</p>
                <p className={`text-xl font-bold tracking-tighter leading-none ${kpi.accent || 'text-white'}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* REVENUE BY TYPE  |  TOP CLIENTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Revenue by Job Type" icon={Briefcase}>
              {byType.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No completed jobs this period.</p>
              ) : (
                <div className="flex items-center gap-5">
                  <div className="w-36 h-36 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byType} innerRadius={40} outerRadius={62} paddingAngle={4} dataKey="revenue" nameKey="type">
                          {byType.map(t => <Cell key={t.type} fill={TYPE_COLORS[t.type] || '#64748B'} stroke="none" />)}
                        </Pie>
                        <Tooltip {...chartTooltip} formatter={(v: number) => [fmt$(v), 'Revenue']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {byType.map(t => (
                      <div key={t.type} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] || '#64748B' }} />
                          {t.type}
                        </span>
                        <span className="text-xs font-bold text-white">{fmt$(t.revenue)} <span className="text-slate-500">· {t.count}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Top Clients" icon={Users}>
              {clients.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No completed jobs this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {clients.map((c, i) => (
                    <div key={c.name + i} className="flex items-center justify-between bg-white/5 px-3 py-2.5 rounded-xl border border-white/10">
                      <span className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="text-sm font-semibold text-white">{c.name}</span>
                      </span>
                      <span className="text-sm font-bold text-white">{fmt$(c.revenue)} <span className="text-xs text-slate-500 font-medium">· {c.jobs} job{c.jobs === 1 ? '' : 's'}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* YEARLY SEASONALITY  |  DAY OF WEEK */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title={`Year Overview — ${viewYear}`} icon={CalendarDays} className="h-[260px] flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearly}>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 9, fontWeight: 700 }} />
                    <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number) => [fmt$(v), 'Revenue']} />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                      {yearly.map((m) => <Cell key={m.month} fill={m.monthIndex === viewMonth ? '#3B82F6' : '#1E40AF'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="When You Earn — Day of Week" icon={Activity} className="h-[260px] flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dow}>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} />
                    <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number, _n, p: any) => [`${fmt$(v)} · ${p.payload.count} jobs`, 'Revenue']} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* RECORDS  |  COFFEE LOSS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="All-Time Records" icon={Trophy}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/5 p-4 rounded-xl border border-amber-500/15">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Best Day</p>
                  <p className="text-lg font-bold text-white">{fmt$(records.bestDay.revenue)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{records.bestDay.date || '—'}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-blue-500/15">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Best Month</p>
                  <p className="text-lg font-bold text-white">{fmt$(records.bestMonth.revenue)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{records.bestMonth.month || '—'}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-green-500/15">
                  <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">Biggest Ticket</p>
                  <p className="text-lg font-bold text-white">{fmt$(records.biggestTicket.amount)}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{records.biggestTicket.client || '—'}</p>
                </div>
              </div>
            </Card>

            <Card title="Missed Revenue — Coffee & Cancellations" icon={Coffee}>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 p-4 rounded-xl border border-red-500/15 text-center">
                  <p className="text-2xl font-bold text-red-400">{coffee.coffeeCount}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">No-Sale</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-slate-500/15 text-center">
                  <p className="text-2xl font-bold text-slate-300">{coffee.cancelledCount}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Cancelled</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-amber-500/15 text-center">
                  <p className="text-2xl font-bold text-amber-400">{fmt$(coffee.lostEstimate)}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Est. Lost</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">Estimated loss = missed visits × average ticket for the period.</p>
            </Card>
          </div>

          {/* MARGIN  |  AUTO-INSIGHTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Net Profit Margin" icon={Wallet}>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gross Revenue</span>
                  <span className="text-base font-bold text-white">{fmt$(A.totalRevenue)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">- Parts Cost</span>
                  <span className="text-base font-bold text-red-400">-{fmt$(A.partsCost)}</span>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <span className="text-sm font-bold text-white uppercase tracking-widest">Margin <span className="text-slate-500">({A.marginPct.toFixed(0)}%)</span></span>
                  <span className="text-3xl font-bold text-green-400 tracking-tighter drop-shadow-md">{fmt$(A.margin)}</span>
                </div>
              </div>
            </Card>

            <section className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-2xl p-5 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-3xl -mr-24 -mt-24" />
              <div className="flex items-center space-x-3 mb-4">
                <BrainCircuit size={22} className="text-blue-300" />
                <h4 className="text-lg font-bold tracking-tight">Smart Insights</h4>
              </div>
              {insights.length === 0 ? (
                <p className="text-sm text-blue-100/70 italic">Not enough data for this period yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {insights.map((t, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-blue-50/90 leading-snug">
                      <Sparkles size={14} className="text-blue-300 mt-0.5 shrink-0" /> {t}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

// ---- Compare View ------------------------------------------------------------

const CompareView: React.FC<{
  jobs: any[]; months: { year: number; month: number }[]; target: number;
  A: FinancialMetrics; B: FinancialMetrics;
  viewYear: number; viewMonth: number; cmpYear: number; cmpMonth: number;
  setView: (y: number, m: number) => void; setCmp: (y: number, m: number) => void;
}> = ({ jobs, months, A, B, viewYear, viewMonth, cmpYear, cmpMonth, setView, setCmp }) => {
  const labelA = `${MONTH_FULL[viewMonth]} ${viewYear}`;
  const labelB = `${MONTH_FULL[cmpMonth]} ${cmpYear}`;

  const trendCompare = useMemo(() => {
    const ta = buildMonthlyTrend(jobs, viewYear, viewMonth);
    const tb = buildMonthlyTrend(jobs, cmpYear, cmpMonth);
    const len = Math.max(ta.length, tb.length);
    return Array.from({ length: len }, (_, i) => ({ day: String(i + 1), A: ta[i]?.revenue ?? 0, B: tb[i]?.revenue ?? 0 }));
  }, [jobs, viewYear, viewMonth, cmpYear, cmpMonth]);

  const rows: { label: string; a: number; b: number; fmt: (n: number) => string; higherIsBetter: boolean }[] = [
    { label: 'Revenue', a: A.totalRevenue, b: B.totalRevenue, fmt: fmt$, higherIsBetter: true },
    { label: 'Net Margin', a: A.margin, b: B.margin, fmt: fmt$, higherIsBetter: true },
    { label: 'Jobs Done', a: A.totalCount, b: B.totalCount, fmt: n => String(n), higherIsBetter: true },
    { label: 'Close Rate', a: A.closeRate, b: B.closeRate, fmt: n => `${n.toFixed(0)}%`, higherIsBetter: true },
    { label: 'Avg Ticket', a: A.averageTicket, b: B.averageTicket, fmt: fmt$, higherIsBetter: true },
    { label: 'No-Sale Visits', a: A.coffeeCount, b: B.coffeeCount, fmt: n => String(n), higherIsBetter: false },
  ];

  return (
    <div className="space-y-5">
      {/* Pickers */}
      <div className="flex flex-wrap items-center justify-center gap-4 bg-slate-900 p-4 rounded-2xl border border-white/10">
        <div className="text-center">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Period A</p>
          <MonthPicker year={viewYear} month={viewMonth} months={months} onChange={setView} accent="blue" />
        </div>
        <span className="text-slate-500 font-bold text-lg pt-5">vs</span>
        <div className="text-center">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Period B</p>
          <MonthPicker year={cmpYear} month={cmpMonth} months={months} onChange={setCmp} accent="amber" />
        </div>
      </div>

      {/* Big revenue cards */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-slate-900 p-5 rounded-2xl border border-blue-500/30 shadow-2xl">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{labelA}</p>
          <p className="text-3xl font-bold text-white tracking-tighter">{fmt$(A.totalRevenue)}</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">{A.totalCount} jobs · {A.closeRate.toFixed(0)}% close</p>
        </div>
        <div className="bg-slate-900 p-5 rounded-2xl border border-amber-500/30 shadow-2xl">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">{labelB}</p>
          <p className="text-3xl font-bold text-white tracking-tighter">{fmt$(B.totalRevenue)}</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">{B.totalCount} jobs · {B.closeRate.toFixed(0)}% close</p>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-4 px-5 py-3 border-b border-white/10 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <span>Metric</span>
          <span className="text-right text-blue-400">{labelA}</span>
          <span className="text-right text-amber-400">{labelB}</span>
          <span className="text-right">Change</span>
        </div>
        {rows.map(r => {
          const diff = r.a - r.b;
          const pct = r.b !== 0 ? (diff / Math.abs(r.b)) * 100 : r.a !== 0 ? 100 : 0;
          const up = diff > 0;
          const flat = Math.abs(diff) < 0.0001;
          const good = flat ? true : r.higherIsBetter ? up : !up;
          return (
            <div key={r.label} className="grid grid-cols-4 px-5 py-3.5 border-b border-white/5 items-center hover:bg-white/[0.02] transition-colors">
              <span className="text-sm font-semibold text-slate-300">{r.label}</span>
              <span className="text-right text-sm font-bold text-white">{r.fmt(r.a)}</span>
              <span className="text-right text-sm font-bold text-slate-400">{r.fmt(r.b)}</span>
              <span className={`text-right text-xs font-bold flex items-center justify-end gap-1 ${flat ? 'text-slate-500' : good ? 'text-green-400' : 'text-red-400'}`}>
                {!flat && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                {flat ? '—' : `${up ? '+' : ''}${pct.toFixed(0)}%`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Overlaid daily trend */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl h-[300px] flex flex-col">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Daily Revenue Overlay</h3>
        <div className="flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendCompare}>
              <defs>
                <linearGradient id="cmpA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.35} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                <linearGradient id="cmpB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} /><stop offset="95%" stopColor="#F59E0B" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} interval={4} />
              <Tooltip {...chartTooltip} formatter={(v: number, n) => [fmt$(v), n === 'A' ? labelA : labelB]} labelFormatter={l => `Day ${l}`} />
              <Legend formatter={(v) => (v === 'A' ? labelA : labelB)} wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
              <Area type="monotone" dataKey="A" stroke="#3B82F6" strokeWidth={2.5} fill="url(#cmpA)" />
              <Area type="monotone" dataKey="B" stroke="#F59E0B" strokeWidth={2.5} fill="url(#cmpB)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
