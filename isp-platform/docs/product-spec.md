# ISP-OS Product Specification

> **Stage 0 — Product Specification**  
> Version: 0.1.0 | Status: Draft

---

## 1. Product Vision

ISP-OS is a **multi-tenant SaaS platform** that enables hotspot Internet Service Providers to manage their full operations — from subscriber onboarding and network provisioning to billing, analytics, and support — through a single, unified platform.

---

## 2. Core Actors (Roles)

The platform defines five primary actors. Each actor operates within an organisation context (except Platform Admin who operates globally).

### 2.1 Platform Admin
- **Scope**: Global (cross-tenant)
- **Responsibilities**:
  - Manage all organisations (ISPs) on the platform
  - Configure global platform settings and feature flags
  - Monitor system health, usage metrics, and billing across all tenants
  - Manage platform subscription tiers and pricing
  - Handle escalated support tickets

### 2.2 ISP Admin
- **Scope**: Single organisation (their ISP)
- **Responsibilities**:
  - Full control over all settings within their organisation
  - Manage Staff and Reseller accounts
  - Configure network nodes (MikroTik, RADIUS servers)
  - Define service plans and pricing
  - View all billing, revenue, and analytics dashboards
  - Manage integrations (SMS gateways, payment providers)

### 2.3 Staff
- **Scope**: Single organisation (assigned branch/location)
- **Responsibilities**:
  - Create and manage subscriber accounts
  - Issue and revoke vouchers
  - Handle first-level support and tickets
  - Process walk-in payments and subscriptions
  - View operational dashboards (not financial configuration)

### 2.4 Reseller
- **Scope**: Single organisation (assigned reseller account)
- **Responsibilities**:
  - Purchase voucher batches and data bundles at wholesale prices
  - Sell to end customers (offline or via their own sub-portal)
  - View their own wallet balance, transaction history, and commissions
  - Limited access to subscriber management for their own customers

### 2.5 Customer (Subscriber)
- **Scope**: Single organisation's customer portal
- **Responsibilities**:
  - Self-register and manage their own account
  - Purchase and renew data plans online
  - Redeem vouchers on the captive portal
  - View current session usage, data balance, and billing history
  - Raise support tickets

---

## 3. Permission Matrix

| Feature | Platform Admin | ISP Admin | Staff | Reseller | Customer |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage organisations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage staff/resellers | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configure network nodes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create service plans | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create subscribers | ✅ | ✅ | ✅ | Limited | ❌ |
| Issue vouchers | ✅ | ✅ | ✅ | ✅ | ❌ |
| Process payments | ✅ | ✅ | ✅ | ❌ | ❌ |
| View revenue reports | ✅ | ✅ | ❌ | Limited | ❌ |
| Manage own account | ✅ | ✅ | ✅ | ✅ | ✅ |
| Raise support ticket | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 4. The 20 Core Modules

### Module 01 — Organisation Management
Manages the lifecycle of tenant organisations on the platform. Covers ISP registration, onboarding, subscription tier selection, feature flag configuration, and suspension/deletion. Includes white-label branding settings (custom domain, logo, colour scheme) per organisation.

### Module 02 — User & Role Management
Handles all user accounts across roles. Supports invite-based onboarding, role assignment (RBAC), branch/location scoping for Staff, and two-factor authentication (2FA). Provides audit logs for all user actions within an organisation.

### Module 03 — Subscriber (Customer) Management
Core CRM for end subscribers. Manages subscriber profiles, KYC documents, account status (active, suspended, terminated), assigned service plans, data balances, and session history. Supports bulk import via CSV.

### Module 04 — Service Plan Management
Defines the pricing and quota structures for internet access. Plans can be time-based (hourly, daily, monthly), data-based (MB/GB cap), or unlimited. Supports speed profiles (upload/download limits mapped to MikroTik queues and RADIUS attributes). Plans belong to an organisation and can be restricted to specific network locations.

### Module 05 — Voucher Management
Generates and manages prepaid voucher codes. Batches can be created with a defined plan, quantity, validity period, and prefix. Supports single-use and multi-use vouchers. Integrates with the captive portal for redemption and with the RADIUS server for session provisioning. Tracks voucher status (generated, sold, redeemed, expired).

