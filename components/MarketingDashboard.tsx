import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Megaphone, TrendingUp, Target as TargetIcon, Users, DollarSign, Coins,
  ChevronLeft, ChevronRight, Info, Zap, Gift, ArrowRight,
} from 'lucide-react';
import { useVisibleJobs } from '../store';
import { useSettingsStore } from '../settingsStore';
import {
  channelMetrics, leadFunnel, monthsInPeriod, availableMonths,
  MONTH_FULL, PeriodMode, ChannelMetrics,
} from '../financialUtils';
import { LeadChannel, LEAD_CHANNEL_LABELS } from '../types';

const CH_COLORS: Record<LeadChannel | 'unknown', string> = {
  google_ads:  '#3B82F6',
  facebook:    '#1877F2',
  instagram:   '#C13584',
  google_maps: '#10B981',
  website:     '#8B5CF6',
  referral:    '#F59E0B',
  repeat:      '#F472B6',
  other:       '#14B8A6',
  unknown:     '#64748B',
};

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const stepMonth = (year: number, month: number, delta: number) => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

const chartTooltip = {
  contentStyle: { backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '10px' },
  itemStyle: { fontWeight: 700, fontSize: '11px' },
  labelStyle: { color: '#94A3B8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' as const },
};

const Card: React.FC<{ title?: string; icon?: React.ElementType; className?: string; children: React.ReactNode }> =
  ({ title, icon: Icon, className = '', children }) => (
    <div className={`bg-slate-900 rounded-3xl border border-white/10 p-5 md:p-6 shadow-xl ${className}`}>
      {title && (
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
          {Icon && <Icon size={16} className="mr-2 text-purple-400" />} {title}
        </h3>
      )}
      {children}
    </div>
  );

const Kpi: React.FC<{ label: string; value: string; sub?: string; accent?: string; icon?: React.ElementType }> =
  ({ label, value, sub, accent = 'text-white', icon: Icon }) => (
    <div className="bg-slate-900 rounded-2xl border border-white/10 p-4 md:p-5 shadow-lg">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        {Icon && <Icon size={14} />}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl md:text-3xl font-extrabold tracking-tight tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1 font-medium">{sub}</p>}
    </div>
  );

