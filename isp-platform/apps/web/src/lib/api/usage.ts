import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type SubscriberUsage = {
  subscriberId: string;
  subscriberName: string;
  sessionCount: number;
  totalUpMb: number;
  totalDownMb: number;
};

export type UsageOverview = {
  perSubscriber: SubscriberUsage[];
  totalUpMb: number;
  totalDownMb: number;
};

/** Aggregates all recorded session bandwidth per subscriber for the organization. */
export async function getUsageForOrganization(
  organizationId: string,
  sinceDays?: number
): Promise<UsageOverview> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const where =
    typeof sinceDays === "number" && sinceDays > 0
      ? { started_at: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) } }
      : undefined;

  const sessions = await tenantDb.session.findMany({
    where,
    select: {
      data_up_mb: true,
      data_down_mb: true,
      subscriber: { select: { id: true, full_name: true, username: true } },
    },
  });

  const bySubscriber = new Map<string, SubscriberUsage>();
  let totalUpMb = 0;
  let totalDownMb = 0;

  for (const session of sessions) {
    totalUpMb += session.data_up_mb;
    totalDownMb += session.data_down_mb;

    const existing = bySubscriber.get(session.subscriber.id);
    if (existing) {
      existing.sessionCount += 1;
      existing.totalUpMb += session.data_up_mb;
      existing.totalDownMb += session.data_down_mb;
    } else {
      bySubscriber.set(session.subscriber.id, {
        subscriberId: session.subscriber.id,
        subscriberName: session.subscriber.full_name || session.subscriber.username,
        sessionCount: 1,
        totalUpMb: session.data_up_mb,
        totalDownMb: session.data_down_mb,
      });
    }
  }

  const perSubscriber = Array.from(bySubscriber.values()).sort(
    (a, b) => b.totalUpMb + b.totalDownMb - (a.totalUpMb + a.totalDownMb)
  );

  return { perSubscriber, totalUpMb, totalDownMb };
}
