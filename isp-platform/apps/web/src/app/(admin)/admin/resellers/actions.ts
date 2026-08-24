"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOrganizationPermission } from "@/lib/permissions";

export type ResellerActionState = { error: string } | { success: true } | null;

export async function createResellerProfileAction(
  _previousState: ResellerActionState,
  formData: FormData
): Promise<ResellerActionState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const commissionRate = Number(formData.get("commissionRate"));
  if (!userId) return { error: "Select a reseller user." };
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return { error: "Commission rate must be between 0 and 100." };
  }

  const context = await requireOrganizationPermission("RESELLER_MANAGE");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const user = await prisma.user.findFirst({ where: { id: userId, organization_id: context.organizationId, role: "RESELLER", deleted_at: null }, select: { id: true } });
  if (!user) return { error: "Reseller user not found in this organization." };

  try {
    await tenantDb.resellerProfile.create({
      data: { user_id: user.id, organization_id: context.organizationId, commission_rate: commissionRate },
    });
  } catch {
    return { error: "A reseller profile already exists for this user." };
  }

  revalidatePath("/admin/resellers");
  return { success: true };
}

export async function updateResellerProfileAction(
  _previousState: ResellerActionState,
  formData: FormData
): Promise<ResellerActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const commissionRate = Number(formData.get("commissionRate"));
  if (!profileId) return { error: "Missing reseller profile." };
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return { error: "Commission rate must be between 0 and 100." };
  }

  const context = await requireOrganizationPermission("RESELLER_MANAGE");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const updated = await tenantDb.resellerProfile.updateMany({ where: { id: profileId }, data: { commission_rate: commissionRate } });
  if (updated.count === 0) return { error: "Reseller profile not found." };

  revalidatePath("/admin/resellers");
  return { success: true };
}

export async function toggleResellerActiveAction(
  _previousState: ResellerActionState,
  formData: FormData
): Promise<ResellerActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const active = String(formData.get("active") ?? "false") === "true";
  if (!profileId) return { error: "Missing reseller profile." };

  const context = await requireOrganizationPermission("RESELLER_MANAGE");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findFirst({ where: { id: profileId }, select: { user_id: true } });
  if (!profile) return { error: "Reseller profile not found." };
  const updated = await prisma.user.updateMany({ where: { id: profile.user_id, organization_id: context.organizationId, role: "RESELLER" }, data: { is_active: active } });
  if (updated.count === 0) return { error: "Reseller user not found." };

  revalidatePath("/admin/resellers");
  return { success: true };
}
