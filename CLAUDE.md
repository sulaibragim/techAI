# techAI — Locksmith CRM

## Project Overview
CRM system for a locksmith company (медвежатники). Manages service jobs for opening locks, doors, and cars.

**Owner:** Sultan  
**AI Assistant name:** Дурачок  
**AI language:** Russian with Sultan, English with clients

## Tech Stack
- **Framework:** React 19 + TypeScript
- **Build:** Vite 6
- **State:** Zustand 5
- **Styling:** Tailwind CSS + tailwind-merge + clsx
- **Charts:** Recharts 3
- **Animations:** Framer Motion (motion) 12
- **Icons:** Lucide React
- **AI:** Google Gemini (@google/genai) — chat + voice (gemini-2.5-flash-preview-native-audio-dialog)

## Project Structure
```
/
├── App.tsx                  # Main app, tab navigation
├── types.ts                 # All TypeScript types
├── store.ts                 # Zustand global store
├── geminiService.ts         # Gemini API (chat + voice)
├── financialUtils.ts        # Revenue/KPI calculations
├── index.tsx                # Entry point
├── index.html
├── components/
│   ├── WorkroomDashboard.tsx  # Main dashboard: Kanban, calendar, KPIs
│   ├── JobsList.tsx           # Job queue with filters
│   ├── JobDetail.tsx          # Full job card: billing, photos, messages
│   ├── JobWizard.tsx          # New job creation wizard (3 steps)
│   ├── Dashboard.tsx          # Analytics: revenue charts, KPIs
│   ├── Inventory.tsx          # Parts inventory management
│   ├── AIChat.tsx             # AI strategic assistant chat
│   ├── VoiceAssistant.tsx     # Voice AI (Gemini audio)
│   ├── MessagesList.tsx       # Client SMS inbox
│   ├── CallsList.tsx          # Call history log
│   ├── Navigation.tsx         # Mobile bottom nav
│   └── Sidebar.tsx            # Desktop sidebar nav
```

## Navigation Tabs
`calendar` → `jobs` → `messages` → `calls` → `analytics` → `inventory` → `brain` → `settings`

## Key Domain Types
- **Job** — main entity: client, lock details, status, schedule, billing, photos, messages
- **JobStatus** — `scheduled | enRoute | onSite | diagnosed | sold | coffee | waitingParts | completed | cancelled`
- **Part** — inventory item: SKU, category, stock, reorder point, price
- **Client** — name, phone, email, address, notes
- **LineItem** — invoice line: labor | hardware | diagnostic | maintenance

## Environment Variables
- `GEMINI_API_KEY` — required in `.env.local`

## Commands
```bash
npm install   # Install dependencies
npm run dev   # Start dev server (Vite)
npm run build # Production build
```

## Code Style
- No comments unless non-obvious
- Tailwind for all styling (dark theme: bg-gray-900/800/700 base)
- Framer Motion for animations (stagger children pattern)
- Zustand store accessed via `useAppStore()` hook
- All monetary values in USD ($)

## AI System Prompt Notes
- Gemini acts as "Дурачок" — personal assistant for Sultan
- Must use tool functions for all actions (no claiming completion without function calls)
- Available AI actions: `create_job`, `update_job`, `send_message_by_name`, `navigate_to`, `get_app_state`
