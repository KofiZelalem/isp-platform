import "server-only";

import { createTenantClient } from "database";
import { recordRouterConnectionStatus } from "mikrotik";

import { prisma } from "@/lib/db";
import { buildAgentRequestHeaders } from "@/lib/agent-signing";

export type RouterConnectionCheckResult = {
  nodeId: string;
  status: "CONNECTED" | "ERROR";
  checkedAt: string;
};

function agentConfig(): { url: string; secret: string } {
  const url = process.env.NETWORK_AGENT_URL;
  const secret = process.env.NETWORK_AGENT_SHARED_SECRET;
  if (!url || !secret) throw new Error("The network agent is not configured.");
  if (secret.length < 32) throw new Error("The network agent secret is too short.");
  const endpoint = new URL(url);
  if (!/^https?:$/.test(endpoint.protocol)) throw new Error("The network agent URL must use HTTP(S).");
  return { url: endpoint.toString().replace(/\/$/, ""), secret };
}

/** Tests a tenant-owned router through the provider boundary without returning credentials. */
export async function checkRouterConnectionForOrganization(
  organizationId: string,
  nodeId: string
): Promise<RouterConnectionCheckResult> {
  if (!nodeId.trim()) throw new Error("Router id is required.");

  const tenantDb = createTenantClient(prisma, organizationId);
  const node = await tenantDb.networkNode.findFirst({
    where: { id: nodeId, node_type: "MIKROTIK" },
    select: {
      id: true,
      name: true,
      ip_address: true,
      port: true,
      username_enc: true,
      password_enc: true,
    },
  });

  if (!node) throw new Error("Router not found.");

  try {
    const { url, secret } = agentConfig();
    const payload = JSON.stringify({
      nodeId: node.id,
      name: node.name,
      host: node.ip_address,
      port: node.port,
      username: node.username_enc,
      password: node.password_enc,
    });
    const response = await fetch(`${url}/v1/routers/check`, {
      method: "POST",
      headers: buildAgentRequestHeaders(payload, secret),
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json()) as { nodeId?: string; status?: string; checkedAt?: string; error?: string };
    if (!response.ok || result.status !== "CONNECTED" || result.nodeId !== node.id) {
      throw new Error(result.error ?? "Network agent could not connect to the router.");
    }
    await recordRouterConnectionStatus(tenantDb, {
      nodeId: node.id,
      organizationId,
      status: "CONNECTED",
      routerName: node.name,
    });
    return { nodeId: node.id, status: "CONNECTED", checkedAt: result.checkedAt ?? new Date().toISOString() };
  } catch (error) {
    await recordRouterConnectionStatus(tenantDb, {
      nodeId: node.id,
      organizationId,
      status: "ERROR",
      routerName: node.name,
    });
    throw new Error(error instanceof Error ? error.message : "Router connection failed.");
  }
}
