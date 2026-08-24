import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());

type SessionRow = {
  id: string;
  organization_id: string;
  subscriber_id: string;
  node_id: string;
  status: "ACTIVE" | "TERMINATED" | "EXPIRED";
  started_at: Date;
  ended_at: Date | null;
  duration_sec: number;
  data_up_mb: number;
  data_down_mb: number;
  termination_cause: string | null;
  subscriber: { id: string; username: string; full_name: string | null; email: string | null };
  node: { id: string; name: string };
};

type SessionWhere = Record<string, unknown> | undefined;

type CountArgs = { where?: SessionWhere };
type FindManyArgs = {
  where?: SessionWhere;
  orderBy?: unknown;
  skip?: number;
  take?: number;
  select?: unknown;
};

type LookupArgs = { where?: Record<string, unknown>; select?: unknown };

const subscribers = [
  { id: "sub-a", organization_id: "org-a", username: "alice", full_name: "Alice Doe", email: "alice@test.com" },
  { id: "sub-b", organization_id: "org-a", username: "bob", full_name: "Bob Smith", email: "bob@test.com" },
  { id: "sub-z", organization_id: "org-b", username: "zara", full_name: "Zara", email: "zara@test.com" },
];

const nodes = [
  { id: "node-a", organization_id: "org-a", name: "Core Router" },
  { id: "node-b", organization_id: "org-a", name: "Edge Router" },
  { id: "node-z", organization_id: "org-b", name: "Foreign Router" },
];

const sessionRows: SessionRow[] = [
  {
    id: "s1",
    organization_id: "org-a",
    subscriber_id: "sub-a",
    node_id: "node-a",
    status: "ACTIVE",
    started_at: new Date("2026-08-20T10:00:00.000Z"),
    ended_at: null,
    duration_sec: 120,
    data_up_mb: 10,
    data_down_mb: 20,
    termination_cause: null,
    subscriber: { id: "sub-a", username: "alice", full_name: "Alice Doe", email: "alice@test.com" },
    node: { id: "node-a", name: "Core Router" },
  },
  {
    id: "s2",
    organization_id: "org-a",
    subscriber_id: "sub-a",
    node_id: "node-b",
    status: "TERMINATED",
    started_at: new Date("2026-08-15T10:00:00.000Z"),
    ended_at: new Date("2026-08-15T11:00:00.000Z"),
    duration_sec: 3600,
    data_up_mb: 100,
    data_down_mb: 500,
    termination_cause: "Admin-Disconnect",
    subscriber: { id: "sub-a", username: "alice", full_name: "Alice Doe", email: "alice@test.com" },
    node: { id: "node-b", name: "Edge Router" },
  },
  {
    id: "s3",
    organization_id: "org-a",
    subscriber_id: "sub-b",
    node_id: "node-a",
    status: "EXPIRED",
    started_at: new Date("2026-08-10T10:00:00.000Z"),
    ended_at: new Date("2026-08-10T12:00:00.000Z"),
    duration_sec: 7200,
    data_up_mb: 50,
    data_down_mb: 150,
    termination_cause: "Session-Timeout",
    subscriber: { id: "sub-b", username: "bob", full_name: "Bob Smith", email: "bob@test.com" },
    node: { id: "node-a", name: "Core Router" },
  },
  {
    id: "s4",
    organization_id: "org-b",
    subscriber_id: "sub-z",
    node_id: "node-z",
    status: "ACTIVE",
    started_at: new Date("2026-08-21T10:00:00.000Z"),
    ended_at: null,
    duration_sec: 60,
    data_up_mb: 1,
    data_down_mb: 2,
    termination_cause: null,
    subscriber: { id: "sub-z", username: "zara", full_name: "Zara", email: "zara@test.com" },
    node: { id: "node-z", name: "Foreign Router" },
  },
  ...Array.from({ length: 8 }).map((_, index) => ({
    id: `s-extra-${index + 1}`,
    organization_id: "org-a",
    subscriber_id: "sub-b",
    node_id: "node-b",
    status: "TERMINATED" as const,
    started_at: new Date(`2026-08-${String(9 - index).padStart(2, "0")}T09:00:00.000Z`),
    ended_at: new Date(`2026-08-${String(9 - index).padStart(2, "0")}T09:30:00.000Z`),
    duration_sec: 1800,
    data_up_mb: 5,
    data_down_mb: 15,
    termination_cause: "User-Request",
    subscriber: { id: "sub-b", username: "bob", full_name: "Bob Smith", email: "bob@test.com" },
    node: { id: "node-b", name: "Edge Router" },
  })),
];

