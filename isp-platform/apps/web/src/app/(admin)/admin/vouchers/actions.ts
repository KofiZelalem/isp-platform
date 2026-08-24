"use server";

import { createTenantClient } from "database";
import { createVoucherBatch } from "billing";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type CreateVoucherBatchState =
  | { error: string }
  | { success: true }
  | null;

/** Server Action backing the "Generate vouchers" form; creates a VoucherBatch and its codes. */
export async function createVoucherBatchAction(
  _prevState: CreateVoucherBatchState,
  formData: FormData
): Promise<CreateVoucherBatchState> {
  const name = String(formData.get("name") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const resellerProfileId = String(formData.get("resellerId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const sellingPrice = Number(formData.get("sellingPrice"));

  if (!name) return { error: "Batch name is required." };
  if (!planId) return { error: "Select a package for this batch." };
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 5000) {
    return { error: "Enter a quantity between 1 and 5000." };
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return { error: "Enter a valid selling price." };
  }

  const { organizationId } = await requireCurrentOrganization();

  const tenantDb = createTenantClient(prisma, organizationId);

  try {
    await createVoucherBatch(tenantDb, {
      organizationId,
      planId,
      name,
      prefix: prefix || undefined,
      quantity,
      sellingPrice,
      generatedBy: "admin-portal",
      resellerProfileId: resellerProfileId || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate vouchers." };
  }

  revalidatePath("/admin/vouchers");
  return { success: true };
}

export async function revokeVoucherAction(
  _prevState: CreateVoucherBatchState,
  formData: FormData
): Promise<CreateVoucherBatchState> {
  const voucherId = String(formData.get("voucherId") ?? "").trim();
  if (!voucherId) return { error: "Missing voucher id." };
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const result = await tenantDb.voucher.updateMany({
    where: { id: voucherId, status: { in: ["GENERATED", "SOLD"] } },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) return { error: "Voucher not found or already redeemed." };
  revalidatePath("/admin/vouchers");
  return { success: true };
}

export async function revokeVoucherBatchAction(
  _prevState: CreateVoucherBatchState,
  formData: FormData
): Promise<CreateVoucherBatchState> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  if (!batchId) return { error: "Missing voucher batch id." };
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const result = await tenantDb.voucher.updateMany({
    where: { batch_id: batchId, status: { in: ["GENERATED", "SOLD"] } },
    data: { status: "REVOKED" },
  });
  if (result.count === 0) return { error: "No redeemable vouchers were found in this batch." };
  revalidatePath("/admin/vouchers");
  revalidatePath(`/admin/vouchers/${batchId}`);
  return { success: true };
}
