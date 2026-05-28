# Job Wizard (New Job Creation)

> **Trigger:** "New Job" / "+" button | **Component:** JobWizard.tsx

## Overview
3-step modal wizard for creating a new service job. Collects client info, hardware details, and the service complaint.

## Step 1: Customer Details
| Field | Required | Notes |
|-------|----------|-------|
| First name | Yes | |
| Last name | Yes | |
| Phone | Yes | |
| Email | No | |
| Service address | Yes | Text area |

## Step 2: Hardware Profile
| Field | Required | Notes |
|-------|----------|-------|
| Lock type | Yes | Auto / Home / Business / Safe-Vault / Other |
| Brand | No | Dropdown: 18 brands (Toyota, Schlage, Yale, etc.) |
| Model/Year | No | Text input |
| Photo | No | Camera capture |

## Step 3: Service Complaint
| Field | Required | Notes |
|-------|----------|-------|
| Complaint description | Yes | Text area - "describe the lock issue or vehicle situation" |

## Interactions

### Navigation
- Next / Back buttons between steps
- Step indicator shows current step (1/2/3)

### Create Job
- Final step: "Create Job" button
- Creates job with: client data, hardware, complaint, auto-generated job number (LK-XXXX), status=diagnosed, current timestamp
- Closes wizard, new job appears in store

### Cancel
- X button on any step cancels without saving

## Post-Creation
- Job immediately visible in all views
- Sultan typically navigates to Job Detail to add billing
