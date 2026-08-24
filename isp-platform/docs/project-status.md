# ISP-OS Project Status

> Last audited: 2026-08-21
> This is the living status document required by the project's master development process. Update it at the start and end of every major session.

---

## CURRENT STAGE

**Stage 21 — Security & Production Hardening** is the next active implementation stage. Stages 15, 17, 18, 19, and 20 are complete at the application-code level, with deployment/provider prerequisites documented below.

Stage 14 software implementation is complete in-repo (public organization discovery, voucher/payment/login portal flows, signed tenant-scoped state, safe destination handling, abuse throttling, tenant-owned RouterOS handoff contract, `/portal/connected` evidence route, and dedicated `apps/captive-portal` forwarding runtime). The remaining Stage 14 item is external hardware interoperability evidence in a real NAS/FreeRADIUS environment.

Stage 15 now has live admin session and usage views backed by tenant-scoped `Session` data, including active session operations, recent session accounting history, usage windows (7d/30d/all), server-side filtered session history (status/date range/subscriber search/router), CSV export, operational session alerts, scheduled report execution, durable Report artifacts, persisted delivery events, authenticated internal jobs, a recurring worker service, and deduplicated in-app alert delivery. External provider credentials and deployment environment configuration remain operational prerequisites.

### Stage 14 Implementation Checklist

- [x] Tenant-scoped signed portal auth cookie validation + safe redirect.
- [x] Shared abuse throttling for portal login, voucher redemption, and payment initiation.
- [x] Trusted NAS handoff contract with allowlisted/sanitized RouterOS fields.
- [x] In-app post-authentication session evidence route (`/portal/connected`) backed by tenant-scoped `Session` records.
- [x] Runtime decision implemented: dedicated `apps/captive-portal` runtime with allowlisted forwarding into `apps/web /portal`.
- [ ] Real NAS/FreeRADIUS interoperability evidence (hardware-backed).

Stage 13 code-level implementation is complete: network policy transitions, plan-backed rate/time enforcement, encrypted router credentials, and canonical `ResellerProfile` schema reconciliation are implemented and validated. Real MikroTik hardware validation remains environment-dependent.

## STAGE STATUS

