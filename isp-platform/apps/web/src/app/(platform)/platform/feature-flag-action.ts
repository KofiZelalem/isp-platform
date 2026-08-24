"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { setPlatformFeatureFlag } from "@/lib/api/platform-administration";

export type PlatformActionState = { error: string } | { success: true } | null;

export async function setFeatureFlagAction(_previousState: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  if (!organizationId || !key) return { error: "Missing feature flag target." };
  const context = await requireRole("PLATFORM_ADMIN");
  try {
    await setPlatformFeatureFlag({ actorId: context.userId, organizationId, key, enabled });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Feature flag update failed." };
  }
  revalidatePath("/platform");
  return { success: true };
}
