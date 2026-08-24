import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createTenantClient } from "database";
import type { AgentTunnelState } from "database";

import { prisma } from "@/lib/db";

export const HEARTBEAT_STALE_AFTER_MS = 90_000;
export const HEARTBEAT_OFFLINE_AFTER_MS = 300_000;

const TUNNEL_STATES: AgentTunnelState[] = ["DISABLED", "UP", "DOWN", "ERROR", "UNKNOWN"];

type HeartbeatPayload = {
  agentId: string;
  nodeId: string;
  tunnel: AgentTunnelState;
  reportedAt?: string;
  agentVersion?: string;
  error?: string;
};

export type AgentHealthStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";
export type AgentHealthItem = {
  nodeId: string;
  nodeName: string;
  agentId: string | null;
  availability: AgentHealthStatus;
  tunnelState: AgentTunnelState;
  lastHeartbeatAt: string | null;
  heartbeatAgeSec: number | null;
  lastError: string | null;
  metadata: { reportedAt?: string; agentVersion?: string } | null;
};

function workerSecret(): string {
  const secret = process.env.NETWORK_AGENT_SHARED_SECRET;
  if (!secret || secret.length < 32) throw new Error("Network agent secret is not configured.");
  return secret;
}

export function verifyAgentHeartbeatSignature(body: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", workerSecret()).update(body).digest("hex"));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function parseHeartbeat(body: string): HeartbeatPayload {
  const payload = JSON.parse(body) as Partial<HeartbeatPayload>;
  if (!payload.agentId || !payload.nodeId || !payload.tunnel || !TUNNEL_STATES.includes(payload.tunnel)) {
    throw new Error("Invalid heartbeat payload.");
  }
  if (payload.reportedAt && Number.isNaN(new Date(payload.reportedAt).getTime())) {
    throw new Error("Invalid heartbeat timestamp.");
  }
  return {
    agentId: payload.agentId,
    nodeId: payload.nodeId,
    tunnel: payload.tunnel,
    reportedAt: payload.reportedAt,
    agentVersion: payload.agentVersion?.slice(0, 40),
    error: payload.error?.slice(0, 500),
  };
}

/** Authenticates an agent report and derives organization ownership from its configured node. */
export async function recordAgentHeartbeat(body: string, signature: string | undefined): Promise<{ organizationId: string; nodeId: string }> {
  if (!verifyAgentHeartbeatSignature(body, signature)) throw new Error("Invalid agent signature.");
  const payload = parseHeartbeat(body);
  const configuredAgentId = process.env.NETWORK_AGENT_ID;
  const configuredNodeId = process.env.NETWORK_AGENT_NODE_ID;
  if (!configuredAgentId || !configuredNodeId || payload.agentId !== configuredAgentId || payload.nodeId !== configuredNodeId) {
    throw new Error("Agent identity is not authorized.");
  }

  const node = await prisma.networkNode.findFirst({
    where: { id: configuredNodeId, node_type: "MIKROTIK" },
    select: { id: true, organization_id: true },
  });
  if (!node) throw new Error("Configured agent node is not available.");

  const existing = await prisma.agentHeartbeat.findUnique({ where: { node_id: node.id }, select: { agent_id: true } });
  if (existing && existing.agent_id !== payload.agentId) throw new Error("Agent identity conflicts with node ownership.");

  const heartbeatAt = new Date();
  await prisma.$transaction((transaction) =>
    transaction.agentHeartbeat.upsert({
      where: { node_id: node.id },
      create: {
        organization_id: node.organization_id,
        node_id: node.id,
        agent_id: payload.agentId,
        last_heartbeat_at: heartbeatAt,
        tunnel_state: payload.tunnel,
        last_error: payload.error ?? null,
        metadata: { reportedAt: payload.reportedAt, agentVersion: payload.agentVersion },
      },
      update: {
        organization_id: node.organization_id,
        agent_id: payload.agentId,
        last_heartbeat_at: heartbeatAt,
        tunnel_state: payload.tunnel,
        last_error: payload.error ?? null,
        metadata: { reportedAt: payload.reportedAt, agentVersion: payload.agentVersion },
      },
    })
  );

  return { organizationId: node.organization_id, nodeId: node.id };
}

/** Projects tenant routers into operational health without trusting stored status fields. */
export async function getAgentHealthForOrganization(
  organizationId: string,
  now = new Date()
): Promise<AgentHealthItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const nodes = await tenantDb.networkNode.findMany({
    where: { node_type: "MIKROTIK" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      agent_heartbeat: {
        select: { agent_id: true, last_heartbeat_at: true, tunnel_state: true, last_error: true, metadata: true },
      },
    },
  });

  return nodes.map((node) => {
    const heartbeat = node.agent_heartbeat;
    const ageMs = heartbeat ? Math.max(0, now.getTime() - heartbeat.last_heartbeat_at.getTime()) : null;
    const tunnelState = heartbeat?.tunnel_state ?? "UNKNOWN";
    const availability: AgentHealthStatus =
      ageMs === null || ageMs >= HEARTBEAT_OFFLINE_AFTER_MS
        ? "OFFLINE"
        : ageMs > HEARTBEAT_STALE_AFTER_MS || tunnelState === "DOWN" || tunnelState === "ERROR"
          ? "DEGRADED"
          : "HEALTHY";
    const metadata = heartbeat?.metadata && typeof heartbeat.metadata === "object" && !Array.isArray(heartbeat.metadata)
      ? heartbeat.metadata as { reportedAt?: string; agentVersion?: string }
      : null;

    return {
      nodeId: node.id,
      nodeName: node.name,
      agentId: heartbeat?.agent_id ?? null,
      availability,
      tunnelState,
      lastHeartbeatAt: heartbeat?.last_heartbeat_at.toISOString() ?? null,
      heartbeatAgeSec: ageMs === null ? null : Math.floor(ageMs / 1000),
      lastError: heartbeat?.last_error ?? null,
      metadata,
    };
  });
}