| Stage | Name | Status | Notes |
|---|---|---|---|
| 0 | Product Specification | 🟢 COMPLETE | docs exist, usable as living spec |
| 1 | Development Foundation | 🟡 IN PROGRESS | app runs, DB connects, minimal Vitest suite now exists; still no CI or lint pre-commit hook |
| 2 | App Shell & Design System | 🟢 COMPLETE | admin/platform/customer layouts, sidebar, shadcn-style kit on base-ui |
| 3 | Database Architecture | 🟢 COMPLETE | schema covers all core entities; no migrations folder found, no RLS |
| 4 | Multi-Tenancy | 🟢 COMPLETE | tenant context now resolves from authenticated session; portal resolves org by verified host/slug; RADIUS bridge requires org-scoped API keys; 18 regression tests pass |
| 5 | Customer CRM | 🟢 COMPLETE | organization-scoped list/search/filter/pagination, create/edit/soft-delete, detail profile, 24 tests pass |
| 6 | Package & Subscription Engine | 🟢 COMPLETE | package CRUD/lifecycle, pending-to-active subscriptions, UTC expiry, cross-tenant tests; 33 tests pass |
| 7 | Billing Engine | 🟢 COMPLETE | durable payment attempts, trusted settlement, idempotency, failed-payment handling, billing UI |
| 8 | Payment System | 🟢 COMPLETE | strict Paystack provider adapter, decimal-safe money, orphan-safe initialization, 14 contract tests; 57 total tests pass |
| 9 | Voucher & Access Code System | 🟢 COMPLETE | tenant-scoped generation, single-use redemption, revocation, status tracking, CSV export |
| 10 | Network Abstraction | 🟢 COMPLETE | provider contract, MikroTik implementation, injectable policy boundary, mock coverage |
| 11 | MikroTik Integration | 🟢 COMPLETE* | RouterOS client, MikroTik NetworkProvider, policy/session integration, TCP emulator test; real hardware validation pending |
| 12 | RADIUS | � COMPLETE* | authentication (PAP/CHAP/MS-CHAPv2), accounting (Start/Update/Stop), CoA/Disconnect control packets, tenant-scoped REST bridge; real FreeRADIUS server validation pending |
| 13 | Network Policy Engine | 🟢 COMPLETE* | policy transitions, zero-rate suspension, plan-backed speed/time-limit enforcement, AES-256-GCM credential storage, and canonical `ResellerProfile` schema reconciliation validated; real hardware validation pending |
| 14 | Captive Portal | 🟢 COMPLETE* | tenant-owned RouterOS POST handoff, shared RADIUS authorization, signed state, throttling, safe destinations, connected evidence route, and dedicated captive-portal runtime implemented; real NAS/FreeRADIUS validation pending |
| 15 | Session & Usage Accounting | 🟢 COMPLETE* | RADIUS accounting writes Session rows; admin sessions include live active + recent history, server-side filters, CSV export, operational alerts, scheduled definitions, transaction-backed due execution, report artifacts, persisted delivery events, authenticated internal jobs, and a recurring worker service |
| 16 | Secure Remote Router Management | 🟢 COMPLETE* | Code-level network-agent HMAC control channel, WireGuard lifecycle/health, tenant-safe router checks, subscriber isolation/restoration, server-derived rate-policy application, remote session disconnect/reconnect, durable heartbeat persistence, stale detection, and admin agent health monitoring are implemented; real tunnel/router deployment validation remains |
| 17 | Notifications | 🟢 COMPLETE* | Tenant provider settings, encrypted email/SMS credentials, configured server-side dispatch, persisted notification history, retry-linked delivery attempts with atomic counters, admin retry controls, provider test controls, scheduled-report delivery, deduplicated operational-alert delivery, and recurring worker execution are implemented; live external provider verification remains |
| 18 | Staff & Reseller System | 🟢 COMPLETE* | ResellerProfile is canonical; tenant admins can create profiles, edit commission rates, enable/disable reseller users, issue hashed invitations with resend/revoke/expiry, activate users through Supabase, manage roles and granular permissions, assign tenant customers, and view customer/voucher/commission activity; reseller users have scoped customer search, customer onboarding/editing with optional package assignment, voucher inventory visibility, own-inventory revocation, payout request/approval/payment, and termination workflows; real payout-provider deployment remains |
| 19 | Analytics | 🟢 COMPLETE* | Tenant analytics page/API provide date-range revenue/growth, active subscriber health, ARPU, bandwidth, daily revenue, package popularity, router usage, subscriber growth/churn, payment-status totals, peak concurrency, session-duration buckets, voucher/reseller performance, authenticated CSV export, operational KPIs, and robust median-slope forecasts with confidence/quality indicators; ongoing forecast calibration remains operational work |
| 20 | Platform Administration | 🟢 COMPLETE* | Platform admin organization status/detail management, allowlisted feature flags, database/configuration/agent health checks, filtered audit visibility/export, and audited operational controls are implemented; production monitoring remains |
| 21 | Security & Production Hardening | 🟡 IN PROGRESS | Redis-backed distributed portal rate limiting with bounded fallback, runtime production-secret validation, baseline security headers, and GitHub Actions CI are implemented; input validation, CSRF strategy, backups, and deployment hardening remain |
| 22 | Commercial SaaS | ⬜ NOT STARTED | no self-serve signup/onboarding wizard, no platform billing plans |

Legend: ⬜ NOT STARTED · 🟡 IN PROGRESS · 🔵 BLOCKED · 🟢 COMPLETE · 🔴 FAILED / NEEDS REWORK

\* Code-level completion is verified; real RouterOS/FreeRADIUS hardware validation remains outstanding.

---

## STAGE 4 REMEDIATION SUMMARY

