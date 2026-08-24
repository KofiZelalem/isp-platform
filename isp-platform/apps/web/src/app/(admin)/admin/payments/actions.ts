"use server"

import { initializePaystackPayment } from "payments"

import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createTenantClient } from "database"

export type InitializeAdminPaymentState = { error: string } | { success: true; authorizationUrl: string } | null

/** Initiates a payment from authenticated admin context; customer email is never accepted from the browser. */
export async function initializeAdminPaymentAction(
  _previousState: InitializeAdminPaymentState,
  formData: FormData
): Promise<InitializeAdminPaymentState> {
  const planId = String(formData.get("planId") ?? "").trim()
  const subscriberId = String(formData.get("subscriberId") ?? "").trim()
  if (!planId || !subscriberId) return { error: "Customer and package are required." }

  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey || secretKey.startsWith("sk_test_placeholder")) return { error: "Payment gateway is not configured." }

  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)
  const subscriber = await tenantDb.subscriber.findUnique({ where: { id: subscriberId }, select: { email: true } })
  if (!subscriber?.email) return { error: "Customer does not have an email address for payment checkout." }

  try {
    const result = await initializePaystackPayment(prisma, {
      organizationId,
      subscriberId,
      planId,
      email: subscriber.email,
      secretKey,
    })
    return { success: true, authorizationUrl: result.authorizationUrl }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to initialize payment." }
  }
}