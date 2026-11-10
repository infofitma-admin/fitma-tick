# Fitma Tick (Cloud) — commercial time-tracking SaaS

A multi-tenant time tracker in the spirit of WebWork / Hubstaff / Time Doctor.
Any company can sign up, install the desktop app, and track their team.
**Fitma's own team uses it free; other companies pay (billed in USD, annually).**

> This is separate from Fitma's *internal* Workspace (which stays on Google
> Sheets). This product needs a real cloud database for scale, security, and
> keeping each company's data isolated.

## Stack
- **Database + Auth + Storage:** Supabase (Postgres). Row-Level Security keeps
  every company's data walled off at the database level. Free to start.
- **Web dashboard:** React + Vite SPA, Supabase JS client. Hosts on Netlify/Vercel.
- **Desktop app (Fitma Tick):** Electron (reuses the existing app), re-pointed at
  Supabase — login, timer, screenshots, activity %, syncs to the cloud.
- **Billing:** invoice-based (annual). Customer subscribes → invoice with payment
  instructions → pays by transfer → admin marks paid → access unlocked. A
  Merchant of Record (cards) can be added later. No per-transaction wire fees
  when we add a global receiving account.

## Data model (see `supabase/schema.sql`)
`companies` (tenants) · `memberships` (who's in which company + role) · `invites`
· `projects` · `tasks` · `time_entries` · `activity_samples` · `screenshots` ·
`app_usage` · `plans` · `subscriptions` · `invoices`.
Every row carries `company_id`; RLS enforces that a company only ever sees its own.

## Roles
- **owner / admin** — see the whole team, manage members, projects, billing.
- **member** — tracks time; sees only their own data.

## Build roadmap
**Phase 1 — MVP (sign your first customer):**
1. ✅ Database schema + isolation (this file + `schema.sql`)
2. ✅ Supabase project stood up + schema deployed + storage bucket for screenshots
   (project ref `adyqhpqugdlksqzpscwm`, 13 tables + RLS + seeded plans, `screenshots` bucket + policies — deployed 2026-11-10)
3. ⬜ Web: company signup → workspace → invite team → dashboard (time, screenshots, activity, projects/tasks, basic reports)
4. ⬜ Desktop: login, timer, periodic screenshots + activity, sync to Supabase
5. ⬜ Billing: plans, 14-day trial, invoice checkout, access-lock when unpaid
6. ⬜ Public product/pricing page (on the Fitma Tick page of fitma.lk)

**Phase 2 — WebWork parity:** app & website usage, productivity categories,
exportable/scheduled reports, billable rates & payroll, idle detection,
integrations (Slack/Jira…), API, white-label.

## Repo layout
```
supabase/      database schema, policies, migrations, edge functions
apps/web/      React dashboard + signup + pricing
apps/desktop/  Electron tracker (from existing Fitma Tick)
docs/          plans, decisions
```

## Pricing (USD, adjustable)
| Plan | Price (billed annually) | For |
|------|------------------------|-----|
| Free trial | 14 days | everyone |
| Starter | $3.99 / user / mo | tracking, screenshots, activity, projects/tasks, basic reports |
| Professional | $6.99 / user / mo | + app/URL tracking, advanced reports, integrations |
| Enterprise | custom | + SSO, white-label, dedicated support |
