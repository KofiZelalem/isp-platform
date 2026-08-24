import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { getResellerProfilesForOrganization } = await import("./resellers");

describe("reseller operational reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockReturnValue({ resellerProfile: { findMany: vi.fn().mockResolvedValue([
      {
        id: "profile-a", commission_rate: 10, wallet_balance: 25,
        user: { full_name: "Reseller A", email: "a@example.test", is_active: true },
        voucher_batches: [{ id: "batch-a", vouchers: [{ status: "REDEEMED" }, { status: "GENERATED" }] }],
        subscribers: [{ id: "sub-a" }, { id: "sub-b" }],
        payments: [{ amount: 100 }],
      },
    ]) } });
  });

  it("reports assigned customers and voucher redemption activity", async () => {
    await expect(getResellerProfilesForOrganization("org-a")).resolves.toEqual([expect.objectContaining({ assignedCustomerCount: 2, voucherBatchCount: 1, voucherCount: 2, redeemedVoucherCount: 1 })]);
  });
});
