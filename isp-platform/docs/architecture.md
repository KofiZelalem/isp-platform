# ISP-OS Platform Architecture

> **Stage 0 — Product Specification**  
> Version: 0.1.0 | Status: Draft

> **Reality check (2026-08-21 audit):** this document describes the original intended architecture. Actual implementation diverges in a few places — see [project-status.md](project-status.md) for current, evidence-based status. Known divergences: no tRPC layer (Server Actions + direct Prisma calls from `lib/api/*.ts` are used instead); UI kit is built on `@base-ui/react`, not Radix UI; no Supabase RLS policies exist (tenant isolation is application-level only via `createTenantClient`); monorepo uses plain pnpm workspaces, not Turborepo.

---

## 1. Overview

ISP-OS is a multi-tenant SaaS platform purpose-built for hotspot Internet Service Providers (ISPs). It consolidates subscriber management, network provisioning, billing, and analytics into a single unified platform, enabling multiple ISP organisations to operate independently on shared infrastructure without data leakage across tenants.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                              │
│  ┌────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │  Admin Web │  │ Customer Portal  │  │   Captive Portal      │  │
│  │  (Next.js) │  │    (Next.js)     │  │     (Next.js)         │  │
│  └─────┬──────┘  └────────┬─────────┘  └──────────┬────────────┘  │
└────────┼─────────────────┼─────────────────────────┼──────────────┘
         │                 │                         │
         ▼                 ▼                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY (Next.js API Routes / tRPC)      │
│              JWT + Supabase Auth  │  Rate Limiting  │  Audit Log   │
└────────────────────────┬───────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────────┐
         ▼               ▼                   ▼
┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐
│ Business     │  │  Billing &     │  │  Network Abstraction  │
│ Logic Layer  │  │  Payment Layer │  │  Layer (NAL)          │
│  (packages/) │  │  (packages/    │  │  (packages/mikrotik,  │
│              │  │   billing,     │  │   radius, services/   │
│              │  │   payments)    │  │   network-agent)      │
└──────┬───────┘  └───────┬────────┘  └──────────┬───────────┘
       │                  │                       │
       ▼                  ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                  │
│   PostgreSQL (via Supabase)   │   Prisma ORM   │   Redis Cache     │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                           │
│         Docker   │   Nginx (Reverse Proxy)   │   WireGuard VPN    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### 3.1 Frontend

| Technology | Role |
|---|---|
| **Next.js 14 (App Router)** | Server-side rendering, React Server Components, API Routes |
| **TypeScript** | End-to-end type safety |
| **shadcn/ui + Radix UI** | Accessible, headless component library |
| **Tailwind CSS** | Utility-first styling |
| **tRPC** | Type-safe RPC between Next.js client and server |
| **Zustand** | Lightweight client-side state management |
| **React Query / TanStack Query** | Server state, caching, and synchronisation |

### 3.2 Backend & API

| Technology | Role |
|---|---|
| **Next.js API Routes** | Primary REST/tRPC endpoint surface |
| **tRPC** | End-to-end typed procedure layer |
| **Zod** | Schema validation at API boundaries |
| **BullMQ + Redis** | Background job queues (billing cycles, notifications) |
| **Node.js Workers** | Long-running services (RADIUS daemon, network-agent) |

### 3.3 Database

| Technology | Role |
|---|---|
| **PostgreSQL** | Primary relational database |
| **Supabase** | Managed Postgres + Auth + Realtime + Storage |
| **Prisma ORM** | Type-safe schema definition, migrations, and query client |
| **Redis** | Session cache, BullMQ job store, rate-limit counters |

### 3.4 Authentication & Security

| Technology | Role |
|---|---|
| **Supabase Auth** | OAuth providers, magic links, JWT issuance |
| **RBAC Middleware** | Role & organisation-scoped access control |
| **Row-Level Security (RLS)** | Postgres-level multi-tenancy enforcement |
| **WireGuard** | Encrypted tunnels between cloud and on-premise MikroTik routers |

### 3.5 Infrastructure

| Technology | Role |
|---|---|
| **Docker + Docker Compose** | Containerised service orchestration |
| **Nginx** | Reverse proxy, SSL termination, captive portal redirect |
| **GitHub Actions** | CI/CD pipelines |
| **Turborepo** | Monorepo build orchestration and caching |

---

## 4. Monorepo Structure

