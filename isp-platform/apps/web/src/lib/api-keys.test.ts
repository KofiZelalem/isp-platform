import { beforeEach, describe, expect, it, vi } from "vitest";

const apiKeyFindFirst = vi.fn();
const apiKeyUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    apiKey: {
      findFirst: apiKeyFindFirst,
      update: apiKeyUpdate,
    },
  },
}));

const { authorizeOrganizationApiKey, hashApiKey } = await import("@/lib/api-keys");

describe("authorizeOrganizationApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyUpdate.mockResolvedValue(null);
  });

  it("accepts an Organization A API key for Organization A", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key-a",
      organization_id: "org-a",
      scopes: ["radius:authorize", "radius:accounting"],
      organization: { slug: "org-a" },
    });

    const result = await authorizeOrganizationApiKey(
      {
        headers: new Headers({ "x-api-key": "secret-a" }),
      },
      "org-a",
      "radius:authorize"
    );

    expect(result).toEqual({
      ok: true,
      organizationId: "org-a",
      organizationSlug: "org-a",
      scopes: ["radius:authorize", "radius:accounting"],
    });
    expect(apiKeyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key_hash: hashApiKey("secret-a"),
          organization: expect.objectContaining({ slug: "org-a" }),
        }),
      })
    );
    expect(apiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "key-a" } })
    );
  });

  it("rejects requests with no API key", async () => {
    const result = await authorizeOrganizationApiKey(
      { headers: new Headers() },
      "org-a",
      "radius:authorize"
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      reason: "An organization API key is required.",
    });
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an Organization A API key when it is presented for Organization B", async () => {
    apiKeyFindFirst.mockResolvedValue(null);

    const result = await authorizeOrganizationApiKey(
      {
        headers: new Headers({ authorization: "Bearer secret-a" }),
      },
      "org-b",
      "radius:authorize"
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: "The supplied API key is not authorized for this organization.",
    });
    expect(apiKeyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization: expect.objectContaining({ slug: "org-b" }),
        }),
      })
    );
  });

  it("rejects API keys that do not carry the required scope", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key-a",
      organization_id: "org-a",
      scopes: ["radius:authorize"],
      organization: { slug: "org-a" },
    });

    const result = await authorizeOrganizationApiKey(
      {
        headers: new Headers({ "x-api-key": "secret-a" }),
      },
      "org-a",
      "radius:accounting"
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: "The supplied API key does not grant radius:accounting.",
    });
  });
});