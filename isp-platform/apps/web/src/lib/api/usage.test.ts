import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { getUsageForOrganization } = await import("./usage");

describe("getUsageForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockReturnValue({
      session: {
        findMany,
      },
    });
  });

  it("aggregates usage totals and subscriber totals", async () => {
    findMany.mockResolvedValue([
      {
        data_up_mb: 100,
        data_down_mb: 400,
        subscriber: { id: "sub-a", full_name: "Alice", username: "alice" },
      },
      {
        data_up_mb: 50,
        data_down_mb: 150,
        subscriber: { id: "sub-a", full_name: "Alice", username: "alice" },
      },
      {
        data_up_mb: 20,
        data_down_mb: 80,
        subscriber: { id: "sub-b", full_name: null, username: "bob" },
      },
    ]);

    await expect(getUsageForOrganization("org-a")).resolves.toEqual({
      totalUpMb: 170,
      totalDownMb: 630,
      perSubscriber: [
        {
          subscriberId: "sub-a",
          subscriberName: "Alice",
          sessionCount: 2,
          totalUpMb: 150,
          totalDownMb: 550,
        },
        {
          subscriberId: "sub-b",
          subscriberName: "bob",
          sessionCount: 1,
          totalUpMb: 20,
          totalDownMb: 80,
        },
      ],
    });
  });

  it("applies a started_at window filter when sinceDays is provided", async () => {
    findMany.mockResolvedValue([]);

    await getUsageForOrganization("org-a", 7);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          started_at: {
            gte: expect.any(Date),
          },
        },
      })
    );
  });
});
