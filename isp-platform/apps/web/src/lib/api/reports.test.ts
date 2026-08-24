import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());

type SessionStatus = "ACTIVE" | "TERMINATED" | "EXPIRED";

type SessionRow = {
  id: string;
  organization_id: string;
  subscriber_id: string;
  status: SessionStatus;
  started_at: Date;
  ended_at: Date | null;
  duration_sec: number;
  data_up_mb: number;
  data_down_mb: number;
  termination_cause: string | null;
  subscriber: { id: string; full_name: string | null; username: string; email: string | null };
  node: { id: string; name: string };
};

type ReportRow = {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  type: "SESSION_USAGE_CSV" | "USAGE_SUMMARY_CSV";
  status: "PENDING" | "COMPLETED" | "FAILED";
  window_start: Date;
  window_end: Date;
  file_name: string;
  content_type: string;
  content: string | null;
  row_count: number;
  metadata: Record<string, unknown> | null;
  error: string | null;
  generated_at: Date | null;
  created_at: Date;
  requester?: { id: string; full_name: string | null; email: string };
};

const sessions: SessionRow[] = [
  {
    id: "session-1",
    organization_id: "org-a",
    subscriber_id: "sub-a",
    status: "ACTIVE",
    started_at: new Date("2026-08-10T10:00:00.000Z"),
    ended_at: null,
    duration_sec: 120,
    data_up_mb: 10,
    data_down_mb: 20,
    termination_cause: null,
    subscriber: { id: "sub-a", full_name: "Alice Doe", username: "alice", email: "alice@test.com" },
    node: { id: "node-a", name: "Core Router" },
  },
  {
    id: "session-2",
    organization_id: "org-a",
    subscriber_id: "sub-b",
    status: "TERMINATED",
    started_at: new Date("2026-08-12T10:00:00.000Z"),
    ended_at: new Date("2026-08-12T11:00:00.000Z"),
    duration_sec: 3600,
    data_up_mb: 30,
    data_down_mb: 70,
    termination_cause: "Session-Timeout",
    subscriber: { id: "sub-b", full_name: "Bob Smith", username: "bob", email: "bob@test.com" },
    node: { id: "node-b", name: "Edge Router" },
  },
  {
    id: "session-foreign",
    organization_id: "org-b",
    subscriber_id: "sub-z",
    status: "ACTIVE",
    started_at: new Date("2026-08-11T10:00:00.000Z"),
    ended_at: null,
    duration_sec: 300,
    data_up_mb: 5,
    data_down_mb: 5,
    termination_cause: null,
    subscriber: { id: "sub-z", full_name: "Zara", username: "zara", email: "zara@test.com" },
    node: { id: "node-z", name: "Foreign Router" },
  },
];

const reportsByOrg = new Map<string, ReportRow[]>();
let reportIdCounter = 0;

function nextReportId(): string {
  reportIdCounter += 1;
  return `report-${reportIdCounter}`;
}

function inWindow(date: Date, gte?: Date, lte?: Date): boolean {
  if (gte && date < gte) return false;
  if (lte && date > lte) return false;
  return true;
}

function buildTenantClient(organizationId: string) {
  return {
    session: {
      findMany: vi.fn(async (args?: { where?: { started_at?: { gte?: Date; lte?: Date } } }) => {
        const where = args?.where;
        const gte = where?.started_at?.gte;
        const lte = where?.started_at?.lte;

        return sessions
          .filter((row) => row.organization_id === organizationId)
          .filter((row) => inWindow(row.started_at, gte, lte));
      }),
    },
    report: {
      create: vi.fn(async ({ data }: { data: Omit<ReportRow, "id" | "organization_id" | "created_at" | "updated_at"> & { metadata?: Record<string, unknown> } }) => {
        const row: ReportRow = {
          id: nextReportId(),
          organization_id: organizationId,
          requested_by_user_id: data.requested_by_user_id,
          type: data.type,
          status: data.status,
          window_start: data.window_start,
          window_end: data.window_end,
          file_name: data.file_name,
          content_type: data.content_type,
          content: null,
          row_count: data.row_count,
          metadata: data.metadata ?? null,
          error: null,
          generated_at: null,
          created_at: new Date(),
          requester: {
            id: data.requested_by_user_id,
            full_name: "Test Admin",
            email: "admin@test.com",
          },
        };
        const list = reportsByOrg.get(organizationId) ?? [];
        list.unshift(row);
        reportsByOrg.set(organizationId, list);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<ReportRow> }) => {
        const list = reportsByOrg.get(organizationId) ?? [];
        const found = list.find((row) => row.id === where.id);
        if (!found) throw new Error("report not found");
        Object.assign(found, data);
        return found;
      }),
      findMany: vi.fn(async ({ take = 50 }: { take?: number }) => {
        const list = reportsByOrg.get(organizationId) ?? [];
        return list.slice(0, take);
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; status: "COMPLETED" } }) => {
        const list = reportsByOrg.get(organizationId) ?? [];
        const found = list.find((row) => row.id === where.id && row.status === where.status);
        if (!found) return null;
        return {
          file_name: found.file_name,
          content_type: found.content_type,
          content: found.content,
        };
      }),
    },
  };
}

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  generateReportForOrganization,
  getReportDownloadForOrganization,
  listReportsForOrganization,
  reportTypeLabel,
} = await import("./reports");

