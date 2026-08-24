"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { applySubscriberRatePolicyRemotely } from "@/lib/api/remote-rate-policy";

export type RatePolicyActionState = { error: string } | { success: true } | null;

export async function applyRatePolicyAction(
  _previousState: RatePolicyActionState,
  formData: FormData
): Promise<RatePolicyActionState> {
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();
  if (!subscriberId) return { error: "Missing subscriber id." };
  const { organizationId } = await requireCurrentOrganization();

  try {
    const result = await applySubscriberRatePolicyRemotely(organizationId, subscriberId);
    if (!result.completed) return { error: result.routers.find((router) => router.status === "FAILED")?.error ?? "Rate policy failed on one or more routers." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Rate policy failed." };
  }

  revalidatePath(`/admin/customers/${subscriberId}`);
  return { success: true };
}