```
isp-platform/               <- Turborepo root
├── apps/
│   ├── web/                <- Platform Admin dashboard (Next.js)
│   ├── customer-portal/    <- Self-service portal for subscribers
│   └── captive-portal/     <- Hotspot login/voucher redemption page
├── packages/
│   ├── database/           <- Prisma schema, migrations, seed scripts
│   ├── auth/               <- Auth helpers, session utilities, RBAC
│   ├── payments/           <- Payment gateway adapters (Stripe, Flutterwave, etc.)
│   ├── mikrotik/           <- MikroTik RouterOS API client (RouterOS API v2)
│   ├── radius/             <- FreeRADIUS dictionary, CoA/DM helpers
│   ├── billing/            <- Billing cycle engine, invoice generator
│   ├── notifications/      <- SMS, Email, Push notification dispatchers
│   └── shared/             <- Shared types, utilities, constants, errors
├── services/
│   ├── worker/             <- BullMQ job workers (scheduled tasks)
│   ├── radius/             <- Standalone FreeRADIUS integration service
│   └── network-agent/      <- On-premise agent for router communication
├── infrastructure/
│   ├── docker/             <- Dockerfiles and Compose definitions
│   ├── nginx/              <- Nginx configuration templates
│   └── wireguard/          <- WireGuard config and provisioning scripts
└── docs/                   <- All Stage 0 specification documents
```

---

## 5. Multi-Tenancy Model

Every tenant (ISP organisation) is isolated at multiple layers:

### 5.1 Application Layer
- Browser-admin routes resolve tenant context from the authenticated Supabase session via `apps/web/src/lib/auth.ts`: `getAuthContext()` loads the application `User`, and `requireCurrentOrganization()` upgrades that into a verified active `OrganizationContext`.
- The existing schema was preserved: a `User` has exactly one `organization_id`. There is no membership join table. Platform admins remain `User` rows, but `requireCurrentOrganization()` intentionally returns `null` for `PLATFORM_ADMIN`, forcing them onto explicit global-only code paths such as `requireRole("PLATFORM_ADMIN")`.
- Admin pages and server actions no longer resolve organizations from hardcoded slugs. The tenant id is taken only from the verified server-side session -> `User` -> `organization_id` chain.
- If a request carries an organization slug, it is treated as discovery only. `requireOrganizationSlugAccess(slug)` can be used to verify that the slug matches the authenticated user's organization before continuing.
- The public captive-portal route uses `resolvePublicOrganizationFromRequest()` instead of an authenticated tenant session. It derives the organization from request host/custom domain and optional local-dev slug, and rejects host/slug mismatches rather than trusting a client-submitted slug.
- The RADIUS REST bridge also treats `organizationSlug` as discovery only. `apps/web/src/lib/api-keys.ts` requires an org-scoped API key with the right scope (`radius:authorize` or `radius:accounting`) before a tenant client is created.

### 5.2 Database Layer
- **Prisma**: Every model that holds tenant data includes `organization_id UUID NOT NULL`.
- **Tenant client**: `createTenantClient(prisma, organizationId)` injects tenant filters on reads and rejects writes that try to supply a different `organization_id`.
- **Authorization boundary**: live application code constructs the tenant client only from server-verified context (`requireCurrentOrganization`, verified portal resolution, or org-scoped API key auth). Client-supplied `organization_id` values are ignored or rejected.
- **Testing**: the committed Vitest suite proves both the low-level tenant client behavior and the higher-level session/action/route authorization behavior.
- **Row-Level Security**: PostgreSQL RLS is still not implemented in this repository. The current isolation guarantee is application-level, not database-native RLS.
- **Schema**: A single shared schema (no schema-per-tenant) for operational simplicity and easier cross-tenant analytics by Platform Admins.

### 5.3 Network Layer
- Each organisation owns one or more `NetworkNode` records (MikroTik/RADIUS servers).
- The RADIUS REST bridge now authenticates with org-scoped API keys before relaying authorization/accounting traffic into tenant-scoped queries.

## 6. Customer CRM

Customer management is implemented as organization-scoped server actions and server-rendered queries over the existing `Subscriber` model. `apps/web/src/app/(admin)/admin/customers/actions.ts` validates and normalizes create/update input, derives organization access with `requireCurrentOrganization()`, and uses `createTenantClient()` for create, update, and soft-delete operations. The list uses URL-driven search, status filtering, and pagination; the detail route reads only existing subscription, payment, session, usage, and timestamp relations. No Device model exists in the current schema, so no new device abstraction was introduced during Stage 5.

## Package & Subscription Engine

