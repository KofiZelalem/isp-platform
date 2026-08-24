import type { TenantPrismaClient } from "database";

export type AccountingStartRequest = {
  organizationId: string;
  subscriberId: string;
  nodeId: string;
  radiusSessionId: string;
  ipAddress?: string;
  macAddress?: string;
};

/** Handles an Accounting-Request(Start) by opening a Session record. */
export async function handleAccountingStart(
  tenantDb: TenantPrismaClient,
  request: AccountingStartRequest
) {
  if (!request.radiusSessionId.trim()) {
    throw new Error("Acct-Session-Id is required.");
  }
  const [subscriber, node, existingSession] = await Promise.all([
    tenantDb.subscriber.findUnique({ where: { id: request.subscriberId }, select: { id: true } }),
    tenantDb.networkNode.findUnique({ where: { id: request.nodeId }, select: { id: true } }),
    tenantDb.session.findFirst({ where: { radius_session: request.radiusSessionId } }),
  ]);
  if (!subscriber) throw new Error("Subscriber was not found in this organization.");
  if (!node) throw new Error("Network node was not found in this organization.");
  if (existingSession) return existingSession;

  return tenantDb.session.create({
    data: {
      organization_id: request.organizationId,
      subscriber_id: request.subscriberId,
      node_id: request.nodeId,
      radius_session: request.radiusSessionId,
      ip_address: request.ipAddress,
      mac_address: request.macAddress,
      status: "ACTIVE",
    },
  });
}

export type AccountingUpdateRequest = {
  radiusSessionId: string;
  dataUpMb: number; // cumulative Acct-Input-Octets, converted to MB by the caller
  dataDownMb: number; // cumulative Acct-Output-Octets, converted to MB by the caller
  durationSec: number;
};

export type AccountingUpdateResult =
  | { action: "continue" }
  | { action: "disconnect"; reason: string };

/**
 * Handles an Accounting-Request(Interim-Update): updates the session's
 * counters and rolls the usage delta into the subscription's data balance,
 * signalling a disconnect once the plan's data allowance is exhausted.
 */
export async function handleAccountingUpdate(
  tenantDb: TenantPrismaClient,
  request: AccountingUpdateRequest
): Promise<AccountingUpdateResult> {
  if (!request.radiusSessionId.trim() || !Number.isInteger(request.dataUpMb) || request.dataUpMb < 0 || !Number.isInteger(request.dataDownMb) || request.dataDownMb < 0 || !Number.isInteger(request.durationSec) || request.durationSec < 0) {
    return { action: "disconnect", reason: "Accounting counters must be non-negative whole numbers." };
  }
  const session = await tenantDb.session.findFirst({
    where: { radius_session: request.radiusSessionId, status: "ACTIVE" },
    select: { id: true, subscriber_id: true, data_up_mb: true, data_down_mb: true },
  });
  if (!session) {
    return { action: "disconnect", reason: "No active session found for this Acct-Session-Id." };
  }
  const deltaUp = Math.max(0, request.dataUpMb - session.data_up_mb);
  const deltaDown = Math.max(0, request.dataDownMb - session.data_down_mb);

  await tenantDb.session.update({
    where: { id: session.id },
    data: {
      data_up_mb: request.dataUpMb,
      data_down_mb: request.dataDownMb,
      duration_sec: request.durationSec,
    },
  });

  const subscription = await tenantDb.subscription.findFirst({
    where: { subscriber_id: session.subscriber_id, status: "ACTIVE" },
    orderBy: { started_at: "desc" },
    select: { id: true, data_used_mb: true, plan: { select: { data_limit_mb: true } } },
  });
  if (!subscription) {
    return { action: "disconnect", reason: "No active subscription." };
  }

  const newUsage = subscription.data_used_mb + deltaUp + deltaDown;
  await tenantDb.subscription.update({
    where: { id: subscription.id },
    data: { data_used_mb: newUsage },
  });

  if (subscription.plan.data_limit_mb !== null && newUsage >= subscription.plan.data_limit_mb) {
    return { action: "disconnect", reason: "Data allowance exhausted." };
  }
  return { action: "continue" };
}

export type AccountingStopRequest = {
  radiusSessionId: string;
  terminationCause?: string;
};

/** Handles an Accounting-Request(Stop) by closing out the Session record. */
export async function handleAccountingStop(
  tenantDb: TenantPrismaClient,
  request: AccountingStopRequest
) {
  const session = await tenantDb.session.findFirst({
    where: { radius_session: request.radiusSessionId },
    select: { id: true },
  });
  if (!session) return null;

  return tenantDb.session.update({
    where: { id: session.id },
    data: {
      status: "TERMINATED",
      ended_at: new Date(),
      termination_cause: request.terminationCause ?? "User-Request",
    },
  });
}
