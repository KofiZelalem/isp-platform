import type { TenantPrismaClient } from "database";

export type ResellerCommissionInput = {
  resellerProfileId: string;
  amount: number;
};

export type ResellerCommissionResult = {
  resellerProfileId: string;
  commissionRate: string;
  commissionAmount: number;
  walletBalance: string;
};

/** Calculates and atomically credits a reseller's commission wallet. */
export async function processResellerCommission(
  tenantDb: TenantPrismaClient,
  input: ResellerCommissionInput
): Promise<ResellerCommissionResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Commission source amount must be greater than zero.");
  }

  const profile = await tenantDb.resellerProfile.findUnique({
    where: { id: input.resellerProfileId },
    select: { id: true, commission_rate: true },
  });
  if (!profile) throw new Error("Reseller profile was not found in this organization.");

  const commissionRate = Number(profile.commission_rate);
  const commissionAmount = Number(((input.amount * commissionRate) / 100).toFixed(4));
  const updated = await tenantDb.resellerProfile.update({
    where: { id: profile.id },
    data: { wallet_balance: { increment: commissionAmount } },
    select: { wallet_balance: true },
  });

  return {
    resellerProfileId: profile.id,
    commissionRate: profile.commission_rate.toString(),
    commissionAmount,
    walletBalance: updated.wallet_balance.toString(),
  };
}
