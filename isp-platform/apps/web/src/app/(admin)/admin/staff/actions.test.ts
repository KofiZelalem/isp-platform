import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCurrentOrganization = vi.fn();
const updateMany = vi.fn();
const revalidatePath = vi.fn();
const auditCreate = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentOrganization,
}));
vi.mock("@/lib/permissions", () => ({ requireOrganizationPermission: vi.fn(async () => requireCurrentOrganization()) }));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      updateMany,
    },
    auditLog: { create: auditCreate },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { toggleStaffActiveAction, updateStaffRoleAction, updateStaffPermissionsAction } = await import("./actions");

function createFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("toggleStaffActiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an Organization A user update Organization A staff", async () => {
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" });
    updateMany.mockResolvedValue({ count: 1 });

    const result = await toggleStaffActiveAction(
      null,
      createFormData({ userId: "staff-a", nextActive: "true" })
    );

    expect(result).toEqual({ success: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "staff-a", organization_id: "org-a" },
      data: { is_active: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/staff");
  });

  it("prevents an Organization A user from updating Organization B staff", async () => {
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" });
    updateMany.mockResolvedValue({ count: 0 });

    const result = await toggleStaffActiveAction(
      null,
      createFormData({ userId: "staff-b", nextActive: "false" })
    );

    expect(result).toEqual({ error: "Staff member not found." });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "staff-b", organization_id: "org-a" },
      data: { is_active: false },
    });
  });

  it("prevents an Organization B user from updating Organization A staff", async () => {
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-b" });
    updateMany.mockResolvedValue({ count: 0 });

    const result = await toggleStaffActiveAction(
      null,
      createFormData({ userId: "staff-a", nextActive: "false" })
    );

    expect(result).toEqual({ error: "Staff member not found." });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "staff-a", organization_id: "org-b" },
      data: { is_active: false },
    });
  });

  it("ignores a malicious organizationId supplied by the client", async () => {
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" });
    updateMany.mockResolvedValue({ count: 0 });

    const result = await toggleStaffActiveAction(
      null,
      createFormData({
        userId: "staff-b",
        nextActive: "true",
        organizationId: "org-b",
      })
    );

    expect(result).toEqual({ error: "Staff member not found." });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "staff-b", organization_id: "org-a" },
      data: { is_active: true },
    });
  });

  it("updates an allowlisted staff permission for a tenant user", async () => {
    const permissionUpdate = vi.fn().mockResolvedValue({ count: 1 });
    vi.mocked(updateMany).mockImplementation(permissionUpdate);
    const result = await updateStaffPermissionsAction(null, createFormData({ userId: "staff-a", permission: "RESELLER_MANAGE" }));
    expect(result).toEqual({ success: true });
    expect(permissionUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { permissions: ["RESELLER_MANAGE"] } }));
  });
});