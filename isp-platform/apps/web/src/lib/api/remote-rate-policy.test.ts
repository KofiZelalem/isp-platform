import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const recordRouterConnectionStatus = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("mikrotik", () => ({ recordRouterConnectionStatus }));

const { applySubscriberRatePolicyRemotely } = await import("./remote-rate-policy");

function subscriber(plan = { speed_upload_kbps: 512, speed_download_kbps: 2048 }, sessions = [{ ip_address: "10.0.0.20", node: { id: "node-a", name: "Core", ip_address: "10.0.0.1", port: 8728, username_enc: "enc-u", password_enc: "enc-p" } }]) {
  return { id: "sub-a", subscriptions: [{ plan }], sessions };
}

describe("remote subscriber rate policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETWORK_AGENT_URL", "http://agent.test");
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", "12345678901234567890123456789012");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "COMPLETED" }) }));
  });

  it("derives active plan limits and sends them to the agent", async () => {
    createTenantClient.mockReturnValue({ subscriber: { findFirst: vi.fn().mockResolvedValue(subscriber()) } });
    const result = await applySubscriberRatePolicyRemotely("org-a", "sub-a");
    const request = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(result).toMatchObject({ completed: true, uploadKbps: 512, downloadKbps: 2048 });
    expect(request).toMatchObject({ subscriberId: "sub-a", address: "10.0.0.20", uploadKbps: 512, downloadKbps: 2048, nodeId: "node-a" });
    expect(request).not.toHaveProperty("organizationId");
    expect(request).not.toHaveProperty("planId");
  });

  it("ignores browser plan or speed input because the API accepts none", async () => {
    const tenantDb = { subscriber: { findFirst: vi.fn().mockResolvedValue(subscriber({ speed_upload_kbps: 100, speed_download_kbps: 200 })) } };
    createTenantClient.mockReturnValue(tenantDb);
    await applySubscriberRatePolicyRemotely("org-a", "sub-a");
    const request = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(request.uploadKbps).toBe(100);
    expect(request.downloadKbps).toBe(200);
  });

  it("returns per-router failure without changing subscription state", async () => {
    const tenantDb = { subscriber: { findFirst: vi.fn().mockResolvedValue(subscriber()) } };
    createTenantClient.mockReturnValue(tenantDb);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "router offline" }) }));
    const result = await applySubscriberRatePolicyRemotely("org-a", "sub-a");
    expect(result.completed).toBe(false);
    expect(result.routers[0]).toMatchObject({ status: "FAILED" });
    expect(recordRouterConnectionStatus).toHaveBeenCalled();
    expect(tenantDb).not.toHaveProperty("subscription");
  });

  it("reports multiple active router contexts independently", async () => {
    const multi = subscriber(undefined, [
      subscriber().sessions[0],
      { ip_address: "10.0.0.21", node: { id: "node-b", name: "Edge", ip_address: "10.0.0.2", port: 8728, username_enc: "u2", password_enc: "p2" } },
    ]);
    createTenantClient.mockReturnValue({ subscriber: { findFirst: vi.fn().mockResolvedValue(multi) } });
    const result = await applySubscriberRatePolicyRemotely("org-a", "sub-a");
    expect(result.routers).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
