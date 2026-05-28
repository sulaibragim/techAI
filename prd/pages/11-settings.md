# Settings Page — PRD

> **Tab:** settings | **Component:** Settings.tsx (to be created)
> **Status:** Placeholder — not implemented
> **Author:** Sultan | **Date:** 2026-05-27

---

## Problem Statement

The Settings tab currently shows only an empty placeholder with an icon. Three hardcoded values are scattered in the codebase and cannot be changed without editing source code:
- Monthly revenue target: $1500/day and $5000/month (WorkroomDashboard, financialUtils)
- Technician name: "Sultan" (App.tsx header)
- API key: VITE_API_KEY (only via .env.local)

Sultan has no way to configure his own profile, adjust business targets, or manage the AI API key from within the app.

---

## Goals

1. Give Sultan a single place to configure all app settings
2. Make monthly revenue target editable and persistent (localStorage)
3. Store technician profile (name, company, photo)
4. Add API key input so Sultan can enter Gemini key without editing files
5. Match existing dark theme exactly — no visual inconsistency

## Non-Goals

- Multi-user / role management (single user app)
- Cloud sync or remote config
- Language switching (app is already bilingual by design)
- Notification system (no backend — future feature)
- Billing / subscription management

---

## User Stories

| # | Story | Acceptance Criteria |
|---|-------|---------------------|
| US-1 | As Sultan, I want to set my monthly revenue target so the dashboard reflects my real goal | Target input saves to localStorage, persists on refresh, updates all dashboard calculations |
| US-2 | As Sultan, I want to set my name and company so the header shows the right info | Name/company saved to localStorage, shown in App.tsx header instead of hardcoded "Sultan" |
| US-3 | As Sultan, I want to upload a profile photo so the avatar in the header is mine | Photo saved as base64 in localStorage, shown in header avatar |
| US-4 | As Sultan, I want to enter my Gemini API key in the app so I don't need to edit .env files | Key saved to localStorage, used by geminiService.ts instead of import.meta.env.VITE_API_KEY |
| US-5 | As Sultan, I want to see the app version and reset all settings if needed | Version shown, "Reset to defaults" button clears localStorage settings |

---

## Acceptance Criteria

**AC-1 — Revenue Target**
- Given Sultan enters a number in the monthly target field
- When he saves
- Then financialUtils.calculateFinancialMetrics() uses that value
- And the value persists after page refresh

**AC-2 — Technician Profile**
- Given Sultan enters name, company name, and uploads a photo
- When he saves
- Then App.tsx header shows updated name and photo
- And values persist after page refresh

**AC-3 — API Key**
- Given Sultan enters a Gemini API key in the masked input field
- When he saves
- Then geminiService.ts uses that key for all Gemini calls
- And the key is stored in localStorage (not shown in plain text after save)

**AC-4 — Visual consistency**
- Settings page matches dark theme (bg-slate-900/slate-800 cards)
- Uses same Framer Motion entrance animations as other tabs
- Fully responsive (mobile + desktop)

**AC-5 — Reset**
- "Reset to defaults" clears all localStorage settings
- Confirmation dialog shown before reset
- App reverts to hardcoded defaults

---

## Metrics & Success

| Metric | Target |
|--------|--------|
| Zero hardcoded values remaining in source | 100% |
| Settings persist across page refreshes | Yes |
| No TypeScript errors introduced | 0 errors |
| Visual parity with existing dark theme | Pass |

---

## Scope

### In Scope
- `components/Settings.tsx` — new component
- `store.ts` — add settingsSlice (or separate localStorage hook)
- `App.tsx` — read name/photo from settings store
- `financialUtils.ts` — accept target as parameter instead of hardcoded
- `geminiService.ts` — read API key from settings store with fallback to import.meta.env

### Out of Scope
- Notification preferences (no notification system exists)
- Theme switcher (dark-only for now)
- Export/import settings as JSON (future)

---

## Implementation Notes

- Use `localStorage` directly via a `useSettings` Zustand slice with `persist` middleware
- Settings state shape:
```typescript
interface Settings {
  technicianName: string        // default: 'Sultan'
  companyName: string           // default: 'Salem Locksmith'
  profilePhoto: string          // default: '' (uses pravatar fallback)
  monthlyRevenueTarget: number  // default: 5000
  dailyRevenueTarget: number    // default: 1500
  geminiApiKey: string          // default: '' (falls back to import.meta.env)
}
```
- Zustand persist middleware writes to localStorage key: `techai-settings`
- API key field: type="password" input, show/hide toggle button
