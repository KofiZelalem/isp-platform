import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWorkerJob, runWorkerCycle } = await import("./index");

describe("worker jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKER_CONTROL_URL", "http://web:3000");
    vi.stubEnv("ISP_OS_WORKER_SECRET", "12345678901234567890123456789012");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ processed: 1 }) }));
  });

  it("calls the authenticated scheduled report endpoint", async () => {
    await expect(runWorkerJob("scheduled-reports")).resolves.toMatchObject({ job: "scheduled-reports", ok: true });
    expect(fetch).toHaveBeenCalledWith("http://web:3000/api/internal/scheduled-reports/run", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer 12345678901234567890123456789012" },
    }));
  });

  it("runs reports and alert delivery as independent jobs", async () => {
    const results = await runWorkerCycle();
    expect(results).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])).toEqual([
      "http://web:3000/api/internal/scheduled-reports/run",
      "http://web:3000/api/internal/operational-alerts/run",
    ]);
  });

  it("returns job failure without stopping the worker process", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("web unavailable")));
    await expect(runWorkerJob("operational-alerts")).resolves.toMatchObject({ job: "operational-alerts", ok: false, error: "web unavailable" });
  });
});
