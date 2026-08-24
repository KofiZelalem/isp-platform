import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { revokeOwnVoucherAction } = await import("./actions");

describe("reseller voucher actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ organizationId: "org-a", userId: "user-a" });
    createTenantClient.mockReturnValue({ resellerProfile: { findUnique: vi.fn().mockResolvedValue({ id: "profile-a" }) }, voucher: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } });
  });

  it("revokes only available vouchers from the reseller's own inventory", async () => {
    const form = new FormData(); form.set("voucherId", "voucher-a");
    await expect(revokeOwnVoucherAction(null, form)).resolves.toEqual({ success: true });
    expect(createTenantClient.mock.results[0].value.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "voucher-a", status: { in: ["GENERATED", "SOLD"] }, batch: { reseller_id: "profile-a" } } }));
  });

  it("rejects missing or foreign inventory", async () => {
    const missing = new FormData();
    await expect(revokeOwnVoucherAction(null, missing)).resolves.toEqual({ error: "Missing voucher." });
    createTenantClient.mockReturnValue({ resellerProfile: { findUnique: vi.fn().mockResolvedValue(null) }, voucher: { updateMany: vi.fn() } });
    const foreign = new FormData(); foreign.set("voucherId", "foreign");
    await expect(revokeOwnVoucherAction(null, foreign)).resolves.toEqual({ error: "Reseller profile is not configured." });
  });
});
