import { randomUUID } from "node:crypto";

import { assignPlanToSubscriber } from "billing";
import { createTenantClient, PrismaClient } from "database";

import { toMinorUnits } from "./money";
import { PaystackProvider } from "./paystack";

export interface InitializePaymentInput {
  organizationId: string;
  subscriberId: string;
  planId: string;
  resellerProfileId?: string;
  email: string;
  receiptPhone?: string;
  secretKey: string;
  callbackUrl?: string;
}

export interface InitializePaymentResult {
  paymentId: string;
  authorizationUrl: string;
}

/**
 * Creates a PENDING Payment record then calls Paystack to get a checkout URL.
 * A unique internal reference is used as the Paystack reference; provider_ref
 * is reserved for the provider's settled transaction reference.
 */
export async function initializePaystackPayment(
  prisma: PrismaClient,
  input: InitializePaymentInput
): Promise<InitializePaymentResult> {
  const tenantDb = createTenantClient(prisma, input.organizationId);

  const [plan, subscriber] = await Promise.all([
    tenantDb.servicePlan.findUnique({
      where: { id: input.planId },
      select: { price: true, name: true, is_active: true, organization: { select: { currency: true } } },
    }),
    tenantDb.subscriber.findUnique({ where: { id: input.subscriberId }, select: { id: true } }),
  ]);
  if (!plan || !plan.is_active) {
    throw new Error("Service plan not found or inactive.");
  }
  if (!subscriber) throw new Error("Customer not found in this organization.");

  const currency = plan.organization.currency.toUpperCase();
  if (currency !== "GHS") throw new Error("Paystack checkout currently supports GHS organization currency only.");

  const paymentId = randomUUID();
  const internalReference = `payment_${paymentId}`;
  const amountMinorUnits = toMinorUnits(plan.price, currency);
  const provider = new PaystackProvider(input.secretKey);

  // Initialize Paystack before writing local records so a provider failure
  // cannot leave a pending subscription without a corresponding payment.
  // The tradeoff is that a database failure after provider success requires
  // operational reconciliation using the internal reference.
  const paystackResult = await provider.initializePayment({
    amountMinorUnits,
    currency,
    internalReference,
    customerEmail: input.email,
    callbackUrl: input.callbackUrl ?? "",
    metadata: {
      payment_id: paymentId,
      internal_reference: internalReference,
      plan_id: input.planId,
      subscriber_id: input.subscriberId,
      organization_id: input.organizationId,
    },
  });

  const subscription = await assignPlanToSubscriber(tenantDb, {
    subscriberId: input.subscriberId,
    planId: input.planId,
  });

  await tenantDb.payment.create({
    data: {
      id: paymentId,
      internal_reference: internalReference,
      organization_id: input.organizationId,
      subscriber_id: input.subscriberId,
      subscription_id: subscription.id,
      reseller_id: input.resellerProfileId,
      amount: plan.price,
      currency,
      provider: "PAYSTACK",
      status: "PENDING",
      provider_ref: paystackResult.providerReference,
      provider_response: {
        reseller_profile_id: input.resellerProfileId,
        email: input.email,
        receipt_phone: input.receiptPhone,
        _status: "pending",
      },
    },
  });

  return { paymentId, authorizationUrl: paystackResult.checkoutUrl };
}
