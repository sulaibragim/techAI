# TrustKey CRM

Field CRM for a locksmith company. Dispatch, job cards, invoicing, card payments,
inventory, client SMS, analytics, and an AI assistant.

- **Frontend** — React 19 + TypeScript + Vite, deployed on Vercel from `main`.
- **Backend** — Express (`server/`), deployed on Railway.
- **Database** — PostgreSQL on Railway. Tables are created on boot by `initDB()`.

## Run it locally

```bash
npm install
npm run dev:all      # Vite on :3000 + API on :3001
```

`npm run dev` alone starts only the frontend. Most screens render without the
backend, but anything that reads or writes data needs it — and without
`DATABASE_URL` the server keeps data in memory only and loses it on restart.

```bash
npm test             # money math, SMS opt-out keywords, the write outbox
npm run build        # typecheck + production build
```

## Configuration

**All secrets live on the server.** In particular the Gemini key is server-only:
the browser talks to `/api/ai` and uses short-lived tokens for voice. Never put a
key in a `VITE_*` variable — those are compiled into the public bundle.

Copy `.env.example` to `.env.local` and fill in what you need. The server refuses
to start in production without `JWT_SECRET`, `OPENPHONE_WEBHOOK_SECRET`,
`WEBSITE_WEBHOOK_SECRET`, and `STRIPE_WEBHOOK_SECRET` (when Stripe is on) — this
is deliberate, since every one of those otherwise fails silently rather than
loudly.

The only client-side variable is `VITE_API_BASE`, which must point at the Railway
backend in production.

## Where things are

```
App.tsx              tab shell, live poll, connection + save banners
store.ts             jobs, inventory (Zustand, persisted)
settingsStore.ts     company settings, ledgers, price book — synced as deltas
writeQueue.ts        outbox: retries writes, surfaces the ones that failed
financialUtils.ts    revenue, payroll, accounting — the money math
components/          one file per screen
server/routes/       REST API
server/services/     Stripe, OpenPhone, push, email, geo, scheduler
```

## Health check

Settings → Launch Readiness reports what is actually configured on the server
(secrets, database and how the link is secured, Stripe mode, SMS, push). Check it
after any deploy — a half-configured backend otherwise looks perfectly healthy.
