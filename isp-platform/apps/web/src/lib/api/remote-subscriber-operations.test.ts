import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const recordRouterConnectionStatus = vi.hoisted(() => vi.fn());

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("mikrotik", () => ({ recordRouterConnectionStatus }));

const { operateOnSubscriberRemotely } = await import("./remote-subscriber-operations");

function client(subscriber: unknown) {
  return { subscriber: { findFirst: vi.fn().mockResolvedValue(subscriber) } };
}

describe("remote subscriber operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETWORK_AGENT_URL", "http://agent.test");
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", "12345678901234567890123456789012");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "COMPLETED" }),
    }));
  });

  it("isolates a tenant subscriber through the signed agent boundary", async () => {
    const tenantDb = client({
      id: "sub-a",
      sessions: [{ ip_address: "10.0.0.20", node: { id: "node-a", name: "Core", ip_address: "10.0.0.1", port: 8728, username_enc: "u", password_enc: "p" } }],
    });
    createTenantClient.mockReturnValue(tenantDb);

    await expect(operateOnSubscriberRemotely("org-a", "sub-a", "isolate")).resolves.toMatchObject({ completed: true });
    expect(fetch).toHaveBeenCalledWith("http://agent.test/v1/subscribers/operation", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-agent-signature": expect.any(String) }),
    }));
    const request = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(request).toMatchObject({ operation: "isolate", subscriberId: "sub-a", address: "10.0.0.20", nodeId: "node-a" });
    expect(request).not.toHaveProperty("organizationId");
  });

  it("rejects a cross-tenant or missing subscriber before agent execution", async () => {
    createTenantClient.mockReturnValue(client(null));
    await expect(operateOnSubscriberRemotely("org-a", "sub-b", "isolate")).rejects.toThrow("Subscriber not found");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns hardware failure without reporting success", async () => {
    const tenantDb = client({ id: "sub-a", sessions: [{ ip_address: "10.0.0.20", node: { id: "node-a", name: "Core", ip_address: "10.0.0.1", port: 8728, username_enc: "u", password_enc: "p" } }] });
    createTenantClient.mockReturnValue(tenantDb);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "router offline" }) }));

    const result = await operateOnSubscriberRemotely("org-a", "sub-a", "restore");
    expect(result.completed).toBe(false);
    expect(result.routers[0]).toMatchObject({ nodeId: "node-a", status: "FAILED" });
    expect(recordRouterConnectionStatus).toHaveBeenCalledWith(tenantDb, expect.objectContaining({ status: "ERROR" }));
  });
});
