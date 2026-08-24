# ISP-OS Roadmap (Canonical, 23-Stage)

> This is the canonical stage roadmap going forward, aligned to the master project specification. It supersedes the stage numbering in [development-roadmap.md](development-roadmap.md) (kept for historical reference only — its Stage N labels do not match this document's).
>
> Status is evidence-based as of the 2026-08-21 audit — see [project-status.md](project-status.md) for details and blockers. A stage is only ✅ when its exit criteria are demonstrated, not merely when code exists.

| # | Stage | Status |
|---|---|---|
| 0 | Product Specification | 🟢 Complete |
| 1 | Development Foundation | 🟡 In progress (minimal Vitest suite exists; still no CI) |
| 2 | Application Shell & Design System | 🟢 Complete |
| 3 | Database Architecture | 🟢 Complete (no migrations tracked, no RLS) |
| 4 | Multi-Tenancy | 🟢 Complete (session-derived org context, verified portal discovery, org-scoped RADIUS API keys, 18 Stage 4 regression tests) |
| 5 | Customer CRM | 🟢 Complete (tenant-scoped CRUD, search/filter/pagination, detail profile, 24 passing tests) |
| 6 | Package & Subscription Engine | 🟢 Complete (tenant-scoped package lifecycle, subscription activation/expiry, 33 passing tests) |
| 7 | Billing Engine | 🟢 Complete (durable payment records, verified Paystack settlement, idempotency, billing UI, 42 passing tests) |
| 8 | Payment System | 🟢 Complete (Paystack provider contract, decimal-safe money conversion, orphan-safe initialization, 57 passing tests) |
| 9 | Voucher & Access Code System | 🟢 Complete (tenant-scoped generation, single-use redemption, revocation, status tracking, CSV export, 63 passing tests) |
| 10 | Network Abstraction | 🟢 Complete (NetworkProvider contract, MikroTik adapter, injectable policy orchestration, 66 passing tests) |
| 11 | MikroTik Integration | 🟢 Complete* (RouterOS client, NetworkProvider adapter, policy/session integration, emulator validation; hardware validation pending) |
| 12 | RADIUS | � Complete* (authentication/accounting validation, plan-backed authorization attributes, cross-tenant security, accounting idempotency, control packet infrastructure; FreeRADIUS server validation pending) |
| 13 | Network Policy Engine | 🟢 Complete* (policy transitions, plan-backed enforcement, encrypted credentials, and canonical reseller schema reconciliation implemented; real hardware validation remains) |
| 14 | Captive Portal | 🟢 Complete* (software implementation complete in-repo; real NAS/FreeRADIUS validation remains environment-dependent) |
| 15 | Session & Usage Accounting | 🟢 Complete* (live admin sessions + usage views, filtering/export/operational alerts, scheduled definitions, transaction-backed execution, persisted delivery events, authenticated internal jobs, recurring worker service, and deduplicated alert delivery implemented; provider credentials and deployment environment remain operational prerequisites) |
| 16 | Secure Remote Router Management | 🟢 Complete* (code-level network-agent HMAC control channel, WireGuard lifecycle/health, tenant-safe router checks, subscriber isolation/restoration, server-derived rate-policy application, remote session disconnect/reconnect, durable heartbeat persistence, stale detection, and admin agent health monitoring implemented; real tunnel/router deployment validation remains) |
| 17 | Notifications | 🟢 Complete* (tenant provider settings, encrypted credentials, configured dispatch, persisted delivery history, retry-linked attempts with atomic counters and admin retry controls, provider test controls, scheduled-report/operational-alert delivery, and recurring worker execution implemented; live external provider verification remains) |
| 18 | Staff & Reseller System | 🟢 Complete* (canonical ResellerProfile administration, commission editing, reseller activation, secure invitations with expiry/resend/revoke, Supabase activation, STAFF/RESELLER role and granular permission management, tenant customer assignment, reseller customer search/onboarding/editing with package assignment, voucher inventory/revocation, commission activity, payout lifecycle, audit records, and reseller termination implemented; real payout-provider deployment remains) |

| 19 | Analytics | 🟢 Complete* (tenant-scoped revenue, subscriber health, ARPU, bandwidth, daily revenue, package popularity, router usage, subscriber growth/churn, payment-status totals, peak session concurrency, duration buckets, voucher/reseller performance, authenticated CSV export, operational KPIs, and robust median-slope forecasts with confidence/quality indicators implemented; ongoing forecast calibration remains operational work) |
| 20 | Platform Administration | 🟢 Complete* (organization status/detail management, allowlisted feature flags, system health/detail checks, filtered audit viewer/export, and audited platform controls implemented; production monitoring remains) |
| 21 | Security & Production Hardening | 🟡 In progress (distributed portal rate limiting, runtime secret validation, security headers, and CI checks implemented; schema validation, CSRF, backups, scanning, and deployment hardening remain) |
| 22 | Commercial SaaS | ⬜ Not started |

## Immediate priority order

1. **Stage 21 continuation** — add schema-based request validation, CSRF protections, dependency/security scanning, backup/restore checks, and production deployment hardening.
2. Reconcile `Reseller` vs `ResellerProfile` schema duplication.
3. Replace Base64 "encryption" of any remaining legacy router/RADIUS credentials with real encryption at rest.
4. Run the RADIUS, MikroTik, WireGuard, and network-agent flows against real services/hardware; current verification is still code-level only.
