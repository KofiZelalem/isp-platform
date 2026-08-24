# ISP-OS Domain Model

> Reflects the actual Prisma schema (`packages/database/prisma/schema.prisma`) as of 2026-08-21, not aspirational design.

## Tenancy root

- **Organization** — the ISP/hotspot operator tenant. Every tenant-owned entity carries `organization_id`. Has `slug`, `custom_domain`, `status` (OrgStatus), branding fields, and plan tier. In the live app, admin tenant context no longer comes from the slug; slugs are discovery values only.
- **Subscriber / Customer** — the organization-owned customer record used for hotspot and RADIUS access. It stores the existing identity/contact fields (`username`, `full_name`, `email`, `phone`, `address`, `notes`), lifecycle status, timestamps, and relations to subscriptions, payments, sessions, invoices, vouchers, tickets, and wallet. The compound `(organization_id, username)` key prevents duplicate network identities within an ISP.
- **Customer CRM** — the admin customer list and detail routes use the authenticated organization context for every read/write. Search, status filtering, pagination, create/edit, and soft-delete operate on Subscriber records. The current schema has no Device model; device activity is therefore represented only by session IP/MAC fields until a device domain model is formally introduced.
- **ServicePlan / Package** — the organization-owned commercial access definition. It stores name, description, price, plan type (`TIME_BASED`, `DATA_BASED`, `UNLIMITED`, `VOUCHER`), period, validity days, public/active flags, and only data/bandwidth limits already represented in the schema. Package currency follows `Organization.currency`. Archived plans are soft-deleted and hidden from listings and public purchase.

## Identity & access

- **User** — `role` (UserRole: PLATFORM_ADMIN, ISP_ADMIN, STAFF, RESELLER, CUSTOMER), linked to Supabase Auth via `supabase_uid`, and linked to exactly one Organization through required `organization_id`.
- **OrganizationContext** — runtime application concept, not a Prisma model. `apps/web/src/lib/auth.ts` resolves the authenticated Supabase user to the corresponding `User` row, verifies the organization is active, and returns `{ authUserId, userId, role, organizationId, organization }` for tenant-scoped server code.
- **Platform administrator access** — there is no separate membership architecture. Platform admins remain `User` rows on a dedicated `isp-os-platform` organization, but tenant helpers deliberately refuse to treat them as organization members; they must use explicit global-only code paths.
- **ResellerProfile** and legacy `resellers` — two overlapping models for reseller accounts (wallet balance, commission rate) are still present in the current Prisma schema and require reconciliation.

## Customers & network access

- **Subscriber** — the end customer of an ISP. `status` (SubscriberStatus: ACTIVE, SUSPENDED, EXPIRED, TERMINATED). Owns Subscriptions, Payments, Sessions.
- **ServicePlan** — a package (PlanType: TIME_BASED, DATA_BASED, UNLIMITED, VOUCHER; PlanPeriod: HOURLY/DAILY/WEEKLY/MONTHLY/CUSTOM), with data/speed limits and validity.
- **Subscription** — a Subscriber's assignment to a ServicePlan for a period. `status` (SubscriptionStatus: PENDING, ACTIVE, SUSPENDED, EXPIRED, CANCELLED) driven by the state machine in `packages/billing/src/subscription-state-machine.ts`.
- **Subscription lifecycle** — assignment creates `PENDING`; explicit activation transitions to `ACTIVE` and calculates expiry from `validity_days` in UTC; server-side expiration transitions passed active records to `EXPIRED`. `EXPIRING` is computed, not persisted. Payment confirmation, recurring billing, and voucher redemption remain separate later-stage boundaries.
- **Voucher** / **VoucherBatch** / **VoucherUse** — pre-generated access codes (VoucherStatus: GENERATED, SOLD, REDEEMED, EXPIRED, REVOKED), redeemable via the captive portal to create a Subscription.
- **Voucher lifecycle** — Stage 9 generates cryptographically random single-use codes, conditionally claims only generated/sold codes during redemption, activates the linked Stage 6 subscription, and records `VoucherUse`. Admins can revoke unused/sold codes individually or by batch. The existing schema has no remaining-use count, so multi-use vouchers are not represented.
- **Session** — a network session (radius accounting), tracks `started_at/ended_at`, data up/down, status (SessionStatus).

## Network

