import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const requestHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: requestHeaders }));

const { parseFormData, requireSameOrigin } = await import("./request-security");

function headerMap(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe("request security", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_ORIGIN;
    vi.clearAllMocks();
  });

  it("accepts an exact same-origin production request", async () => {
    requestHeaders.mockResolvedValue(headerMap({
      origin: "https://admin.example.test",
      host: "admin.example.test",
      "x-forwarded-proto": "https",
    }));
    await expect(requireSameOrigin()).resolves.toBeUndefined();
  });

  it("rejects a cross-origin production request", async () => {
    requestHeaders.mockResolvedValue(headerMap({
      origin: "https://evil.example.test",
      host: "admin.example.test",
      "x-forwarded-proto": "https",
    }));
    await expect(requireSameOrigin()).rejects.toThrow("Request origin is not allowed");
  });

  it("rejects a production request with no origin header", async () => {
    requestHeaders.mockResolvedValue(headerMap({
      host: "admin.example.test",
      "x-forwarded-proto": "https",
    }));
    await expect(requireSameOrigin()).rejects.toThrow("Request origin is not allowed");
  });

  it("parses and validates FormData through the supplied schema", () => {
    const data = new FormData();
    data.set("name", "Alice");
    expect(parseFormData(data, z.object({ name: z.string().min(1) }))).toEqual({ success: true, data: { name: "Alice" } });
  });
});
