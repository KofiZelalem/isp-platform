import "server-only";

import { createTenantClient } from "database";
import { recordRouterConnectionStatus } from "mikrotik";

import { prisma } from "@/lib/db";
import { buildAgentRequestHeaders } from "@/lib/agent-signing";

export type RemoteSessionOperation = "disconnect" | "reconnect";
export type RemoteSessionResult = {
  sessionId: string;
  operation: RemoteSessionOperation;
  status: "COMPLETED" | "FAILED";
  error?: string;
};

function agentConfig(): { url: string; secret: string } {
  const url = process.env.NETWORK_AGENT_URL;
  const secret = process.env.NETWORK_AGENT_SHARED_SECRET;
  if (!url || !secret || secret.length < 32) throw new Error("The network agent is not configured.");
  return { url: new URL(url).toString().replace(/\/$/, ""), secret };
}

/** Resolves a tenant-owned session and executes its router operation remotely. */
export async function operateOnSessionRemotely(
  organizationId: string,
  sessionId: string,
  operation: RemoteSessionOperation
): Promise<RemoteSessionResult> {
  if (!sessionId.trim()) throw new Error("Session id is required.");
  const tenantDb = createTenantClient(prisma, organizationId);
  const session = await tenantDb.session.findFirst({
    where: { id: sessionId },
    select: {
      id: true,
      subscriber_id: true,
      status: true,
      ip_address: true,
      node: { select: { id: true, name: true, ip_address: true, port: true, username_enc: true, password_enc: true } },
    },
  });
  if (!session) throw new Error("Session not found.");
  if (!session.ip_address) throw new Error("Session has no usable IP address.");
  if (operation === "disconnect" && session.status !== "ACTIVE") throw new Error("Session is not active.");

  const { url, secret } = agentConfig();
  const payload = JSON.stringify({ operation, sessionId: session.id, subscriberId: session.subscriber_id, address: session.ip_address, nodeId: session.node.id, name: session.node.name, host: session.node.ip_address, port: session.node.port, username: session.node.username_enc, password: session.node.password_enc });
  try {
    const response = await fetch(`${url}/v1/sessions/operation`, {
      method: "POST",
      headers: buildAgentRequestHeaders(payload, secret),
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json()) as { status?: string; error?: string };
    if (!response.ok || result.status !== "COMPLETED") throw new Error(result.error ?? "Network agent session operation failed.");
    return { sessionId: session.id, operation, status: "COMPLETED" };
  } catch (error) {
    await recordRouterConnectionStatus(tenantDb, { nodeId: session.node.id, organizationId, status: "ERROR", routerName: session.node.name });
    return { sessionId: session.id, operation, status: "FAILED", error: error instanceof Error ? error.message : String(error) };
  }
}
