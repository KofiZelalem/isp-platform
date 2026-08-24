# ISP-OS Development Roadmap

> **Stage 0 — Product Specification**  
> Version: 0.1.0 | Status: Draft

> **Superseded:** see [roadmap.md](roadmap.md) for the canonical, evidence-based 23-stage roadmap aligned to the master project spec, and [project-status.md](project-status.md) for current status. This document's Stage numbering does not match roadmap.md's — kept here for historical reference only.

---

## Overview

The ISP-OS platform is developed across **22 stages**, progressing from foundational infrastructure through feature modules to production hardening. Each stage produces a deployable, testable increment.

---

## Stage Checklist

### Foundation

- [ ] **Stage 0** — Product Specification & Repository Scaffolding
  - [ ] Define system architecture document
  - [ ] Define product specification (actors, modules)
  - [ ] Draft Prisma schema (database-schema.md)
  - [ ] Create monorepo directory structure (Turborepo)
  - [ ] Establish development roadmap

- [ ] **Stage 1** — Monorepo Bootstrap & Toolchain
  - [ ] Initialise Turborepo with `pnpm` workspaces
  - [ ] Configure TypeScript (strict mode) across all packages and apps
  - [ ] Configure ESLint + Prettier + Husky pre-commit hooks
  - [ ] Set up GitHub Actions CI pipeline (lint, type-check, test)
  - [ ] Configure `packages/shared` (common types, errors, utilities)

- [ ] **Stage 2** — Database Layer (`packages/database`)
  - [ ] Initialise Prisma with Supabase PostgreSQL connection
  - [ ] Implement full schema from `database-schema.md`
  - [ ] Write initial migration
  - [ ] Create seed scripts (platform admin user, demo organisation)
  - [ ] Configure Supabase RLS policies for all tenant-scoped tables
  - [ ] Export typed Prisma client

- [ ] **Stage 3** — Authentication & RBAC (`packages/auth`)
  - [ ] Integrate Supabase Auth (JWT issuance, session management)
  - [ ] Implement organisation context extraction from JWT claims
  - [ ] Build RBAC middleware (role + organisation-scoped guards)
  - [ ] Implement invite-based user onboarding flow
  - [ ] Add 2FA support (TOTP via Supabase)

---

### Core Platform Admin

- [ ] **Stage 4** — Admin Web App Foundation (`apps/web`)
  - [ ] Bootstrap Next.js 14 (App Router) with TypeScript
  - [ ] Implement design system (tokens, typography, colour palette)
  - [ ] Build layout shell (sidebar navigation, topbar, breadcrumbs)
  - [ ] Integrate tRPC client + React Query
  - [ ] Implement authentication pages (login, forgot password, 2FA)

- [ ] **Stage 5** — Organisation Management Module
  - [ ] tRPC router: CRUD for organisations
  - [ ] ISP registration and onboarding wizard
  - [ ] Organisation settings UI (branding, timezone, currency)
  - [ ] Feature flag management per organisation
  - [ ] Organisation suspension / termination flows

- [ ] **Stage 6** — User & Role Management Module
  - [ ] tRPC router: CRUD for users within an organisation
  - [ ] Staff and Reseller invitation UI
  - [ ] Role assignment and permission editing
  - [ ] User profile management (avatar, contact details, password reset)
  - [ ] Audit log viewer (per user and per organisation)

---

### Network Layer

- [ ] **Stage 7** — Network Node Management (`packages/mikrotik`)
  - [ ] Implement MikroTik RouterOS API v2 client (TypeScript)
  - [ ] tRPC router: CRUD for network nodes
  - [ ] Connection health check and status polling
  - [ ] Node provisioning wizard (IP, credentials, WireGuard key exchange)
  - [ ] Node management UI in admin dashboard

- [ ] **Stage 8** — Network Agent Service (`services/network-agent`)
  - [ ] Build on-premise agent as a Node.js service
  - [ ] WireGuard tunnel setup and key management
  - [ ] Agent registration and heartbeat protocol
  - [ ] Command relay: receive intents from platform and execute on router
  - [ ] Agent deployment guide (Docker / PM2)

