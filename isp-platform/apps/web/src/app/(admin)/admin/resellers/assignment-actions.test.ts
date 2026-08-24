import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganizationPermission = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissions", () => ({ requireOrganizationPermission }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { assignCustomerToResellerAction, unassignCustomerFromResellerAction } = await import("./assignment-actions");

function form(values: Record<string, string>): FormData { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }

describe("reseller customer assignment", () => {
  const profileFindFirst = vi.fn();
  const subscriberUpdateMany = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganizationPermission.mockResolvedValue({ organizationId: "org-a", userId: "admin-a" });
    profileFindFirst.mockResolvedValue({ id: "profile-a" });
    subscriberUpdateMany.mockResolvedValue({ count: 1 });
    createTenantClient.mockReturnValue({ resellerProfile: { findFirst: profileFindFirst }, subscriber: { updateMany: subscriberUpdateMany } });
  });

  it("assigns a tenant customer to a tenant reseller", async () => {
    await expect(assignCustomerToResellerAction(null, form({ profileId: "profile-a", subscriberId: "sub-a" }))).resolves.toEqual({ success: true });
    expect(subscriberUpdateMany).toHaveBeenCalledWith({ where: { id: "sub-a" }, data: { reseller_id: "profile-a" } });
  });

  it("rejects a reseller profile outside the tenant", async () => {
    profileFindFirst.mockResolvedValue(null);
    await expect(assignCustomerToResellerAction(null, form({ profileId: "foreign", subscriberId: "sub-a" }))).resolves.toEqual({ error: "Reseller profile not found." });
    expect(subscriberUpdateMany).not.toHaveBeenCalled();
  });

  it("unassigns only through the tenant client", async () => {
    await expect(unassignCustomerFromResellerAction(null, form({ subscriberId: "sub-a" }))).resolves.toEqual({ success: true });
    expect(subscriberUpdateMany).toHaveBeenCalledWith({ where: { id: "sub-a" }, data: { reseller_id: null } });
  });
});