`ServicePlan` is the package aggregate and remains organization-owned. Package actions validate price, duration, supported plan type/period, and existing data/bandwidth limits; edits, activation toggles, and safe soft-archive all use `requireCurrentOrganization()` and `createTenantClient()`. Package currency is inherited from `Organization.currency`, avoiding duplicated currency configuration.

`Subscription` is the entitlement aggregate connecting a tenant-owned `Subscriber` to a tenant-owned `ServicePlan`. `packages/billing/src/subscriptions.ts` verifies both relations through the tenant client before assignment. Assignment creates `PENDING`; `activateSubscription()` is the explicit payment/operator boundary that transitions to `ACTIVE` and computes UTC expiry from the plan validity. `expireSubscriptions()` is a server-side operation for a future worker or cron caller. No payment confirmation, recurring billing, voucher redemption, or new network functionality is implemented in Stage 6.

## Billing & Payment Settlement

`Payment` is the durable billing-attempt record. Initiators create a linked pending subscription and payment using server-derived customer, package, amount, currency, and a unique internal reference before redirecting to Paystack. The provider reference is stored separately after settlement. The webhook first verifies the Paystack signature, then calls Paystack transaction verification and compares provider status, reference, amount, and currency with the stored payment. `settlePaystackPayment()` atomically claims only a pending payment and activates its linked subscription through the Stage 6 state machine. Repeated or concurrent delivery cannot create a second successful payment or subscription. Failed signed notifications record failure details without activation.

The migration `packages/database/prisma/migrations/20260821152000_billing_payment_idempotency/migration.sql` adds `Payment.internal_reference`, `Payment.subscription_id`, `payment_method`, and `failure_reason`, backfills legacy internal references, and adds the required indexes/foreign key. No invoice-generation or recurring billing system was added in Stage 7.

## Payment System Adapter Boundary

Stage 8 introduces `packages/payments/src/provider.ts` with one strict `PaymentProvider` contract: initialize payment, verify a provider transaction, and parse a signed webhook event. `PaystackProvider` implements the contract without changing Paystack endpoints, headers, payloads, or signature verification. The provider interface contains no tenant fields; organization ownership remains the responsibility of the authenticated service layer and tenant-scoped client.

`toMinorUnits()` parses Prisma Decimal/string values into exact integer minor units. JavaScript floating-point conversion is deliberately avoided because many decimal fractions cannot be represented exactly by `Number`. Payment initialization calls Paystack before local subscription/payment creation, preventing a failed provider request from leaving a local pending subscription. A provider success followed by a local database failure requires operational reconciliation using the internal reference.

`MockPaymentProvider` is explicitly test-only. The contract suite runs the same 14 assertions against both the Paystack adapter with mocked HTTP and the no-network mock. Stage 8 does not add another provider, provider selection UI, refunds, invoices, recurring billing, or reconciliation tooling.

## Voucher & Access Code System

Stage 9 uses the existing `VoucherBatch`, `Voucher`, and `VoucherUse` models. Authenticated admin actions derive tenant context through `requireCurrentOrganization()` and `createTenantClient()`. Batch generation validates the active package, quantity, prefix, and selling price, then generates secure ambiguity-resistant codes. The captive portal resolves its organization through the verified public resolver and redeems only codes whose conditional status claim succeeds, preventing concurrent single-use reuse before subscription activation and usage auditing.

The admin surface provides batch status counts, individual code inspection, individual/batch revocation for unused codes, and authenticated CSV export. The current schema does not represent remaining uses, so multi-use vouchers and PDF output remain future work; no speculative schema change was introduced.

## Network Abstraction

Stage 10 introduces the provider-independent `NetworkProvider` contract in `packages/network`. It owns connection lifecycle, subscriber isolation/restoration, active-session disconnect, enforceable rate policy, and status reporting. The contract intentionally has no organization identifier; `applySubscriptionPolicy()` remains responsible for tenant-scoped database reads and injects a provider for each organization-owned network node.

`MikroTikNetworkProvider` implements the contract by composing the existing RouterOS client and policy functions. `MockNetworkProvider` records operations without network access, allowing policy behavior to be tested independently of RouterOS. The current default remains MikroTik, so existing Stage 6 subscription status actions preserve their behavior while no longer coupling orchestration directly to the RouterOS client. Real-router validation and a future RADIUS provider implementation remain later work.

Stage 11 adds an in-process RouterOS TCP emulator test for the existing client: connection, plain login, command transmission, separate `!re`/`!done` response sentences, and attribute parsing are exercised without claiming real hardware interoperability. The admin session-disconnect path also uses `MikroTikNetworkProvider`, leaving RouterOS-specific construction inside the adapter.
- The `network-agent` service is still a placeholder, but the same org-scoped API key model is the intended machine-to-machine pattern.

