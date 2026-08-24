import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type ResellerOption = {
  id: string;
  name: string;
  commissionRate: string;
};

export async function getResellerOptionsForOrganization(
  organizationId: string
): Promise<ResellerOption[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const profiles = await tenantDb.resellerProfile.findMany({
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      commission_rate: true,
      user: { select: { full_name: true, email: true } },
    },
  });

  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.user.full_name || profile.user.email,
    commissionRate: profile.commission_rate.toString(),
  }));
}

export type ResellerProfileSummary = {
  id: string;
  userName: string;
  email: string;
  commissionRate: string;
  walletBalance: string;
  isActive: boolean;
  voucherBatchCount: number;
  assignedCustomerCount: number;
  voucherCount: number;
  redeemedVoucherCount: number;
  successfulSalesAmount: string;
  commissionEarned: string;
};

/** Fetches every reseller profile for the organization's management table. */
export async function getResellerProfilesForOrganization(
  organizationId: string
): Promise<ResellerProfileSummary[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const profiles = await tenantDb.resellerProfile.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      commission_rate: true,
      wallet_balance: true,
      user: { select: { full_name: true, email: true, is_active: true } },
      subscribers: { select: { id: true } },
      voucher_batches: { select: { id: true, vouchers: { select: { status: true } } } },
      payments: { where: { status: "SUCCESS" }, select: { amount: true } },
    },
  });

  return profiles.map((profile) => ({
    id: profile.id,
    userName: profile.user.full_name || profile.user.email,
    email: profile.user.email,
    commissionRate: profile.commission_rate.toString(),
    walletBalance: profile.wallet_balance.toString(),
    isActive: profile.user.is_active,
    voucherBatchCount: profile.voucher_batches.length,
    assignedCustomerCount: profile.subscribers.length,
    voucherCount: profile.voucher_batches.reduce((total, batch) => total + batch.vouchers.length, 0),
    redeemedVoucherCount: profile.voucher_batches.reduce((total, batch) => total + batch.vouchers.filter((voucher) => voucher.status === "REDEEMED").length, 0),
    successfulSalesAmount: profile.payments.reduce((total, payment) => total + Number(payment.amount), 0).toFixed(2),
    commissionEarned: ((profile.payments.reduce((total, payment) => total + Number(payment.amount), 0) * Number(profile.commission_rate)) / 100).toFixed(4),
  }));
}