- **What changed:** all protected admin pages and server actions now derive their tenant from a single server-side organization context in `apps/web/src/lib/auth.ts` instead of from hardcoded slugs. The public portal moved to `apps/web/src/lib/organizations.ts`, which resolves an active organization from request host and optional local-dev slug and rejects host/slug mismatches. The RADIUS REST bridge now requires org-scoped API keys, so `organizationSlug` is only a routing hint, not proof of authorization.
- **User to organization model:** the existing schema was preserved. `users.organization_id` is required, so each user belongs to exactly one organization. There is no many-to-many membership table. Platform admins are still represented as `User` rows, but under a dedicated `isp-os-platform` organization and are explicitly denied tenant-scoped context by `requireCurrentOrganization()`.
- **Tests added:** Vitest in `apps/web`, with 33 passing tests covering DB-level tenant client scoping, admin action scoping, authenticated organization resolution, portal host/slug verification, org-scoped API key checks, platform-admin-only global access, package management, and subscription lifecycle.
- **Security implications:** the app no longer trusts hardcoded organization slugs, client-supplied `organization_id`, or unauthenticated `organizationSlug` values for authorization. Browser admin routes trust only the authenticated session -> application user -> `organization_id` chain. Machine-to-machine RADIUS routes trust only org-scoped API keys plus scope checks. Public portal discovery still uses slug/host, but slug is verified against host before any organization is accepted.
- **Remaining Stage 4 issues:** no open Stage 4 blockers remain in production application code. Remaining risks are outside Stage 4 proper: no API-key rotation UI, no CI, and no real MikroTik/FreeRADIUS end-to-end validation.
- **Stage 4 status:** COMPLETE.

## STAGE 5 CRM SUMMARY

- **Features implemented:** customer list with search, status filtering, pagination, package and recent activity columns; validated create/edit/soft-delete server actions; customer detail profile with contact information, status, notes, timestamps, active subscription, package, usage, payment history, and recent sessions.
- **Organization isolation:** every CRM read and mutation obtains `requireCurrentOrganization()` and uses `createTenantClient()`. Client organization_id values are ignored, usernames are unique within the existing organization compound key, and cross-tenant update/delete requests resolve as not found.
- **Schema decision:** no Prisma schema change was required. The existing Subscriber model already owns the supported CRM fields and relations. No Device model exists in the current schema, so the CRM does not fabricate device records; recorded session IP/MAC values are shown as the available device activity.
- **Tests added:** `apps/web/src/app/(admin)/admin/customers/actions.test.ts` adds six create/update/delete, spoofing, cross-tenant, and authentication tests. The full suite now has 24 passing tests across 7 files.
- **Stage 5 status:** COMPLETE.

## STAGE 6 PACKAGE & SUBSCRIPTION SUMMARY