- [ ] **Stage 9** — RADIUS Integration (`packages/radius`, `services/radius`)
  - [ ] FreeRADIUS database schema integration (radcheck, radreply, radusergroup)
  - [ ] Implement CoA (Change of Authorization) packet sender
  - [ ] Implement Disconnect-Message (DM) packet sender
  - [ ] RADIUS accounting receiver (parse Acct-Start/Stop/Interim-Update)
  - [ ] Session management tRPC router (list, terminate)
  - [ ] Session monitoring UI (real-time active sessions table)

---

### Subscriber & Plan Management

- [ ] **Stage 10** — Service Plan Management Module
  - [ ] tRPC router: CRUD for service plans
  - [ ] Speed profile mapping to MikroTik queue definitions
  - [ ] RADIUS group attribute mapping
  - [ ] Service plan list UI (data table, filters, sort)
  - [ ] Plan create/edit form with preview

- [ ] **Stage 11** — Subscriber Management Module
  - [ ] tRPC router: CRUD for subscribers
  - [ ] Subscriber create/edit form (profile, plan assignment)
  - [ ] Bulk subscriber import (CSV upload + validation)
  - [ ] Subscriber status management (activate, suspend, terminate)
  - [ ] Subscriber detail page (profile, subscriptions, sessions, invoices)
  - [ ] RADIUS user sync on subscriber create/update/suspend

- [ ] **Stage 12** — Voucher Management Module
  - [ ] tRPC router: voucher batch generation, listing, revocation
  - [ ] Voucher batch creation wizard (plan, quantity, prefix, pricing)
  - [ ] Voucher status tracking UI
  - [ ] PDF/CSV voucher export (print-ready format)
  - [ ] Voucher redemption on captive portal (integrated in Stage 14)

---

### Billing & Payments

- [ ] **Stage 13** — Billing Engine (`packages/billing`)
  - [ ] Automated billing cycle worker (BullMQ cron job)
  - [ ] Invoice generation (line items, tax, totals)
  - [ ] Prorated billing calculation for mid-cycle plan changes
  - [ ] Dunning management (overdue notice at D+1, D+3, D+7)
  - [ ] Invoice list and detail UI (PDF download)
  - [ ] Manual invoice creation and payment recording

- [ ] **Stage 14** — Payment Gateway Integration (`packages/payments`)
  - [ ] Pluggable payment adapter interface
  - [ ] Stripe adapter (checkout sessions, webhook handler)
  - [ ] Flutterwave adapter (payment initiation, webhook handler)
  - [ ] Paystack adapter (payment initiation, webhook handler)
  - [ ] M-Pesa adapter (STK push, callback handler)
  - [ ] Payment reconciliation and receipt generation

- [ ] **Stage 15** — Wallet & Credit System
  - [ ] Wallet creation on subscriber / reseller account setup
  - [ ] Wallet top-up flow (via payment gateways)
  - [ ] Deduction logic on plan purchase and voucher buying
  - [ ] Commission crediting for Resellers on sales
  - [ ] Wallet transaction history UI

---

### Customer-Facing Applications

- [ ] **Stage 16** — Captive Portal (`apps/captive-portal`)
  - [ ] Nginx configuration for captive portal redirect
  - [ ] Captive portal UI (voucher code, username/password login)
  - [ ] Voucher redemption → RADIUS authentication → MikroTik session open
  - [ ] Organisation branding applied dynamically (logo, colours)
  - [ ] Walled-garden page (free sites list)
  - [ ] Session status page (data remaining, time remaining)

- [ ] **Stage 17** — Customer Self-Service Portal (`apps/customer-portal`)
  - [ ] Customer portal bootstrap (Next.js, organisation-branded)
  - [ ] Customer registration and login (Supabase Auth)
  - [ ] Dashboard: current plan, data balance, session history
  - [ ] Plan purchase flow (online payment via configured gateway)
  - [ ] Voucher redemption from portal
  - [ ] Billing history and invoice download
  - [ ] Support ticket creation and tracking

---

### Support, Notifications & Analytics

