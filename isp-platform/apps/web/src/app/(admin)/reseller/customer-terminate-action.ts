"use server";

import { operateOnSubscriberRemotely } from "@/lib/api/remote-subscriber-operations";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

export type TerminateCustomerState = { error: string } | { success: true } | null;

export async function terminateResellerCustomerAction(_previousState: TerminateCustomerState, formData: FormData): Promise<TerminateCustomerState> {
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();
  if (!subscriberId) return { error: "Missing customer." };
  const context = await requireRole("RESELLER");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({ where: { user_id: context.userId }, select: { id: true } });
  if (!profile) return { error: "Reseller profile is not configured." };
  const customer = await tenantDb.subscriber.findFirst({ where: { id: subscriberId, reseller_id: profile.id }, select: { id: true } });
  if (!customer) return { error: "Customer is not assigned to your reseller account." };
  const activeSessions = await tenantDb.session.count({ where: { subscriber_id: subscriberId, status: "ACTIVE" } });
  if (activeSessions > 0) {
    const result = await operateOnSubscriberRemotely(context.organizationId, subscriberId, "isolate");
    if (!result.completed) return { error: "Customer could not be isolated on the router." };
  }
  await tenantDb.subscriber.update({ where: { id: subscriberId }, data: { status: "TERMINATED", deleted_at: new Date() } });
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "reseller.customer_terminated", resource_type: "Subscriber", resource_id: subscriberId } });
  revalidatePath("/reseller");
  return { success: true };
}
