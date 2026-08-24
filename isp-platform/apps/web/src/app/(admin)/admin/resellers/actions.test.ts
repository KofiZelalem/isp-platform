import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ user: { findFirst: vi.fn(), updateMany: vi.fn() } }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@/lib/permissions", () => ({ requireOrganizationPermission: vi.fn().mockResolvedValue({ organizationId: "org-a", userId: "admin-a", role: "ISP_ADMIN" }) }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { createResellerProfileAction, toggleResellerActiveAction, updateResellerProfileAction } = await import("./actions");

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

describe("reseller administration actions", () => {
  const profileCreate = vi.fn();
  const profileUpdateMany = vi.fn();
  const profileFindFirst = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ organizationId: "org-a", userId: "admin-a", role: "ISP_ADMIN" });
    createTenantClient.mockReturnValue({
      resellerProfile: { create: profileCreate, updateMany: profileUpdateMany, findFirst: profileFindFirst },
    });
    prisma.user.findFirst.mockResolvedValue({ id: "reseller-a" });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    profileCreate.mockResolvedValue({});
    profileUpdateMany.mockResolvedValue({ count: 1 });
    profileFindFirst.mockResolvedValue({ user_id: "reseller-a" });
  });

  it("creates a profile only for an organization-owned reseller user", async () => {
    await expect(createResellerProfileAction(null, form({ userId: "reseller-a", commissionRate: "12.5" }))).resolves.toEqual({ success: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "reseller-a", organization_id: "org-a", role: "RESELLER", deleted_at: null } }));
    expect(profileCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: "org-a", user_id: "reseller-a", commission_rate: 12.5 }) }));
  });

  it("rejects cross-tenant reseller creation", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(createResellerProfileAction(null, form({ userId: "reseller-b", commissionRate: "10" }))).resolves.toEqual({ error: "Reseller user not found in this organization." });
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it("updates commission only within the tenant and validates the range", async () => {
    await expect(updateResellerProfileAction(null, form({ profileId: "profile-a", commissionRate: "25" }))).resolves.toEqual({ success: true });
    expect(profileUpdateMany).toHaveBeenCalledWith({ where: { id: "profile-a" }, data: { commission_rate: 25 } });
    await expect(updateResellerProfileAction(null, form({ profileId: "profile-a", commissionRate: "101" }))).resolves.toEqual({ error: "Commission rate must be between 0 and 100." });
  });

  it("toggles only the profile's tenant-owned reseller user", async () => {
    await expect(toggleResellerActiveAction(null, form({ profileId: "profile-a", active: "false" }))).resolves.toEqual({ success: true });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: "reseller-a", organization_id: "org-a", role: "RESELLER" }, data: { is_active: false } });
  });
});
