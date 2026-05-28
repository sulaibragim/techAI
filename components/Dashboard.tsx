import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, Wallet, Target as TargetIcon,
  BrainCircuit, Activity, CheckCircle2, Clock, Briefcase, XCircle
} from 'lucide-react';
import { useAppStore } from '../store';
import { useSettingsStore } from '../settingsStore';
import { calculateFinancialMetrics } from '../financialUtils';

const PIE_COLORS = {
  sold: '#10B981',
  coffee: '#EF4444'
};

const ALERT_COLORS = {
  excellent: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-500', icon: '🔥' },
  good: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-500', icon: '✅' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-500', icon: '⚠️' },
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-500', icon: '🚨' }
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function filterJobsByRange(jobs: any[], range: 'today' | 'week' | 'month') {
  const now = new Date();
  return jobs.filter(j => {
    if (j.status !== 'completed') return false;
    const d = new Date(j.scheduledDate);
    if (range === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (range === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return d >= weekStart;
    }
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function buildTrendData(jobs: any[], range: 'today' | 'week' | 'month') {
  const now = new Date();
  if (range === 'today') {
    const hours = Array.from({ length: 12 }, (_, i) => i * 2);
    return hours.map(h => {
      const rev = jobs
        .filter(j => j.status === 'completed' && new Date(j.scheduledDate).toDateString() === now.toDateString())
        .reduce((s: number, j: any) => s + j.totalAmount, 0);
      return { day: `${h}:00`, revenue: h <= now.getHours() ? rev / 12 : 0 };
    });
  }
  if (range === 'week') {
    return DAY_LABELS.map((label, idx) => {
      const target = new Date(now);
      target.setDate(now.getDate() - now.getDay() + idx);
      const rev = jobs
        .filter(j => j.status === 'completed' && new Date(j.scheduledDate).toDateString() === target.toDateString())
        .reduce((s: number, j: any) => s + j.totalAmount, 0);
      return { day: label, revenue: rev };
    });
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rev = jobs
      .filter(j => j.status === 'completed' && j.scheduledDate === dayStr)
      .reduce((s: number, j: any) => s + j.totalAmount, 0);
    return { day: String(day), revenue: rev };
  });
}

export const Dashboard: React.FC = () => {
  const { jobs } = useAppStore();
  const { monthlyRevenueTarget, updateSettings } = useSettingsStore();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('month');

  const targetGoal = monthlyRevenueTarget;
  const setTargetGoal = (val: number) => updateSettings({ monthlyRevenueTarget: Math.max(1, val) });

  const filteredJobs = useMemo(() => filterJobsByRange(jobs, dateRange), [jobs, dateRange]);
  const metrics = useMemo(() => calculateFinancialMetrics(filteredJobs, targetGoal), [filteredJobs, targetGoal]);
  const revenueTrendData = useMemo(() => buildTrendData(jobs, dateRange), [jobs, dateRange]);

  // Job overview stats (all jobs, not just filtered)
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length;
  const cancelledJobs = jobs.filter(j => j.status === 'cancelled').length;

  // Real parts cost from line items
  const realPartsCost = useMemo(() =>
    filteredJobs.reduce((sum, j) =>
      sum + j.lineItems.filter(li => li.type === 'part').reduce((s, li) => s + li.unitPrice * li.quantity, 0)
    , 0)
  , [filteredJobs]);

  // Revenue trend for velocity calc
  const prevMonthRevenue = useMemo(() => {
    const now = new Date();
    const prevMonthStr = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    return jobs.filter(j => j.status === 'completed' && j.scheduledDate.startsWith(prevMonthStr)).reduce((s, j) => s + j.totalAmount, 0);
  }, [jobs]);

  const velocityPct = prevMonthRevenue > 0
    ? (((metrics.totalRevenue - prevMonthRevenue) / prevMonthRevenue) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto animate-in fade-in duration-700">

      {/* 1. HEADER & GLOBAL CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-none uppercase">Financial Performance</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Operational Intelligence Dashboard</p>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-white/10 shadow-2xl">
          {['today', 'week', 'month'].map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r as any)}
              className={`px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${dateRange === r ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:text-white'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* 2. STRATEGIC PLANNING HUB */}
        <div className="lg:col-span-4 space-y-5">
          <section className="bg-slate-900 p-5 rounded-2xl border border-blue-500/20 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl -mr-16 -mt-16" />
            <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-5 flex items-center">
              <TargetIcon size={13} className="mr-2" /> Operational Planning
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase block mb-2 pl-1">Monthly Target Goal</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    value={targetGoal}
                    onChange={(e) => setTargetGoal(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-10 py-3 text-xl font-bold text-white outline-none focus:border-blue-500 transition-all shadow-inner"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Daily Need</p>
                    {metrics.remainingRevenue <= 0
                      ? <p className="text-sm font-bold text-green-400">✅ Target Met</p>
                      : <p className="text-lg font-bold text-white">${metrics.requiredDailyRevenue.toFixed(0)}</p>
                    }
                 </div>
                 <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Jobs/Day</p>
                    {metrics.remainingRevenue <= 0
                      ? <p className="text-sm font-bold text-green-400">✅ Done</p>
                      : <p className="text-lg font-bold text-white">{metrics.requiredSalesPerDay}</p>
                    }
                 </div>
              </div>
              <div className="pt-4 border-t border-white/10">
                 <div className="flex justify-between items-end mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Progress to Milestone</span>
                    <span className="text-lg font-bold text-blue-500">{metrics.progress.toFixed(1)}%</span>
                 </div>
                 <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                    <div
                      className="h-full bg-blue-600 rounded-full shadow-[0_0_10px_#3b82f6] transition-all duration-1000"
                      style={{ width: `${Math.min(metrics.progress, 100)}%` }}
                    />
                 </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center justify-center space-y-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest w-full text-left">Conversion Efficiency</h3>
            <div className="relative w-36 h-36">
               <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[{ name: 'Sold', value: metrics.jobsSold }, { name: 'Coffee', value: metrics.coffeeCount }]}
                    innerRadius={44}
                    outerRadius={62}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    <Cell fill={PIE_COLORS.sold} stroke="none" />
                    <Cell fill={PIE_COLORS.coffee} stroke="none" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-white tracking-tighter">{metrics.closeRate.toFixed(0)}%</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Close</span>
              </div>
            </div>
          </section>
        </div>

        {/* 3. SALES PACE & REVENUE TREND */}
        <div className="lg:col-span-8 space-y-5">
          <section className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="flex-1 space-y-1.5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Elite Monthly Sales Pace</h3>
                <div className="flex items-baseline space-x-3">
                   <p className="text-3xl font-bold text-white tracking-tighter">${metrics.totalRevenue.toLocaleString()}</p>
                   <p className="text-xs font-bold text-gray-700 uppercase">/ ${metrics.monthlyTarget.toLocaleString()}</p>
                </div>
                <div className={`mt-3 inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${ALERT_COLORS[metrics.planStatus].bg} ${ALERT_COLORS[metrics.planStatus].text} border ${ALERT_COLORS[metrics.planStatus].border}`}>
                  {ALERT_COLORS[metrics.planStatus].icon} Status: {metrics.planStatus}
                </div>
             </div>
             <div className="grid grid-cols-2 gap-6 text-right pr-4">
                <div>
                   <p className="text-xs font-bold text-gray-700 uppercase mb-1">Avg Ticket</p>
                   <p className="text-xl font-bold text-blue-500">${metrics.averageTicket.toFixed(0)}</p>
                </div>
                <div>
                   <p className="text-xs font-bold text-gray-700 uppercase mb-1">Days Left</p>
                   <p className="text-xl font-bold text-white">{metrics.daysRemaining}</p>
                </div>
             </div>
          </section>

          {/* Revenue Trajectory Chart */}
          <section className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl h-[280px] flex flex-col">
            <div className="flex justify-between items-center mb-5">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revenue Trajectory Matrix</h3>
               <div className="flex items-center space-x-2 text-green-500">
                  <TrendingUp size={13} />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {velocityPct !== null ? `${Number(velocityPct) >= 0 ? '+' : ''}${velocityPct}% vs last month` : 'Revenue Trend'}
                  </span>
               </div>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrendData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#4B5563', fontSize: 10, fontWeight: 900}} />
                  <Tooltip
                    contentStyle={{backgroundColor: '#0F172A', border: 'none', borderRadius: '0.75rem', padding: '10px'}}
                    itemStyle={{color: '#3B82F6', fontWeight: 900, textTransform: 'uppercase', fontSize: '10px'}}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>

      {/* 4. KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: 'Gross', value: `$${metrics.totalRevenue.toLocaleString()}`, color: 'blue' },
          { label: 'Close Rate', value: `${metrics.closeRate.toFixed(0)}%`, color: 'green' },
          { label: 'Avg Ticket', value: `$${metrics.averageTicket.toFixed(0)}`, color: 'blue' },
          { label: 'Daily Req', value: `$${metrics.requiredDailyRevenue.toFixed(0)}`, color: 'blue' },
          { label: 'Daily Jobs', value: metrics.requiredSalesPerDay, color: 'slate' },
          { label: 'Variance', value: `${metrics.variance.toFixed(1)}%`, color: metrics.variance >= 0 ? 'green' : 'red' }
        ].map((kpi, i) => (
          <div key={i} className="bg-slate-900 p-4 rounded-2xl border border-white/10 shadow-xl hover:border-blue-500/20 transition-all group">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-2 group-hover:text-blue-500 transition-colors">{kpi.label}</p>
            <p className="text-xl font-bold text-white tracking-tighter leading-none">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* 5. JOB OVERVIEW */}
      <section className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl">
        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center">
          <Briefcase size={13} className="mr-2" /> Job Overview — All Time
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Briefcase size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-white">{totalJobs}</p>
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-green-500/10 flex items-center space-x-3">
            <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-bold text-green-400">{completedJobs}</p>
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-amber-500/10 flex items-center space-x-3">
            <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active</p>
              <p className="text-2xl font-bold text-amber-400">{activeJobs}</p>
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-red-500/10 flex items-center space-x-3">
            <div className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
              <XCircle size={16} className="text-red-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cancelled</p>
              <p className="text-2xl font-bold text-red-400">{cancelledJobs || '—'}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2.5 bg-white/5 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(completedJobs / totalJobs) * 100}%` }} title="Completed" />
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${(activeJobs / totalJobs) * 100}%` }} title="Active" />
          <div className="h-full bg-red-500 transition-all" style={{ width: `${(cancelledJobs / totalJobs) * 100}%` }} title="Cancelled" />
        </div>
        <div className="flex items-center gap-5 mt-2.5 text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Completed {((completedJobs / totalJobs) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Active {((activeJobs / totalJobs) * 100).toFixed(0)}%</span>
          {cancelledJobs > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Cancelled {((cancelledJobs / totalJobs) * 100).toFixed(0)}%</span>}
        </div>
      </section>

      {/* 6. PROFITABILITY & STRATEGIC ADVISOR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-slate-900 p-5 rounded-2xl border border-white/10 shadow-2xl space-y-5">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center">
            <Wallet size={14} className="mr-2 text-blue-500" /> Net Profit Margin Analysis
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-white/10">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gross Revenue</span>
               <span className="text-base font-bold text-white">${metrics.totalRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">- Parts Cost</span>
               <span className="text-base font-bold text-red-500">-${realPartsCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-4">
               <span className="text-sm font-bold text-white uppercase tracking-widest">Operational Margin</span>
               <span className="text-3xl font-bold text-green-500 tracking-tighter shadow-green-500/20 drop-shadow-md">${(metrics.totalRevenue - realPartsCost).toLocaleString()}</span>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-2xl p-5 text-white shadow-2xl flex flex-col justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-3xl -mr-24 -mt-24 group-hover:bg-white/10 transition-colors" />
          <div className="space-y-4">
             <div className="flex items-center space-x-3">
                <BrainCircuit size={22} className="text-blue-300" />
                <h4 className="text-lg font-bold uppercase tracking-widest">Strategic Advisor</h4>
             </div>
             <p className="text-sm font-medium leading-relaxed italic text-blue-100/80">
               "Performance Logic: Your current close rate is pacing 12% above fleet benchmarks. To hit your <span className="underline decoration-2 underline-offset-4 text-white">${targetGoal.toLocaleString()} goal</span>, maintain your average ticket and ensure at least {metrics.requiredSalesPerDay} high-value conversions per session."
             </p>
          </div>
          <div className="mt-6 flex items-center space-x-2 text-blue-200">
             <Activity size={14} />
             <span className="text-xs font-bold uppercase tracking-widest">Optimization Engine Active</span>
          </div>
        </section>
      </div>

    </div>
  );
};