---

## 8. Business Logic vs. Network Abstraction Layer (NAL)

A critical design principle is the **strict separation** between business logic and network operations.

### 6.1 Business Logic Layer (`packages/`)
Handles all domain concerns:
- Subscriber lifecycle (create, suspend, activate, terminate)
- Plan & quota management
- Invoice generation & payment processing
- Notification dispatch
- Reporting & analytics

Business logic **never** speaks directly to routers or RADIUS servers. It emits **intents** (structured commands) to the NAL.

### 6.2 Network Abstraction Layer (NAL)
Accepts intents from the business layer and translates them into router-specific commands:

```
Business Logic          NAL                   Physical Device
──────────────    ──────────────────────    ──────────────────
suspendCustomer -> NetworkIntent.SUSPEND  -> MikroTik: /ip/hotspot/user/set disabled=yes
activateCustomer -> NetworkIntent.ACTIVATE -> RADIUS: Send CoA packet (Session-Timeout update)
addVoucher       -> NetworkIntent.ADD_USER -> MikroTik: /ip/hotspot/user/add
```

The NAL package (`packages/mikrotik`, `packages/radius`) implements adapters for each device type. Adding support for a new router vendor (e.g., Cisco, Ubiquiti) requires only a new adapter — zero changes to business logic.

---

## 9. Data Flow: Customer Authentication (Captive Portal)

```
[Customer Device]
      | HTTP request to any URL
      v
[Nginx/RouterOS] -- captive redirect --> [apps/web /portal]
                                                      |
                                    verified tenant + login/voucher action
                                                      |
                                    packages/radius authorization decision
                                                      |
                                    signed tenant-scoped portal state
                                                      |
                    [TRUSTED NAS HANDOFF: configuration and implementation pending]
                                                      |
                              MikroTik hotspot login -> FreeRADIUS Access-Accept/Reject
                                                      |
                                    MikroTik opens the network path
                                                      |
                              RADIUS Accounting Start/Update/Stop
                                                      |
                              apps/web RADIUS bridge -> Session records
```

The implemented portal owns tenant discovery, subscription authorization, voucher redemption, signed short-lived browser state, safe destination handling, throttling, and a POST handoff to the tenant-owned `NetworkNode.hotspot_login_url`. The endpoint is validated against the registered node address and is never accepted from the browser. The portal does not create a normal network session or claim network access; RouterOS and FreeRADIUS remain responsible for final authentication and accounting.

---

## 8. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo tooling | Turborepo | Fast incremental builds, shared package caching |
| ORM | Prisma | Type-safe queries, excellent migration tooling, Supabase-compatible |
| Auth provider | Supabase Auth | Managed JWT, OAuth, MFA — reduces auth complexity |
| API style | tRPC over REST | End-to-end types eliminate schema drift between client and server |
| Job queue | BullMQ + Redis | Battle-tested, supports delayed/cron jobs needed for billing cycles |
| Router protocol | RouterOS API v2 + RADIUS CoA | Industry standard; supports real-time session management |
| Tenant isolation | Shared DB + RLS | Lower cost than schema-per-tenant; Supabase RLS provides strong guarantees |

---

## 9. MikroTik Integration and Protocol Handling

Stage 11 adds an in-process RouterOS TCP emulator test for the existing client: connection, plain login, command transmission, separate `!re`/`!done` response sentences, and attribute parsing are exercised without claiming real hardware interoperability. The admin session-disconnect path also uses `MikroTikNetworkProvider`, leaving RouterOS-specific construction inside the adapter.

---

## 10. RADIUS Authentication, Authorization, and Accounting

Stage 12 hardens the existing RADIUS boundary by validating inputs, enforcing tenant authorization, and deriving authorization attributes from plan configuration. PAP/CHAP/MS-CHAPv2 authentication and Start/Update/Stop accounting operations are validated before reaching crypto or database layers. Authorization-Response includes only database-backed attributes (`Session-Timeout`, `User-Group`, `Mikrotik-Group`, `Mikrotik-Rate-Limit`) without accepting client-supplied identifiers. Accounting operations are tenant-scoped and idempotent by `Acct-Session-Id`.

The existing `/api/radius/authorize` and `/api/radius/accounting` routes require org-scoped API keys with matching scopes. A new `RadiusControlClient` provides RFC 5176 CoA and Disconnect-Message infrastructure with HMAC-MD5 request authenticator generation and response authenticator verification without embedding tenant authority.
