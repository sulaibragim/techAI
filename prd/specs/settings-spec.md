# Settings Page — Technical Specification

**Author:** Sultan
**Date:** 2026-05-27
**Status:** Approved

---

## Context

The Settings tab currently renders an empty placeholder with no functionality. Three critical values are hardcoded in source files and cannot be changed by Sultan without editing code:

1. `dailyRevenueTarget: 1500` in WorkroomDashboard.tsx
2. `targetRevenue: 5000` in store.ts `getFinancialMetrics()`
3. Technician name `"Sultan"` and avatar in App.tsx header
4. Gemini API key only configurable via `.env.local` file

Sultan needs a self-service settings page to configure his profile, revenue goals, and AI key from within the app UI. All settings must persist across page refreshes via localStorage.

---

## Functional Requirements

- FR-1: The Settings page MUST display three sections: Profile, Business Targets, AI Configuration.
- FR-2: The Profile section MUST contain fields for technician name (text), company name (text), and profile photo (file upload, stored as base64).
- FR-3: The Business Targets section MUST contain fields for monthly revenue target (number, USD) and daily revenue target (number, USD).
- FR-4: The AI Configuration section MUST contain a password-type input for the Gemini API key with a show/hide toggle button.
- FR-5: All settings MUST persist to localStorage under key `techai-settings` using Zustand persist middleware.
- FR-6: Settings MUST be loaded from localStorage on app startup so they survive page refresh.
- FR-7: The App.tsx header MUST read technician name and profile photo from the settings store instead of hardcoded values.
- FR-8: financialUtils.ts MUST accept monthlyTarget and dailyTarget as parameters instead of hardcoding them.
- FR-9: geminiService.ts MUST use the API key from settings store with fallback to `import.meta.env.VITE_API_KEY`.
- FR-10: A "Reset to Defaults" button MUST restore all settings to their default values after the user confirms in a dialog.
- FR-11: The Settings page MUST display the current app version read from package.json metadata.

---

## Non-Functional Requirements

- NFR-1: Page MUST use dark theme — bg-slate-950 background, bg-slate-900 cards, blue-500 accents — matching all other tabs.
- NFR-2: Layout MUST be responsive: single column on mobile, 2-column grid on md+ screens.
- NFR-3: Save operation MUST complete in under 50ms (synchronous localStorage write).
- NFR-4: Zero new TypeScript errors MUST be introduced (`npx tsc --noEmit` stays clean).
- NFR-5: Profile photo MUST be validated to under 2MB before storing as base64.
- NFR-6: Page entrance MUST use Framer Motion animation matching other tabs (opacity + x slide).

---

## Acceptance Criteria

### AC-1: Profile saves and persists
- **Given:** Sultan enters name "Ali" and company "Salem Locks" and clicks Save
- **When:** The page is refreshed
- **Then:** The header shows "Ali" and the settings form shows "Ali" / "Salem Locks"
- **References:** FR-2, FR-5, FR-6, FR-7

### AC-2: Profile photo updates header
- **Given:** Sultan uploads a valid photo (under 2MB) in Settings
- **When:** The photo is saved
- **Then:** The avatar in the App.tsx header immediately shows the uploaded photo
- **References:** FR-2, FR-7

### AC-3: Revenue targets flow to analytics
- **Given:** Sultan sets monthly target to $8000 and saves
- **When:** The Analytics tab is opened
- **Then:** All KPIs, progress bars, and daily-required calculations use $8000 as the target
- **References:** FR-3, FR-8

### AC-4: API key is used by Gemini
- **Given:** Sultan enters a valid Gemini API key in Settings and saves
- **When:** AI Brain sends a message
- **Then:** geminiService.ts uses the settings key (not the .env value)
- **References:** FR-4, FR-9

### AC-5: API key field is masked
- **Given:** Settings page opens with a previously saved API key
- **When:** The page loads
- **Then:** The key displays as dots (password input); the show/hide button toggles plain text visibility
- **References:** FR-4

### AC-6: Reset to defaults works
- **Given:** Sultan has changed settings and clicks "Reset to Defaults"
- **When:** Sultan confirms the dialog
- **Then:** All fields revert to defaults and localStorage entry is cleared
- **References:** FR-10

### AC-7: Visual and animation parity
- **Given:** Settings tab is active
- **Then:** Background is bg-slate-950, cards are bg-slate-900, accents are blue-500, entrance uses Framer Motion spring
- **References:** NFR-1, NFR-6

---

## Edge Cases

- EC-1: Photo file exceeds 2MB — show error toast "Photo must be under 2MB", do not save, do not update store.
- EC-2: Monthly or daily target set to 0 — clamp to minimum value of 1 to prevent division-by-zero in financialUtils.
- EC-3: API key field left empty and VITE_API_KEY not set — geminiService falls back to empty string; Gemini calls fail with auth error (existing behavior, not regression).
- EC-4: localStorage unavailable (e.g. private browsing mode) — catch QuotaExceededError or SecurityError, display warning banner "Settings won't persist in this mode", use in-memory store only.
- EC-5: Technician name exceeds 50 characters — input enforces maxLength=50 at the HTML level.

---

## API Contracts

No external HTTP APIs. Internal TypeScript interfaces:

```typescript
// New Zustand slice added to store.ts
interface SettingsState {
  technicianName: string
  companyName: string
  profilePhoto: string
  monthlyRevenueTarget: number
  dailyRevenueTarget: number
  geminiApiKey: string
  updateSettings: (patch: Partial<Omit<SettingsState, 'updateSettings' | 'resetSettings'>>) => void
  resetSettings: () => void
}

const SETTINGS_DEFAULTS = {
  technicianName: 'Sultan',
  companyName: 'Salem Locksmith',
  profilePhoto: '',
  monthlyRevenueTarget: 5000,
  dailyRevenueTarget: 1500,
  geminiApiKey: '',
}

// financialUtils.ts signature change
function calculateFinancialMetrics(
  jobs: Job[],
  monthlyTarget?: number,   // was hardcoded 5000
  dailyTarget?: number      // was hardcoded 1500
): FinancialMetrics

// geminiService.ts key resolution
const resolveApiKey = (): string =>
  useSettingsStore.getState().geminiApiKey || import.meta.env.VITE_API_KEY || ''
```

---

## Data Models

localStorage key: `techai-settings`

| Field | Type | Default | Constraint |
|-------|------|---------|-----------|
| technicianName | string | Sultan | max 50 chars |
| companyName | string | Salem Locksmith | max 100 chars |
| profilePhoto | string | '' | base64 data URL, max ~2.7MB encoded |
| monthlyRevenueTarget | number | 5000 | min 1 |
| dailyRevenueTarget | number | 1500 | min 1 |
| geminiApiKey | string | '' | any string |

---

## Out of Scope

- OS-1: Multi-language / locale switcher — app bilingual by Gemini system prompt design.
- OS-2: Push notification preferences — no notification infrastructure exists.
- OS-3: Light/dark theme toggle — dark-only for this version.
- OS-4: Cloud sync of settings — local-only app, no backend.
- OS-5: Multiple technician profiles — single-user app.
