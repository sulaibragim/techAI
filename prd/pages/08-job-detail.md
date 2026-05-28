# Job Detail (Overlay)

> **Trigger:** Click any job card | **Component:** JobDetail.tsx

## Overview
Full-screen overlay showing complete job information. Sultan can edit client data, update lock details, add invoice line items, collect payment, send messages to client, and capture photos.

## Layout
```
[Header: Job# | Status picker | Date/Time scheduler | Save button]
[Left sidebar: Client Card | Hardware Profile | Message History]
[Center: Invoice / Billing Panel]
[Right/Bottom: Intake notes | Diagnosis notes]
```

## Header
| Element | Description |
|---------|-------------|
| Job number | e.g. LK-8402 |
| Status dropdown | All 9 statuses with color indicators |
| Calendar scheduler | 4-week picker + 9 time slots (8:00-20:00) |
| Save button | Active when unsaved changes exist (isModified flag) |

## Left Sidebar

### Client Card
| Field | Editable |
|-------|----------|
| Name | Yes (modal) |
| Phone | Yes (modal) |
| Email | Yes (modal) |
| Address | Yes (modal) |
| Quick actions | Call, Email, SMS buttons |

### Hardware Profile
| Field | Description |
|-------|-------------|
| Lock type | Dropdown: Automotive/Residential/Commercial/Secure Safe/Other |
| Brand | Dropdown: 18 major brands |
| Model/Year | Text input |
| VIN/Key Code | Text input |
| Hardware Finish | Text input |
| Photo gallery | Thumbnails + capture/upload button |

### Message History
- SMS-style thread of messages with this client
- Sender types: technician, client, assistant, system
- New message input + send button

## Center: Invoice Panel
- Professional invoice layout (A4 proportions)
- Quick-add buttons: Labor | Hardware | Diagnostic | Maintenance
- Scrollable line items list
- Each line item: description, type badge, quantity, unit price
- Total amount calculated automatically
- Settlement button -> triggers payment workflow

### Line Item Addition
- Clicking quick-add button opens billing prompt
- Fields: type, description, price, optional part (searches inventory by name/SKU)
- Adding a part line item decrements that part's stock in inventory

### Payment Settlement Workflow (3 steps)
1. Collection scope: Full payment / Partial (50%)
2. Payment method: Card / Cash / Check / Zelle
3. Terms: digital signature placeholder + term selection

## Bottom: Operational Logs
- Intake: original customer complaint (read-only)
- Diagnosis: editable textarea for findings and notes

## Interactions

### Photo Capture
- Camera button: opens device camera (environment-facing)
- Gallery button: opens file picker
- Photos stored as base64 data URLs in job.photos array

### Calendar Conflict Detection
- Scheduler checks existing jobs for time conflicts
- Conflicting slots shown in red/disabled

### Save
- Save button saves all local changes to Zustand store
- isModified flag cleared after save

## APIs
None - reads/writes Zustand store. Inventory stock updated in-place.
