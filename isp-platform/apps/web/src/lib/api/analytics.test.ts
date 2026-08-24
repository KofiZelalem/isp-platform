import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ organization: { findUnique: vi.fn() } }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma }));

const { forecastSeries, getAnalyticsForOrganization } = await import("./analytics");

const session = (organization_id: string, date: string, node: { id: string; name: string }, up: number, down: number) => ({ organization_id, started_at: new Date(date), ended_at: null, data_up_mb: up, data_down_mb: down, node });

describe("tenant analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findUnique.mockResolvedValue({ currency: "USD" });
  });

  it("forecasts stable, increasing, and decreasing series with quality metadata", () => {
    expect(forecastSeries([10, 10, 10, 10])).toMatchObject({ nextValue: 10, quality: "LIMITED", method: "ROBUST_MEDIAN_SLOPE" });
    expect(forecastSeries([1, 2, 3, 4, 5, 6, 7]).nextValue).toBeGreaterThan(7);
    expect(forecastSeries([7, 6, 5, 4, 3, 2, 1]).nextValue).toBe(0);
  });

  it("handles empty and sparse series without negative forecasts", () => {
    expect(forecastSeries([])).toMatchObject({ nextValue: 0, confidence: 0, quality: "INSUFFICIENT" });
    expect(forecastSeries([5])).toMatchObject({ nextValue: 5, quality: "INSUFFICIENT" });
    expect(forecastSeries([-10, -5])).toMatchObject({ nextValue: 0 });
  });

  it("aggregates revenue, usage, and router usage for the requested range", async () => {
    createTenantClient.mockReturnValue({
      payment: { findMany: vi.fn().mockResolvedValueOnce([{ amount: 100, paid_at: new Date(), provider_response: null, invoice: null }]).mockResolvedValueOnce([{ status: "SUCCESS", amount: 100 }]).mockResolvedValueOnce([]) },
      subscriber: { count: vi.fn().mockResolvedValue(4), findMany: vi.fn().mockResolvedValue([{ created_at: new Date() }]) },
      subscription: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ plan: { id: "plan-a", name: "Starter" } }]) },
      session: { findMany: vi.fn().mockResolvedValue([session("org-a", new Date().toISOString(), { id: "node-a", name: "Core" }, 1024, 2048)]) },
      servicePlan: { findMany: vi.fn().mockResolvedValue([{ id: "plan-a", name: "Starter" }]) },
      voucher: { findMany: vi.fn().mockResolvedValue([]) },
    });

    const result = await getAnalyticsForOrganization("org-a", 7);
    expect(result.totalRevenue).toBe(100);
    expect(result.activeSubscribers).toBe(4);
    expect(result.totalDataGb).toBe(3);
    expect(result.routerUsage).toEqual([{ nodeId: "node-a", nodeName: "Core", dataGb: 3, sessions: 1 }]);
    expect(result.subscriberTrend.at(-1)).toMatchObject({ newSubscribers: 1, churnedSubscribers: 0, netChange: 1 });
    expect(result.paymentStatusTrend).toEqual([{ status: "SUCCESS", count: 1, amount: 100 }]);
    expect(result.sessionConcurrency.at(-1)).toMatchObject({ peakConcurrent: 1 });
    expect(result.paymentSuccessRate).toBe(100);
    expect(result.voucherRedemptionRate).toBe(0);
    expect(result.averageSessionDurationMinutes).toBeGreaterThanOrEqual(0);
    expect(result.forecast.method).toBe("ROBUST_MEDIAN_SLOPE");
    expect(result.forecast.confidence).toBeGreaterThanOrEqual(0);
  });

  it("uses the tenant client for all operational data", async () => {
    const tenantDb = {
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      subscriber: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      subscription: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      session: { findMany: vi.fn().mockResolvedValue([]) },
      servicePlan: { findMany: vi.fn().mockResolvedValue([]) },
      voucher: { findMany: vi.fn().mockResolvedValue([]) },
    };
    createTenantClient.mockReturnValue(tenantDb);
    await getAnalyticsForOrganization("org-a", 30);
    expect(createTenantClient).toHaveBeenCalledWith(prisma, "org-a");
  });
});
