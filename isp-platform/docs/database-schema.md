# ISP-OS Database Schema

> **Stage 0 — Product Specification**  
> Version: 0.1.0 | Status: Draft  
> ORM: Prisma | Database: PostgreSQL (Supabase)

---

## Design Principles

1. **Strict Multi-Tenancy**: Every tenant-scoped model carries `organization_id UUID NOT NULL`. No row of tenant data can ever be accessed without an explicit tenant filter.
2. **UUID Primary Keys**: All tables use `@id @default(uuid())` for distributed-friendly IDs with no sequential enumeration risk.
3. **Soft Deletes**: Critical entities (subscribers, invoices, vouchers) use `deleted_at DateTime?` rather than hard deletion.
4. **Timestamps**: All models include `created_at` and `updated_at` managed by Prisma (`@updatedAt`).
5. **Enums**: Status fields use Prisma `enum` for type safety and self-documenting schema.

---

## Full Prisma Schema

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// ENUMS
// ============================================================

enum UserRole {
  PLATFORM_ADMIN
  ISP_ADMIN
  STAFF
  RESELLER
  CUSTOMER
}

enum OrgStatus {
  ACTIVE
  SUSPENDED
  PENDING
  TERMINATED
}

enum SubscriberStatus {
  ACTIVE
  SUSPENDED
  EXPIRED
  TERMINATED
}

enum PlanType {
  TIME_BASED
  DATA_BASED
  UNLIMITED
  VOUCHER
}

enum PlanPeriod {
  HOURLY
  DAILY
  WEEKLY
  MONTHLY
  CUSTOM
}

enum VoucherStatus {
  GENERATED
  SOLD
  REDEEMED
  EXPIRED
  REVOKED
}

enum NodeType {
  MIKROTIK
  FREERADIUS
  UNIFI
}

enum NodeStatus {
  ONLINE
  OFFLINE
  DEGRADED
  PROVISIONING
}

enum InvoiceStatus {
  DRAFT
  PENDING
  PAID
  OVERDUE
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
  REFUNDED
}

enum PaymentProvider {
  STRIPE
  FLUTTERWAVE
  PAYSTACK
  MPESA
  WALLET
  MANUAL
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum NotificationChannel {
  EMAIL
  SMS
  IN_APP
  PUSH
}

enum SessionStatus {
  ACTIVE
  TERMINATED
  EXPIRED
}

enum WalletTransactionType {
  TOPUP
  DEDUCTION
  COMMISSION
  REFUND
  ADJUSTMENT
}

// ============================================================
// CORE: ORGANISATIONS (TENANTS)
// ============================================================

model Organization {
  id               String      @id @default(uuid())
  name             String
  slug             String      @unique  // used in subdomain: slug.isp-os.com
  status           OrgStatus   @default(PENDING)
  plan_tier        String      @default("starter") // starter | growth | enterprise
  custom_domain    String?
  logo_url         String?
  primary_color    String?
  secondary_color  String?
  country          String?
  timezone         String      @default("UTC")
  currency         String      @default("USD")
  created_at       DateTime    @default(now())
  updated_at       DateTime    @updatedAt
  deleted_at       DateTime?

  // Relations
  users            User[]
  resellers        Reseller[]
  subscribers      Subscriber[]
  subscriptions    Subscription[]
  service_plans    ServicePlan[]
  voucher_batches  VoucherBatch[]
  network_nodes    NetworkNode[]
  sessions         Session[]
  invoices         Invoice[]
  payments         Payment[]
  wallets          Wallet[]
  tickets          SupportTicket[]
  audit_logs       AuditLog[]
  api_keys         ApiKey[]
  webhooks         Webhook[]
  notifications    Notification[]
  settings         OrganizationSettings?
  subscription     PlatformSubscription?

  @@index([slug])
  @@map("organizations")
}

model OrganizationSettings {
  id                    String       @id @default(uuid())
  organization_id       String       @unique
  sms_gateway_provider  String?
  sms_api_key           String?
  smtp_host             String?
  smtp_port             Int?
  smtp_user             String?
  smtp_password_enc     String?      // encrypted at rest
  payment_provider      String?
  payment_api_key_enc   String?      // encrypted at rest
  radius_secret_enc     String?      // encrypted at rest
  max_sessions_per_user Int          @default(1)
  captive_portal_config Json?        // flexible JSON for portal customisation
  created_at            DateTime     @default(now())
  updated_at            DateTime     @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)