- **NetworkNode** — a router (NodeType: MIKROTIK, FREERADIUS, UNIFI), holds AES-256-GCM encrypted credentials with legacy Base64 decoding compatibility, plus WireGuard public/private key fields for Stage 16.
- **NetworkProvider** — runtime abstraction in `packages/network`, not a Prisma model. It defines connection, subscriber isolation/restoration, disconnect, rate-policy, and status operations without tenant fields. `MikroTikNetworkProvider` is the current implementation; `MockNetworkProvider` is used for deterministic tests.
- **MikroTik integration** — `MikroTikNetworkProvider` is the production adapter for RouterOS TCP/API operations. It composes the existing RouterOsClient and policy primitives; the application orchestration layer does not directly construct RouterOS clients.

## Billing & money

- **Payment** — a durable organization-owned payment attempt. It stores a unique `internal_reference`, optional `subscription_id`, amount/currency, provider/status, provider reference, payment method, failure reason, provider response, and settlement timestamps. Paystack is currently the only provider wired.
- **Invoice** — subtotal/tax/total + JSON line items. No automated generation worker exists yet.
- **Wallet** / **WalletTransaction** — subscriber/reseller balances; transaction types TOPUP, DEDUCTION, COMMISSION, REFUND, ADJUSTMENT.

## Support & platform

- **Notification** — channel (EMAIL, SMS, IN_APP, PUSH), status (PENDING, SENT, FAILED, READ), type (PAYMENT_SUCCESS, PACKAGE_ACTIVATED, ROUTER_DISCONNECTED, ROUTER_ERROR, GENERAL, etc.).
- **SupportTicket** / **TicketComment** — basic support ticketing.
- **AuditLog** — present in schema; no UI viewer built yet.
- **ApiKey** — now used by the RADIUS REST bridge as the machine-to-machine authorization boundary. Keys are org-scoped and checked for explicit scopes before a tenant client is constructed.
- **Webhook**, **PlatformSubscription** — scaffolding for later stages (public API, platform billing) and not yet broadly used by application code.

## Tenant scoping enforcement

`packages/database/src/tenant.ts` exports `createTenantClient(prisma, organizationId)`, which auto-scopes queries for `TENANT_SCOPED_MODELS`: Subscriber, ServicePlan, Subscription, NetworkNode, Payment, Session, VoucherBatch, Voucher, VoucherUse, Notification. It auto-filters reads and requires `organization_id` explicitly on `create`/`createMany` writes (TypeScript still requires it — the `$extends` wrapper only enforces it at runtime).

This enforcement is now exercised by the live app through `requireCurrentOrganization()` for protected admin flows, `resolvePublicOrganizationFromRequest()` for portal discovery, and org-scoped API key auth for the RADIUS bridge. The committed Vitest suite covers both the low-level tenant client and the higher-level application authorization boundaries.

Package and subscription operations use the same enforcement. Plan and subscriber ownership are independently verified before a subscription is created, preventing cross-tenant relational references. No schema change was required for Stage 6.

Billing follows the same tenant boundary. Authenticated admin initiation derives the organization and customer email from server context; public portal initiation accepts only a verified organization resolver. Paystack webhooks verify the signature and provider transaction, then conditionally claim the matching pending Payment by unique internal reference before activating its linked Stage 6 Subscription. The Stage 7 migration added this payment-to-subscription link and reference separation because the prior schema could not guarantee durable reconciliation or idempotent settlement.

Stage 8 adds a provider boundary without changing the billing domain: `PaymentProvider` defines initialization, transaction verification, and signed webhook parsing; `PaystackProvider` is the only production adapter. Provider types do not accept `organization_id`; tenant ownership remains in the calling service layer. `toMinorUnits()` converts monetary Decimal strings using integer arithmetic, and payment initialization calls the provider before creating local subscription/payment records to prevent local orphan subscriptions.

Voucher administration uses the same tenant client. Batch and individual code reads, revocations, and CSV export require authenticated organization context; public redemption uses the verified public organization resolver. No voucher organization or customer identity supplied by the browser is used as authorization.

Network policy orchestration uses `NetworkProvider` injection. Tenant-scoped session/node data is loaded by the calling service, while provider implementations receive only the node connection and subscriber network target required to perform the operation.

The MikroTik adapter has an in-process TCP emulator test for connection, login, command framing, and reply parsing. Real RouterOS hardware validation remains a deployment prerequisite and is not represented as completed here.
