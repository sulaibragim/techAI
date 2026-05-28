# Jobs List (Dispatch Queue)

> **Tab:** jobs | **Component:** JobsList.tsx

## Overview
Filterable list of all jobs. Technician can advance job status, reschedule, or cancel. Designed as a quick dispatch queue.

## Layout
```
[Filter Tabs: Pending | Completed | Cancelled]
[Job Cards Grid - 1 to 4 columns responsive]
```

## Fields per Job Card
| Field | Description |
|-------|-------------|
| Status bar (top) | Color stripe matching job status |
| Client name | Full name |
| Job number | e.g. LK-8402 |
| Lock type & brand | e.g. Automotive - Toyota |
| Scheduled date/time | |
| Amount | Total in USD |
| Action button | Advances status (context-aware label) |
| Calendar icon | Opens reschedule modal |
| Cancel button | Sets status to cancelled |

## Filters
| Filter | Shows |
|--------|-------|
| Pending | All non-completed, non-cancelled jobs |
| Completed | completed jobs only |
| Cancelled | cancelled jobs only |

## Interactions

### Status Progression
Button label and action changes by current status:
- scheduled/enRoute/onSite -> "Mark Diagnosed" -> sets to diagnosed
- diagnosed -> "Mark Sold" -> sets to sold
- sold -> "Complete Job" -> sets to completed

### Reschedule Modal
- Opens when calendar icon clicked
- Select new date + time slot (9:00 / 11:00 / 13:00 / 15:00 / 17:00 / 19:00)
- Confirm saves new scheduledDate and scheduledTime

### Cancel
- Immediately sets job status to cancelled (no confirmation dialog)

### Job Detail
- Clicking card body opens JobDetail overlay

## APIs
None - reads/writes Zustand store.
