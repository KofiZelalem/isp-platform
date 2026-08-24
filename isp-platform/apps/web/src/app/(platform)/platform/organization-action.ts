"use server";

import { revalidatePath } from "next/cache";

import { updatePlatformOrganization } from "@/lib/api/platform-administration";
import { requireRole } from "@/lib/auth";

export type OrganizationActionState = { error: string } | { success: true } | null;

export async function updatePlatformOrganizationAction(_previousState: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const planTier = String(formData.get("planTier") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!organizationId) return { error: "Missing organization." };
  const context = await requireRole("PLATFORM_ADMIN");
  try {
    await updatePlatformOrganization({ actorId: context.userId, organizationId, name, planTier, timezone });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Organization update failed." };
  }
  revalidatePath("/platform");
  return { success: true };
}
