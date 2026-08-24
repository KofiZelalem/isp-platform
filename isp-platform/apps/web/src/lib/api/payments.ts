import "server-only"

import { createTenantClient } from "database"

import { prisma } from "@/lib/db"

export type BillingPaymentListItem = {
  id: string
  internalReference: string
  providerReference: string | null
  customerName: string
  customerUsername: string
  packageName: string | null
  amount: string
  currency: string
  status: string
  provider: string
  subscriptionStatus: string | null
  paidAt: string | null
  createdAt: string
  failureReason: string | null
}

export async function getPaymentsForOrganization(
  organizationId: string,
  options: { status?: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED"; search?: string } = {}
): Promise<BillingPaymentListItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId)
  const search = options.search?.trim()
  const payments = await tenantDb.payment.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(search ? {
        OR: [
          { internal_reference: { contains: search, mode: "insensitive" } },
          { provider_ref: { contains: search, mode: "insensitive" } },
          { subscriber: { username: { contains: search, mode: "insensitive" } } },
          { subscriber: { full_name: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      id: true,
      internal_reference: true,
      provider_ref: true,
      amount: true,
      currency: true,
      status: true,
      provider: true,
      paid_at: true,
      created_at: true,
      failure_reason: true,
      subscriber: { select: { full_name: true, username: true } },
      subscription: { select: { status: true, plan: { select: { name: true } } } },
    },
  })

  return payments.map((payment) => ({
    id: payment.id,
    internalReference: payment.internal_reference,
    providerReference: payment.provider_ref,
    customerName: payment.subscriber?.full_name ?? "Unknown customer",
    customerUsername: payment.subscriber?.username ?? "—",
    packageName: payment.subscription?.plan.name ?? null,
    amount: payment.amount.toString(),
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    subscriptionStatus: payment.subscription?.status ?? null,
    paidAt: payment.paid_at?.toISOString() ?? null,
    createdAt: payment.created_at.toISOString(),
    failureReason: payment.failure_reason,
  }))
}