import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  scheduledReport: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  report: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const createTenantClient = vi.hoisted(() => vi.fn());
const generateReportForOrganization = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/api/reports", () => ({ generateReportForOrganization }));
vi.mock("notifications", () => ({ sendNotification }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification: sendNotification }));
// SSRF/DNS resolution is covered by ssrf-guard.test.ts; this suite exercises delivery-status recording only.
vi.mock("@/lib/ssrf-guard", () => ({
  assertSafeWebhookDestination: vi.fn().mockResolvedValue(undefined),
  isSyntacticallySafeWebhookUrl: vi.fn().mockReturnValue(true),
}));

const { calculateNextRunAt, runDueScheduledReports } = await import("./scheduled-reports");

const dueSchedule = {
  id: "schedule-a",
  organization_id: "org-a",
  created_by_user_id: "user-a",
  type: "SESSION_USAGE_CSV" as const,
  frequency: "DAILY" as const,
  delivery_channel: "IN_APP" as const,
  delivery_target: null,
  next_run_at: new Date("2026-08-23T00:00:00.000Z"),
};

describe("scheduled report runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    prisma.scheduledReport.findMany.mockResolvedValue([]);
    prisma.scheduledReport.updateMany.mockResolvedValue({ count: 1 });
    prisma.report.findFirst.mockResolvedValue({ file_name: "session.csv" });
    generateReportForOrganization.mockResolvedValue({ id: "report-a" });
    createTenantClient.mockReturnValue({
      reportDelivery: {
        create: vi.fn().mockResolvedValue({ id: "delivery-a" }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
  });

  it("calculates daily, weekly, and monthly next runs", () => {
    const date = new Date("2026-08-23T14:30:00.000Z");
    expect(calculateNextRunAt("DAILY", date).toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(calculateNextRunAt("WEEKLY", date).toISOString()).toBe("2026-08-30T00:00:00.000Z");
    expect(calculateNextRunAt("MONTHLY", date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("claims and executes due schedules, advancing next run", async () => {
    prisma.scheduledReport.findMany.mockResolvedValue([dueSchedule]);

    const results = await runDueScheduledReports(new Date("2026-08-23T12:00:00.000Z"));

    expect(results).toEqual([
      {
        scheduleId: "schedule-a",
        executionId: expect.any(String),
        status: "COMPLETED",
        reportId: "report-a",
        deliveryStatus: "SENT",
      },
    ]);
    expect(prisma.scheduledReport.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.scheduledReport.updateMany.mock.calls[0][0].data.next_run_at.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(generateReportForOrganization).toHaveBeenCalledWith({
      organizationId: "org-a",
      requestedByUserId: "user-a",
      type: "SESSION_USAGE_CSV",
      windowStart: "2026-08-22",
      windowEnd: "2026-08-22",
    });
  });

  it("skips a schedule another worker claimed", async () => {
    prisma.scheduledReport.findMany.mockResolvedValue([dueSchedule]);
    prisma.scheduledReport.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(runDueScheduledReports(new Date("2026-08-23T12:00:00.000Z"))).resolves.toEqual([]);
    expect(generateReportForOrganization).not.toHaveBeenCalled();
  });

  it("continues after generation failure and records schedule failure", async () => {
    prisma.scheduledReport.findMany.mockResolvedValue([dueSchedule]);
    generateReportForOrganization.mockRejectedValue(new Error("database unavailable"));

    const results = await runDueScheduledReports(new Date("2026-08-23T12:00:00.000Z"));

    expect(results[0]).toMatchObject({ scheduleId: "schedule-a", status: "FAILED", error: "database unavailable" });
    expect(prisma.scheduledReport.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.scheduledReport.updateMany.mock.calls[1][0].data.last_status).toBe("FAILED");
  });

  it("keeps the generated report when delivery fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    prisma.scheduledReport.findMany.mockResolvedValue([{
      ...dueSchedule,
      delivery_channel: "WEBHOOK" as const,
      delivery_target: "https://example.test/report-hook",
    }]);

    const results = await runDueScheduledReports(new Date("2026-08-23T12:00:00.000Z"));

    expect(results[0]).toMatchObject({
      status: "COMPLETED",
      reportId: "report-a",
      deliveryStatus: "FAILED",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const deliveryUpdates = createTenantClient.mock.results[0]?.value.reportDelivery.update;
    expect(deliveryUpdates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }));
    vi.unstubAllGlobals();
  });
});
