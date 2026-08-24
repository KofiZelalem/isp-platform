import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";
import { getSessionOperationalAlertsForOrganization } from "@/lib/api/sessions";
import { sendConfiguredNotification } from "@/lib/api/configured-notifications";

export type OperationalAlertDeliveryResult = {
  organizationId: string;
  alertKey: string;
  status: "SENT" | "SKIPPED" | "FAILED";
  notificationId?: string;
  error?: string;
};

/** Delivers current session alerts with a short deduplication window. */
export async function deliverOperationalAlerts(
  now = new Date()
): Promise<OperationalAlertDeliveryResult[]> {
  const organizations = await prisma.organization.findMany({
    where: { status: "ACTIVE", deleted_at: null },
    select: { id: true, name: true },
  });
  const results: OperationalAlertDeliveryResult[] = [];

  for (const organization of organizations) {
    const tenantDb = createTenantClient(prisma, organization.id);
    const alerts = await getSessionOperationalAlertsForOrganization(organization.id, now.getTime());
    const recipients = await tenantDb.user.findMany({
      where: { role: { in: ["ISP_ADMIN", "STAFF"] }, is_active: true, deleted_at: null },
      select: { id: true, email: true },
    });

    for (const alert of alerts) {
      const message = `${alert.message} (${alert.count}).`;
      const recent = await tenantDb.notification.findFirst({
        where: {
          type: "GENERAL",
          message,
          created_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (recent) {
        results.push({ organizationId: organization.id, alertKey: alert.key, status: "SKIPPED", notificationId: recent.id });
        continue;
      }

      let delivered = false;
      let firstError: string | undefined;
      for (const recipient of recipients) {
        const result = await sendConfiguredNotification({
          organizationId: organization.id,
          userId: recipient.id,
          recipientId: recipient.id,
          email: recipient.email,
          type: "GENERAL",
          channel: "IN_APP",
          subject: `ISP-OS operational alert: ${organization.name}`,
          message,
        });
        if (result.status === "SENT") delivered = true;
        else firstError ??= result.providerError;
      }

      results.push({
        organizationId: organization.id,
        alertKey: alert.key,
        status: delivered ? "SENT" : "FAILED",
        error: delivered ? undefined : firstError ?? "No active staff recipients found.",
      });
    }
  }

  return results;
}
