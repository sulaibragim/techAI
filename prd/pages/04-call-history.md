# Call History

> **Tab:** calls | **Component:** CallsList.tsx

## Overview
Log of all incoming, outgoing, and missed calls. Tapping a call dials the number.

## Layout
```
[Header: "Call History" + record count]
[Call Record List]
```

## Call Card Fields
| Field | Description |
|-------|-------------|
| Avatar | Caller photo |
| Name | Caller name |
| Phone | Phone number |
| Timestamp | When call occurred |
| Duration | Call length (if available) |
| Type icon | Green=incoming, Blue=outgoing, Red=missed |

## Interactions

### Click Call Card
- Triggers tel: protocol - opens phone dialer with that number

## APIs
None - reads from calls array in Zustand store.