### Module 06 — Network Node Management
Manages the organisation's physical and virtual network infrastructure. Nodes include MikroTik routers and FreeRADIUS servers. Stores connection credentials, sync status, and health metrics. The on-premise `network-agent` service connects each node to the cloud platform via WireGuard.

### Module 07 — Captive Portal Engine
The customer-facing authentication page served on hotspot networks. Configurable per organisation (branding, custom fields, social login). Supports multiple authentication methods: voucher code, username/password (PPPoE/Hotspot), and social login. Handles walled-garden rule management (sites accessible before authentication).

### Module 08 — RADIUS Integration
Manages the FreeRADIUS AAA (Authentication, Authorisation, Accounting) pipeline. Translates subscriber and plan data into RADIUS attributes. Handles Access-Request/Accept/Reject flows, CoA (Change of Authorization) for real-time session modification (speed changes, quota enforcement), and Disconnect-Messages for session termination.

### Module 09 — Billing & Invoicing
Automated billing engine. Generates invoices at the end of each billing cycle per subscriber. Supports prorated billing for mid-cycle plan changes. Tracks payment status (pending, paid, overdue). Sends automated dunning notifications. Provides a complete audit trail of all financial transactions per organisation.

### Module 10 — Payment Gateway Integration
Pluggable payment adapter layer. Supports multiple gateways (Stripe, Flutterwave, Paystack, M-Pesa). Each organisation can configure their preferred gateway(s). Handles payment initiation, webhook processing, reconciliation, and refunds. All payment records are tenant-scoped.

### Module 11 — Wallet & Credit System
Internal wallet for Resellers and prepaid Customers. Allows wallet top-up via payment gateways. Balance is deducted on voucher purchase or plan subscription. Supports commission crediting for Resellers. Includes full transaction history and low-balance alerts.

### Module 12 — Session Management & Monitoring
Real-time tracking of active subscriber sessions. Displays current online users, session duration, data consumed, and assigned network node. Allows Staff/Admin to terminate sessions remotely (sends RADIUS Disconnect-Message). Provides historical session logs for billing verification and troubleshooting.

### Module 13 — Analytics & Reporting
Comprehensive dashboards for each actor. Includes revenue trends, subscriber growth, churn metrics, data usage by plan/location, and voucher sales performance. Platform Admin sees cross-tenant aggregates. ISP Admin sees organisation-level data. Reports can be exported as CSV or PDF.

### Module 14 — Notification Engine
Centralised dispatch system for all platform communications. Supports Email (SMTP/SendGrid), SMS (Africa's Talking, Twilio), and in-app notifications. Triggers: account creation, plan expiry warnings, payment confirmation, low balance alerts, and session limits. Templates are configurable per organisation.

### Module 15 — Support Ticket System
Internal helpdesk for subscriber support. Customers raise tickets via the customer portal. Staff resolve tickets and can escalate to ISP Admin. Tickets are tagged by category (billing, connectivity, account). Includes SLA tracking and auto-close rules.

### Module 16 — Audit Log & Compliance
Immutable audit trail of all significant actions on the platform. Records actor identity, timestamp, action type, affected resource, and before/after state. Used for compliance, debugging, and dispute resolution. Logs are retained per configurable retention policy.

### Module 17 — Reseller Portal
Dedicated interface for Resellers. Enables voucher batch purchasing, wallet top-up, sales history, and commission tracking. Resellers can generate their own sub-voucher series. Includes a simplified dashboard showing active subscribers under their account.

### Module 18 — API & Webhook Management
Public REST API for third-party integrations. Allows ISPs to integrate ISP-OS with external billing systems, ERP, or custom apps. Supports API key management, webhook endpoint configuration, and event subscriptions. Full API reference auto-generated from tRPC schema.

### Module 19 — White-Label & Branding
Allows each ISP to configure a fully branded experience. Custom domain mapping, logo, favicon, primary/secondary colour palette, and email sender name. The captive portal and customer portal inherit organisation branding. Platform-level branding is managed by Platform Admin.

### Module 20 — Platform Subscription & Licensing
Manages ISP subscriptions to the ISP-OS platform itself. Defines feature tiers (Starter, Growth, Enterprise) with limits on subscribers, nodes, users, and API calls. Handles billing of ISPs by the Platform Admin (meta-billing layer). Provides usage gauges and upgrade prompts within the ISP Admin dashboard.