  @@map("organization_settings")
}

// ============================================================
// USERS & AUTH
// ============================================================

model User {
  id              String    @id @default(uuid())
  organization_id String
  supabase_uid    String    @unique  // links to auth.users in Supabase
  email           String
  full_name       String?
  phone           String?
  role            UserRole
  is_active       Boolean   @default(true)
  last_login_at   DateTime?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  organization    Organization   @relation(fields: [organization_id], references: [id])
  reseller        Reseller?
  audit_logs      AuditLog[]
  tickets_raised  SupportTicket[] @relation("RaisedBy")
  tickets_assigned SupportTicket[] @relation("AssignedTo")

  @@unique([organization_id, email])
  @@index([organization_id])
  @@index([supabase_uid])
  @@map("users")
}

// ============================================================
// SUBSCRIBERS (CUSTOMERS)
// ============================================================

model Subscriber {
  id              String           @id @default(uuid())
  organization_id String
  user_id         String?          // set if subscriber has a self-service account
  username        String           // RADIUS / hotspot username
  password_hash   String
  full_name       String
  email           String?
  phone           String?
  status          SubscriberStatus @default(ACTIVE)
  kyc_verified    Boolean          @default(false)
  kyc_document    String?
  address         String?
  notes           String?
  reseller_id     String?          // if acquired via a reseller
  created_at      DateTime         @default(now())
  updated_at      DateTime         @updatedAt
  deleted_at      DateTime?

  organization    Organization        @relation(fields: [organization_id], references: [id])
  reseller        Reseller?           @relation(fields: [reseller_id], references: [id])
  subscriptions   Subscription[]
  sessions        Session[]
  invoices        Invoice[]
  payments        Payment[]
  voucher_uses    VoucherUse[]
  tickets         SupportTicket[]
  wallet          Wallet?

  @@unique([organization_id, username])
  @@index([organization_id])
  @@index([organization_id, status])
  @@map("subscribers")
}

// ============================================================
// RESELLERS
// ============================================================

model Reseller {
  id              String    @id @default(uuid())
  organization_id String
  user_id         String    @unique
  business_name   String?
  commission_rate Decimal   @default(0) @db.Decimal(5, 2) // percentage
  is_active       Boolean   @default(true)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  organization    Organization @relation(fields: [organization_id], references: [id])
  user            User         @relation(fields: [user_id], references: [id])
  subscribers     Subscriber[]
  wallet          Wallet?

  @@index([organization_id])
  @@map("resellers")
}

// ============================================================
// SERVICE PLANS
// ============================================================

model ServicePlan {
  id                  String     @id @default(uuid())
  organization_id     String
  name                String
  description         String?
  plan_type           PlanType
  plan_period         PlanPeriod
  price               Decimal    @db.Decimal(12, 2)
  data_limit_mb       Int?       // null = unlimited
  time_limit_minutes  Int?       // null = unlimited
  speed_upload_kbps   Int?
  speed_download_kbps Int?
  validity_days       Int        @default(30)
  is_active           Boolean    @default(true)
  is_public           Boolean    @default(true) // visible on captive portal
  mikrotik_profile    String?    // corresponding MikroTik user profile name
  radius_group        String?    // corresponding RADIUS group name
  metadata            Json?
  created_at          DateTime   @default(now())
  updated_at          DateTime   @updatedAt
  deleted_at          DateTime?

  organization   Organization   @relation(fields: [organization_id], references: [id])
  subscriptions  Subscription[]
  voucher_batches VoucherBatch[]

  @@index([organization_id])
  @@index([organization_id, is_active])
  @@map("service_plans")
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

model Subscription {
  id              String           @id @default(uuid())
  organization_id String
  subscriber_id   String
  plan_id         String
  status          SubscriberStatus @default(ACTIVE)
  started_at      DateTime         @default(now())
  expires_at      DateTime?
  data_used_mb    Int              @default(0)
  auto_renew      Boolean          @default(false)
  created_at      DateTime         @default(now())
  updated_at      DateTime         @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])
  subscriber   Subscriber   @relation(fields: [subscriber_id], references: [id])
  plan         ServicePlan  @relation(fields: [plan_id], references: [id])
  invoices     Invoice[]

  @@index([organization_id])
  @@index([subscriber_id])
  @@index([expires_at])
  @@map("subscriptions")
}

