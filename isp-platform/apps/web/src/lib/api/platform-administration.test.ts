import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  organization: { findMany: vi.fn(), findUnique: vi.fn() },
  organizationFeatureFlag: { upsert: vi.fn() },
  platformAuditLog: { create: vi.fn(), findMany: vi.fn() },
  agentHeartbeat: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma }));

const { getPlatformFeatureFlags, getPlatformHealth, setPlatformFeatureFlag } = await import("./platform-administration");

describe("platform administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    prisma.organization.findMany.mockResolvedValue([{ id: "org-a", name: "ISP A", feature_flags: [{ key: "CAPTIVE_PORTAL", enabled: true }] }]);
    prisma.agentHeartbeat.findMany.mockResolvedValue([]);
  });

  it("returns an explicit flag matrix for organizations", async () => {
    await expect(getPlatformFeatureFlags()).resolves.toEqual(expect.arrayContaining([
      { organizationId: "org-a", organizationName: "ISP A", key: "CAPTIVE_PORTAL", enabled: true },
      { organizationId: "org-a", organizationName: "ISP A", key: "REMOTE_ROUTER_MANAGEMENT", enabled: false },
    ]));
  });

  it("rejects unknown feature flags and non-platform actors", async () => {
    await expect(setPlatformFeatureFlag({ actorId: "user-a", organizationId: "org-a", key: "UNKNOWN", enabled: true })).rejects.toThrow("Unknown feature flag");
    prisma.organization.findUnique.mockResolvedValue({ id: "org-a", slug: "isp-a" });
    prisma.user.findUnique.mockResolvedValue({ role: "STAFF" });
    await expect(setPlatformFeatureFlag({ actorId: "user-a", organizationId: "org-a", key: "CAPTIVE_PORTAL", enabled: true })).rejects.toThrow("Only platform administrators");
  });

  it("derives agent health counts from heartbeat age", async () => {
    const now = Date.now();
    prisma.agentHeartbeat.findMany.mockResolvedValue([
      { last_heartbeat_at: new Date(now - 10_000) },
      { last_heartbeat_at: new Date(now - 120_000) },
      { last_heartbeat_at: new Date(now - 400_000) },
    ]);
    const result = await getPlatformHealth();
    expect(result.agents).toEqual({ healthy: 1, degraded: 1, offline: 1 });
    expect(result.database).toBe("UP");
  });
});