function matchContains(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase());
}

function applyWhere(where: SessionWhere, rows: SessionRow[]): SessionRow[] {
  if (!where) return rows;

  return rows.filter((row) => {
    const record = where as Record<string, unknown>;

    if (record.status && row.status !== record.status) return false;
    if (record.subscriber_id && row.subscriber_id !== record.subscriber_id) return false;
    if (record.node_id && row.node_id !== record.node_id) return false;

    if (record.started_at) {
      const started = record.started_at as { gte?: Date; lte?: Date };
      if (started.gte && row.started_at < started.gte) return false;
      if (started.lte && row.started_at > started.lte) return false;
    }

    if (Array.isArray(record.OR) && record.OR.length > 0) {
      const ok = record.OR.some((clause) => {
        const subscriberClause =
          typeof clause === "object" && clause !== null && "subscriber" in clause
            ? (clause as { subscriber?: Record<string, { contains?: string }> }).subscriber
            : undefined;

        if (subscriberClause?.username?.contains) {
          return matchContains(row.subscriber.username, subscriberClause.username.contains);
        }
        if (subscriberClause?.full_name?.contains) {
          return row.subscriber.full_name
            ? matchContains(row.subscriber.full_name, subscriberClause.full_name.contains)
            : false;
        }
        if (subscriberClause?.email?.contains) {
          return row.subscriber.email ? matchContains(row.subscriber.email, subscriberClause.email.contains) : false;
        }
        return false;
      });
      if (!ok) return false;
    }

    return true;
  });
}

function buildTenantClient(organizationId: string) {
  return {
    subscriber: {
      findFirst: vi.fn(async (args: LookupArgs) => {
        const id = String(args.where?.id ?? "");
        return subscribers.find((sub) => sub.id === id && sub.organization_id === organizationId)
          ? { id }
          : null;
      }),
    },
    networkNode: {
      findFirst: vi.fn(async (args: LookupArgs) => {
        const id = String(args.where?.id ?? "");
        return nodes.find((node) => node.id === id && node.organization_id === organizationId)
          ? { id }
          : null;
      }),
      findMany: vi.fn(async () =>
        nodes
          .filter((node) => node.organization_id === organizationId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((node) => ({ id: node.id, name: node.name }))
      ),
    },
    session: {
      count: vi.fn(async ({ where }: CountArgs) => {
        return applyWhere(where, sessionRows.filter((row) => row.organization_id === organizationId)).length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 25 }: FindManyArgs) => {
        const all = applyWhere(where, sessionRows.filter((row) => row.organization_id === organizationId)).sort(
          (a, b) => b.started_at.getTime() - a.started_at.getTime()
        );
        return all.slice(skip, skip + take);
      }),
    },
  };
}

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  getRecentSessionsForOrganization,
  getSessionOperationalAlertsForOrganization,
  getSessionNodeFilterOptionsForOrganization,
  serializeSessionHistoryCsv,
} = await import("./sessions");

