import { Job } from './types';

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
}

export function calculateFinancialMetrics(jobs: Job[], monthlyTarget: number = 20000): FinancialMetrics {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const completedJobs = jobs.filter(j => j.status === 'completed' && j.scheduledDate.startsWith(currentMonthStr));
  
  const totalRevenue = completedJobs.reduce((sum, j) => sum + j.totalAmount, 0);
  
  const soldJobs = completedJobs.filter(job => {
    return job.lineItems.some(item => item.type === 'labor' || item.type === 'part');
  });
  
  const coffeeJobs = completedJobs.filter(job => {
    return job.status === 'completed' && !job.lineItems.some(item => item.type === 'labor' || item.type === 'part');
  });

  const jobsSold = soldJobs.length;
  const coffeeCount = coffeeJobs.length;
  const totalCount = completedJobs.length;
  
  const closeRate = totalCount > 0 ? (jobsSold / totalCount) * 100 : 0;
  const averageTicket = jobsSold > 0 ? totalRevenue / jobsSold : 0;
  
  // Real-time Date Logic
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = now.getDate();
  
  const progress = (totalRevenue / monthlyTarget) * 100;
  const expectedProgress = (daysElapsed / daysInMonth) * 100;
  const variance = progress - expectedProgress;
  
  let planStatus: 'excellent' | 'good' | 'warning' | 'critical' = 'good';
  if (variance >= 5) planStatus = 'excellent';
  else if (variance >= 0) planStatus = 'good';
  else if (variance >= -10) planStatus = 'warning';
  else planStatus = 'critical';

  const remainingRevenue = Math.max(0, monthlyTarget - totalRevenue);
  const daysRemaining = daysInMonth - daysElapsed;
  const requiredDailyRevenue = daysRemaining > 0 ? remainingRevenue / daysRemaining : 0;
  const requiredSalesPerDay = averageTicket > 0 ? Math.ceil(requiredDailyRevenue / averageTicket) : 2;

  return {
    totalRevenue,
    totalCount,
    jobsSold,
    coffeeCount,
    closeRate,
    averageTicket,
    monthlyTarget,
    progress,
    expectedProgress,
    variance,
    remainingRevenue,
    daysRemaining,
    requiredDailyRevenue,
    requiredSalesPerDay,
    planStatus
  };
}