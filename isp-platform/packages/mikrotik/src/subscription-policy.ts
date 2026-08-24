import type { TenantPrismaClient } from "database";
import { sendNotification } from "notifications";
import type { NetworkNodeConnection, NetworkProvider } from "network";

import { BLOCKED_ADDRESS_LIST, MikroTikNetworkProvider } from "./network-provider";

export { BLOCKED_ADDRESS_LIST };

export type SubscriptionPolicyAction = "suspend" | "restore" | "enforce";

export type ApplySubscriptionPolicyResult = {
  nodesUpdated: number;
  /** Per-node connection/command failures; network issues never throw so the
   *  caller's own state change (e.g. Subscriber.status) is never blocked. */
  errors: string[];
};

export type RouterConnectionState = "DISCONNECTED" | "ERROR" | "CONNECTED";

type PlanPolicy = {
  uploadKbps: number | null;
  downloadKbps: number | null;
  sessionTimeoutSec: number;
};

/** Validates speed limits and timeout are within safe ranges. */
function validatePlanPolicy(policy: PlanPolicy | null): string | null {
  if (!policy) return null;

  if (policy.uploadKbps !== null && policy.uploadKbps < 0) {
    return `Invalid upload speed: ${policy.uploadKbps} kbps (must be >= 0)`;
  }
  if (policy.downloadKbps !== null && policy.downloadKbps < 0) {
    return `Invalid download speed: ${policy.downloadKbps} kbps (must be >= 0)`;
  }
  if (policy.sessionTimeoutSec <= 0) {
    return `Invalid session timeout: ${policy.sessionTimeoutSec} seconds (must be > 0)`;
  }

  return null;
}

/** Validates session and network node data. */
function validateSessionData(
  session: { ip_address: string | null; node: { ip_address: string; port: number } }
): string | null {
  if (!session.ip_address) return "Session IP address is missing";
  if (!session.node?.ip_address) return "Router IP address is missing";
  if (session.node.port <= 0 || session.node.port > 65535) {
    return `Invalid router port: ${session.node.port}`;
  }
  return null;
}

function computeSessionTimeoutSec(
  timeLimitMinutes: number | null,
  subscriptionExpiresAt: Date | null
): number {
  const now = Date.now();
  const planLimit = timeLimitMinutes ? timeLimitMinutes * 60 : null;
  const expiryLimit = subscriptionExpiresAt
    ? Math.max(0, Math.floor((subscriptionExpiresAt.getTime() - now) / 1000))
    : null;

  if (planLimit !== null && expiryLimit !== null) return Math.min(planLimit, expiryLimit);
  if (planLimit !== null) return planLimit;
  if (expiryLimit !== null) return expiryLimit;
  return 86_400;
}

function hasElapsedSessionTimeout(startedAt: Date, sessionTimeoutSec: number): boolean {
  if (sessionTimeoutSec <= 0) return true;
  const elapsedSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  return elapsedSec >= sessionTimeoutSec;
}

async function loadPlanPolicy(
  tenantDb: TenantPrismaClient,
  subscriberId: string
): Promise<PlanPolicy | null> {
  const subscription = await tenantDb.subscription.findFirst({
    where: { subscriber_id: subscriberId, status: "ACTIVE" },
    orderBy: { started_at: "desc" },
    select: {
      expires_at: true,
      plan: {
        select: {
          time_limit_minutes: true,
          speed_upload_kbps: true,
          speed_download_kbps: true,
        },
      },
    },
  });

  if (!subscription) return null;

  return {
    uploadKbps: subscription.plan.speed_upload_kbps,
    downloadKbps: subscription.plan.speed_download_kbps,
    sessionTimeoutSec: computeSessionTimeoutSec(
      subscription.plan.time_limit_minutes,
      subscription.expires_at
    ),
  };
}

/** Persists router connectivity and logs an alert whenever access is unhealthy. */
export async function recordRouterConnectionStatus(
  tenantDb: TenantPrismaClient,
  params: { nodeId: string; organizationId: string; status: RouterConnectionState; routerName: string }
): Promise<void> {
  await tenantDb.networkNode.update({
    where: { id: params.nodeId },
    data: {
      connection_status: params.status,
      status: params.status === "CONNECTED" ? "ONLINE" : "OFFLINE",
      last_seen_at: params.status === "CONNECTED" ? new Date() : undefined,
    },
  });

  if (params.status === "DISCONNECTED" || params.status === "ERROR") {
    await sendNotification(tenantDb, {
      organizationId: params.organizationId,
      type: params.status === "ERROR" ? "ROUTER_ERROR" : "ROUTER_DISCONNECTED",
      channel: "IN_APP",
      subject: `Router ${params.status.toLowerCase()}`,
      message: `${params.routerName} connection status changed to ${params.status}.`,
    });
  }
}

/**
 * Pushes firewall/hotspot changes to every router the subscriber currently
 * has an active session on: isolates+disconnects them on suspend/expiry, or
 * lifts the block on reinstatement. Best-effort — a router being unreachable
 * is reported in `errors` rather than thrown.
 *
 * **Plan Speed/Time-Limit Enforcement**:
 * - suspend: isolate, disconnect, and apply "block" rate policy
 * - restore: unblock and apply plan rate limits (upload/download speeds)
 * - enforce: validate time limits and reapply rate limits; disconnect if timeout exceeded
 */
