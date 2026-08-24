import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: {
      findFirst: organizationFindFirst,
    },
  },
}));

const { resolvePublicOrganization } = await import("@/lib/organizations");

describe("resolvePublicOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PORTAL_DEFAULT_ORGANIZATION_SLUG;
  });

  it("resolves a portal organization when host and slug agree", async () => {
    organizationFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.slug === "org-a") {
        return {
          id: "org-a",
          slug: "org-a",
          name: "Organization A",
          custom_domain: "wifi.org-a.test",
          primary_color: null,
          secondary_color: null,
        };
      }

      if (where.custom_domain === "wifi.org-a.test") {
        return {
          id: "org-a",
          slug: "org-a",
          name: "Organization A",
          custom_domain: "wifi.org-a.test",
          primary_color: null,
          secondary_color: null,
        };
      }

      return null;
    });

    await expect(resolvePublicOrganization("org-a", "wifi.org-a.test")).resolves.toEqual({
      id: "org-a",
      slug: "org-a",
      name: "Organization A",
      customDomain: "wifi.org-a.test",
      primaryColor: null,
      secondaryColor: null,
    });
  });

  it("rejects a portal request when the supplied slug and host map to different organizations", async () => {
    organizationFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.slug === "org-a") {
        return {
          id: "org-a",
          slug: "org-a",
          name: "Organization A",
          custom_domain: "wifi.org-a.test",
          primary_color: null,
          secondary_color: null,
        };
      }

      if (where.custom_domain === "wifi.org-b.test") {
        return {
          id: "org-b",
          slug: "org-b",
          name: "Organization B",
          custom_domain: "wifi.org-b.test",
          primary_color: null,
          secondary_color: null,
        };
      }

      return null;
    });

    await expect(resolvePublicOrganization("org-a", "wifi.org-b.test")).resolves.toBeNull();
  });

  it("uses the configured default organization for local development requests", async () => {
    process.env.PORTAL_DEFAULT_ORGANIZATION_SLUG = "org-a";
    organizationFindFirst.mockResolvedValue({
      id: "org-a",
      slug: "org-a",
      name: "Organization A",
      custom_domain: null,
      primary_color: null,
      secondary_color: null,
    });

    await expect(resolvePublicOrganization(null, "localhost")).resolves.toMatchObject({
      id: "org-a",
      slug: "org-a",
    });
    expect(organizationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ slug: "org-a" }),
    }));
  });
});