describe("getRecentSessionsForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockImplementation((_db: unknown, organizationId: string) =>
      buildTenantClient(organizationId)
    );
  });

  it("applies status filter", async () => {
    const result = await getRecentSessionsForOrganization("org-a", { status: "TERMINATED" });
    expect(result.items).toHaveLength(9);
    expect(result.items.every((item) => item.status === "TERMINATED")).toBe(true);
    expect(result.items.some((item) => item.id === "s2")).toBe(true);
  });

  it("applies date-range filter using started_at", async () => {
    const result = await getRecentSessionsForOrganization("org-a", {
      startedFrom: "2026-08-12",
      startedTo: "2026-08-20",
    });

    expect(result.items.map((item) => item.id)).toEqual(["s1", "s2"]);
  });

  it("applies subscriber search server-side", async () => {
    const result = await getRecentSessionsForOrganization("org-a", { search: "alice" });
    expect(result.items.map((item) => item.id)).toEqual(["s1", "s2"]);
  });

  it("applies combined filters", async () => {
    const result = await getRecentSessionsForOrganization("org-a", {
      status: "TERMINATED",
      search: "alice",
      nodeId: "node-b",
    });

    expect(result.items.map((item) => item.id)).toEqual(["s2"]);
  });

  it("enforces tenant isolation even when foreign ids are provided", async () => {
    const result = await getRecentSessionsForOrganization("org-a", { nodeId: "node-z" });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns empty when subscriber filter does not exist in tenant", async () => {
    const result = await getRecentSessionsForOrganization("org-a", { subscriberId: "does-not-exist" });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("handles pagination and safe page-size limits", async () => {
    const paged = await getRecentSessionsForOrganization("org-a", { page: 2, pageSize: 1 });
    expect(paged.items.map((item) => item.id)).toEqual(["s-extra-8"]);
    expect(paged.total).toBe(11);
    expect(paged.page).toBe(2);
    expect(paged.totalPages).toBe(2);

    const minClamp = await getRecentSessionsForOrganization("org-a", { pageSize: 1 });
    expect(minClamp.pageSize).toBe(10);

    const maxClamp = await getRecentSessionsForOrganization("org-a", { pageSize: 999 });
    expect(maxClamp.pageSize).toBe(100);
  });
});

describe("getSessionNodeFilterOptionsForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockImplementation((_db: unknown, organizationId: string) =>
      buildTenantClient(organizationId)
    );
  });

  it("returns only tenant routers sorted by name", async () => {
    await expect(getSessionNodeFilterOptionsForOrganization("org-a")).resolves.toEqual([
      { id: "node-a", name: "Core Router" },
      { id: "node-b", name: "Edge Router" },
    ]);
  });
});

describe("serializeSessionHistoryCsv", () => {
  it("serializes session rows into CSV with escaped values", () => {
    const csv = serializeSessionHistoryCsv([
      {
        id: "s1",
        subscriberName: "Alice \"A\"",
        nodeName: "Core Router",
        status: "ACTIVE",
        startedAt: "2026-08-20T10:00:00.000Z",
        endedAt: null,
        durationSec: 120,
        dataUpMb: 10,
        dataDownMb: 20,
        terminationCause: null,
      },
    ]);

    expect(csv).toContain("\"Session ID\",\"Subscriber\",\"Router\"");
    expect(csv).toContain("\"s1\",\"Alice \"\"A\"\"\",\"Core Router\"");
  });
});

describe("getSessionOperationalAlertsForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns warning/info alerts when thresholds are met", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(2) // long-active
      .mockResolvedValueOnce(34) // termination-spike
      .mockResolvedValueOnce(1); // high-usage-active

    createTenantClient.mockReturnValue({
      session: { count },
    });

    await expect(getSessionOperationalAlertsForOrganization("org-a")).resolves.toEqual([
      {
        key: "long-active",
        severity: "warning",
        message: "Active sessions older than 24h",
        count: 2,
      },
      {
        key: "termination-spike",
        severity: "warning",
        message: "High session terminations in the last 24h",
        count: 34,
      },
      {
        key: "high-usage-active",
        severity: "info",
        message: "High-usage active sessions detected",
        count: 1,
      },
    ]);
  });

  it("returns no alerts when thresholds are not met", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);

    createTenantClient.mockReturnValue({
      session: { count },
    });

    await expect(getSessionOperationalAlertsForOrganization("org-a")).resolves.toEqual([]);
  });
});
