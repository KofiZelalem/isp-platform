import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();
const platformAuditCreate = vi.fn();
const transaction = vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
    },
    organization: {
      findUnique: organizationFindUnique,
      update: organizationUpdate,
    },
    platformAuditLog: {
      create: platformAuditCreate,
    },
    $transaction: transaction,
  },
}));

const { setOrganizationStatus } = await import("@/lib/api/platform");

describe("setOrganizationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationUpdate.mockResolvedValue({});
    platformAuditCreate.mockResolvedValue({});
  });

  it("allows platform administrators to perform explicit global organization actions", async () => {
    userFindUnique.mockResolvedValue({ id: "platform-user", role: "PLATFORM_ADMIN" });
    organizationFindUnique.mockResolvedValue({
      id: "org-a",
      name: "Organization A",
      status: "ACTIVE",
      slug: "org-a",
    });

    await expect(
      setOrganizationStatus("platform-user", "org-a", "SUSPENDED")
    ).resolves.toBeUndefined();

    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-a" },
      data: { status: "SUSPENDED" },
    });
    expect(platformAuditCreate).toHaveBeenCalled();
  });

  it("denies global organization actions to non-platform users", async () => {
    userFindUnique.mockResolvedValue({ id: "isp-user", role: "ISP_ADMIN" });

    await expect(
      setOrganizationStatus("isp-user", "org-a", "SUSPENDED")
    ).rejects.toThrow("Only platform administrators can change organization status.");
    expect(organizationFindUnique).not.toHaveBeenCalled();
  });
});