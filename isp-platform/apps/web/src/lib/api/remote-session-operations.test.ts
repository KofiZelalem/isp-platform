import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const recordRouterConnectionStatus = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("mikrotik", () => ({ recordRouterConnectionStatus }));

const { operateOnSessionRemotely } = await import("./remote-session-operations");
const session = { id: "session-a", subscriber_id: "sub-a", status: "ACTIVE", ip_address: "10.0.0.20", node: { id: "node-a", name: "Core", ip_address: "10.0.0.1", port: 8728, username_enc: "enc-u", password_enc: "enc-p" } };

describe("remote session operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETWORK_AGENT_URL", "http://agent.test");
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", "12345678901234567890123456789012");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "COMPLETED" }) }));
  });

  it("dispatches disconnect through the authenticated agent", async () => {
    createTenantClient.mockReturnValue({ session: { findFirst: vi.fn().mockResolvedValue(session) } });
    await expect(operateOnSessionRemotely("org-a", "session-a", "disconnect")).resolves.toMatchObject({ status: "COMPLETED" });
    const request = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(request).toMatchObject({ operation: "disconnect", sessionId: "session-a", subscriberId: "sub-a", address: "10.0.0.20" });
    expect(request).not.toHaveProperty("organizationId");
  });

  it("supports reconnect using the same tenant-owned session context", async () => {
    createTenantClient.mockReturnValue({ session: { findFirst: vi.fn().mockResolvedValue(session) } });
    await expect(operateOnSessionRemotely("org-a", "session-a", "reconnect")).resolves.toMatchObject({ operation: "reconnect", status: "COMPLETED" });
  });

  it("returns hardware failure and does not mutate session state", async () => {
    const tenantDb = { session: { findFirst: vi.fn().mockResolvedValue(session) } };
    createTenantClient.mockReturnValue(tenantDb);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "router offline" }) }));
    await expect(operateOnSessionRemotely("org-a", "session-a", "disconnect")).resolves.toMatchObject({ status: "FAILED" });
    expect(recordRouterConnectionStatus).toHaveBeenCalled();
    expect(tenantDb.session).not.toHaveProperty("update");
  });

  it("rejects a session outside the tenant before agent execution", async () => {
    createTenantClient.mockReturnValue({ session: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(operateOnSessionRemotely("org-a", "session-b", "disconnect")).rejects.toThrow("Session not found");
    expect(fetch).not.toHaveBeenCalled();
  });
});