describe("generateReportForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportIdCounter = 0;
    reportsByOrg.clear();
    createTenantClient.mockImplementation((_db: unknown, organizationId: string) =>
      buildTenantClient(organizationId)
    );
  });

  it("generates a session usage report and persists completed metadata", async () => {
    const result = await generateReportForOrganization({
      organizationId: "org-a",
      requestedByUserId: "user-a",
      type: "SESSION_USAGE_CSV",
      windowStart: "2026-08-10",
      windowEnd: "2026-08-12",
    });

    expect(result.id).toBe("report-1");

    const rows = reportsByOrg.get("org-a") ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(rows[0]?.row_count).toBe(2);
    expect(rows[0]?.content).toContain("Session ID");
    expect(rows[0]?.content).toContain("session-1");
    expect(rows[0]?.content).not.toContain("session-foreign");
  });

  it("generates a usage summary report with subscriber-level rollups", async () => {
    await generateReportForOrganization({
      organizationId: "org-a",
      requestedByUserId: "user-a",
      type: "USAGE_SUMMARY_CSV",
      windowStart: "2026-08-10",
      windowEnd: "2026-08-12",
    });

    const rows = reportsByOrg.get("org-a") ?? [];
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(rows[0]?.row_count).toBe(2);
    expect(rows[0]?.content).toContain("Subscriber ID");
    expect(rows[0]?.content).toContain("sub-a");
    expect(rows[0]?.content).toContain("sub-b");
  });

  it("rejects invalid date ranges", async () => {
    await expect(
      generateReportForOrganization({
        organizationId: "org-a",
        requestedByUserId: "user-a",
        type: "SESSION_USAGE_CSV",
        windowStart: "2026-08-20",
        windowEnd: "2026-08-10",
      })
    ).rejects.toThrow("End date must be on or after start date.");
  });

  it("rejects excessively large date windows", async () => {
    await expect(
      generateReportForOrganization({
        organizationId: "org-a",
        requestedByUserId: "user-a",
        type: "SESSION_USAGE_CSV",
        windowStart: "2025-01-01",
        windowEnd: "2026-08-01",
      })
    ).rejects.toThrow("Date range is too large");
  });

  it("supports empty windows safely", async () => {
    await generateReportForOrganization({
      organizationId: "org-a",
      requestedByUserId: "user-a",
      type: "SESSION_USAGE_CSV",
      windowStart: "2026-08-01",
      windowEnd: "2026-08-01",
    });

    const rows = reportsByOrg.get("org-a") ?? [];
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(rows[0]?.row_count).toBe(0);
    expect(rows[0]?.content).toContain("Session ID");
  });
});

describe("report listing/download", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    reportIdCounter = 0;
    reportsByOrg.clear();
    createTenantClient.mockImplementation((_db: unknown, organizationId: string) =>
      buildTenantClient(organizationId)
    );

    await generateReportForOrganization({
      organizationId: "org-a",
      requestedByUserId: "user-a",
      type: "SESSION_USAGE_CSV",
      windowStart: "2026-08-10",
      windowEnd: "2026-08-12",
    });
  });

  it("lists tenant reports only", async () => {
    const orgAReports = await listReportsForOrganization("org-a");
    const orgBReports = await listReportsForOrganization("org-b");

    expect(orgAReports).toHaveLength(1);
    expect(orgAReports[0]?.requestedBy.name).toBe("Test Admin");
    expect(orgBReports).toEqual([]);
  });

  it("allows download for completed tenant-owned report only", async () => {
    const downloadable = await getReportDownloadForOrganization("org-a", "report-1");
    expect(downloadable?.fileName).toContain("session-usage");
    expect(downloadable?.content).toContain("Session ID");

    const foreign = await getReportDownloadForOrganization("org-b", "report-1");
    expect(foreign).toBeNull();
  });

  it("returns null for missing report id", async () => {
    await expect(getReportDownloadForOrganization("org-a", "   ")).resolves.toBeNull();
  });
});

describe("reportTypeLabel", () => {
  it("maps labels", () => {
    expect(reportTypeLabel("SESSION_USAGE_CSV")).toBe("Session usage CSV");
    expect(reportTypeLabel("USAGE_SUMMARY_CSV")).toBe("Usage summary CSV");
  });
});
