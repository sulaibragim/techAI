# Workroom Dashboard

> **Tab:** calendar | **Component:** WorkroomDashboard.tsx

## Overview
Main operational hub. Shows today's job pipeline as a Kanban board, a monthly calendar with job indicators, real-time KPIs, and a speedometer for close rate. This is the default view when the app opens.

## Layout

```
[KPI Bar: Revenue | Settlement % | Asset Logs | Active Plan]
[Calendar + Daily Goal Tracker] [Speedometer] [System Focus]
[Kanban: New Tasks | Diagnostics | Completed]
```

## Sections

### KPI Bar (top)
| Card | Value | Description |
|------|-------|-------------|
| Revenue Pool | $ total | Sum of completed jobs this month |
| Settlement % | % | Close rate (jobs sold / total completed) |
| Asset Logs | count | Total jobs logged |
| Active Plan | status | Plan health: excellent/good/warning/critical |

### Calendar
- Monthly grid with navigation (prev/next month)
- Days with scheduled jobs show colored indicator bars
- Clicking a day filters the job list below to that date
- Daily Goal Tracker shows today's revenue vs $1500 target with progress bar

### Speedometer
- SVG gauge 0-100% showing close rate
- Color zones: red (<35%), orange (35-50%), cyan (50-70%), green (70%+)
- Animated needle on load

### Kanban Board
Three columns:
| Column | Statuses shown |
|--------|---------------|
| New Tasks | scheduled, enRoute |
| Diagnostics | diagnosed, sold, waitingParts, coffee |
| Completed | completed |

Each card shows: client name, scheduled time, distance (miles), lock type/brand, amount, status color.
Drag-and-drop moves jobs between columns and updates their status in the store.

## Interactions

### Page Load
- Loads all jobs from store
- Calendar defaults to current month, today highlighted
- Kanban populated from all jobs grouped by status

### Day Selection
- Clicking calendar day: filters jobs to show only that date
- Clicking same day again: deselects (shows all)

### Kanban Drag-and-Drop
- Dragging card to new column updates job status
- New Tasks -> Diagnostics: status becomes diagnosed
- Diagnostics -> Completed: status becomes completed

### New Job
- "+" button triggers JobWizard overlay

### Job Selection
- Clicking any Kanban card opens JobDetail overlay

## APIs
None - reads from Zustand store directly.
