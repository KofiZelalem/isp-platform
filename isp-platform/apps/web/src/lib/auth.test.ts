import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});

const getUser = vi.fn();
const supabaseIsConfigured = vi.fn(() => true);
const createSupabaseServerClient = vi.fn(async () => ({
  auth: {
    getUser,
  },
}));

const userFindFirst = vi.fn();
const organizationFindFirst = vi.fn();

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseIsConfigured,
  createSupabaseServerClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: userFindFirst,
    },
    organization: {
      findFirst: organizationFindFirst,
    },
  },
}));

const {
  getCurrentOrganizationContext,
  requireCurrentOrganization,
} = await import("@/lib/auth");

describe("organization auth context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseIsConfigured.mockReturnValue(true);
  });

  it("derives Organization A from the authenticated ISP session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "auth-a" } }, error: null });
    userFindFirst.mockResolvedValue({
      id: "user-a",
      role: "ISP_ADMIN",
      organization_id: "org-a",
    });
    organizationFindFirst.mockResolvedValue({
      id: "org-a",
      slug: "org-a",
      name: "Organization A",
    });

    await expect(getCurrentOrganizationContext()).resolves.toEqual({
      authUserId: "auth-a",
      userId: "user-a",
      role: "ISP_ADMIN",
      organizationId: "org-a",
      organization: {
        id: "org-a",
        slug: "org-a",
        name: "Organization A",
      },
    });
  });

  it("redirects unauthenticated users away from protected organization data", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireCurrentOrganization()).rejects.toThrow("REDIRECT:/login");
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("keeps platform administrators out of tenant-scoped organization context", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "platform-auth" } }, error: null });
    userFindFirst.mockResolvedValue({
      id: "platform-user",
      role: "PLATFORM_ADMIN",
      organization_id: "platform-org",
    });

    await expect(getCurrentOrganizationContext()).resolves.toBeNull();
    await expect(requireCurrentOrganization()).rejects.toThrow("REDIRECT:/login");
    expect(organizationFindFirst).not.toHaveBeenCalled();
  });

  it("denies organization context once the user is deactivated or soft-deleted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "auth-a" } }, error: null });
    userFindFirst.mockResolvedValue(null);

    await expect(getCurrentOrganizationContext()).resolves.toBeNull();
    await expect(requireCurrentOrganization()).rejects.toThrow("REDIRECT:/login");
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ is_active: true, deleted_at: null }),
      })
    );
    expect(organizationFindFirst).not.toHaveBeenCalled();
  });
});