// ============================================================
// VOUCHERS
// ============================================================

model VoucherBatch {
  id              String    @id @default(uuid())
  organization_id String
  plan_id         String
  name            String
  prefix          String?
  quantity        Int
  selling_price   Decimal   @db.Decimal(12, 2)
  generated_by    String    // User ID
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])
  plan         ServicePlan  @relation(fields: [plan_id], references: [id])
  vouchers     Voucher[]

  @@index([organization_id])
  @@map("voucher_batches")
}

model Voucher {
  id              String        @id @default(uuid())
  organization_id String
  batch_id        String
  code            String
  status          VoucherStatus @default(GENERATED)
  sold_to         String?       // Reseller ID or walk-in note
  sold_at         DateTime?
  expires_at      DateTime?
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  batch      VoucherBatch @relation(fields: [batch_id], references: [id])
  uses       VoucherUse[]

  @@unique([organization_id, code])
  @@index([organization_id])
  @@index([organization_id, status])
  @@map("vouchers")
}

model VoucherUse {
  id              String   @id @default(uuid())
  organization_id String
  voucher_id      String
  subscriber_id   String
  session_id      String?
  redeemed_at     DateTime @default(now())

  voucher    Voucher    @relation(fields: [voucher_id], references: [id])
  subscriber Subscriber @relation(fields: [subscriber_id], references: [id])

  @@index([organization_id])
  @@index([voucher_id])
  @@map("voucher_uses")
}

// ============================================================
// NETWORK NODES
// ============================================================

model NetworkNode {
  id                String     @id @default(uuid())
  organization_id   String
  name              String
  node_type         NodeType
  ip_address        String
  port              Int        @default(8728)
  username_enc      String
  password_enc      String     // encrypted
  status            NodeStatus @default(PROVISIONING)
  location          String?
  last_seen_at      DateTime?
  wireguard_pub_key String?
  created_at        DateTime   @default(now())
  updated_at        DateTime   @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])
  sessions     Session[]

  @@index([organization_id])
  @@map("network_nodes")
}

// ============================================================
// SESSIONS
// ============================================================

model Session {
  id              String        @id @default(uuid())
  organization_id String
  subscriber_id   String
  node_id         String
  radius_session  String?       // NAS-generated Acct-Session-Id
  ip_address      String?
  mac_address     String?
  status          SessionStatus @default(ACTIVE)
  started_at      DateTime      @default(now())
  ended_at        DateTime?
  data_up_mb      Int           @default(0)
  data_down_mb    Int           @default(0)
  duration_sec    Int           @default(0)
  termination_cause String?

  organization Organization @relation(fields: [organization_id], references: [id])
  subscriber   Subscriber   @relation(fields: [subscriber_id], references: [id])
  node         NetworkNode  @relation(fields: [node_id], references: [id])

  @@index([organization_id])
  @@index([subscriber_id])
  @@index([organization_id, status])
  @@index([radius_session])
  @@map("sessions")
}

// ============================================================
// BILLING & INVOICES
// ============================================================

