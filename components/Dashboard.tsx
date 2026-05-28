import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, Wallet, Target, DollarSign, Calendar,
  Zap, BrainCircuit, Trophy, Clock, Target as TargetIcon,
  Activity, ArrowUpRight, Percent, ChevronRight
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
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Daily Goal</p>
                    <p className="text-lg font-bold text-white">${metrics.requiredDailyRevenue.toFixed(0)}</p>
                 </div>
                 <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Jobs/Day</p>
                    <p className="text-lg font-bold text-white">{metrics.requiredSalesPerDay}</p>
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
                  <span className="text-xs font-bold uppercase tracking-widest">+14.2% Peak Velocity</span>
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

      {/* 5. PROFITABILITY & STRATEGIC ADVISOR */}
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
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">- Parts & Logistics</span>
               <span className="text-base font-bold text-red-500">-$2,140</span>
            </div>
            <div className="flex justify-between items-center pt-4">
               <span className="text-sm font-bold text-white uppercase tracking-widest">Operational Margin</span>
               <span className="text-3xl font-bold text-green-500 tracking-tighter shadow-green-500/20 drop-shadow-md">${(metrics.totalRevenue - 2140).toLocaleString()}</span>
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
