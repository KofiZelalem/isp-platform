import { activateSubscription } from "billing";
import type { TenantPrismaClient } from "database";

import { toMinorUnits } from "./money";

export type SettlePaymentInput = {
  internalReference: string;
  providerReference: string;
  amountSmallestUnit: number;
  currency: string;
  paidAt?: Date;
  paymentMethod?: string;
  providerResponse?: Record<string, unknown>;
};

export type FailPaymentInput = {
  internalReference: string;
  reason: string;
  providerResponse?: Record<string, unknown>;
};

export class PaymentSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentSettlementError";
  }
}

/**
 * Settles a verified provider transaction exactly once. The conditional update
 * is the idempotency claim: only one concurrent delivery can move PENDING to
 * SUCCESS, while retries can finish a previously claimed subscription.
 */
export async function settlePaystackPayment(
  tenantDb: TenantPrismaClient,
  input: SettlePaymentInput
) {
  const payment = await tenantDb.payment.findUnique({
    where: { internal_reference: input.internalReference },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      subscription_id: true,
      subscription: { select: { id: true, status: true } },
    },
  });
  if (!payment) throw new PaymentSettlementError("Payment reference was not found.");

  const expectedAmount = toMinorUnits(payment.amount.toString(), payment.currency);
  if (expectedAmount !== input.amountSmallestUnit || payment.currency !== input.currency) {
    throw new PaymentSettlementError("Verified payment amount or currency does not match the billing record.");
  }

  if (payment.status !== "SUCCESS") {
    if (payment.status !== "PENDING") {
      throw new PaymentSettlementError(`Payment cannot be settled from ${payment.status} status.`);
    }
    const claimed = await tenantDb.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: "SUCCESS",
        provider_ref: input.providerReference,
        paid_at: input.paidAt ?? new Date(),
        payment_method: input.paymentMethod,
        provider_response: input.providerResponse,
      },
    });
    if (claimed.count === 0) return { paymentId: payment.id, alreadySettled: true };
  }

  if (payment.subscription?.status === "PENDING") {
    await activateSubscription(tenantDb, payment.subscription.id, input.paidAt ?? new Date());
  }

  return { paymentId: payment.id, alreadySettled: payment.status === "SUCCESS" };
}

/** Records a verified failed provider attempt without touching its subscription. */
export async function failPaystackPayment(
  tenantDb: TenantPrismaClient,
  input: FailPaymentInput
) {
  const result = await tenantDb.payment.updateMany({
    where: { internal_reference: input.internalReference, status: "PENDING" },
    data: { status: "FAILED", failure_reason: input.reason, provider_response: input.providerResponse },
  });
  return { failed: result.count === 1 };
}