"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireOrganizationPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export type AssignmentState = { error: string } | { success: true } | null;

export async function assignCustomerToResellerAction(_previousState: AssignmentState, formData: FormData): Promise<AssignmentState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();
  if (!profileId || !subscriberId) return { error: "Select a reseller and customer." };
  const context = await requireOrganizationPermission("RESELLER_MANAGE");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findFirst({ where: { id: profileId }, select: { id: true } });
  if (!profile) return { error: "Reseller profile not found." };
  const updated = await tenantDb.subscriber.updateMany({ where: { id: subscriberId }, data: { reseller_id: profile.id } });
  if (updated.count === 0) return { error: "Customer not found." };
  revalidatePath("/admin/resellers");
  revalidatePath("/admin/customers");
  return { success: true };
}

export async function unassignCustomerFromResellerAction(_previousState: AssignmentState, formData: FormData): Promise<AssignmentState> {
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();
  if (!subscriberId) return { error: "Missing customer." };
  const context = await requireOrganizationPermission("RESELLER_MANAGE");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const updated = await tenantDb.subscriber.updateMany({ where: { id: subscriberId }, data: { reseller_id: null } });
  if (updated.count === 0) return { error: "Customer not found." };
  revalidatePath("/admin/resellers");
  revalidatePath("/admin/customers");
  return { success: true };
}
