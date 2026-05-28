# Analytics Dashboard

> **Tab:** analytics | **Component:** Dashboard.tsx

## Overview
Business performance overview with revenue trajectory, conversion rate, and KPI grid. Lets Sultan track progress toward monthly revenue target.

## Layout
```
[Strategic Planning Hub (left 4/12)] [Revenue + Charts (right 8/12)]
[KPI Grid - 6 metrics full width]
[Profitability Panel | Strategic Advisor]
```

## Charts
| Chart | Type | Description |
|-------|------|-------------|
| Revenue Trajectory Matrix | Area chart | Daily revenue over 7 days |
| Conversion Efficiency | Donut/Pie | Completed (sold) vs unsuccessful jobs |

## KPI Cards (6)
| KPI | Description |
|-----|-------------|
| Total Revenue | Gross vs monthly target |
| Close Rate % | Jobs sold / total completed |
| Avg Ticket Value | Revenue per sold job |
| Required Daily Revenue | Needed per day to hit target |
| Daily Job Conversion Goal | Jobs/day needed |
| Variance | Actual vs expected progress |

## Editable Target
- Monthly target input field - changing it recalculates all dependent metrics

## Date Filters
- today / week / month toggle (UI only - data remains static)

## Strategic Advisor
- Text recommendations based on current performance vs benchmarks

## APIs
None - calculates from jobs in Zustand store via financialUtils.ts.

## Calculations (financialUtils.ts)
- totalRevenue: sum of completed jobs this month
- closeRate: jobsSold / totalCompleted * 100
- avgTicket: totalRevenue / jobsSold
- variance: actualProgress% - expectedProgress%
- planStatus: excellent(>=5% ahead) / good / warning(<=-10%) / critical
