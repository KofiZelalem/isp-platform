import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { getResellerOperationsForUser } = await import("./reseller-operations");

describe("reseller portal operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockReturnValue({ resellerProfile: { findUnique: vi.fn().mockResolvedValue({
      id: "profile-a", commission_rate: 10, wallet_balance: 20,
      subscribers: [{ id: "sub-a", full_name: "Alice", email: "a@test", status: "ACTIVE", created_at: new Date("2026-08-01") }],
      voucher_batches: [{ id: "batch-a", name: "August", quantity: 2, created_at: new Date("2026-08-01"), vouchers: [{ id: "v1", code: "A1", status: "GENERATED", sold_at: null }, { id: "v2", code: "A2", status: "REDEEMED", sold_at: new Date("2026-08-02") }] }],
      payments: [{ amount: 100 }],
    }) } });
  });

  it("returns scoped customer, inventory, and commission activity", async () => {
    await expect(getResellerOperationsForUser("org-a", "user-a", "Alice")).resolves.toEqual(expect.objectContaining({ profileId: "profile-a", assignedCustomers: [expect.objectContaining({ id: "sub-a" })], walletBalance: "20", commissionEarned: "10.0000", inventory: [expect.objectContaining({ id: "v1", batchName: "August" }), expect.objectContaining({ id: "v2", status: "REDEEMED" })] }));
    expect(createTenantClient).toHaveBeenCalledWith({}, "org-a");
  });

  it("returns no reseller data when the authenticated user has no profile", async () => {
    createTenantClient.mockReturnValue({ resellerProfile: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(getResellerOperationsForUser("org-a", "user-b")).resolves.toBeNull();
  });
});
