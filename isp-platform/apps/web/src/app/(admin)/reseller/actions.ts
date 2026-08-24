"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ResellerVoucherActionState = { error: string } | { success: true } | null;

export async function revokeOwnVoucherAction(_previousState: ResellerVoucherActionState, formData: FormData): Promise<ResellerVoucherActionState> {
  const voucherId = String(formData.get("voucherId") ?? "").trim();
  if (!voucherId) return { error: "Missing voucher." };
  const context = await requireRole("RESELLER");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({ where: { user_id: context.userId }, select: { id: true } });
  if (!profile) return { error: "Reseller profile is not configured." };
  const updated = await tenantDb.voucher.updateMany({ where: { id: voucherId, status: { in: ["GENERATED", "SOLD"] }, batch: { reseller_id: profile.id } }, data: { status: "REVOKED" } });
  if (updated.count === 0) return { error: "Voucher not found in your inventory or already used." };
  revalidatePath("/reseller");
  return { success: true };
}
