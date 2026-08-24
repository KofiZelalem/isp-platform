import Link from "next/link";

import { createTenantClient } from "database";

import { Badge } from "@/components/ui/badge";
import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value) : "No expiry";
}

export default async function SubscriptionsPage() {
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const subscriptions = await tenantDb.subscription.findMany({
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      started_at: true,
      expires_at: true,
      subscriber: { select: { id: true, full_name: true, username: true } },
      plan: { select: { name: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Recent plan access for your customers.</p>
      </div>
      {subscriptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No subscriptions yet. Assign a package from a customer profile to create one.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/customers/${subscription.subscriber.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{subscription.subscriber.full_name}</Link>
                  <p className="truncate text-sm text-muted-foreground">{subscription.subscriber.username} · {subscription.plan.name}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Ends {formatDate(subscription.expires_at)}</span>
                  <Badge variant={subscription.status === "ACTIVE" ? "default" : "secondary"}>{subscription.status.toLowerCase()}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}