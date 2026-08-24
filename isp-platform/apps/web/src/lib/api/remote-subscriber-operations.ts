import "server-only";

import { createTenantClient } from "database";
import { recordRouterConnectionStatus } from "mikrotik";

import { prisma } from "@/lib/db";
import { buildAgentRequestHeaders } from "@/lib/agent-signing";

export type SubscriberRemoteOperation = "isolate" | "restore";

export type SubscriberRemoteOperationResult = {
  subscriberId: string;
  operation: SubscriberRemoteOperation;
  completed: boolean;
  routers: Array<{ nodeId: string; status: "COMPLETED" | "FAILED"; error?: string }>;
};

function agentConfig(): { url: string; secret: string } {
  const url = process.env.NETWORK_AGENT_URL;
  const secret = process.env.NETWORK_AGENT_SHARED_SECRET;
  if (!url || !secret || secret.length < 32) throw new Error("The network agent is not configured.");
  return { url: new URL(url).toString().replace(/\/$/, ""), secret };
}

export async function operateOnSubscriberRemotely(
  organizationId: string,
  subscriberId: string,
  operation: SubscriberRemoteOperation
): Promise<SubscriberRemoteOperationResult> {
  if (!subscriberId.trim()) throw new Error("Subscriber id is required.");
  const tenantDb = createTenantClient(prisma, organizationId);
  const subscriber = await tenantDb.subscriber.findFirst({
    where: { id: subscriberId },
    select: {
      id: true,
      sessions: {
        where: { status: "ACTIVE", ip_address: { not: null } },
        select: {
          ip_address: true,
          node: { select: { id: true, name: true, ip_address: true, port: true, username_enc: true, password_enc: true } },
        },
      },
    },
  });
  if (!subscriber) throw new Error("Subscriber not found.");

  const contexts = new Map<string, (typeof subscriber.sessions)[number]>();
  for (const session of subscriber.sessions) contexts.set(session.node.id, session);
  if (contexts.size === 0) throw new Error("Subscriber has no active router session.");

  const { url, secret } = agentConfig();
  const routers: SubscriberRemoteOperationResult["routers"] = [];
  for (const session of contexts.values()) {
    const payload = JSON.stringify({
      operation,
      subscriberId: subscriber.id,
      address: session.ip_address,
      nodeId: session.node.id,
      name: session.node.name,
      host: session.node.ip_address,
      port: session.node.port,
      username: session.node.username_enc,
      password: session.node.password_enc,
    });
    try {
      const response = await fetch(`${url}/v1/subscribers/operation`, {
        method: "POST",
        headers: buildAgentRequestHeaders(payload, secret),
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as { status?: string; error?: string };
      if (!response.ok || result.status !== "COMPLETED") throw new Error(result.error ?? "Network agent operation failed.");
      routers.push({ nodeId: session.node.id, status: "COMPLETED" });
    } catch (error) {
      routers.push({ nodeId: session.node.id, status: "FAILED", error: error instanceof Error ? error.message : String(error) });
      await recordRouterConnectionStatus(tenantDb, { nodeId: session.node.id, organizationId, status: "ERROR", routerName: session.node.name });
    }
  }

  return { subscriberId: subscriber.id, operation, completed: routers.every((router) => router.status === "COMPLETED"), routers };
}
