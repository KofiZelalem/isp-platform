import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type ResellerOperations = {
  profileId: string;
  assignedCustomers: Array<{ id: string; username: string; name: string; email: string | null; phone: string | null; status: string; createdAt: string }>;
  voucherBatches: Array<{ id: string; name: string; quantity: number; redeemed: number; available: number; createdAt: string }>;
  successfulSalesAmount: string;
  commissionRate: string;
  commissionEarned: string;
  walletBalance: string;
  inventory: Array<{ id: string; batchName: string; code: string; status: string; soldAt: string | null }>;
};

/** Returns only the authenticated reseller's tenant-owned customer, voucher, and commission activity. */
export async function getResellerOperationsForUser(organizationId: string, userId: string, search?: string): Promise<ResellerOperations | null> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({
    where: { user_id: userId },
    select: {
      id: true,
      commission_rate: true,
      wallet_balance: true,
      subscribers: { where: search ? { OR: [{ full_name: { contains: search, mode: "insensitive" } }, { username: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : undefined, orderBy: { created_at: "desc" }, select: { id: true, username: true, full_name: true, email: true, phone: true, status: true, created_at: true } },
      voucher_batches: { orderBy: { created_at: "desc" }, select: { id: true, name: true, quantity: true, created_at: true, vouchers: { select: { id: true, code: true, status: true, sold_at: true } } } },
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });
  if (!profile) return null;
  const salesAmount = profile.payments.reduce((total, payment) => total + Number(payment.amount), 0);
  const commissionEarned = Number(((salesAmount * Number(profile.commission_rate)) / 100).toFixed(4));
  return {
    profileId: profile.id,
    assignedCustomers: profile.subscribers.map((subscriber) => ({ id: subscriber.id, username: subscriber.username, name: subscriber.full_name, email: subscriber.email, phone: subscriber.phone, status: subscriber.status, createdAt: subscriber.created_at.toISOString() })),
    voucherBatches: profile.voucher_batches.map((batch) => ({ id: batch.id, name: batch.name, quantity: batch.quantity, redeemed: batch.vouchers.filter((voucher) => voucher.status === "REDEEMED").length, available: batch.vouchers.filter((voucher) => voucher.status === "GENERATED" || voucher.status === "SOLD").length, createdAt: batch.created_at.toISOString() })),
    successfulSalesAmount: salesAmount.toFixed(2),
    commissionRate: profile.commission_rate.toString(),
    commissionEarned: commissionEarned.toFixed(4),
    walletBalance: profile.wallet_balance.toString(),
    inventory: profile.voucher_batches.flatMap((batch) => batch.vouchers.map((voucher) => ({ id: voucher.id, batchName: batch.name, code: voucher.code, status: voucher.status, soldAt: voucher.sold_at?.toISOString() ?? null }))).slice(0, 100),
  };
}
