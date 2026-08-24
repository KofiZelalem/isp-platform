"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { operateOnSubscriberRemotely, type SubscriberRemoteOperation } from "@/lib/api/remote-subscriber-operations";

export type SubscriberNetworkActionState = { error: string } | { success: true } | null;

export async function subscriberNetworkAction(
  _previousState: SubscriberNetworkActionState,
  formData: FormData
): Promise<SubscriberNetworkActionState> {
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();
  const operation = String(formData.get("operation") ?? "") as SubscriberRemoteOperation;
  if (!subscriberId) return { error: "Missing subscriber id." };
  if (operation !== "isolate" && operation !== "restore") return { error: "Invalid network operation." };

  const { organizationId } = await requireCurrentOrganization();
  try {
    const result = await operateOnSubscriberRemotely(organizationId, subscriberId, operation);
    if (!result.completed) {
      return { error: result.routers.find((router) => router.status === "FAILED")?.error ?? "Router operation failed." };
    }

    const tenantDb = createTenantClient(prisma, organizationId);
    await tenantDb.subscriber.update({
      where: { id: subscriberId },
      data: { status: operation === "isolate" ? "SUSPENDED" : "ACTIVE" },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Router operation failed." };
  }

  revalidatePath(`/admin/customers/${subscriberId}`);
  revalidatePath("/admin/customers");
  return { success: true };
}
