# techAI Locksmith CRM - Product Requirements Document

**Project:** fieldtech-os (Voice-First Technician Co-Pilot)
**Stack:** React 19 + TypeScript + Vite + Zustand + Tailwind CSS + Gemini AI
**Owner:** Sultan | **AI Assistant:** Durachok (Gemini, Russian/English)
**Generated:** 2026-05-27

---

## System Overview

techAI is a mobile-first CRM for a locksmith company (locksmiths/medvezhyatniki). It manages the full lifecycle of service jobs - from initial customer call through dispatch, on-site work, invoicing, and payment. Single-page app with tab-based navigation, optimised for a solo technician in the field.

The AI assistant "Durachok" listens via voice, communicates with Sultan in Russian, and handles job creation, status updates, client messaging, and navigation through natural language.

**Primary user:** Sultan (owner/technician)

---

## Summary

| Metric | Count |
|--------|-------|
| Views/Tabs | 8 |
| Overlay Modals | 3 (JobDetail, JobWizard, VoiceAssistant) |
| API Endpoints | 0 (no backend - in-memory Zustand store) |
| AI Integrations | 2 (Gemini text chat + Gemini voice) |
| State Management | Zustand (in-memory, resets on refresh) |

## Module Overview

| Module | Tab | Core Functionality |
|--------|-----|--------------------|
| Workroom | calendar | Kanban pipeline, calendar view, KPIs, speedometer |
| Dispatch | jobs | Job queue with status progression and rescheduling |
| Communications | messages + calls | Client SMS inbox and call history |
| Analytics | analytics | Revenue charts, close rate, monthly targets |
| Inventory | inventory | Van parts stock with low-stock alerts |
| AI Brain | brain | Strategic AI chat (Gemini text) |
| Job Detail | overlay | Full job card: billing, invoice, photos, payment |
| Job Wizard | overlay | 3-step new job creation |
| Voice AI | floating | Real-time voice commands (Gemini audio) |

## Page Inventory

| # | Page | Tab/Trigger | Component | Doc |
|---|------|-------------|-----------|-----|
| 1 | Workroom Dashboard | calendar | WorkroomDashboard.tsx | ./pages/01-workroom-dashboard.md |
| 2 | Jobs List | jobs | JobsList.tsx | ./pages/02-jobs-list.md |
| 3 | Messages Inbox | messages | MessagesList.tsx | ./pages/03-messages-inbox.md |
| 4 | Call History | calls | CallsList.tsx | ./pages/04-call-history.md |
| 5 | Analytics | analytics | Dashboard.tsx | ./pages/05-analytics.md |
| 6 | Inventory | inventory | Inventory.tsx | ./pages/06-inventory.md |
| 7 | AI Brain Chat | brain | AIChat.tsx | ./pages/07-ai-brain.md |
| 8 | Job Detail | click any job | JobDetail.tsx | ./pages/08-job-detail.md |
| 9 | Job Wizard | New Job button | JobWizard.tsx | ./pages/09-job-wizard.md |
| 10 | Voice Assistant | floating mic | VoiceAssistant.tsx | ./pages/10-voice-assistant.md |

## Global Notes

### Permission Model
No authentication. Single-user app for Sultan. No role-based access.

### Data Persistence
All state is in-memory (Zustand). Data resets on page refresh - no backend or database yet.

### AI System
- Chat: gemini-3.1-pro-preview (text + tool calls)
- Voice: gemini-2.5-flash-native-audio-preview-09-2025 (audio in/out, voice: Puck)
- Language: Russian with Sultan, English for all client data and function parameters

### Common Interaction Patterns
- Active Dispatch banner shows at top when a job is enRoute or diagnosed
- All page transitions use Framer Motion spring animations
- Dark theme: bg-slate-950 base, blue accents
- Currency: USD, Dates: YYYY-MM-DD, Times: HH:mm

### Known Gaps
- Settings tab is a placeholder (not implemented)
- No real SMS/call integration - UI only
- No data persistence across sessions
- useAIActions in store.ts is a stub
