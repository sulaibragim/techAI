import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Users, Trophy, Wallet, CalendarDays, Activity,
  Download, Sparkles, Crown, Coffee, Target, TrendingUp, X, Flag,
} from 'lucide-react';
import { Job, User, STATUS_COLORS } from '../types';
import {
  dailyPerformance, technicianStats, technicianTrend, payrollToCSV,
  DayPerf, TechStats, MONTH_FULL,
} from '../financialUtils';
import { useSettingsStore } from '../settingsStore';
import { useCurrentUser } from '../authStore';

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TECH_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16'];

const LEVEL_STYLE: Record<DayPerf['level'], string> = {
  great: 'bg-emerald-400 text-emerald-950 shadow-[0_0_12px_rgba(52,211,153,0.45)] font-bold',
  good: 'bg-emerald-600/80 text-white font-bold',
  low: 'bg-emerald-900/60 text-emerald-200/90',
  coffee: 'bg-red-500/25 text-red-300 border border-red-500/40',
  idle: 'bg-white/[0.03] text-slate-600',
};

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

// ---- Sales Calendar (heatmap + day drill-down) --------------------------------

export const SalesHeatmap: React.FC<{
  days: DayPerf[];
  userById?: Record<string, string>;
}> = ({ days, userById }) => {
  const [selected, setSelected] = useState<DayPerf | null>(null);
  const lead = days.length > 0 ? days[0].dow : 0;
  const sel = selected ? days.find(d => d.date === selected.date) ?? null : null;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-slate-500 uppercase">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
        {days.map(d => (
          <button
            key={d.date}
            onClick={() => setSelected(sel?.date === d.date ? null : d)}
            title={`${d.date} — ${fmt$(d.revenue)} · ${d.soldCount} sold${d.coffeeCount ? ` · ${d.coffeeCount} no-sale` : ''}`}
            className={`relative aspect-square rounded-lg text-[11px] flex items-center justify-center transition-all hover:scale-105 ${LEVEL_STYLE[d.level]} ${sel?.date === d.date ? 'ring-2 ring-blue-400 scale-105' : ''}`}
          >
            {d.day}
            {d.coffeeCount > 0 && d.revenue > 0 && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-400" />
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400" /> Great day</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600/80" /> Good</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-900/60" /> Slow</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" /> No-sale only</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white/5" /> Off</span>
      </div>

      {sel && (
        <div className="mt-4 bg-slate-950 rounded-xl border border-blue-500/20 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">
              {sel.date} — {fmt$(sel.revenue)} · {sel.soldCount} sold{sel.coffeeCount ? ` · ${sel.coffeeCount} no-sale` : ''}
            </p>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white transition-colors"><X size={14} /></button>
          </div>
          {sel.jobs.length === 0 ? (
            <p className="text-xs text-slate-500">No jobs this day.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {sel.jobs.map(j => (
                <div key={j.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[j.status] }} />
                    <span className="text-xs font-semibold text-white truncate">
                      {j.client.firstName} {j.client.lastName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">{j.lockDetails?.type || 'Other'}</span>
                    {userById && j.assignedTo && userById[j.assignedTo] && (
                      <span className="text-[10px] text-blue-400 font-bold shrink-0">{userById[j.assignedTo]}</span>
                    )}
                  </span>
                  <span className={`text-xs font-bold tabular-nums shrink-0 ml-2 ${j.status === 'coffee' ? 'text-red-400' : 'text-white'}`}>
                    {j.status === 'coffee' ? 'No sale' : fmt$(j.totalAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---- Tech picker (same pattern as the month picker) ----------------------------

const TechPicker: React.FC<{
  techs: TechStats[];
  value: string; // 'all' or tech id
  onChange: (id: string) => void;
}> = ({ techs, value, onChange }) => {
  const ids = ['all', ...techs.map(t => t.userId)];
  const idx = Math.max(0, ids.indexOf(value));
  const step = (delta: number) => onChange(ids[(idx + delta + ids.length) % ids.length]);
  return (
    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-purple-500/30 shadow-lg">
      <button onClick={() => step(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><ChevronLeft size={16} /></button>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent text-white text-xs font-bold uppercase tracking-wider px-2 py-1.5 outline-none cursor-pointer min-w-[150px] text-center [&>option]:bg-slate-900"
      >
        <option value="all">All Technicians</option>
        {techs.map(t => <option key={t.userId} value={t.userId}>{t.name}{t.active ? '' : ' (inactive)'}</option>)}
      </select>
      <button onClick={() => step(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"><ChevronRight size={16} /></button>
    </div>
  );
};

const chartTooltip = {
  contentStyle: { backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '10px' },
  itemStyle: { fontWeight: 700, fontSize: '11px' },
  labelStyle: { color: '#94A3B8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' as const },
};

// ---- Main ----------------------------------------------------------------------

export const TechAnalytics: React.FC<{
  jobs: Job[];
  users: User[];
  year: number;
  month: number;
}> = ({ jobs, users, year, month }) => {
  const [techId, setTechId] = useState<string>('all');

  const stats = useMemo(() => technicianStats(jobs, year, month, users), [jobs, year, month, users]);
  const userById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u.name])), [users]);
  const periodLabel = `${MONTH_FULL[month]} ${year}`;

  const current = techId === 'all' ? null : stats.find(s => s.userId === techId) ?? null;

  if (stats.length === 0) {
    return (
      <Card className="text-center py-12">
        <Users size={32} className="mx-auto text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-400">No technicians yet.</p>
        <p className="text-xs text-slate-500 mt-1">Add your team in Settings → Team to unlock per-tech analytics.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <TechPicker techs={stats} value={techId} onChange={setTechId} />
        {techId === 'all' && (
          <button
            onClick={() => {
              const csv = payrollToCSV(stats);
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `payroll-${year}-${String(month + 1).padStart(2, '0')}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-900 text-slate-300 border border-white/10 hover:text-white hover:border-purple-500/40 transition-all"
          >
            <Download size={14} /> Payroll CSV
          </button>
        )}
      </div>

      {current ? (
        <TechDeepDive jobs={jobs} tech={current} allStats={stats} year={year} month={month} periodLabel={periodLabel} />
      ) : (
        <TeamOverview jobs={jobs} stats={stats} userById={userById} year={year} month={month} periodLabel={periodLabel} onSelect={setTechId} />
      )}
    </div>
  );
};

// ---- Team overview (all technicians) -------------------------------------------

const TeamOverview: React.FC<{
  jobs: Job[];
  stats: TechStats[];
  userById: Record<string, string>;
  year: number;
  month: number;
  periodLabel: string;
  onSelect: (id: string) => void;
}> = ({ jobs, stats, userById, year, month, periodLabel, onSelect }) => {
  const techTargets = useSettingsStore(s => s.techTargets);
  const teamRevenue = stats.reduce((s, t) => s + t.revenue, 0);
  const teamJobs = stats.reduce((s, t) => s + t.jobCount, 0);
  const teamCommission = stats.reduce((s, t) => s + t.commission, 0);
  const mvp = stats[0];
  const days = useMemo(() => dailyPerformance(jobs, year, month), [jobs, year, month]);
  const shareData = stats.filter(t => t.revenue > 0).map((t, i) => ({ name: t.name, value: t.revenue, fill: TECH_COLORS[i % TECH_COLORS.length] }));

  const medal = (i: number) =>
    i === 0 ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
      : i === 1 ? 'bg-slate-300/15 text-slate-300 border-slate-300/30'
      : i === 2 ? 'bg-orange-600/15 text-orange-400 border-orange-600/30'
      : 'bg-white/5 text-slate-500 border-white/10';

  return (
    <>
      {/* MVP + team totals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="bg-gradient-to-br from-amber-600/20 to-slate-900 rounded-2xl p-5 border border-amber-500/25 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl -mr-12 -mt-12" />
          <div className="flex items-center gap-2 mb-3">
            <Crown size={15} className="text-amber-400" />
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">MVP — {periodLabel}</h3>
          </div>
          {mvp && mvp.revenue > 0 ? (
            <>
              <p className="text-2xl font-bold text-white tracking-tight">{mvp.name}</p>
              <p className="text-sm font-bold text-amber-300 mt-1">{fmt$(mvp.revenue)} <span className="text-xs text-slate-400 font-semibold">· {Math.round(teamRevenue > 0 ? (mvp.revenue / teamRevenue) * 100 : 0)}% of team revenue</span></p>
              <p className="text-xs text-slate-400 mt-2 font-semibold">{mvp.jobCount} jobs · {mvp.closeRate.toFixed(0)}% close · {fmt$(mvp.avgTicket)} avg ticket</p>
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-2">No sales yet this period.</p>
          )}
        </section>
        {[
          { label: 'Team Revenue', value: fmt$(teamRevenue), sub: `${teamJobs} jobs closed`, icon: TrendingUp, color: 'text-blue-400' },
          { label: 'Total Commission', value: fmt$(teamCommission), sub: `payout owed for ${periodLabel}`, icon: Wallet, color: 'text-green-400' },
        ].map(k => (
          <section key={k.label} className="bg-slate-900 rounded-2xl p-5 border border-white/10 shadow-2xl flex flex-col justify-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center"><k.icon size={13} className={`mr-2 ${k.color}`} /> {k.label}</h3>
            <p className={`text-3xl font-bold tracking-tighter ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-1 font-semibold">{k.sub}</p>
          </section>
        ))}
      </div>

      {/* Leaderboard */}
      <Card title={`Leaderboard — ${periodLabel}`} icon={Trophy}>
        <div className="space-y-2">
          {stats.map((t, i) => (
            <button
              key={t.userId}
              onClick={() => onSelect(t.userId)}
              className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-xl px-3 py-3 border border-white/5 hover:border-purple-500/30 transition-all text-left group"
            >
              <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center border shrink-0 ${medal(i)}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">{t.name}</span>
                  <span className="text-sm font-bold text-white tabular-nums">{fmt$(t.revenue)}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${teamRevenue > 0 ? (t.revenue / Math.max(...stats.map(s => s.revenue), 1)) * 100 : 0}%`, backgroundColor: TECH_COLORS[i % TECH_COLORS.length] }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>{t.jobCount} jobs</span>
                  <span className={t.closeRate >= 70 ? 'text-green-400' : t.closeRate > 0 ? 'text-amber-400' : ''}>{t.closeRate.toFixed(0)}% close</span>
                  <span>{fmt$(t.avgTicket)} avg</span>
                  <span>{fmt$(t.revenuePerActiveDay)}/day</span>
                  <span className="text-green-400">{fmt$(t.commission)} comm.</span>
                  {t.coffeeCount > 0 && <span className="text-red-400">{t.coffeeCount} no-sale</span>}
                  {(techTargets[t.userId] ?? 0) > 0 && (
                    <span className={(t.revenue / techTargets[t.userId]) >= 1 ? 'text-green-400' : 'text-blue-300'}>
                      {Math.round((t.revenue / techTargets[t.userId]) * 100)}% of goal
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-600 group-hover:text-purple-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-3">Tap a technician to open their full scorecard with day-by-day sales calendar.</p>
      </Card>

      {/* Revenue share + company sales calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Revenue Share" icon={Users}>
          {shareData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No revenue this period.</p>
          ) : (
            <div className="flex items-center gap-5">
              <div className="w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={shareData} innerRadius={40} outerRadius={62} paddingAngle={4} dataKey="value" nameKey="name">
                      {shareData.map(d => <Cell key={d.name} fill={d.fill} stroke="none" />)}
                    </Pie>
                    <Tooltip {...chartTooltip} formatter={(v: number) => [fmt$(v), 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {shareData.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} /> {d.name}
                    </span>
                    <span className="text-xs font-bold text-white">{fmt$(d.value)} <span className="text-slate-500">· {teamRevenue > 0 ? Math.round((d.value / teamRevenue) * 100) : 0}%</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title={`Company Sales Calendar — ${periodLabel}`} icon={CalendarDays}>
          <SalesHeatmap days={days} userById={userById} />
        </Card>
      </div>
    </>
  );
};

// ---- Single technician deep dive ------------------------------------------------

const TechDeepDive: React.FC<{
  jobs: Job[];
  tech: TechStats;
  allStats: TechStats[];
  year: number;
  month: number;
  periodLabel: string;
}> = ({ jobs, tech, allStats, year, month, periodLabel }) => {
  const days = useMemo(() => dailyPerformance(jobs, year, month, tech.userId), [jobs, year, month, tech.userId]);
  const trend = useMemo(() => technicianTrend(jobs, tech.userId, year, month), [jobs, tech.userId, year, month]);

  const { techTargets, setTechTarget } = useSettingsStore();
  const me = useCurrentUser();
  const canEditGoal = me?.role === 'owner' || me?.role === 'manager';
  const goal = techTargets[tech.userId] ?? 0;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysLeft = isCurrentMonth ? Math.max(0, daysInMonth - now.getDate()) : 0;
  const goalPct = goal > 0 ? (tech.revenue / goal) * 100 : 0;
  const goalRemaining = Math.max(0, goal - tech.revenue);

  const rank = allStats.findIndex(s => s.userId === tech.userId) + 1;
  const activePeers = allStats.filter(s => s.jobCount > 0 || s.coffeeCount > 0);
  const teamAvg = {
    revenue: activePeers.length ? activePeers.reduce((s, t) => s + t.revenue, 0) / activePeers.length : 0,
    closeRate: activePeers.length ? activePeers.reduce((s, t) => s + t.closeRate, 0) / activePeers.length : 0,
    avgTicket: activePeers.length ? activePeers.reduce((s, t) => s + t.avgTicket, 0) / activePeers.length : 0,
  };

  const weekdays = useMemo(() => {
    const agg = DOW_FULL.map((name, i) => ({ name: name.slice(0, 3), full: name, dow: i, revenue: 0, count: 0 }));
    for (const d of days) { agg[d.dow].revenue += d.revenue; agg[d.dow].count += d.soldCount; }
    return agg;
  }, [days]);

  const streak = useMemo(() => {
    let best = 0, cur = 0;
    for (const d of days) {
      if (d.revenue > 0) { cur += 1; best = Math.max(best, cur); }
      else cur = 0;
    }
    return best;
  }, [days]);

  const insights = useMemo(() => {
    const out: string[] = [];
    const sellingDays = weekdays.filter(w => w.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    if (sellingDays.length > 1) {
      out.push(`${sellingDays[0].full} is the strongest day (${fmt$(sellingDays[0].revenue)}); ${sellingDays[sellingDays.length - 1].full} is the weakest (${fmt$(sellingDays[sellingDays.length - 1].revenue)}).`);
    }
    if (teamAvg.closeRate > 0 && tech.closeRate > 0) {
      const diff = tech.closeRate - teamAvg.closeRate;
      out.push(`Close rate ${tech.closeRate.toFixed(0)}% — ${Math.abs(diff).toFixed(0)} pts ${diff >= 0 ? 'above' : 'below'} team average.`);
    }
    if (teamAvg.avgTicket > 0 && tech.avgTicket > 0) {
      const diff = ((tech.avgTicket - teamAvg.avgTicket) / teamAvg.avgTicket) * 100;
      out.push(`Average ticket ${fmt$(tech.avgTicket)} — ${Math.abs(diff).toFixed(0)}% ${diff >= 0 ? 'above' : 'below'} the team.`);
    }
    if (streak >= 3) out.push(`Longest selling streak this month: ${streak} days in a row.`);
    if (tech.coffeeCount > 0) {
      out.push(`${tech.coffeeCount} no-sale visit${tech.coffeeCount === 1 ? '' : 's'} — roughly ${fmt$(tech.coffeeCount * (tech.avgTicket || teamAvg.avgTicket))} left on the table.`);
    }
    return out.slice(0, 4);
  }, [weekdays, tech, teamAvg, streak]);

  const vsRows = [
    { label: 'Revenue', mine: tech.revenue, team: teamAvg.revenue, fmt: fmt$ },
    { label: 'Close Rate', mine: tech.closeRate, team: teamAvg.closeRate, fmt: (n: number) => `${n.toFixed(0)}%` },
    { label: 'Avg Ticket', mine: tech.avgTicket, team: teamAvg.avgTicket, fmt: fmt$ },
  ];

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Revenue', value: fmt$(tech.revenue), sub: `#${rank} on team` },
          { label: 'Jobs Sold', value: String(tech.soldCount), sub: `${tech.jobCount} closed total` },
          { label: 'Close Rate', value: `${tech.closeRate.toFixed(0)}%`, sub: `${tech.coffeeCount} no-sale`, accent: tech.closeRate >= 70 ? 'text-green-400' : tech.closeRate > 0 ? 'text-amber-400' : undefined },
          { label: 'Avg Ticket', value: fmt$(tech.avgTicket), sub: 'per sale' },
          { label: 'Commission', value: fmt$(tech.commission), sub: `${tech.commissionRate}% rate`, accent: 'text-green-400' },
          { label: 'Best Day', value: fmt$(tech.bestDay.revenue), sub: tech.bestDay.date ? tech.bestDay.date.slice(5) : '—', accent: 'text-amber-400' },
        ].map(k => (
          <div key={k.label} className="bg-slate-900 p-4 rounded-2xl border border-white/10 shadow-xl hover:border-purple-500/30 transition-all group">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 group-hover:text-purple-400 transition-colors">{k.label}</p>
            <p className={`text-xl font-bold tracking-tighter leading-none ${k.accent || 'text-white'}`}>{k.value}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Personal goal */}
      <Card className="!border-green-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-600/5 blur-3xl -mr-16 -mt-16" />
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="md:w-72 shrink-0">
            <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center">
              <Flag size={13} className="mr-2" /> Personal Goal — {MONTH_FULL[month]}
            </h3>
            {canEditGoal ? (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  value={goal || ''}
                  placeholder="No goal set"
                  onChange={e => setTechTarget(tech.userId, Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-10 py-2.5 text-lg font-bold text-white outline-none focus:border-green-500 transition-all shadow-inner placeholder:text-slate-600 placeholder:text-sm placeholder:font-semibold"
                />
              </div>
            ) : (
              <p className="text-2xl font-bold text-white tracking-tighter">{goal > 0 ? fmt$(goal) : <span className="text-sm text-slate-500 font-semibold">No goal set</span>}</p>
            )}
          </div>
          <div className="flex-1">
            {goal > 0 ? (
              <div className="space-y-2.5">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{fmt$(tech.revenue)} of {fmt$(goal)}</span>
                  <span className={`text-lg font-bold ${goalPct >= 100 ? 'text-green-400' : 'text-white'}`}>{goalPct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${goalPct >= 100 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-green-600'}`}
                    style={{ width: `${Math.min(goalPct, 100)}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {goalPct >= 100 ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30">Goal smashed 🎉</span>
                  ) : (
                    <>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">{fmt$(goalRemaining)} to go</span>
                      {isCurrentMonth && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {daysLeft > 0 ? `${fmt$(goalRemaining / daysLeft)}/day for ${daysLeft} days` : 'Last day — push!'}
                        </span>
                      )}
                      {isPastMonth && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">Missed by {fmt$(goalRemaining)}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-semibold">
                {canEditGoal
                  ? `Set a monthly revenue goal for ${tech.name.split(' ')[0]} — progress, daily pace and a "to go" tracker will appear here. The goal applies to every month.`
                  : 'No personal goal set for this technician yet.'}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Sales calendar + vs team */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card title={`Sales Calendar — ${tech.name}, ${periodLabel}`} icon={CalendarDays} className="lg:col-span-7">
          <SalesHeatmap days={days} />
        </Card>

        <div className="lg:col-span-5 space-y-5">
          <Card title="vs Team Average" icon={Target}>
            <div className="space-y-4">
              {vsRows.map(r => {
                const max = Math.max(r.mine, r.team, 1);
                const ahead = r.mine >= r.team;
                return (
                  <div key={r.label}>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-400 uppercase tracking-wider">{r.label}</span>
                      <span className={ahead ? 'text-green-400' : 'text-amber-400'}>{r.fmt(r.mine)} <span className="text-slate-500">vs {r.fmt(r.team)}</span></span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${ahead ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${(r.mine / max) * 100}%` }} />
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-500 rounded-full transition-all duration-700" style={{ width: `${(r.team / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-green-500" /> {tech.name.split(' ')[0]}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-slate-500" /> Team avg</span>
              </div>
            </div>
          </Card>

          <section className="bg-gradient-to-br from-purple-700 to-indigo-900 rounded-2xl p-5 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 blur-3xl -mr-20 -mt-20" />
            <div className="flex items-center space-x-3 mb-4">
              <Sparkles size={18} className="text-purple-300" />
              <h4 className="text-base font-bold tracking-tight">Coach Notes</h4>
            </div>
            {insights.length === 0 ? (
              <p className="text-sm text-purple-100/70 italic">Not enough data this period yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {insights.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-purple-50/90 leading-snug">
                    <Sparkles size={13} className="text-purple-300 mt-0.5 shrink-0" /> {t}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Weekday pattern + 6-month trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Best Selling Weekdays" icon={Activity} className="h-[240px] flex flex-col">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdays}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} />
                <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number, _n, p: any) => [`${fmt$(v)} · ${p.payload.count} sold`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`6-Month Trend — ${tech.name}`} icon={TrendingUp} className="h-[240px] flex flex-col">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10, fontWeight: 700 }} />
                <Tooltip {...chartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: number, _n, p: any) => [`${fmt$(v)} · ${p.payload.count} jobs`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {trend.map((m, i) => <Cell key={m.label} fill={i === trend.length - 1 ? '#8B5CF6' : '#4C1D95'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {tech.coffeeCount > 0 && (
        <Card className="!border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Coffee size={18} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{tech.coffeeCount} no-sale visit{tech.coffeeCount === 1 ? '' : 's'} this period</p>
              <p className="text-xs text-slate-500 mt-0.5">Red days on the calendar above — visits where {tech.name.split(' ')[0]} walked away without a sale. Worth a debrief on objection handling.</p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};