model Invoice {
  id              String        @id @default(uuid())
  organization_id String
  subscriber_id   String
  subscription_id String?
  invoice_number  String
  status          InvoiceStatus @default(PENDING)
  subtotal        Decimal       @db.Decimal(12, 2)
  tax             Decimal       @default(0) @db.Decimal(12, 2)
  total           Decimal       @db.Decimal(12, 2)
  due_date        DateTime
  paid_at         DateTime?
  notes           String?
  line_items      Json          // array of {description, qty, unit_price, total}
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  organization Organization  @relation(fields: [organization_id], references: [id])
  subscriber   Subscriber    @relation(fields: [subscriber_id], references: [id])
  subscription Subscription? @relation(fields: [subscription_id], references: [id])
  payments     Payment[]

  @@unique([organization_id, invoice_number])
  @@index([organization_id])
  @@index([subscriber_id])
  @@index([organization_id, status])
  @@map("invoices")
}

// ============================================================
// PAYMENTS
// ============================================================

model Payment {
  id                String          @id @default(uuid())
  organization_id   String
  subscriber_id     String?
  invoice_id        String?
  amount            Decimal         @db.Decimal(12, 2)
  currency          String          @default("USD")
  provider          PaymentProvider
  status            PaymentStatus   @default(PENDING)
  provider_ref      String?         // external transaction ID
  provider_response Json?           // raw webhook/response payload
  paid_at           DateTime?
  created_at        DateTime        @default(now())
  updated_at        DateTime        @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])
  subscriber   Subscriber?  @relation(fields: [subscriber_id], references: [id])
  invoice      Invoice?     @relation(fields: [invoice_id], references: [id])

  @@index([organization_id])
  @@index([subscriber_id])
  @@index([provider_ref])
  @@map("payments")
}

// ============================================================
// WALLETS
// ============================================================

model Wallet {
  id              String   @id @default(uuid())
  organization_id String
  subscriber_id   String?  @unique
  reseller_id     String?  @unique
  balance         Decimal  @default(0) @db.Decimal(14, 4)
  currency        String   @default("USD")
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  organization  Organization        @relation(fields: [organization_id], references: [id])
  subscriber    Subscriber?         @relation(fields: [subscriber_id], references: [id])
  reseller      Reseller?           @relation(fields: [reseller_id], references: [id])
  transactions  WalletTransaction[]

  @@index([organization_id])
  @@map("wallets")
}

model WalletTransaction {
  id              String                @id @default(uuid())
  organization_id String
  wallet_id       String
  type            WalletTransactionType
  amount          Decimal               @db.Decimal(14, 4)
  balance_before  Decimal               @db.Decimal(14, 4)
  balance_after   Decimal               @db.Decimal(14, 4)
  reference       String?               // payment_id or voucher_id
  description     String?
  created_at      DateTime              @default(now())

  wallet Wallet @relation(fields: [wallet_id], references: [id])

  @@index([wallet_id])
  @@index([organization_id])
  @@map("wallet_transactions")
}

// ============================================================
// SUPPORT TICKETS
// ============================================================

model SupportTicket {
  id              String         @id @default(uuid())
  organization_id String
  subscriber_id   String?
  raised_by       String
  assigned_to     String?
  subject         String
  description     String
  category        String         // billing | connectivity | account | other
  status          TicketStatus   @default(OPEN)
  priority        TicketPriority @default(MEDIUM)
  resolved_at     DateTime?
  closed_at       DateTime?
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt

  organization Organization   @relation(fields: [organization_id], references: [id])
  subscriber   Subscriber?    @relation(fields: [subscriber_id], references: [id])
  raiser       User           @relation("RaisedBy", fields: [raised_by], references: [id])
  assignee     User?          @relation("AssignedTo", fields: [assigned_to], references: [id])
  comments     TicketComment[]

  @@index([organization_id])
  @@index([organization_id, status])
  @@map("support_tickets")
}

model TicketComment {
  id         String   @id @default(uuid())
  ticket_id  String
  author_id  String
  body       String
  is_internal Boolean @default(false)
  created_at DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticket_id], references: [id], onDelete: Cascade)

  @@index([ticket_id])
  @@map("ticket_comments")
}

// ============================================================
// NOTIFICATIONS
// ============================================================

