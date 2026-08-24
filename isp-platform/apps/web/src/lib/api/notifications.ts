import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type NotificationFeedItem = {
  id: string;
  type: string;
  message: string;
  status: string;
  channel: string;
  createdAt: string;
  isRead: boolean;
  retryOfId: string | null;
  retryCount: number;
};

/** Fetches the latest alerts through an organization-bound Prisma client. */
export async function getNotificationsForOrganization(
  organizationId: string
): Promise<NotificationFeedItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const notifications = await tenantDb.notification.findMany({
    orderBy: { created_at: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      message: true,
      status: true,
      channel: true,
      created_at: true,
      is_read: true,
      retry_of_id: true,
      retry_count: true,
    },
  });

  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    message: notification.message,
    status: notification.status,
    channel: notification.channel,
    createdAt: notification.created_at.toISOString(),
    isRead: notification.is_read,
    retryOfId: notification.retry_of_id,
    retryCount: notification.retry_count,
  }));
}
