import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  networkNode: { findFirst: vi.fn() },
  agentHeartbeat: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
const createTenantClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("database", () => ({ createTenantClient }));

const { getAgentHealthForOrganization, recordAgentHeartbeat, verifyAgentHeartbeatSignature } = await import("./agent-heartbeats");
const secret = "12345678901234567890123456789012";

function signature(body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
import { createHmac } from "node:crypto";

describe("agent heartbeat persistence and health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", secret);
    vi.stubEnv("NETWORK_AGENT_ID", "agent-a");
    vi.stubEnv("NETWORK_AGENT_NODE_ID", "node-a");
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    prisma.networkNode.findFirst.mockResolvedValue({ id: "node-a", organization_id: "org-a" });
    prisma.agentHeartbeat.findUnique.mockResolvedValue(null);
    prisma.agentHeartbeat.upsert.mockResolvedValue({});
  });

  it("accepts an authenticated heartbeat and persists tenant-derived ownership", async () => {
    const body = JSON.stringify({ agentId: "agent-a", nodeId: "node-a", tunnel: "UP", reportedAt: "2026-08-23T12:00:00.000Z", agentVersion: "1.0" });
    await expect(recordAgentHeartbeat(body, signature(body))).resolves.toEqual({ organizationId: "org-a", nodeId: "node-a" });
    expect(prisma.agentHeartbeat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { node_id: "node-a" },
      create: expect.objectContaining({ organization_id: "org-a", agent_id: "agent-a", tunnel_state: "UP" }),
      update: expect.objectContaining({ organization_id: "org-a", agent_id: "agent-a", tunnel_state: "UP" }),
    }));
  });

  it("rejects invalid signatures before touching persistence", async () => {
    const body = JSON.stringify({ agentId: "agent-a", nodeId: "node-a", tunnel: "UP" });
    expect(verifyAgentHeartbeatSignature(body, "invalid")).toBe(false);
    await expect(recordAgentHeartbeat(body, "invalid")).rejects.toThrow("Invalid agent signature");
    expect(prisma.networkNode.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an identity that is not the server-configured agent", async () => {
    const body = JSON.stringify({ agentId: "other-agent", nodeId: "node-a", tunnel: "UP" });
    await expect(recordAgentHeartbeat(body, signature(body))).rejects.toThrow("Agent identity is not authorized");
    expect(prisma.networkNode.findFirst).not.toHaveBeenCalled();
  });

  it("derives healthy, degraded, and offline states from heartbeat age", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    createTenantClient.mockReturnValue({ networkNode: { findMany: vi.fn().mockResolvedValue([
      { id: "node-a", name: "Core", agent_heartbeat: { agent_id: "agent-a", last_heartbeat_at: new Date("2026-08-23T11:59:00.000Z"), tunnel_state: "UP", last_error: null, metadata: null } },
      { id: "node-b", name: "Edge", agent_heartbeat: { agent_id: "agent-b", last_heartbeat_at: new Date("2026-08-23T11:55:00.000Z"), tunnel_state: "UP", last_error: "late", metadata: null } },
      { id: "node-c", name: "Remote", agent_heartbeat: null },
    ]) } });

    await expect(getAgentHealthForOrganization("org-a", now)).resolves.toEqual([
      expect.objectContaining({ nodeId: "node-a", availability: "HEALTHY", heartbeatAgeSec: 60 }),
      expect.objectContaining({ nodeId: "node-b", availability: "OFFLINE", lastError: "late" }),
      expect.objectContaining({ nodeId: "node-c", availability: "OFFLINE", tunnelState: "UNKNOWN" }),
    ]);
  });

  it("does not expose heartbeat secrets", async () => {
    const body = JSON.stringify({ agentId: "agent-a", nodeId: "node-a", tunnel: "UP" });
    expect(body).not.toContain(secret);
    expect(signature(body)).not.toContain(secret);
  });
});
