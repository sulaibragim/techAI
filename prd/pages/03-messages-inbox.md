# Messages Inbox

> **Tab:** messages | **Component:** MessagesList.tsx

## Overview
Unified SMS inbox showing conversation threads with clients, grouped by job. Shows latest message preview per thread sorted by recency.

## Layout
```
[Header: "Client Inbox" + thread count badge]
[Thread List]
[Footer metrics: Response Velocity | SLA Compliance | Sentiment Index]
```

## Thread Card Fields
| Field | Description |
|-------|-------------|
| Client avatar | Circle with online indicator |
| Client name | First + Last |
| Job number | e.g. LK-8402 |
| Latest message preview | Truncated text |
| Method icon | SMS or email icon |
| Timestamp | Relative time |

## Footer Metrics (visible only when threads exist)
- Response Velocity
- SLA Compliance
- Sentiment Index

## Interactions

### Thread List
- Sorted by latest message timestamp (newest first)
- Only jobs that have messages appear

### Click Thread
- Opens JobDetail overlay with messaging tab focused

## APIs
None - reads messages from jobs in Zustand store.

## Business Rules
- Messages are stored per-job (Job.messages array)
- Global messages array in store is separate (standalone conversation)
- Thread shows the latest message from job.messages
