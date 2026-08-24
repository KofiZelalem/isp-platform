import type { TenantPrismaClient } from "database";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { activateSubscription, assignPlanToSubscriber } from "./subscriptions";
import { processResellerCommission } from "./resellers";

// Excludes visually ambiguous characters (0/O, 1/I/L) for print/SMS legibility.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateVoucherCode(length = 10): string {
  if (!Number.isInteger(length) || length < 8 || length > 64) {
    throw new RangeError("Voucher code length must be between 8 and 64 characters.");
  }
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export class ServicePlanUnavailableForVoucherError extends Error {
  constructor(planId: string) {
    super(`Service plan "${planId}" does not exist or is not active.`);
    this.name = "ServicePlanUnavailableForVoucherError";
  }
}

export type CreateVoucherBatchInput = {
  organizationId: string;
  planId: string;
  name: string;
  prefix?: string;
  quantity: number;
  sellingPrice: number;
  generatedBy: string;
  resellerProfileId?: string;
};

/** Creates a VoucherBatch and its pre-paid Voucher codes (Code, Batch ID, Package ID). */
export async function createVoucherBatch(
  tenantDb: TenantPrismaClient,
  input: CreateVoucherBatchInput
) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 5000) {
    throw new RangeError("Voucher quantity must be a whole number between 1 and 5000.");
  }
  if (!Number.isFinite(input.sellingPrice) || input.sellingPrice <= 0) {
    throw new RangeError("Voucher selling price must be greater than zero.");
  }
  if (input.prefix && !/^[A-Z0-9-]{1,20}$/i.test(input.prefix)) {
    throw new RangeError("Voucher prefix may contain only letters, numbers, and hyphens.");
  }
  const plan = await tenantDb.servicePlan.findUnique({
    where: { id: input.planId },
    select: { id: true, is_active: true, validity_days: true },
  });
  if (!plan || !plan.is_active) {
    throw new ServicePlanUnavailableForVoucherError(input.planId);
  }

  if (input.resellerProfileId) {
    const reseller = await tenantDb.resellerProfile.findUnique({
      where: { id: input.resellerProfileId },
      select: { id: true },
    });
    if (!reseller) throw new Error("Reseller profile was not found in this organization.");
  }

  const batch = await tenantDb.voucherBatch.create({
    data: {
      organization_id: input.organizationId,
      plan_id: input.planId,
      name: input.name,
      prefix: input.prefix,
      quantity: input.quantity,
      selling_price: input.sellingPrice,
      generated_by: input.generatedBy,
      reseller_id: input.resellerProfileId,
    },
  });

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.validity_days);

  const codes = new Set<string>();
  while (codes.size < input.quantity) {
    codes.add(`${input.prefix ?? ""}${generateVoucherCode()}`);
  }

  await tenantDb.voucher.createMany({
    data: Array.from(codes).map((code) => ({
      organization_id: input.organizationId,
      batch_id: batch.id,
      code,
      status: "GENERATED" as const,
      expires_at: expiresAt,
    })),
  });

  if (input.resellerProfileId) {
    await processResellerCommission(tenantDb, {
      resellerProfileId: input.resellerProfileId,
      amount: input.sellingPrice * input.quantity,
    });
  }

  return batch;
}

export class VoucherNotRedeemableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoucherNotRedeemableError";
  }
}

export type RedeemVoucherInput = {
  organizationId: string;
  code: string;
  /** Identifies the guest device/subscriber the voucher activates a session for. */
  subscriberUsername: string;
  subscriberFullName: string;
};

export type RedeemVoucherResult = {
  subscriberId: string;
  accessUsername: string;
  accessPassword: string;
  subscriptionId: string;
  planName: string;
  expiresAt: Date | null;
};

/** Redeems a voucher code, creating (or reusing) a guest Subscriber and an ACTIVE subscription for its plan. */
export async function redeemVoucher(
  tenantDb: TenantPrismaClient,
  input: RedeemVoucherInput
): Promise<RedeemVoucherResult> {
  const voucher = await tenantDb.voucher.findFirst({
    where: { code: input.code },
    select: {
      id: true,
      status: true,
      expires_at: true,
      batch: { select: { plan_id: true, plan: { select: { name: true } } } },
    },
  });

  if (!voucher) throw new VoucherNotRedeemableError("Invalid voucher code.");

  if (voucher.expires_at && voucher.expires_at.getTime() <= Date.now() && voucher.status !== "REDEEMED") {
    await tenantDb.voucher.update({ where: { id: voucher.id }, data: { status: "EXPIRED" } });
    throw new VoucherNotRedeemableError("This voucher has expired.");
  }
  if (voucher.status !== "GENERATED" && voucher.status !== "SOLD") {
    throw new VoucherNotRedeemableError(`This voucher has already been ${voucher.status.toLowerCase()}.`);
  }

  const claimed = await tenantDb.voucher.updateMany({
    where: { id: voucher.id, status: { in: ["GENERATED", "SOLD"] } },
    data: { status: "REDEEMED", sold_at: voucher.status === "SOLD" ? undefined : new Date() },
  });
  if (claimed.count !== 1) {
    throw new VoucherNotRedeemableError("This voucher has already been redeemed.");
  }

  const subscriber = await tenantDb.subscriber.upsert({
    where: {
      organization_id_username: {
        organization_id: input.organizationId,
        username: input.subscriberUsername,
      },
    },
    update: {},
    create: {
      organization_id: input.organizationId,
      username: input.subscriberUsername,
      // The voucher is the one-time NAS credential; only its bcrypt hash is stored.
      password_hash: await bcrypt.hash(input.code, 10),
      full_name: input.subscriberFullName,
      status: "ACTIVE",
    },
  });

  const pendingSubscription = await assignPlanToSubscriber(tenantDb, {
    subscriberId: subscriber.id,
    planId: voucher.batch.plan_id,
  });
  const subscription = await activateSubscription(tenantDb, pendingSubscription.id);

  await tenantDb.voucher.update({
    where: { id: voucher.id },
    data: { status: "REDEEMED" },
  });
  await tenantDb.voucherUse.create({
    data: {
      organization_id: input.organizationId,
      voucher_id: voucher.id,
      subscriber_id: subscriber.id,
    },
  });

  return {
    subscriberId: subscriber.id,
    accessUsername: input.subscriberUsername,
    accessPassword: input.code,
    subscriptionId: subscription.id,
    planName: voucher.batch.plan.name,
    expiresAt: subscription.expires_at,
  };
}
