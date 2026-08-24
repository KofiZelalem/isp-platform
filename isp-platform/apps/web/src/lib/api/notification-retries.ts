import "server-only";

import { createTenantClient } from "database";

import { sendConfiguredNotification } from "@/lib/api/configured-notifications";
import { prisma } from "@/lib/db";

export type NotificationRetryResult = {
  originalId: string;
  retryId?: string;
  status: "SENT" | "FAILED";
  attempt: number;
  error?: string;
};

/** Creates a separate retry attempt for one tenant-owned failed notification. */
export async function retryFailedNotification(
  organizationId: string,
  notificationId: string
): Promise<NotificationRetryResult> {
  if (!notificationId.trim()) throw new Error("Notification id is required.");
  const tenantDb = createTenantClient(prisma, organizationId);
  const original = await tenantDb.notification.findFirst({
    where: { id: notificationId, status: "FAILED" },
    select: {
      id: true,
      type: true,
      channel: true,
      message: true,
      subject: true,
      user_id: true,
      subscriber_id: true,
      retry_count: true,
    },
  });
  if (!original) throw new Error("Failed notification not found.");

  const updatedOriginal = await tenantDb.notification.update({
    where: { id: original.id },
    data: { retry_count: { increment: 1 }, last_retry_at: new Date() },
    select: { retry_count: true },
  });
  const attempt = updatedOriginal.retry_count;
  const [user, subscriber] = await Promise.all([
    original.user_id ? tenantDb.user.findUnique({ where: { id: original.user_id }, select: { email: true } }) : null,
    original.subscriber_id ? tenantDb.subscriber.findUnique({ where: { id: original.subscriber_id }, select: { email: true, phone: true } }) : null,
  ]);

  const result = await sendConfiguredNotification({
    organizationId,
    type: original.type,
    channel: original.channel,
    subject: original.subject ?? undefined,
    message: original.message,
    userId: original.user_id ?? undefined,
    subscriberId: original.subscriber_id ?? undefined,
    recipientId: original.user_id ?? original.subscriber_id ?? undefined,
    email: user?.email ?? subscriber?.email ?? undefined,
    phone: subscriber?.phone ?? undefined,
    retryOfId: original.id,
  });

  if (result.status === "SENT") {
    return { originalId: original.id, retryId: result.id, status: "SENT", attempt };
  }

  return {
    originalId: original.id,
    retryId: result.id,
    status: "FAILED",
    attempt,
    error: result.providerError ?? "Notification retry failed.",
  };
}