export const MarketingDashboard: React.FC = () => {
  const jobs = useVisibleJobs();
  const { expenses } = useSettingsStore();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [mode, setMode] = useState<PeriodMode>('month');

  const months = useMemo(() => availableMonths(jobs), [jobs]);
  const span = useMemo(() => monthsInPeriod(viewYear, viewMonth, mode), [viewYear, viewMonth, mode]);

  const rows = useMemo(() => channelMetrics(jobs, expenses, span), [jobs, expenses, span]);
  const funnel = useMemo(() => leadFunnel(jobs, span), [jobs, span]);

  const totals = useMemo(() => {
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cogs = rows.reduce((s, r) => s + r.cogs, 0);
    const leads = rows.reduce((s, r) => s + r.leads, 0);
    const won = rows.reduce((s, r) => s + r.wonJobs, 0);
    const knownLeads = rows.filter(r => r.channel !== 'unknown').reduce((s, r) => s + r.leads, 0);
    return {
      spend, revenue, cogs, leads, won, knownLeads,
      profit: revenue - cogs - spend,
      roas: spend > 0 ? revenue / spend : 0,
      cac: won > 0 && spend > 0 ? spend / won : 0,
      coverage: leads > 0 ? knownLeads / leads : 0,
    };
  }, [rows]);

  const periodLabel = mode === 'month'
    ? `${MONTH_FULL[viewMonth]} ${viewYear}`
    : mode === 'quarter'
      ? `Q${Math.floor(viewMonth / 3) + 1} ${viewYear}`
      : `${viewYear}`;

  const barData = rows
    .filter(r => r.revenue > 0 || r.spend > 0)
    .map(r => ({ name: LEAD_CHANNEL_LABELS[r.channel], revenue: r.revenue, spend: r.spend, channel: r.channel }));

  const leadPie = rows
    .filter(r => r.leads > 0)
    .map(r => ({ name: LEAD_CHANNEL_LABELS[r.channel], value: r.leads, channel: r.channel }));

  const hasAnyData = rows.length > 0 && (totals.leads > 0 || totals.revenue > 0 || totals.spend > 0);

  const funnelSteps = [
    { key: 'leads', label: 'Leads', value: funnel.leads },
    { key: 'booked', label: 'Booked', value: funnel.booked },
    { key: 'reached', label: 'On site', value: funnel.reached },
    { key: 'won', label: 'Won', value: funnel.won },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Megaphone className="text-purple-400" size={26} /> Marketing
          </h2>
          <p className="text-sm text-slate-400 mt-1">Ad spend, leads & revenue by channel — {periodLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period mode */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
            {(['month', 'quarter', 'year'] as PeriodMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${mode === m ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >{m}</button>
            ))}
          </div>
          {/* Month stepper */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-purple-500/30 shadow-lg">
            <button onClick={() => { const s = stepMonth(viewYear, viewMonth, mode === 'year' ? -12 : mode === 'quarter' ? -3 : -1); setViewYear(s.year); setViewMonth(s.month); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><ChevronLeft size={16} /></button>
            <select
              value={`${viewYear}-${viewMonth}`}
              onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setViewYear(y); setViewMonth(m); }}
              className="bg-transparent text-white text-xs font-bold uppercase tracking-wider px-2 py-1.5 outline-none cursor-pointer min-w-[120px] text-center [&>option]:bg-slate-900"
            >
              {(() => {
                const has = months.some(mm => mm.year === viewYear && mm.month === viewMonth);
                const list = has ? months : [{ year: viewYear, month: viewMonth }, ...months];
                return list.map(mm => (
                  <option key={`${mm.year}-${mm.month}`} value={`${mm.year}-${mm.month}`}>{MONTH_FULL[mm.month]} {mm.year}</option>
                ));
              })()}
            </select>
            <button onClick={() => { const s = stepMonth(viewYear, viewMonth, mode === 'year' ? 12 : mode === 'quarter' ? 3 : 1); setViewYear(s.year); setViewMonth(s.month); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4">
        <Kpi label="Ad spend" value={fmt$(totals.spend)} icon={Coins} accent="text-pink-400" />
        <Kpi label="Attributed revenue" value={fmt$(totals.revenue)} icon={DollarSign} accent="text-green-400" />
        <Kpi label="Blended ROAS" value={totals.spend > 0 ? `${totals.roas.toFixed(1)}×` : '—'} icon={TrendingUp} accent="text-blue-400"
          sub={totals.spend > 0 ? `$${totals.revenue > 0 ? (totals.revenue / totals.spend).toFixed(2) : '0'} per $1` : 'no spend logged'} />
        <Kpi label="Leads" value={String(totals.leads)} icon={Users} accent="text-white" sub={`${fmtPct(totals.coverage)} tagged`} />
        <Kpi label="Won jobs" value={String(totals.won)} icon={TargetIcon} accent="text-white"
          sub={totals.leads > 0 ? `${fmtPct(totals.won / totals.leads)} of leads` : undefined} />
        <Kpi label="Blended CAC" value={totals.cac > 0 ? fmt$(totals.cac) : '—'} icon={TargetIcon} accent="text-amber-400"
          sub={totals.cac > 0 ? 'spend ÷ won jobs' : 'no paid wins'} />
      </div>

      {!hasAnyData ? (
        <Card>
          <div className="text-center py-12">
            <Megaphone className="mx-auto text-slate-600 mb-4" size={40} />
            <p className="text-white font-bold text-lg">No marketing data for {periodLabel} yet</p>
            <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
              Tag jobs with a lead source (in the job card or new-job wizard) and log ad spend by channel in
              Accounting → Expenses. This cabinet fills in as soon as there's something to attribute.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Attribution coverage nudge */}
          {totals.coverage < 0.7 && totals.leads > 0 && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
              <Info size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200/90">
                Only <b>{fmtPct(totals.coverage)}</b> of leads have a source tagged ({totals.leads - totals.knownLeads} untagged).
                The more jobs you tag, the sharper ROAS and CAC get. Tag the source on each job card.
              </p>
            </div>
          )}

          {/* Funnel */}
          <Card title={`Lead funnel — ${periodLabel}`} icon={ArrowRight}>
            <div className="grid grid-cols-4 gap-2 md:gap-4">
              {funnelSteps.map((s, i) => {
                const pctOfLeads = funnel.leads > 0 ? s.value / funnel.leads : 0;
                const prev = i > 0 ? funnelSteps[i - 1].value : s.value;
                const conv = prev > 0 ? s.value / prev : 0;
                return (
                  <div key={s.key} className="relative bg-slate-950/60 rounded-2xl border border-white/5 p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-white tabular-nums mt-1">{s.value}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{fmtPct(pctOfLeads)} of leads</p>
                    {i > 0 && (
                      <span className="absolute -left-1 md:-left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-purple-400 bg-slate-900 px-1.5 py-0.5 rounded-full border border-purple-500/30 hidden md:block">
                        {fmtPct(conv)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Revenue vs spend by channel" icon={TrendingUp} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000) + 'k' : v}`} />
                  <Tooltip {...chartTooltip} formatter={(v: number, n: string) => [fmt$(v), n === 'revenue' ? 'Revenue' : 'Spend']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }} />
                  <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} fill="#22C55E" />
                  <Bar dataKey="spend" name="Spend" radius={[6, 6, 0, 0]} fill="#EC4899" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Leads by channel" icon={Users}>
              {leadPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={leadPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {leadPie.map((e) => <Cell key={e.channel} fill={CH_COLORS[e.channel as LeadChannel | 'unknown']} />)}
                    </Pie>
                    <Tooltip {...chartTooltip} formatter={(v: number) => [`${v} leads`, '']} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-500 py-16 text-center">No leads in this period.</p>}
            </Card>
          </div>

          {/* Channel table */}
          <Card title="Channel performance" icon={Megaphone}>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/10">
                    <th className="text-left py-3 px-2">Channel</th>
                    <th className="text-right py-3 px-2">Leads</th>
                    <th className="text-right py-3 px-2">Won</th>
                    <th className="text-right py-3 px-2">Close</th>
                    <th className="text-right py-3 px-2">Revenue</th>
                    <th className="text-right py-3 px-2">Spend</th>
                    <th className="text-right py-3 px-2">Cost/lead</th>
                    <th className="text-right py-3 px-2">CAC</th>
                    <th className="text-right py-3 px-2">ROAS</th>
                    <th className="text-right py-3 px-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => <ChannelRow key={r.channel} r={r} />)}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 font-bold text-white">
                    <td className="py-3 px-2 uppercase text-[11px] tracking-wider text-slate-300">Total</td>
                    <td className="text-right py-3 px-2 tabular-nums">{totals.leads}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{totals.won}</td>
                    <td className="text-right py-3 px-2 tabular-nums text-slate-400">{totals.leads > 0 ? fmtPct(totals.won / totals.leads) : '—'}</td>
                    <td className="text-right py-3 px-2 tabular-nums text-green-400">{fmt$(totals.revenue)}</td>
                    <td className="text-right py-3 px-2 tabular-nums text-pink-400">{fmt$(totals.spend)}</td>
                    <td className="text-right py-3 px-2 tabular-nums text-slate-500">—</td>
                    <td className="text-right py-3 px-2 tabular-nums text-amber-400">{totals.cac > 0 ? fmt$(totals.cac) : '—'}</td>
                    <td className="text-right py-3 px-2 tabular-nums text-blue-400">{totals.spend > 0 ? `${totals.roas.toFixed(1)}×` : '—'}</td>
                    <td className={`text-right py-3 px-2 tabular-nums ${totals.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(totals.profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-4 flex items-center gap-1.5">
              <Info size={12} /> Leads counted when they arrive; revenue when jobs are sold/completed. In a single month they line up; over a quarter or year read close-rate as directional.
            </p>
          </Card>
        </>
      )}
    </div>
  );
};

const ChannelRow: React.FC<{ r: ChannelMetrics }> = ({ r }) => {
  const label = LEAD_CHANNEL_LABELS[r.channel];
  const color = CH_COLORS[r.channel];
  const roasGood = r.roas >= 3;
  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 px-2">
        <span className="inline-flex items-center gap-2 font-semibold text-white">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
          {r.isPaid
            ? <Zap size={11} className="text-amber-400" aria-label="paid channel" />
            : r.channel !== 'unknown' && <Gift size={11} className="text-green-500" aria-label="free channel" />}
        </span>
      </td>
      <td className="text-right py-3 px-2 tabular-nums text-slate-300">{r.leads}</td>
      <td className="text-right py-3 px-2 tabular-nums text-slate-300">{r.wonJobs}</td>
      <td className="text-right py-3 px-2 tabular-nums text-slate-400">{r.leads > 0 ? fmtPct(r.closeRate) : '—'}</td>
      <td className="text-right py-3 px-2 tabular-nums font-semibold text-green-400">{fmt$(r.revenue)}</td>
      <td className="text-right py-3 px-2 tabular-nums text-pink-400">{r.spend > 0 ? fmt$(r.spend) : '—'}</td>
      <td className="text-right py-3 px-2 tabular-nums text-slate-400">{r.costPerLead > 0 ? fmt$(r.costPerLead) : '—'}</td>
      <td className="text-right py-3 px-2 tabular-nums text-amber-400">{r.cac > 0 ? fmt$(r.cac) : '—'}</td>
      <td className={`text-right py-3 px-2 tabular-nums font-bold ${r.spend > 0 ? (roasGood ? 'text-green-400' : 'text-red-400') : 'text-slate-500'}`}>
        {r.spend > 0 ? `${r.roas.toFixed(1)}×` : '—'}
      </td>
      <td className={`text-right py-3 px-2 tabular-nums ${r.profit >= 0 ? 'text-slate-200' : 'text-red-400'}`}>{fmt$(r.profit)}</td>
    </tr>
  );
};
