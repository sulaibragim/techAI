import { Job, User, Expense } from './types';

export interface FinancialMetrics {
  totalRevenue: number;
  totalCount: number;
  jobsSold: number;
  coffeeCount: number;
  closeRate: number;
  averageTicket: number;
  monthlyTarget: number;
  progress: number;
  expectedProgress: number;
  variance: number;
  remainingRevenue: number;
  daysRemaining: number;
  requiredDailyRevenue: number;
  requiredSalesPerDay: number;
  planStatus: 'excellent' | 'good' | 'warning' | 'critical';
  // Extended (period-aware) fields
  partsCost: number;
  margin: number;
  marginPct: number;
  projectedRevenue: number;
  daysInMonth: number;
  daysElapsed: number;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;
  year: number;
  month: number;
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

// Single source of truth for revenue recognition: a job earns revenue once it is
// sold or completed. Used everywhere so Analytics, Workroom and the AI agree.
const REVENUE_STATUSES = new Set<Job['status']>(['completed', 'sold']);
export const isRevenueJob = (j: Job) => REVENUE_STATUSES.has(j.status);

// The date revenue is recognized on: when the work was actually finished, not when
// it was first scheduled. A job booked June 30 but completed July 2 belongs to July
// (matters for monthly revenue, targets, and technician commission/payroll). `sold`
// jobs carry no completedAt, so fall back to the scheduled date.
const revenueDateStr = (j: Job): string => (j.completedAt ? j.completedAt.slice(0, 10) : j.scheduledDate);

// A "sale" is any revenue job that actually produced billable money (service call,
// labor, parts — anything > $0), not just labor/part line items.
const isSale = (j: Job) => j.totalAmount > 0;

// Revenue jobs in a given month. (Named "completed" for backwards compatibility.)
export function completedJobsInMonth(jobs: Job[], year: number, month: number): Job[] {
  const key = monthKey(year, month);
  return jobs.filter(j => isRevenueJob(j) && revenueDateStr(j).startsWith(key));
}

/** Period-aware metrics engine. Works for any chosen month/year, past or present. */
export function calculatePeriodMetrics(
  jobs: Job[],
  year: number,
  month: number,
  monthlyTarget: number = 20000
): FinancialMetrics {
  const now = new Date();
  const key = monthKey(year, month);
  const completed = completedJobsInMonth(jobs, year, month);
  const totalRevenue = completed.reduce((s, j) => s + j.totalAmount, 0);

  const jobsSold = completed.filter(isSale).length;
  // Coffee = an explicit no-sale visit this month (its own status), not "completed minus sale".
  const coffeeCount = jobs.filter(j => j.status === 'coffee' && j.scheduledDate.startsWith(key)).length;
  const totalCount = completed.length;
  // Close rate = of the visits where there was a sell opportunity (a sale OR a walk-away
  // "coffee"), how many became a sale. Same denominator the conversion pie uses, so the
  // headline number and the chart tell one story.
  const opportunities = jobsSold + coffeeCount;
  const closeRate = opportunities > 0 ? (jobsSold / opportunities) * 100 : 0;
  const averageTicket = jobsSold > 0 ? totalRevenue / jobsSold : 0;

  // COGS — what the parts actually cost us (unitCost snapshot), not their retail price.
  // Legacy line items without a recorded cost contribute 0.
  const partsCost = completed.reduce(
    (s, j) => s + j.lineItems.filter(i => i.type === 'part').reduce((ss, i) => ss + (i.unitCost ?? 0) * i.quantity, 0),
    0
  );
  const margin = totalRevenue - partsCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
  const isFutureMonth = !isCurrentMonth && !isPastMonth;

  const daysElapsed = isCurrentMonth ? now.getDate() : isPastMonth ? daysInMonth : 0;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const progress = (totalRevenue / monthlyTarget) * 100;
  const expectedProgress = daysInMonth > 0 ? (daysElapsed / daysInMonth) * 100 : 0;
  const variance = progress - expectedProgress;

  let planStatus: FinancialMetrics['planStatus'] = 'good';
  if (variance >= 5) planStatus = 'excellent';
  else if (variance >= 0) planStatus = 'good';
  else if (variance >= -10) planStatus = 'warning';
  else planStatus = 'critical';

  const remainingRevenue = Math.max(0, monthlyTarget - totalRevenue);
  const requiredDailyRevenue = daysRemaining > 0 ? remainingRevenue / daysRemaining : 0;
  const requiredSalesPerDay = averageTicket > 0 ? Math.ceil(requiredDailyRevenue / averageTicket) : 0;

  const projectedRevenue =
    isCurrentMonth && daysElapsed > 0 ? (totalRevenue / daysElapsed) * daysInMonth : totalRevenue;

  return {
    totalRevenue, totalCount, jobsSold, coffeeCount, closeRate, averageTicket,
    monthlyTarget, progress, expectedProgress, variance, remainingRevenue,
    daysRemaining, requiredDailyRevenue, requiredSalesPerDay, planStatus,
    partsCost, margin, marginPct, projectedRevenue, daysInMonth, daysElapsed,
    isCurrentMonth, isPastMonth, isFutureMonth, year, month,
  };
}

/** Backwards-compatible wrapper used by WorkroomDashboard + store — always current month. */
export function calculateFinancialMetrics(jobs: Job[], monthlyTarget: number = 20000): FinancialMetrics {
  const now = new Date();
  return calculatePeriodMetrics(jobs, now.getFullYear(), now.getMonth(), monthlyTarget);
}

/** Daily revenue series for a given month (for the trajectory chart). */
export function buildMonthlyTrend(jobs: Job[], year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const key = monthKey(year, month);
  return Array.from({ length: daysInMonth }, (_, i) => {
    const dayStr = `${key}-${String(i + 1).padStart(2, '0')}`;
    const revenue = jobs
      .filter(j => isRevenueJob(j) && revenueDateStr(j) === dayStr)
      .reduce((s, j) => s + j.totalAmount, 0);
    return { day: String(i + 1), revenue };
  });
}

/** 12-month revenue + job count for a year (seasonality view). */
export function buildYearlyTrend(jobs: Job[], year: number) {
  return MONTH_LABELS.map((label, m) => {
    const monthJobs = completedJobsInMonth(jobs, year, m);
    return {
      month: label,
      monthIndex: m,
      revenue: monthJobs.reduce((s, j) => s + j.totalAmount, 0),
      count: monthJobs.length,
    };
  });
}

/** Revenue split by lock/job type for a period. */
export function revenueByJobType(jobs: Job[], year: number, month: number) {
  const completed = completedJobsInMonth(jobs, year, month);
  const map = new Map<string, { revenue: number; count: number }>();
  for (const j of completed) {
    const t = j.lockDetails?.type || 'Other';
    const cur = map.get(t) || { revenue: 0, count: 0 };
    cur.revenue += j.totalAmount;
    cur.count += 1;
    map.set(t, cur);
  }
  return [...map.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Revenue & job count grouped by service area (ZIP, falling back to a city guess from the
 *  address tail). Pure — derived from existing job data, no map/API calls, $0. */
export function revenueByArea(jobs: Job[], year: number, month: number, limit = 8) {
  const completed = completedJobsInMonth(jobs, year, month);
  const map = new Map<string, { area: string; revenue: number; count: number }>();
  for (const j of completed) {
    let area = (j.client?.zip || '').trim();
    if (!area) {
      const parts = (j.client?.address || '').split(',').map(s => s.trim()).filter(Boolean);
      area = parts.length ? parts[parts.length - 1] : '';
    }
    area = area || 'Unknown';
    const cur = map.get(area) || { area, revenue: 0, count: 0 };
    cur.revenue += j.totalAmount;
    cur.count += 1;
    map.set(area, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Highest-revenue clients for a period. */
export function topClients(jobs: Job[], year: number, month: number, limit = 5) {
  const completed = completedJobsInMonth(jobs, year, month);
  const map = new Map<string, { name: string; revenue: number; jobs: number }>();
  for (const j of completed) {
    const id = j.client?.id || `${j.client.firstName}${j.client.lastName}`;
    const name = `${j.client.firstName} ${j.client.lastName}`.trim();
    const cur = map.get(id) || { name, revenue: 0, jobs: 0 };
    cur.revenue += j.totalAmount;
    cur.jobs += 1;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Revenue by day of week for a period (when do you earn most). */
export function revenueByDayOfWeek(jobs: Job[], year: number, month: number) {
  const completed = completedJobsInMonth(jobs, year, month);
  const buckets = DOW_LABELS.map(d => ({ day: d, revenue: 0, count: 0 }));
  for (const j of completed) {
    const idx = new Date(revenueDateStr(j) + 'T00:00:00').getDay();
    buckets[idx].revenue += j.totalAmount;
    buckets[idx].count += 1;
  }
  return buckets;
}

/** All-time records. */
export function computeRecords(jobs: Job[]) {
  const completed = jobs.filter(isRevenueJob);

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let biggestTicket = { amount: 0, client: '', date: '' };

  for (const j of completed) {
    const rd = revenueDateStr(j);
    byDay.set(rd, (byDay.get(rd) || 0) + j.totalAmount);
    const mk = rd.slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) || 0) + j.totalAmount);
    if (j.totalAmount > biggestTicket.amount) {
      biggestTicket = { amount: j.totalAmount, client: `${j.client.firstName} ${j.client.lastName}`, date: rd };
    }
  }

  let bestDay = { date: '', revenue: 0 };
  for (const [date, rev] of byDay) if (rev > bestDay.revenue) bestDay = { date, revenue: rev };

  let bestMonth = { month: '', revenue: 0 };
  for (const [mk, rev] of byMonth) if (rev > bestMonth.revenue) bestMonth = { month: mk, revenue: rev };

  return { bestDay, bestMonth, biggestTicket };
}

/** Coffee / no-sale / cancellation loss analysis for a period. */
export function coffeeAnalysis(jobs: Job[], year: number, month: number) {
  const key = monthKey(year, month);
  const inMonth = jobs.filter(j => j.scheduledDate.startsWith(key));
  const coffee = inMonth.filter(j => j.status === 'coffee').length;
  const cancelled = inMonth.filter(j => j.status === 'cancelled').length;
  // Average ticket by the revenue-recognition date (completedAt), matching every other
  // report — a job booked in June but finished in July counts as July here too.
  const completed = jobs.filter(j => j.status === 'completed' && revenueDateStr(j).startsWith(key));
  const avgTicket = completed.length
    ? completed.reduce((s, j) => s + j.totalAmount, 0) / completed.length
    : 0;
  const lostEstimate = (coffee + cancelled) * avgTicket;
  return { coffeeCount: coffee, cancelledCount: cancelled, lostEstimate };
}

/** Months that contain any job, newest first — for the period picker. Always includes the current month. */
export function availableMonths(jobs: Job[]): { year: number; month: number }[] {
  const set = new Set<string>();
  const now = new Date();
  set.add(monthKey(now.getFullYear(), now.getMonth()));
  for (const j of jobs) {
    if (j.scheduledDate && j.scheduledDate.length >= 7) set.add(j.scheduledDate.slice(0, 7));
    // A revenue job recognized in a later month should make that month pickable too.
    if (isRevenueJob(j)) { const rd = revenueDateStr(j); if (rd.length >= 7) set.add(rd.slice(0, 7)); }
  }
  return [...set]
    .sort()
    .reverse()
    .map(k => {
      const [y, m] = k.split('-').map(Number);
      return { year: y, month: m - 1 };
    });
}

export interface TechnicianEarnings {
  userId: string;
  name: string;
  revenue: number;
  jobCount: number;
  commissionRate: number; // percent
  commission: number;     // revenue * rate, rounded to cents
}

/** Per-technician revenue and commission for a period (salary engine). */
export function revenueByTechnician(
  jobs: Job[],
  year: number,
  month: number,
  users: Pick<User, 'id' | 'name' | 'role' | 'commissionRate'>[]
): TechnicianEarnings[] {
  const completed = completedJobsInMonth(jobs, year, month);
  const byTech = new Map<string, { revenue: number; jobCount: number }>();
  for (const j of completed) {
    if (!j.assignedTo) continue;
    const cur = byTech.get(j.assignedTo) || { revenue: 0, jobCount: 0 };
    cur.revenue += j.totalAmount;
    cur.jobCount += 1;
    byTech.set(j.assignedTo, cur);
  }
  return users
    .filter(u => u.role === 'technician')
    .map(u => {
      const agg = byTech.get(u.id) || { revenue: 0, jobCount: 0 };
      const rate = u.commissionRate ?? 0;
      return {
        userId: u.id,
        name: u.name,
        revenue: Math.round(agg.revenue * 100) / 100,
        jobCount: agg.jobCount,
        commissionRate: rate,
        commission: Math.round(agg.revenue * (rate / 100) * 100) / 100,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Technician & planning analytics ─────────────────────────────────────────

export type DayLevel = 'great' | 'good' | 'low' | 'coffee' | 'idle';

export interface DayPerf {
  date: string;   // YYYY-MM-DD
  day: number;    // 1..31
  dow: number;    // 0=Sun
  revenue: number;
  soldCount: number;
  coffeeCount: number;
  jobs: Job[];
  level: DayLevel;
}

/**
 * Day-by-day sales performance for a month, optionally scoped to one technician.
 * Levels are relative to this month's average revenue across active days, so a
 * "great" day means great for this period, not against a fixed dollar amount.
 */
export function dailyPerformance(jobs: Job[], year: number, month: number, techId?: string): DayPerf[] {
  const pool = techId ? jobs.filter(j => j.assignedTo === techId) : jobs;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const key = monthKey(year, month);
  const days: DayPerf[] = Array.from({ length: daysInMonth }, (_, i) => ({
    date: `${key}-${String(i + 1).padStart(2, '0')}`,
    day: i + 1,
    dow: new Date(year, month, i + 1).getDay(),
    revenue: 0, soldCount: 0, coffeeCount: 0, jobs: [], level: 'idle' as DayLevel,
  }));
  for (const j of pool) {
    const d = isRevenueJob(j) ? revenueDateStr(j) : j.status === 'coffee' ? j.scheduledDate : null;
    if (!d || !d.startsWith(key)) continue;
    const idx = Number(d.slice(8, 10)) - 1;
    if (idx < 0 || idx >= daysInMonth) continue;
    const bucket = days[idx];
    bucket.jobs.push(j);
    if (j.status === 'coffee') bucket.coffeeCount += 1;
    else { bucket.revenue += j.totalAmount; if (isSale(j)) bucket.soldCount += 1; }
  }
  const active = days.filter(d => d.revenue > 0);
  const avg = active.length ? active.reduce((s, d) => s + d.revenue, 0) / active.length : 0;
  for (const d of days) {
    if (d.revenue <= 0) d.level = d.coffeeCount > 0 ? 'coffee' : 'idle';
    else if (d.revenue >= avg * 1.5) d.level = 'great';
    else if (d.revenue >= avg * 0.75) d.level = 'good';
    else d.level = 'low';
  }
  return days;
}

export interface TechStats extends TechnicianEarnings {
  active: boolean;
  soldCount: number;
  coffeeCount: number;
  closeRate: number;
  avgTicket: number;
  activeDays: number;
  revenuePerActiveDay: number;
  bestDay: { date: string; revenue: number };
}

/** Full per-technician scorecard for a period — leaderboard + deep-dive source. */
export function technicianStats(
  jobs: Job[],
  year: number,
  month: number,
  users: Pick<User, 'id' | 'name' | 'role' | 'commissionRate' | 'active'>[]
): TechStats[] {
  const key = monthKey(year, month);
  return users
    .filter(u => u.role === 'technician')
    .map(u => {
      const mine = jobs.filter(j => j.assignedTo === u.id);
      const completed = mine.filter(j => isRevenueJob(j) && revenueDateStr(j).startsWith(key));
      const revenue = completed.reduce((s, j) => s + j.totalAmount, 0);
      const soldCount = completed.filter(isSale).length;
      const coffeeCount = mine.filter(j => j.status === 'coffee' && j.scheduledDate.startsWith(key)).length;
      const opportunities = soldCount + coffeeCount;
      const byDay = new Map<string, number>();
      for (const j of completed) {
        const d = revenueDateStr(j);
        byDay.set(d, (byDay.get(d) || 0) + j.totalAmount);
      }
      let bestDay = { date: '', revenue: 0 };
      for (const [date, rev] of byDay) if (rev > bestDay.revenue) bestDay = { date, revenue: rev };
      const rate = u.commissionRate ?? 0;
      return {
        userId: u.id,
        name: u.name,
        active: u.active,
        revenue: round2(revenue),
        jobCount: completed.length,
        commissionRate: rate,
        commission: round2(revenue * (rate / 100)),
        soldCount,
        coffeeCount,
        closeRate: opportunities > 0 ? (soldCount / opportunities) * 100 : 0,
        avgTicket: soldCount > 0 ? revenue / soldCount : 0,
        activeDays: byDay.size,
        revenuePerActiveDay: byDay.size > 0 ? revenue / byDay.size : 0,
        bestDay,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Revenue + job count for the trailing N months, optionally per technician. */
export function technicianTrend(jobs: Job[], techId: string | null, year: number, month: number, monthsBack = 6) {
  const pool = techId ? jobs.filter(j => j.assignedTo === techId) : jobs;
  return Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(year, month - (monthsBack - 1 - i), 1);
    const completed = completedJobsInMonth(pool, d.getFullYear(), d.getMonth());
    return {
      label: `${MONTH_LABELS[d.getMonth()]}${d.getMonth() === 0 ? ` '${String(d.getFullYear()).slice(2)}` : ''}`,
      revenue: completed.reduce((s, j) => s + j.totalAmount, 0),
      count: completed.length,
    };
  });
}

export interface PlanMonth {
  label: string;
  monthIndex: number;
  actual: number;
  target: number;
  pct: number;
  isPast: boolean;
  isCurrent: boolean;
  hit: boolean;
}

/** Plan vs fact for every month of a year — the owner's annual planning board. */
export function yearPlanning(jobs: Job[], year: number, targets: Record<string, number>, fallbackTarget: number) {
  const now = new Date();
  const months: PlanMonth[] = MONTH_LABELS.map((label, m) => {
    const completed = completedJobsInMonth(jobs, year, m);
    const actual = completed.reduce((s, j) => s + j.totalAmount, 0);
    const target = targets[monthKey(year, m)] ?? fallbackTarget;
    const isPast = year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth());
    const isCurrent = year === now.getFullYear() && m === now.getMonth();
    return { label, monthIndex: m, actual, target, pct: target > 0 ? (actual / target) * 100 : 0, isPast, isCurrent, hit: actual >= target };
  });
  const elapsed = months.filter(m => m.isPast || m.isCurrent);
  return {
    months,
    yearActual: months.reduce((s, m) => s + m.actual, 0),
    yearTarget: months.reduce((s, m) => s + m.target, 0),
    ytdActual: elapsed.reduce((s, m) => s + m.actual, 0),
    ytdTarget: elapsed.reduce((s, m) => s + m.target, 0),
    monthsHit: months.filter(m => m.isPast && m.hit).length,
    monthsClosed: months.filter(m => m.isPast).length,
  };
}

export type CallRating = 'excellent' | 'good' | 'needs_improvement' | 'poor';

export interface CallQualityStats {
  scored: number;
  byRating: Record<CallRating, number>;
  score: number; // 0–100 weighted average of how well calls were handled
  topImprovements: { text: string; count: number }[];
  topMissing: { text: string; count: number }[];
}

const RATING_SCORE: Record<CallRating, number> = { excellent: 100, good: 78, needs_improvement: 48, poor: 18 };

/**
 * How well intake calls were handled in a month — aggregated from each job's AI call
 * review (callQuality). Scoped by the job's scheduled date (≈ when the call came in).
 * Surfaces a 0–100 score plus the most common coaching themes & missed-info items.
 */
export function callQualityStats(jobs: Job[], year: number, month: number): CallQualityStats {
  const key = monthKey(year, month);
  const scored = jobs.filter(j => j.callQuality && (j.scheduledDate || '').startsWith(key));
  const byRating: Record<CallRating, number> = { excellent: 0, good: 0, needs_improvement: 0, poor: 0 };
  let scoreSum = 0;
  const imp = new Map<string, number>();
  const miss = new Map<string, number>();
  for (const j of scored) {
    const q = j.callQuality!;
    byRating[q.rating] = (byRating[q.rating] || 0) + 1;
    scoreSum += RATING_SCORE[q.rating] ?? 50;
    for (const s of q.improvements || []) imp.set(s, (imp.get(s) || 0) + 1);
    for (const s of q.missedInfo || []) miss.set(s, (miss.get(s) || 0) + 1);
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 4);
  return {
    scored: scored.length,
    byRating,
    score: scored.length ? Math.round(scoreSum / scored.length) : 0,
    topImprovements: top(imp),
    topMissing: top(miss),
  };
}

// ── Fraud watch ──────────────────────────────────────────────────────────────

export interface FraudSignal {
  userId: string;
  name: string;
  signals: string[];        // human-readable tripwires
  severity: 'watch' | 'alert';
}

/**
 * Behavioral tripwires per technician for a period. NOT proof of anything — a prompt
 * for the owner to look closer at specific jobs. Thresholds need a minimum sample so
 * one slow week doesn't flag anyone:
 *  • no-sale heavy   — ≥3 coffee walk-aways AND ≥50% of opportunities ended no-sale
 *  • cash heavy      — ≥80% of collected money is cash AND ≥$300 collected
 *  • $0 completions  — ≥2 completed jobs with a zero-dollar invoice
 */
export function fraudWatch(
  jobs: Job[],
  year: number,
  month: number,
  users: Pick<User, 'id' | 'name' | 'role' | 'active'>[]
): FraudSignal[] {
  const key = monthKey(year, month);
  const out: FraudSignal[] = [];
  for (const u of users) {
    if (u.role !== 'technician' || !u.active) continue;
    const mine = jobs.filter(j => j.assignedTo === u.id);
    const completed = mine.filter(j => isRevenueJob(j) && revenueDateStr(j).startsWith(key));
    const soldCount = completed.filter(isSale).length;
    const coffeeCount = mine.filter(j => j.status === 'coffee' && j.scheduledDate.startsWith(key)).length;
    const zeroCompleted = mine.filter(j => j.status === 'completed' && revenueDateStr(j).startsWith(key) && (j.totalAmount || 0) === 0).length;

    let cash = 0, collected = 0;
    for (const j of completed) {
      const c = collectedAmount(j);
      collected += c;
      if (j.paymentMethod === 'Cash') cash += c;
    }

    const signals: string[] = [];
    const opportunities = soldCount + coffeeCount;
    if (coffeeCount >= 3 && opportunities > 0 && coffeeCount / opportunities >= 0.5) {
      signals.push(`${coffeeCount} no-sale visits (${Math.round((coffeeCount / opportunities) * 100)}% of opportunities)`);
    }
    if (collected >= 300 && cash / collected >= 0.8) {
      signals.push(`${Math.round((cash / collected) * 100)}% of collected money is cash ($${Math.round(cash).toLocaleString('en-US')})`);
    }
    if (zeroCompleted >= 2) {
      signals.push(`${zeroCompleted} completed jobs with a $0 invoice`);
    }
    if (signals.length > 0) {
      out.push({ userId: u.id, name: u.name, signals, severity: signals.length >= 2 ? 'alert' : 'watch' });
    }
  }
  return out.sort((a, b) => b.signals.length - a.signals.length);
}

export const HOUR_SLOT_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];

export interface HourDowCell { revenue: number; count: number; }

/**
 * Revenue by 3-hour slot × day of week over the trailing `monthsBack` months
 * ending at the given month. Full 24h coverage — night lockouts are real money
 * for a locksmith. Slot comes from the job's scheduled time.
 */
export function revenueByHourDow(jobs: Job[], year: number, month: number, monthsBack = 6) {
  const start = new Date(year, month - (monthsBack - 1), 1);
  const end = new Date(year, month + 1, 1); // exclusive
  const grid: HourDowCell[][] = Array.from({ length: 7 }, () =>
    HOUR_SLOT_LABELS.map(() => ({ revenue: 0, count: 0 }))
  );
  for (const j of jobs) {
    if (!isRevenueJob(j)) continue;
    const d = new Date(revenueDateStr(j) + 'T00:00:00');
    if (isNaN(d.getTime()) || d < start || d >= end) continue;
    const hour = Number((j.scheduledTime || '').slice(0, 2));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
    const cell = grid[d.getDay()][Math.floor(hour / 3)];
    cell.revenue += j.totalAmount;
    cell.count += 1;
  }
  let max = 0;
  let best = { dow: -1, slot: -1, revenue: 0 };
  grid.forEach((row, dow) => row.forEach((c, slot) => {
    if (c.revenue > max) max = c.revenue;
    if (c.revenue > best.revenue) best = { dow, slot, revenue: c.revenue };
  }));
  return { grid, max, best, monthsBack };
}

// ── Accounting helpers ──────────────────────────────────────────────────────

/** How much has actually been collected on a job. */
export const collectedAmount = (j: Job): number => {
  if (j.paymentStatus === 'paid') return j.totalAmount;
  if (j.paymentStatus === 'partial') return j.amountPaid || 0;
  return 0;
};

/** Outstanding balance still owed on a job. */
export const outstandingAmount = (j: Job): number => Math.max(0, j.totalAmount - collectedAmount(j));

export interface AccountingSummary {
  grossRevenue: number;
  collected: number;
  outstanding: number;
  partsCost: number;
  grossProfit: number;
  estimatedTax: number;
  jobCount: number;
}

/** Period accounting summary (revenue jobs in the month). */
export function accountingSummary(jobs: Job[], year: number, month: number, taxRate = 0): AccountingSummary {
  const inMonth = completedJobsInMonth(jobs, year, month);
  const grossRevenue = inMonth.reduce((s, j) => s + j.totalAmount, 0);
  const collected = inMonth.reduce((s, j) => s + collectedAmount(j), 0);
  const outstanding = inMonth.reduce((s, j) => s + outstandingAmount(j), 0);
  const partsCost = inMonth.reduce(
    (s, j) => s + j.lineItems.filter(i => i.type === 'part').reduce((ss, i) => ss + (i.unitCost ?? 0) * i.quantity, 0),
    0
  );
  return {
    grossRevenue: round2(grossRevenue),
    collected: round2(collected),
    outstanding: round2(outstanding),
    partsCost: round2(partsCost),
    grossProfit: round2(grossRevenue - partsCost),
    estimatedTax: round2(grossRevenue * (taxRate / 100)),
    jobCount: inMonth.length,
  };
}

/** Collected revenue split by payment method for a period. */
export function paymentMethodBreakdown(jobs: Job[], year: number, month: number) {
  const inMonth = completedJobsInMonth(jobs, year, month);
  const map = new Map<string, number>();
  for (const j of inMonth) {
    const c = collectedAmount(j);
    if (c <= 0) continue;
    const m = j.paymentMethod || 'Unspecified';
    map.set(m, (map.get(m) || 0) + c);
  }
  return [...map.entries()].map(([method, amount]) => ({ method, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

export interface ReceivableRow {
  id: string;
  jobNumber: string;
  client: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
  status: Job['status'];
}

/** Accounts receivable: completed/sold work that is unpaid or partially paid. */
export function accountsReceivable(jobs: Job[]): ReceivableRow[] {
  return jobs
    .filter(j => isRevenueJob(j) && outstandingAmount(j) > 0.01)
    .map(j => ({
      id: j.id,
      jobNumber: j.jobNumber,
      client: `${j.client.firstName} ${j.client.lastName}`.trim(),
      date: j.completedAt?.slice(0, 10) || j.scheduledDate,
      total: round2(j.totalAmount),
      paid: round2(collectedAmount(j)),
      balance: round2(outstandingAmount(j)),
      status: j.status,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Revenue jobs in a period assigned to one technician. */
export function jobsForTechnician(jobs: Job[], techId: string, year: number, month: number): Job[] {
  return completedJobsInMonth(jobs, year, month)
    .filter(j => j.assignedTo === techId)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

/** Payroll CSV for a period's technician earnings. */
export function payrollToCSV(rows: TechnicianEarnings[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Technician', 'Jobs', 'Revenue', 'Commission Rate (%)', 'Commission'];
  const body = rows.map(r => [r.name, r.jobCount, r.revenue.toFixed(2), r.commissionRate, r.commission.toFixed(2)]);
  const totals = ['TOTAL', rows.reduce((s, r) => s + r.jobCount, 0), rows.reduce((s, r) => s + r.revenue, 0).toFixed(2), '', rows.reduce((s, r) => s + r.commission, 0).toFixed(2)];
  return [header, ...body, totals].map(r => r.map(esc).join(',')).join('\n');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const csvEsc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a CSV string from an arbitrary list of revenue jobs. */
export function jobsToCSV(list: Job[]): string {
  const header = ['Date', 'Job #', 'Client', 'Type', 'Brand', 'Outcome', 'Parts Cost', 'Total'];
  const rows = list.map(j => {
    const partsCost = j.lineItems
      .filter(i => i.type === 'part')
      .reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);
    return [
      j.scheduledDate,
      j.jobNumber,
      `${j.client.firstName} ${j.client.lastName}`,
      j.lockDetails?.type || 'Other',
      j.lockDetails?.brand || '',
      isSale(j) ? 'Sold' : 'Coffee',
      partsCost.toFixed(2),
      j.totalAmount.toFixed(2),
    ];
  });
  return [header, ...rows].map(r => r.map(csvEsc).join(',')).join('\n');
}

/** Build a CSV string of completed jobs for a period (export). */
export function periodJobsToCSV(jobs: Job[], year: number, month: number): string {
  return jobsToCSV(
    completedJobsInMonth(jobs, year, month).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
  );
}

// ── Period spans (month / quarter / year) ───────────────────────────────────

export type PeriodMode = 'month' | 'quarter' | 'year';

/** The months covered by the chosen reporting period. */
export function monthsInPeriod(year: number, month: number, mode: PeriodMode): { year: number; month: number }[] {
  if (mode === 'quarter') {
    const q = Math.floor(month / 3) * 3;
    return [0, 1, 2].map(i => ({ year, month: q + i }));
  }
  if (mode === 'year') return Array.from({ length: 12 }, (_, m) => ({ year, month: m }));
  return [{ year, month }];
}

/** All revenue jobs across a span of months, date-sorted. */
export function jobsInMonths(jobs: Job[], span: { year: number; month: number }[]): Job[] {
  return span
    .flatMap(m => completedJobsInMonth(jobs, m.year, m.month))
    .sort((a, b) => revenueDateStr(a).localeCompare(revenueDateStr(b)));
}

// ── Expense ledger helpers ───────────────────────────────────────────────────

/** Expenses dated within a span of months, newest first. */
export function expensesInMonths(expenses: Expense[], span: { year: number; month: number }[]): Expense[] {
  const keys = new Set(span.map(m => monthKey(m.year, m.month)));
  return expenses
    .filter(e => e.date && keys.has(e.date.slice(0, 7)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Totals per expense category, largest first. */
export function expensesByCategory(list: Expense[]): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const e of list) map.set(e.category, (map.get(e.category) || 0) + e.amount);
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function expensesToCSV(list: Expense[]): string {
  const header = ['Date', 'Category', 'Amount', 'Note'];
  const rows = list.map(e => [e.date, e.category, e.amount.toFixed(2), e.note || '']);
  const total = ['TOTAL', '', list.reduce((s, e) => s + e.amount, 0).toFixed(2), ''];
  return [header, ...rows, total].map(r => r.map(csvEsc).join(',')).join('\n');
}
