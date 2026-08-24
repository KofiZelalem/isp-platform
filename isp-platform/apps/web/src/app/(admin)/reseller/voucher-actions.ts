"use server";

import { createVoucherBatch } from "billing";
import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ResellerVoucherState = { error: string } | { success: true } | null;

export async function createResellerVoucherBatchAction(_previousState: ResellerVoucherState, formData: FormData): Promise<ResellerVoucherState> {
  const planId = String(formData.get("planId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const sellingPrice = Number(formData.get("sellingPrice"));
  if (!planId || !name) return { error: "Batch name and package are required." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) return { error: "Quantity must be between 1 and 500." };
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { error: "Selling price must be greater than zero." };
  const context = await requireRole("RESELLER");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({ where: { user_id: context.userId }, select: { id: true } });
  if (!profile) return { error: "Reseller profile is not configured." };
  try {
    await createVoucherBatch(tenantDb, { organizationId: context.organizationId, planId, name, quantity, sellingPrice, generatedBy: context.userId, resellerProfileId: profile.id });
  } catch (error) { return { error: error instanceof Error ? error.message : "Voucher batch could not be created." }; }
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "reseller.voucher_batch_created", resource_type: "VoucherBatch", after_state: { name, quantity } } });
  revalidatePath("/reseller");
  return { success: true };
}
