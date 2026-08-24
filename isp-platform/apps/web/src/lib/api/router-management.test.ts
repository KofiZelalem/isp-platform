import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const recordRouterConnectionStatus = vi.hoisted(() => vi.fn());

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("mikrotik", () => ({
  recordRouterConnectionStatus,
}));

const { checkRouterConnectionForOrganization } = await import("./router-management");

function tenantClient(node: unknown) {
  return {
    networkNode: { findFirst: vi.fn().mockResolvedValue(node) },
  };
}

describe("checkRouterConnectionForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETWORK_AGENT_URL", "http://agent.test");
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", "12345678901234567890123456789012");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nodeId: "node-a", status: "CONNECTED", checkedAt: "2026-08-23T12:00:00.000Z" }),
    }));
    recordRouterConnectionStatus.mockResolvedValue(undefined);
  });

  it("checks only a tenant-owned MikroTik node and never returns credentials", async () => {
    const client = tenantClient({
      id: "node-a",
      name: "Core Router",
      ip_address: "10.0.0.1",
      port: 8728,
      username_enc: "encrypted-user",
      password_enc: "encrypted-password",
    });
    createTenantClient.mockReturnValue(client);

    const result = await checkRouterConnectionForOrganization("org-a", "node-a");

    expect(result).toMatchObject({ nodeId: "node-a", status: "CONNECTED" });
    expect(result).not.toHaveProperty("username_enc");
    expect(result).not.toHaveProperty("password_enc");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("http://agent.test/v1/routers/check", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-agent-signature": expect.any(String) }),
    }));
    expect(recordRouterConnectionStatus).toHaveBeenCalledWith(client, expect.objectContaining({
      nodeId: "node-a",
      organizationId: "org-a",
      status: "CONNECTED",
    }));
  });

  it("rejects a node outside the authenticated tenant", async () => {
    const client = tenantClient(null);
    createTenantClient.mockReturnValue(client);

    await expect(checkRouterConnectionForOrganization("org-a", "node-b")).rejects.toThrow("Router not found");
    expect(fetch).not.toHaveBeenCalled();
    expect(recordRouterConnectionStatus).not.toHaveBeenCalled();
  });

  it("records an error and closes the provider when connection fails", async () => {
    const client = tenantClient({
      id: "node-a",
      name: "Core Router",
      ip_address: "10.0.0.1",
      port: 8728,
      username_enc: "encrypted-user",
      password_enc: "encrypted-password",
    });
    createTenantClient.mockReturnValue(client);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "connection refused" }),
    }));

    await expect(checkRouterConnectionForOrganization("org-a", "node-a")).rejects.toThrow("connection refused");
    expect(recordRouterConnectionStatus).toHaveBeenCalledWith(client, expect.objectContaining({ status: "ERROR" }));
  });
});