model Notification {
  id              String              @id @default(uuid())
  organization_id String
  recipient_id    String?             // User or Subscriber ID
  channel         NotificationChannel
  subject         String?
  body            String
  is_read         Boolean             @default(false)
  sent_at         DateTime?
  read_at         DateTime?
  error           String?
  created_at      DateTime            @default(now())

  organization Organization @relation(fields: [organization_id], references: [id])

  @@index([organization_id])
  @@index([recipient_id])
  @@map("notifications")
}

// ============================================================
// AUDIT LOGS
// ============================================================

model AuditLog {
  id              String   @id @default(uuid())
  organization_id String
  actor_id        String?
  action          String   // e.g. "subscriber.create", "invoice.paid"
  resource_type   String
  resource_id     String?
  before_state    Json?
  after_state     Json?
  ip_address      String?
  user_agent      String?
  created_at      DateTime @default(now())

  organization Organization @relation(fields: [organization_id], references: [id])
  actor        User?        @relation(fields: [actor_id], references: [id])

  @@index([organization_id])
  @@index([organization_id, created_at])
  @@index([actor_id])
  @@map("audit_logs")
}

// ============================================================
// API KEYS & WEBHOOKS
// ============================================================

model ApiKey {
  id              String    @id @default(uuid())
  organization_id String
  name            String
  key_hash        String    @unique  // store hash, never plaintext
  scopes          String[]  // e.g. ["subscribers:read", "vouchers:write"]
  last_used_at    DateTime?
  expires_at      DateTime?
  is_active       Boolean   @default(true)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])

  @@index([organization_id])
  @@map("api_keys")
}

model Webhook {
  id              String    @id @default(uuid())
  organization_id String
  url             String
  events          String[]  // e.g. ["payment.success", "subscriber.suspended"]
  secret_enc      String    // encrypted HMAC signing secret
  is_active       Boolean   @default(true)
  last_triggered  DateTime?
  failure_count   Int       @default(0)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])

  @@index([organization_id])
  @@map("webhooks")
}

// ============================================================
// PLATFORM SUBSCRIPTION (META-BILLING)
// ============================================================

model PlatformSubscription {
  id              String        @id @default(uuid())
  organization_id String        @unique
  tier            String        // starter | growth | enterprise
  status          InvoiceStatus @default(PENDING)
  price_monthly   Decimal       @db.Decimal(12, 2)
  billing_cycle   String        @default("monthly")
  started_at      DateTime      @default(now())
  expires_at      DateTime?
  stripe_sub_id   String?
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  organization Organization @relation(fields: [organization_id], references: [id])

  @@map("platform_subscriptions")
}
```

---

## Entity Relationship Summary

```
Organization (tenant root)
  ├── User (role-based: PLATFORM_ADMIN | ISP_ADMIN | STAFF | RESELLER | CUSTOMER)
  │     └── Reseller (1:1 extension for RESELLER role)
  ├── Subscriber (end customers / hotspot users)
  │     ├── Subscription (active plan assignment)
  │     ├── Session (RADIUS/hotspot sessions)
  │     ├── Invoice + Payment
  │     ├── VoucherUse
  │     ├── Wallet + WalletTransaction
  │     └── SupportTicket
  ├── ServicePlan (data/time/speed plan definitions)
  ├── VoucherBatch
  │     └── Voucher (individual codes)
  ├── NetworkNode (MikroTik / RADIUS server records)
  ├── OrganizationSettings (gateway keys, SMTP, etc.)
  ├── PlatformSubscription (ISP's own subscription to ISP-OS)
  ├── ApiKey / Webhook
  ├── Notification
  └── AuditLog
```

---

## Index Strategy Notes

- `organization_id` is indexed on every tenant-scoped table — this is the primary partition key for all queries.
- Composite indexes on `(organization_id, status)` are added on high-read tables (`sessions`, `invoices`, `subscribers`) to support dashboard queries efficiently.
- `radius_session` on the `sessions` table is indexed to support fast RADIUS accounting lookups.
- `supabase_uid` on `users` is indexed for JWT-to-user resolution on every API call.
