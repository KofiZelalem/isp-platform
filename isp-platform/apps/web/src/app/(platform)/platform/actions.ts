"use server"

import { revalidatePath } from "next/cache"

import { setOrganizationStatus } from "@/lib/api/platform"
import { requireRole } from "@/lib/auth"

export async function toggleOrganizationStatusAction(
  organizationId: string,
  status: "ACTIVE" | "SUSPENDED"
): Promise<void> {
  const actor = await requireRole("PLATFORM_ADMIN")

  await setOrganizationStatus(actor.userId, organizationId, status)
  revalidatePath("/platform")
}