- [ ] **Stage 18** — Notification Engine (`packages/notifications`)
  - [ ] Email dispatcher (SMTP / SendGrid adapter)
  - [ ] SMS dispatcher (Africa's Talking / Twilio adapter)
  - [ ] In-app notification store and UI (notification bell, read/unread)
  - [ ] Notification template management UI (per organisation)
  - [ ] Automated triggers: plan expiry, payment success, low balance

- [ ] **Stage 19** — Support Ticket System
  - [ ] tRPC router: CRUD for tickets and comments
  - [ ] Ticket creation UI (subscriber portal + admin dashboard)
  - [ ] Staff ticket queue UI (filters by status, priority, assignee)
  - [ ] Ticket assignment and escalation flow
  - [ ] SLA tracking and auto-close logic

- [ ] **Stage 20** — Analytics & Reporting
  - [ ] Analytics data aggregation worker (BullMQ daily job)
  - [ ] Revenue dashboard (MRR, ARR, collection rate, outstanding)
  - [ ] Subscriber dashboard (growth, churn, active/suspended counts)
  - [ ] Usage dashboard (data consumed per plan, per node, per period)
  - [ ] Voucher sales dashboard (sold, redeemed, expired rates)
  - [ ] CSV and PDF report export

---

### Integrations, Security & Launch

- [ ] **Stage 21** — API, Webhooks & White-Label
  - [ ] Public REST API (documented with OpenAPI / tRPC-to-OpenAPI)
  - [ ] API key management UI (create, scope, revoke)
  - [ ] Webhook endpoint management and delivery logs
  - [ ] Custom domain mapping and SSL provisioning (via Nginx + Certbot)
  - [ ] Full white-label branding pipeline (portal + emails)
  - [ ] Reseller Portal module (purchase, wallet, sales history)

- [ ] **Stage 22** — Production Hardening & Launch
  - [ ] End-to-end test suite (Playwright for critical user flows)
  - [ ] Unit test coverage for all packages (Vitest, >80%)
  - [ ] Security audit (OWASP top 10, RBAC penetration test)
  - [ ] Performance optimisation (query analysis, N+1 fixes, caching)
  - [ ] Infrastructure provisioning (Docker Compose production stack)
  - [ ] Monitoring & alerting setup (Sentry, Grafana, Uptime Kuma)
  - [ ] Backup & disaster recovery runbook
  - [ ] Production deployment and go-live checklist
  - [ ] Launch documentation (admin guide, API reference, onboarding guide)

---

## Stage Dependencies

```
Stage 0 (Spec)
  └── Stage 1 (Toolchain)
        ├── Stage 2 (Database)
        │     └── Stage 3 (Auth)
        │           ├── Stage 4 (Admin App)
        │           │     ├── Stage 5 (Org Mgmt)
        │           │     └── Stage 6 (User Mgmt)
        │           ├── Stage 7 (Network Nodes)
        │           │     └── Stage 8 (Network Agent)
        │           │           └── Stage 9 (RADIUS)
        │           ├── Stage 10 (Service Plans)
        │           │     └── Stage 11 (Subscribers)
        │           │           └── Stage 12 (Vouchers)
        │           └── Stage 13 (Billing)
        │                 ├── Stage 14 (Payments)
        │                 └── Stage 15 (Wallet)
        └── Stages 9+10+14+15 unlock:
              ├── Stage 16 (Captive Portal)
              ├── Stage 17 (Customer Portal)
              ├── Stage 18 (Notifications)
              ├── Stage 19 (Support)
              ├── Stage 20 (Analytics)
              ├── Stage 21 (API + White-Label)
              └── Stage 22 (Production Hardening)
```

---

## Estimated Timeline

| Stages | Focus Area | Estimated Duration |
|---|---|---|
| 0–3 | Foundation & Infrastructure | 1–2 weeks |
| 4–6 | Admin App Core | 1–2 weeks |
| 7–9 | Network Layer | 2–3 weeks |
| 10–12 | Subscriber & Plan Mgmt | 2 weeks |
| 13–15 | Billing & Payments | 2–3 weeks |
| 16–17 | Customer-Facing Apps | 2 weeks |
| 18–20 | Support, Notifications, Analytics | 2 weeks |
| 21–22 | API, White-Label, Production | 2–3 weeks |
| **Total** | | **~16–21 weeks** |
