import { Job, User } from './types';

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

// A "sale" is any revenue job that actually produced billable money (service call,
// labor, parts — anything > $0), not just labor/part line items.
const isSale = (j: Job) => j.totalAmount > 0;

// Revenue jobs in a given month. (Named "completed" for backwards compatibility.)
export function completedJobsInMonth(jobs: Job[], year: number, month: number): Job[] {
  const key = monthKey(year, month);
  return jobs.filter(j => isRevenueJob(j) && j.scheduledDate.startsWith(key));
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
  const closeRate = totalCount > 0 ? (jobsSold / totalCount) * 100 : 0;
  const averageTicket = jobsSold > 0 ? totalRevenue / jobsSold : 0;

  const partsCost = completed.reduce(
    (s, j) => s + j.lineItems.filter(i => i.type === 'part').reduce((ss, i) => ss + i.unitPrice * i.quantity, 0),
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
      .filter(j => isRevenueJob(j) && j.scheduledDate === dayStr)
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
    const idx = new Date(j.scheduledDate + 'T00:00:00').getDay();
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
    byDay.set(j.scheduledDate, (byDay.get(j.scheduledDate) || 0) + j.totalAmount);
    const mk = j.scheduledDate.slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) || 0) + j.totalAmount);
    if (j.totalAmount > biggestTicket.amount) {
      biggestTicket = { amount: j.totalAmount, client: `${j.client.firstName} ${j.client.lastName}`, date: j.scheduledDate };
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
  const completed = inMonth.filter(j => j.status === 'completed');
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

/** Build a CSV string of completed jobs for a period (export). */
export function periodJobsToCSV(jobs: Job[], year: number, month: number): string {
  const completed = completedJobsInMonth(jobs, year, month).sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate)
  );
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Date', 'Job #', 'Client', 'Type', 'Brand', 'Outcome', 'Parts Cost', 'Total'];
  const rows = completed.map(j => {
    const partsCost = j.lineItems
      .filter(i => i.type === 'part')
      .reduce((s, i) => s + i.unitPrice * i.quantity, 0);
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
  return [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
}
