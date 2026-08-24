import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";
import { sendConfiguredNotification } from "@/lib/api/configured-notifications";

const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;
const LOW_DATA_PERCENT = 80;

export type CustomerReminderResult = {
  organizationId: string;
  subscriptionId: string;
  reminder: "EXPIRY_SOON" | "EXPIRED" | "LOW_DATA";
  status: "SENT" | "SKIPPED" | "FAILED";
  error?: string;
};

function reminderSubject(reminder: CustomerReminderResult["reminder"], subscriptionId: string): string {
  return `customer-reminder:${reminder}:${subscriptionId}`;
}

function expiryText(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(expiresAt);
}

async function deliverOnce(input: {
  organizationId: string;
  subscriptionId: string;
  reminder: CustomerReminderResult["reminder"];
  phone: string | null;
  message: string;
}): Promise<CustomerReminderResult> {
  const tenantDb = createTenantClient(prisma, input.organizationId);
  const subject = reminderSubject(input.reminder, input.subscriptionId);
  const existing = await tenantDb.notification.findFirst({ where: { subject }, select: { id: true } });
  if (existing) return { organizationId: input.organizationId, subscriptionId: input.subscriptionId, reminder: input.reminder, status: "SKIPPED" };
  if (!input.phone) return { organizationId: input.organizationId, subscriptionId: input.subscriptionId, reminder: input.reminder, status: "SKIPPED", error: "Customer has no phone number." };

  const result = await sendConfiguredNotification({
    organizationId: input.organizationId,
    subscriberId: undefined,
    recipientId: input.subscriptionId,
    type: input.reminder === "LOW_DATA" ? "GENERAL" : "EXPIRY",
    channel: "SMS",
    phone: input.phone,
    subject,
    message: input.message,
  });
  return {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    reminder: input.reminder,
    status: result.status === "SENT" ? "SENT" : "FAILED",
    error: result.providerError,
  };
}

/** Sends one low-data/expiry reminder per subscription, then expires overdue access. */
export async function deliverCustomerReminders(now = new Date()): Promise<CustomerReminderResult[]> {
  const organizations = await prisma.organization.findMany({
    where: { status: "ACTIVE", deleted_at: null },
    select: { id: true, name: true },
  });
  const results: CustomerReminderResult[] = [];

  for (const organization of organizations) {
    const tenantDb = createTenantClient(prisma, organization.id);
    const subscriptions = await tenantDb.subscription.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        expires_at: true,
        data_used_mb: true,
        subscriber: { select: { full_name: true, phone: true } },
        plan: { select: { name: true, data_limit_mb: true } },
      },
    });

    for (const subscription of subscriptions) {
      const customer = subscription.subscriber.full_name;
      if (subscription.expires_at && subscription.expires_at <= now) {
        results.push(await deliverOnce({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          reminder: "EXPIRED",
          phone: subscription.subscriber.phone,
          message: `${customer}, your ${subscription.plan.name} package has expired. Visit the hotspot portal to buy another package.`,
        }));
        continue;
      }

      if (subscription.expires_at && subscription.expires_at.getTime() - now.getTime() <= EXPIRY_WARNING_MS) {
        results.push(await deliverOnce({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          reminder: "EXPIRY_SOON",
          phone: subscription.subscriber.phone,
          message: `${customer}, your ${subscription.plan.name} package expires on ${expiryText(subscription.expires_at)}. Buy another package to stay connected.`,
        }));
      }

      const limit = subscription.plan.data_limit_mb;
      if (limit && subscription.data_used_mb * 100 >= limit * LOW_DATA_PERCENT) {
        const remaining = Math.max(0, limit - subscription.data_used_mb);
        results.push(await deliverOnce({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          reminder: "LOW_DATA",
          phone: subscription.subscriber.phone,
          message: `${customer}, your ${subscription.plan.name} package has ${remaining} MB remaining. Buy another package before your data finishes.`,
        }));
      }
    }

    await tenantDb.subscription.updateMany({
      where: { status: "ACTIVE", expires_at: { lte: now } },
      data: { status: "EXPIRED" },
    });
  }
  return results;
}