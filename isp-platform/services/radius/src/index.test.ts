import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildWebRadiusUrl, proxyRadiusRequest } from "./index";

describe("radius service proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the authoritative web endpoints from a base URL", () => {
    expect(buildWebRadiusUrl("https://web.example.test/")).toEqual({
      authorize: "https://web.example.test/api/radius/authorize",
      accounting: "https://web.example.test/api/radius/accounting",
    });
  });

  it("forwards authorization requests with the configured API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accept: true, subscriberId: "sub-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyRadiusRequest({
      kind: "authorize",
      webBaseUrl: "https://web.example.test",
      apiKey: "radius-key-123",
      payload: { organizationSlug: "demo-org", username: "alice", protocol: "pap", password: "secret" },
    });

    expect(result).toMatchObject({ accept: true, subscriberId: "sub-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://web.example.test/api/radius/authorize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-api-key": "radius-key-123",
        }),
      })
    );
  });
});
