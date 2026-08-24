"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type PayoutState = { error: string } | { success: true } | null;

export async function requestPayoutAction(_previousState: PayoutState, formData: FormData): Promise<PayoutState> {
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a positive payout amount." };
  const context = await requireRole("RESELLER");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({ where: { user_id: context.userId }, select: { id: true, wallet_balance: true } });
  if (!profile) return { error: "Reseller profile is not configured." };
  if (amount > Number(profile.wallet_balance)) return { error: "Payout exceeds available commission balance." };
  await tenantDb.resellerPayout.create({ data: { organization_id: context.organizationId, reseller_id: profile.id, amount } });
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "reseller.payout_requested", resource_type: "ResellerPayout", after_state: { amount } } });
  revalidatePath("/reseller");
  return { success: true };
}

export async function approvePayoutAction(_previousState: PayoutState, formData: FormData): Promise<PayoutState> {
  const payoutId = String(formData.get("payoutId") ?? "").trim();
  if (!payoutId) return { error: "Missing payout." };
  const context = await requireRole("ISP_ADMIN");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const result = await tenantDb.resellerPayout.updateMany({ where: { id: payoutId, status: "PENDING" }, data: { status: "APPROVED", approved_at: new Date(), processed_by: context.userId } });
  if (!result.count) return { error: "Pending payout not found." };
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "reseller.payout_approved", resource_type: "ResellerPayout", resource_id: payoutId } });
  revalidatePath("/admin/resellers");
  return { success: true };
}

export async function payPayoutAction(_previousState: PayoutState, formData: FormData): Promise<PayoutState> {
  const payoutId = String(formData.get("payoutId") ?? "").trim();
  if (!payoutId) return { error: "Missing payout." };
  const context = await requireRole("ISP_ADMIN");
  const payout = await prisma.resellerPayout.findFirst({ where: { id: payoutId, organization_id: context.organizationId, status: "APPROVED" }, select: { id: true, reseller_id: true, amount: true } });
  if (!payout) return { error: "Approved payout not found." };
  const wallet = await prisma.wallet.findFirst({ where: { organization_id: context.organizationId, reseller_id: payout.reseller_id }, select: { id: true, balance: true } });
  if (!wallet || Number(wallet.balance) < Number(payout.amount)) return { error: "Insufficient reseller balance." };
  await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.resellerPayout.updateMany({ where: { id: payout.id, organization_id: context.organizationId, status: "APPROVED" }, data: { status: "PAID", paid_at: new Date(), processed_by: context.userId } });
    if (!claimed.count) throw new Error("Payout was already processed.");
    const before = wallet.balance;
    const after = Number(before) - Number(payout.amount);
    await transaction.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: payout.amount } } });
    await transaction.walletTransaction.create({ data: { organization_id: context.organizationId, wallet_id: wallet.id, type: "DEDUCTION", amount: payout.amount, balance_before: before, balance_after: after, reference: payout.id, description: "Reseller commission payout" } });
  });
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "reseller.payout_paid", resource_type: "ResellerPayout", resource_id: payout.id } });
  revalidatePath("/admin/resellers");
  return { success: true };
}