export async function applySubscriptionPolicy(
  tenantDb: TenantPrismaClient,
  params: {
    subscriberId: string;
    action: SubscriptionPolicyAction;
    providerFactory?: (node: NetworkNodeConnection) => NetworkProvider;
  }
): Promise<ApplySubscriptionPolicyResult> {
  const sessions = await tenantDb.session.findMany({
    where: { subscriber_id: params.subscriberId, status: "ACTIVE" },
    select: {
      id: true,
      ip_address: true,
      started_at: true,
      node: {
        select: {
          id: true,
          name: true,
          organization_id: true,
          ip_address: true,
          port: true,
          username_enc: true,
          password_enc: true,
        },
      },
    },
  });

  const planPolicy = params.action === "suspend"
    ? null
    : await loadPlanPolicy(tenantDb, params.subscriberId);

  // Validate plan policy only if not suspending
  if (params.action !== "suspend") {
    const validationError = validatePlanPolicy(planPolicy);
    if (validationError && planPolicy !== null) {
      return {
        nodesUpdated: 0,
        errors: [validationError],
      };
    }
  }

  let nodesUpdated = 0;
  const errors: string[] = [];
  const notifiedNodes = new Set<string>();

  for (const session of sessions) {
    // Validate session data
    const sessionValidationError = validateSessionData(session);
    if (sessionValidationError) {
      errors.push(`${session.node?.name ?? "unknown"}: ${sessionValidationError}`);
      continue;
    }

    if (!session.ip_address) continue;

    const nodeConnection: NetworkNodeConnection = {
      host: session.node.ip_address,
      port: session.node.port,
      username: session.node.username_enc,
      password: session.node.password_enc,
      name: session.node.name,
    };
    const provider = params.providerFactory?.(nodeConnection) ?? new MikroTikNetworkProvider();
    try {
      await provider.connect(nodeConnection);

      if (params.action === "suspend") {
        // Suspend: isolate, disconnect, and apply "blocked" rate policy (zero speeds)
        await provider.isolateSubscriber({ subscriberId: params.subscriberId, address: session.ip_address });
        await provider.disconnectSubscriber({ subscriberId: params.subscriberId, address: session.ip_address });
        // Apply zero speeds to mark as blocked
        await provider.applyRatePolicy({
          subscriberId: params.subscriberId,
          address: session.ip_address,
          uploadKbps: 0,
          downloadKbps: 0,
        });
        await tenantDb.session.update({
          where: { id: session.id },
          data: { status: "TERMINATED", ended_at: new Date(), termination_cause: "Admin-Suspend" },
        });
      } else if (params.action === "restore") {
        await provider.restoreSubscriber({ subscriberId: params.subscriberId, address: session.ip_address });
        if (planPolicy) {
          if (hasElapsedSessionTimeout(session.started_at, planPolicy.sessionTimeoutSec)) {
            await provider.disconnectSubscriber({ subscriberId: params.subscriberId, address: session.ip_address });
            await tenantDb.session.update({
              where: { id: session.id },
              data: { status: "TERMINATED", ended_at: new Date(), termination_cause: "Session-Timeout" },
            });
          } else {
            await provider.applyRatePolicy({
              subscriberId: params.subscriberId,
              address: session.ip_address,
              uploadKbps: planPolicy.uploadKbps ?? undefined,
              downloadKbps: planPolicy.downloadKbps ?? undefined,
            });
          }
        }
      } else {
        // enforce: validate time limits and reapply rate limits
        if (planPolicy) {
          if (hasElapsedSessionTimeout(session.started_at, planPolicy.sessionTimeoutSec)) {
            await provider.disconnectSubscriber({ subscriberId: params.subscriberId, address: session.ip_address });
            await tenantDb.session.update({
              where: { id: session.id },
              data: { status: "TERMINATED", ended_at: new Date(), termination_cause: "Session-Timeout" },
            });
          } else {
            await provider.applyRatePolicy({
              subscriberId: params.subscriberId,
              address: session.ip_address,
              uploadKbps: planPolicy.uploadKbps ?? undefined,
              downloadKbps: planPolicy.downloadKbps ?? undefined,
            });
          }
        }
      }

      nodesUpdated++;
    } catch (err) {
      errors.push(`${session.node.ip_address}: ${err instanceof Error ? err.message : String(err)}`);
      if (!notifiedNodes.has(session.node.id)) {
        notifiedNodes.add(session.node.id);
        try {
          await recordRouterConnectionStatus(tenantDb, {
            nodeId: session.node.id,
            organizationId: session.node.organization_id,
            status: "ERROR",
            routerName: session.node.name,
          });
        } catch (notificationError) {
          errors.push(
            `${session.node.ip_address}: failed to log connection alert: ${
              notificationError instanceof Error ? notificationError.message : String(notificationError)
            }`
          );
        }
      }
    } finally {
      await provider.disconnect();
    }
  }

  return { nodesUpdated, errors };
}
