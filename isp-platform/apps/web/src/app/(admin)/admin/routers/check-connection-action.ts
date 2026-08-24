"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { checkRouterConnectionForOrganization } from "@/lib/api/router-management";

export type CheckRouterState = { error: string } | { success: true } | null;

export async function checkRouterConnectionAction(
  _previousState: CheckRouterState,
  formData: FormData
): Promise<CheckRouterState> {
  const nodeId = String(formData.get("nodeId") ?? "").trim();
  if (!nodeId) return { error: "Missing router id." };

  const { organizationId } = await requireCurrentOrganization();
  try {
    await checkRouterConnectionForOrganization(organizationId, nodeId);
  } catch (error) {
    revalidatePath("/admin/routers");
    return { error: error instanceof Error ? error.message : "Router connection failed." };
  }

  revalidatePath("/admin/routers");
  return { success: true };
}
