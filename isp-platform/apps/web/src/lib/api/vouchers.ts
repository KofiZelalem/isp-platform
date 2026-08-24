import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type VoucherBatchListItem = {
  id: string;
  name: string;
  planName: string;
  prefix: string | null;
  quantity: number;
  sellingPrice: string;
  redeemedCount: number;
  generatedCount: number;
  soldCount: number;
  revokedCount: number;
  expiredCount: number;
  currency: string;
  createdAt: string;
};

export async function getVoucherBatchesForOrganization(
  organizationId: string
): Promise<VoucherBatchListItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const batches = await tenantDb.voucherBatch.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      quantity: true,
      selling_price: true,
      created_at: true,
      organization: { select: { currency: true } },
      plan: { select: { name: true } },
      vouchers: { select: { status: true } },
    },
  });

  return batches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    planName: batch.plan.name,
    prefix: batch.prefix,
    quantity: batch.quantity,
    sellingPrice: batch.selling_price.toString(),
    redeemedCount: batch.vouchers.filter((v) => v.status === "REDEEMED").length,
    generatedCount: batch.vouchers.filter((v) => v.status === "GENERATED").length,
    soldCount: batch.vouchers.filter((v) => v.status === "SOLD").length,
    revokedCount: batch.vouchers.filter((v) => v.status === "REVOKED").length,
    expiredCount: batch.vouchers.filter((v) => v.status === "EXPIRED").length,
    currency: batch.organization.currency,
    createdAt: batch.created_at.toISOString(),
  }));
}

export type ActiveServicePlanOption = { id: string; name: string };

export async function getActiveServicePlanOptions(
  organizationId: string
): Promise<ActiveServicePlanOption[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const plans = await tenantDb.servicePlan.findMany({
    where: { is_active: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true },
  });
  return plans;
}
