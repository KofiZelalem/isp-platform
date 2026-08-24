import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok without exposing configuration when the database is reachable", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("reports degraded without leaking error details when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused to internal-host:5432"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ status: "degraded", database: "error" });
    expect(JSON.stringify(body)).not.toContain("internal-host");
  });
});
