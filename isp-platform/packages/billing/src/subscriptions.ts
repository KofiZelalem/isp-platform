import type { TenantPrismaClient } from "database";

import { computeExpiresAt, transition } from "./subscription-state-machine";

export class ServicePlanUnavailableError extends Error {
  constructor(planId: string) {
    super(`Service plan "${planId}" does not exist or is not active.`);
    this.name = "ServicePlanUnavailableError";
  }
}

export class SubscriberUnavailableError extends Error {
  constructor(subscriberId: string) {
    super(`Subscriber "${subscriberId}" does not exist in this organization.`);
    this.name = "SubscriberUnavailableError";
  }
}

export type AssignPlanInput = {
  subscriberId: string;
  planId: string;
  autoRenew?: boolean;
};

/**
 * Assigns a service plan to a subscriber after checking both relations belong
 * to the tenant client. Assignment creates a pending entitlement; payment or
 * an explicit operator action must call activateSubscription separately.
 */
export async function assignPlanToSubscriber(
  tenantDb: TenantPrismaClient,
  { subscriberId, planId, autoRenew = false }: AssignPlanInput
) {
  const plan = await tenantDb.servicePlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.is_active) {
    throw new ServicePlanUnavailableError(planId);
  }

  const subscriber = await tenantDb.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true },
  });
  if (!subscriber) throw new SubscriberUnavailableError(subscriberId);

  const startedAt = new Date();

  return tenantDb.subscription.create({
    data: {
      organization_id: plan.organization_id,
      subscriber_id: subscriberId,
      plan_id: planId,
      status: "PENDING",
      started_at: startedAt,
      expires_at: computeExpiresAt(startedAt, plan.validity_days),
      auto_renew: autoRenew,
    },
  });
}

/** Activates an existing pending subscription without asserting that payment occurred. */
export async function activateSubscription(
  tenantDb: TenantPrismaClient,
  subscriptionId: string,
  startedAt = new Date()
) {
  const subscription = await tenantDb.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, status: true, plan: { select: { validity_days: true } } },
  });
  if (!subscription) throw new Error("Subscription was not found in this organization.");

  const status = transition(subscription.status, "CONFIRM_PAYMENT");
  return tenantDb.subscription.update({
    where: { id: subscription.id },
    data: {
      status,
      started_at: startedAt,
      expires_at: computeExpiresAt(startedAt, subscription.plan.validity_days),
    },
  });
}

/** Marks active subscriptions whose UTC expiry has passed as EXPIRED. */
export async function expireSubscriptions(tenantDb: TenantPrismaClient, now = new Date()) {
  return tenantDb.subscription.updateMany({
    where: { status: "ACTIVE", expires_at: { lte: now } },
    data: { status: "EXPIRED" },
  });
}