- **Package model:** the existing `ServicePlan` model already supports organization ownership, name, description, price, plan type, period, validity days, data/bandwidth limits, public visibility, active state, and soft deletion. Currency follows the existing organization-level `Organization.currency` convention; no duplicate package currency field was added.
| 6 | Package & Subscription Engine | 🟢 COMPLETE | package CRUD/lifecycle, pending-to-active subscriptions, UTC expiry, cross-tenant tests; 33 tests pass; Stage 6 follow-up gaps remain outside its required exit criteria: expiration needs a scheduled worker/cron caller, recurring billing is not implemented, and package currency remains organization-level. |
| 7 | Billing Engine | 🟢 COMPLETE | durable payment attempts, Paystack verification, idempotent settlement, failed-payment recording, tenant billing UI; 42 tests pass |
- **Subscription lifecycle:** persisted states remain `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, and `CANCELLED`. Assignment creates `PENDING`; `activateSubscription()` performs explicit activation and calculates `expires_at`; `expireSubscriptions()` marks passed active entitlements `EXPIRED`. `EXPIRING` remains computed, and no duplicate `TERMINATED` state was added.
- **Authorization:** assignment verifies both subscriber and plan through the same tenant-bound client. Payment and voucher callers explicitly activate only after their own confirmation/redemption boundaries; Stage 6 does not fake payment success.
- **Tests:** package action and subscription engine tests cover package CRUD/security, invalid values, archive safety, cross-tenant customer rejection, pending-to-active activation, and UTC expiration. The full suite is 33 passing tests across 9 files.
- **Schema decision:** no Prisma schema change or migration was required. The existing package/subscription schema supports Stage 6 without snapshot duplication or a speculative Device model.
- **Stage 6 status:** COMPLETE.

## STAGE 7 BILLING SUMMARY

- **Billing records:** `Payment` now stores a unique internal reference, optional linked subscription, provider reference, payment method, failure reason, amount, currency, status, and timestamps. Payment initiation creates the pending Stage 6 subscription and payment before provider checkout; amount and currency come from the tenant-owned plan and organization.
- **Provider boundary:** Paystack initialization, checkout, signed webhook receipt, provider-side transaction verification, internal settlement, and Stage 6 subscription activation are separate steps. Browser callback data is not trusted as proof of payment.
- **Idempotency:** the webhook looks up the unique internal reference, verifies the transaction, then conditionally updates only `PENDING` payments. Concurrent or repeated delivery cannot claim the same payment twice. A retry can finish activation for a payment already marked successful but with a still-pending linked subscription.
- **Failed payments:** signed `charge.failed` notifications mark only the matching pending payment as `FAILED` with a failure reason and never activate its subscription.
- **Admin/customer surfaces:** `/admin/payments` provides organization-scoped status/reference/customer filtering and payment/subscription details. Customer profiles show provider references, related package, payment status, and payment history.
- **Schema decision:** a migration was required because the previous Payment model could not durably link a payment to its subscription or distinguish an internal reference from a provider reference. Migration `20260821152000_billing_payment_idempotency` adds and backfills those fields and indexes.
- **Tests:** payment initiation, settlement, failure, idempotency, authenticated admin initiation, package/customer validation, and existing Stage 4-6 isolation tests now total 42 passing tests across 12 files.
- **Stage 7 status:** COMPLETE.

## STAGE 8 PAYMENT SYSTEM SUMMARY

- **Provider contract:** `packages/payments/src/provider.ts` defines the strict three-method `PaymentProvider` interface: `initializePayment`, `verifyTransaction`, and `parseWebhookEvent`, with typed inputs, outputs, statuses, metadata, and `PaymentProviderError`.
- **Paystack adapter:** `PaystackProvider` now owns Paystack initialization, transaction verification, and HMAC-signed webhook parsing. Existing Stage 7 helper exports remain available for compatibility, while application webhook code uses the adapter.
- **Money conversion:** `toMinorUnits()` parses Prisma Decimal/string values as integer whole/fraction parts. It no longer converts through JavaScript `Number`, which cannot represent many decimal fractions exactly.
- **Initialization ordering:** Paystack checkout is initialized before local subscription/payment writes. This prevents provider failures from leaving locally orphaned pending subscriptions. The tradeoff is that a database failure after provider success requires reconciliation using the internal reference.
- **Testing:** `MockPaymentProvider` is test-only and never performs HTTP. The shared provider contract runs 14 cases against both Paystack and the mock. The full suite now has 57 passing tests across 13 files.
- **Schema decision:** no Prisma schema or migration changes were made in Stage 8.
- **Stage 8 status:** COMPLETE.

## STAGE 9 VOUCHER SUMMARY

- **Voucher model:** the existing `VoucherBatch`, `Voucher`, and `VoucherUse` models were used without schema changes. Batches reference active tenant packages and store quantity, prefix, selling price, and reseller attribution; individual codes store lifecycle status and redemption metadata.
- **Generation:** secure random codes use an ambiguity-resistant alphabet and validate length, quantity, price, and prefix server-side. Package and reseller relationships are checked through the tenant client.
- **Redemption:** portal redemption resolves the public organization through the existing Stage 4 host/slug resolver. A conditional status claim changes only `GENERATED` or `SOLD` codes to `REDEEMED`, preventing concurrent reuse before the Stage 6 subscription is activated and a `VoucherUse` audit record is written.
- **Administration:** `/admin/vouchers` shows batch status breakdowns; `/admin/vouchers/[id]` lists individual codes and supports individual/batch revocation. CSV export is available at `/admin/vouchers/[id]/export` and is authenticated and tenant-scoped.
- **Schema decision:** the current schema has no use-limit field, so Stage 9 implements the existing single-use model. Multi-use vouchers require a future explicit schema change rather than implied UI behavior.
- **Tests:** voucher-domain tests cover secure code generation, concurrent redemption rejection, successful redemption, and portal subscription linkage. Admin action tests cover tenant-scoped individual/batch revocation and unauthenticated denial. The full suite now has 63 passing tests across 15 files.
- **Stage 9 status:** COMPLETE.

## STAGE 10 NETWORK ABSTRACTION SUMMARY

- **Provider contract:** the new `packages/network` workspace package defines `NetworkProvider` with connect/disconnect, subscriber isolation/restoration, subscriber disconnect, rate-policy application, and connection status operations. Its types contain no organization context; tenant authorization remains in the calling service layer.
- **Production adapter:** `MikroTikNetworkProvider` implements the contract by reusing the existing RouterOS client, credential decoder, firewall address-list, hotspot disconnect, and simple-queue policy primitives. No RouterOS protocol behavior was duplicated or changed.
- **Policy orchestration:** `applySubscriptionPolicy()` now accepts an injectable provider factory and defaults to MikroTik. Suspension, restoration, session termination, and router error notifications retain their prior behavior while the business policy no longer directly constructs or commands RouterOS.
- **Mock:** `MockNetworkProvider` records operations and connection status deterministically for tests; it performs no network calls.
- **Tests:** added network contract and MikroTik policy tests proving provider operations, suspend/restore injection, session termination, error-free policy results, and absence of direct RouterOS calls in orchestration. The full suite now has 66 passing tests across 17 files.
- **Schema decision:** no Prisma schema or migration changes were required.
- **Stage 10 status:** COMPLETE.

## STAGE 11 MIKROTIK INTEGRATION SUMMARY

- **RouterOS client:** the existing RouterOS API client handles TCP connection, plain post-6.43 login, sentence framing, replies, traps, timeouts, and cleanup.
- **Integration:** `MikroTikNetworkProvider` implements the Stage 10 contract using existing address-list, hotspot disconnect, and simple-queue operations. Subscription policy and admin session disconnect now use the provider boundary rather than constructing `RouterOsClient` in application code.
- **Verification:** an in-process TCP RouterOS emulator test exercises connection, login, command transmission, separate `!re`/`!done` reply framing, and parsed attributes. Full protocol encoding/decoding remains covered by existing code-level validation.
- **Security/operations:** tenant-scoped session/node records still determine which router is contacted; credentials remain decoded only inside the adapter. No client-supplied router or tenant identifiers are used by the policy path.
- **Known validation gap:** no real RouterOS device is available in this environment, so hardware interoperability, RouterOS version differences, TLS/API-SSL mode, and real firewall/queue effects remain unverified.
- **Stage 11 status:** COMPLETE at the implementation/emulator-validation level; real hardware sign-off remains required before production deployment.

## STAGE 12 RADIUS SUMMARY

- **Authentication:** PAP, CHAP, and MS-CHAPv2 methods with server-side password verification against `Subscriber.password_hash`. Input validation rejects truncated CHAP/MS-CHAPv2 packets without touching crypto routines. RADIUS Authorization-Response returns 25 (Access-Accept) or 3 (Access-Reject).
- **Authorization attributes:** tenant-scoped `ServicePlan` attributes (validity days, speed limits, plan group, MikroTik profile) are extracted and returned as RADIUS reply attributes (`Session-Timeout`, `User-Group`, `Mikrotik-Group`, `Mikrotik-Rate-Limit`) with time limits bounded by subscription expiry. Client-supplied group/profile identifiers are rejected in favor of database values.
- **Accounting:** Start/Update/Stop processing with full tenant-scoped validation of `subscriberId`, `nodeId`, and counter integrity before session creation/update. Duplicate `Acct-Session-Id` is idempotent (returns existing session). Accounting-Response always returns code 2 (Accounting-Response).
- **REST security:** Authorization and accounting routes require org-scoped API keys with matching scopes (`radius:authorize`, `radius:accounting`). Client-supplied `organizationId` is rejected; scope checks prevent cross-tenant accounting operations.
- **Control packets:** `RadiusControlClient` sends RFC 5176 CoA (40) and Disconnect-Message (44/45) packets with HMAC-MD5 request authenticator generation and response authenticator verification.
- **Tests:** authentication input validation, accounting cross-tenant denial, accounting idempotency, plan-backed authorization attributes, malformed packet rejection, and RFC 5176 response verification. The full suite now has 77 passing tests across 21 files.
- **Schema decision:** no Prisma schema or migration changes were required.
- **Known validation gap:** no real FreeRADIUS server is available in this environment, so Access-Request/Reject, Accounting-Request/Response packet interoperability, CoA acknowledgment, and Disconnect-Message behavior remain unverified.
- **Stage 12 status:** COMPLETE at the implementation/protocol-validation level; real FreeRADIUS server sign-off remains required before production deployment.

---

## COMPLETED FEATURES

(Implemented in code and reasoned to work locally; **not** the same as "verified in real environment" — see Test Results.)

- Prisma schema covering Organization, User, Subscriber, ServicePlan, Subscription, Payment, Invoice, Voucher(Batch/Use), NetworkNode, Session, Notification, Wallet/WalletTransaction, Reseller(Profile), SupportTicket, AuditLog, ApiKey, Webhook, PlatformSubscription.
- `createTenantClient` (packages/database/src/tenant.ts) — DB-client-level tenant scoping for tenant-owned models; now proven by committed automated tests instead of the removed `/api/test-isolation` dev route.
- Centralized authenticated organization context in `apps/web/src/lib/auth.ts` (`getCurrentOrganizationContext`, `requireCurrentOrganization`, `getCurrentOrganizationId`, `requireOrganizationSlugAccess`).
- Public portal organization discovery in `apps/web/src/lib/organizations.ts`, resolving active organizations from request host/custom domain and optional verified local-dev slug.
- Org-scoped API key authorization for RADIUS REST routes in `apps/web/src/lib/api-keys.ts` and `apps/web/src/app/api/radius/**`.
- Subscription lifecycle state machine + plan assignment (packages/billing).
- Voucher batch generation/redemption + reseller commission crediting (packages/billing).
- Paystack payment initialization, webhook handling with HMAC-SHA512 signature verification and idempotent processing (packages/payments).
- RADIUS PAP/CHAP/MS-CHAPv2 authentication and Start/Update/Stop accounting, including hand-rolled MD4/DES-ECB (validated against RFC/FIPS test vectors) since Node's OpenSSL3 lacks them (packages/radius).
- MikroTik RouterOS API client, address-list/queue policy pushes, WireGuard peer key + script generation (packages/mikrotik).
- Notification dispatch across email/SMS/in-app with per-event triggers on payment success and router disconnects (packages/notifications).
- Admin app shell: sidebar/header layouts for admin, platform, and customer role groups; ~15 admin pages scaffolded (customers, packages, vouchers, routers, hotspots, sessions, usage, analytics, staff, resellers, notifications, settings, support).
- Supabase Auth wiring with role-aware middleware redirect logic (`apps/web/src/middleware.ts`, `lib/auth.ts`).
- Automated regression suite (`pnpm --filter web test`) with 63 passing tests in 15 files.

## IN PROGRESS

- Stage 5 follow-up gaps remain outside its required exit criteria: no bulk import, customer self-service account lifecycle, or Device model.
- Stage 6 follow-up gaps remain outside its required exit criteria: expiration needs a scheduled worker/cron caller, recurring billing is not implemented, and package currency remains organization-level.
- Stage 7 follow-up gaps remain outside its required exit criteria: no recurring billing/dunning, no invoice generation workflow, no provider callback UI, and Paystack is the only provider.
- Stage 8 follow-up limitations remain intentional: no additional providers, no provider-selection UI, no live Paystack transaction, no refunds, reconciliation dashboard, invoices, or recurring billing.
- Stage 9 follow-up limitations remain intentional: no multi-use voucher schema, PDF export, wallet charging, or live MikroTik/RADIUS voucher provisioning.
- Stage 10 follow-up limitations remain intentional: no network-agent runtime, no RADIUS provider implementation under the contract, and no formal policy capability negotiation.
- Stage 11 follow-up limitation: real RouterOS hardware validation is still pending.
- Stage 12 follow-up limitation: real FreeRADIUS server validation is still pending.
- `services/radius` remains a scaffold; the network-agent and worker runtimes now provide the implemented Stage 15/16 execution boundaries.

## BLOCKERS

1. The physical RouterOS candidate at `10.111.0.1` is reachable and exposes an active hotspot, but its model, RouterOS version, RADIUS settings, and management configuration were not inspected because credentialed access was unavailable.
2. `apps/captive-portal` and all three `services/*` (network-agent, radius, worker) packages are empty placeholders — the separate captive-portal runtime and later secure remote router management remain unimplemented.
3. Read-only HTTP discovery observed a RouterOS hotspot status page and `/login` redirecting to `http://suning.connect.captive.ispman.tech/status`, but no authentication, network-access, or accounting behavior was tested against hardware.

## NEXT TASK

Continue Stage 21 Security & Production Hardening: add schema-based request validation, CSRF protections for state-changing flows, dependency/security scanning, backup/restore checks, and production deployment hardening.

## TEST RESULTS

- `pnpm run test` passes: **160 tests across 38 files**, including Stage 17 provider configuration, delivery, retry, and worker tests.
- Database-level isolation is covered by `src/lib/tenant-isolation.test.ts`, proving tenant reads are AND-scoped and mismatched `organization_id` writes are rejected.
- Application-level tenant access is covered by `src/app/(admin)/admin/staff/actions.test.ts`, proving Organization A can update Organization A data, Organization A cannot update Organization B data, Organization B cannot update Organization A data, and a malicious extra `organizationId` field is ignored.
- Auth/session isolation is covered by `src/lib/auth.test.ts`, proving unauthenticated users are redirected and platform admins are denied tenant context.
- Platform-admin global access is covered by `src/lib/api/platform.test.ts`, proving only `PLATFORM_ADMIN` can run global organization status changes.
- Public/machine discovery boundaries are covered by `src/lib/organizations.test.ts` and `src/lib/api-keys.test.ts`, proving host/slug mismatches fail for the portal and org-scoped API keys are required for RADIUS routes.
- Customer CRM mutations are covered by `src/app/(admin)/admin/customers/actions.test.ts`, proving authenticated creation, client organization_id rejection, cross-tenant update/delete denial, and unauthenticated mutation denial.
- Package actions are covered by `src/app/(admin)/admin/packages/actions.test.ts`, proving authenticated package creation/update/toggle, invalid input rejection, safe archive behavior, client organization_id isolation, and unauthenticated denial.
- Subscription behavior is covered by `src/lib/subscriptions.test.ts`, proving cross-tenant customer rejection, pending assignment, explicit activation with UTC expiry, and server-side expiration.
- Payment initiation is covered by `src/lib/payment-initialization.test.ts`, proving server-derived plan amount/currency, tenant customer validation, inactive-plan rejection, and durable linked pending records.
- Payment settlement is covered by `src/lib/payment-settlement.test.ts`, proving amount/currency matching, one-time pending claims, duplicate-delivery idempotency, and failed-payment non-activation.
- Stage 8 provider contracts are covered by `packages/payments/src/__tests__/provider.test.ts`, running identical initialization, verification, signature, tamper, and failure assertions against `PaystackProvider` and `MockPaymentProvider`.
- Stage 9 voucher behavior is covered by `packages/billing/src/vouchers.test.ts` and `apps/web/src/app/(admin)/admin/vouchers/actions.test.ts`, proving secure generation, single-use concurrency protection, successful redemption, tenant-scoped revocation, and unauthenticated denial.
- Stage 10 network behavior is covered by `packages/network/src/network-provider.test.ts` and `packages/mikrotik/src/subscription-policy.test.ts`, proving deterministic provider operations and policy orchestration through injection.
- Stage 11 RouterOS behavior is covered by `packages/mikrotik/src/client.test.ts`, proving TCP connection, login, command exchange, and RouterOS reply parsing against an in-process emulator.
- Stage 12 RADIUS behavior is covered by `packages/radius/src/auth.test.ts`, `packages/radius/src/accounting.test.ts`, and `packages/radius/src/protocol.test.ts`, proving authentication input validation, plan-backed authorization attributes, cross-tenant accounting denial, accounting idempotency, malformed packet rejection, and RFC 5176 response verification.
- MD4/DES-ECB custom crypto implementations were validated against canonical RFC1320/FIPS test vectors via disposable scripts (per repo memory), not committed as tests.
- RouterOS wire protocol (length-prefixed word/sentence framing) was round-tripped across chunk boundaries via a disposable script, not committed as a test.
- No payment, MikroTik, or RADIUS integration has been verified against a real Paystack test transaction, real MikroTik router, or real FreeRADIUS instance.

## ARCHITECTURAL DECISIONS

- Monorepo: pnpm workspaces, not Turborepo (despite being mentioned in the original roadmap draft) — apps/*, packages/*, services/*.
- No tRPC layer; Next.js Server Actions + direct Prisma calls from `lib/api/*.ts` are used instead of the RPC layer originally sketched in architecture.md.
- UI kit is shadcn-style but built on `@base-ui/react`, not Radix UI (contradicts the original architecture.md tech table — needs correcting).
- Users belong to exactly one organization through `users.organization_id`; there is no membership join table. Platform admins are modeled as users on a dedicated meta-organization and are explicitly kept out of tenant context by `requireCurrentOrganization()`.
- Tenant isolation is enforced by a combination of `requireCurrentOrganization()` for browser-admin flows, `resolvePublicOrganizationFromRequest()` for portal discovery, org-scoped API keys for RADIUS REST routes, and the Prisma `$extends` wrapper (`createTenantClient`) for data access — not Postgres Row-Level Security. RLS was planned in the original Stage 2 roadmap draft but was never implemented.
- CHAP/MS-CHAPv2 RADIUS auth reuse the bcrypt `password_hash` field as shared secret material instead of a separate reversible credential/NT-hash column — documented simplification, not production-correct.
- MikroTik/RADIUS router credentials use AES-256-GCM with legacy Base64 decoding compatibility (`packages/mikrotik/src/credentials.ts`); production still requires an explicitly configured encryption key.
- `ResellerProfile` is the canonical reseller model; the legacy lowercase `resellers` table is removed by the Stage 13 reconciliation migration after references are remapped.

## KNOWN ISSUES

- Captive portal throttling is currently in-process; a shared/distributed limiter is still required for multi-instance production deployment.
- Org-scoped API keys now protect the RADIUS REST bridge, but there is not yet any admin UI or operational workflow for rotating/revoking them.
- The Stage 13 reseller reconciliation migration should be applied and verified against the production database before deployment.
- Redis-backed portal rate limiting is implemented with a bounded in-memory fallback; schema-based input validation, explicit CSRF protections, dependency/security scanning, and backup/restore verification remain.
- No Postgres migrations folder found under `packages/database/prisma/` — schema changes may have been applied via `db push` rather than tracked migrations; confirm before any production deploy.
- No CI pipeline (no `.github/workflows`) — nothing prevents broken code from being merged.
- `apps/captive-portal` and all of `services/*` are empty scaffolds only (`.gitkeep`).
- Only Paystack is implemented among planned payment providers (Stripe/Flutterwave/M-Pesa remain enum values only).
- `.env` file (not committed, but was pasted into chat during this session) contains live-looking Supabase, database, Paystack, and Arkesel credentials — rotate anything that may have been exposed and ensure `.env` stays out of version control.
