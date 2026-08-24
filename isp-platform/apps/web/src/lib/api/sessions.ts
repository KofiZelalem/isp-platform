import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type ActiveSessionItem = {
  id: string;
  subscriberName: string;
  nodeName: string;
  ipAddress: string | null;
  macAddress: string | null;
  startedAt: string;
  dataUpMb: number;
  dataDownMb: number;
};

export type RecentSessionItem = {
  id: string;
  subscriberName: string;
  nodeName: string;
  status: "ACTIVE" | "TERMINATED" | "EXPIRED";
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  dataUpMb: number;
  dataDownMb: number;
  terminationCause: string | null;
};

export type SessionHistoryStatus = "ACTIVE" | "TERMINATED" | "EXPIRED";

export type SessionHistoryFilterInput = {
  status?: string;
  search?: string;
  subscriberId?: string;
  nodeId?: string;
  startedFrom?: string;
  startedTo?: string;
  page?: number;
  pageSize?: number;
};

export type SessionHistoryFilters = {
  status?: SessionHistoryStatus;
  search?: string;
  subscriberId?: string;
  nodeId?: string;
  startedFrom?: string;
  startedTo?: string;
  page: number;
  pageSize: number;
};

export type SessionHistoryResult = {
  items: RecentSessionItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: SessionHistoryFilters;
};

export type SessionNodeFilterOption = {
  id: string;
  name: string;
};

export type SessionOperationalAlert = {
  key: "long-active" | "termination-spike" | "high-usage-active";
  severity: "warning" | "info";
  message: string;
  count: number;
};

const LONG_ACTIVE_HOURS = 24;
const TERMINATION_WINDOW_HOURS = 24;
const TERMINATION_SPIKE_THRESHOLD = 30;
const HIGH_USAGE_MB_THRESHOLD = 5000;

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

const SESSION_STATUS_VALUES: SessionHistoryStatus[] = ["ACTIVE", "TERMINATED", "EXPIRED"];

function parseStatus(value: string | undefined): SessionHistoryStatus | undefined {
  if (!value) return undefined;
  return SESSION_STATUS_VALUES.includes(value as SessionHistoryStatus)
    ? (value as SessionHistoryStatus)
    : undefined;
}

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.trunc(value);
}

function clampPageSize(value: number | undefined): number {
  const parsed = parsePositiveInt(value, 25);
  return Math.max(10, Math.min(parsed, 100));
}

function parseDateStart(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseDateEnd(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeSessionHistoryFilters(input: SessionHistoryFilterInput): SessionHistoryFilters {
  const status = parseStatus(input.status);
  const search = input.search?.trim();
  const subscriberId = input.subscriberId?.trim();
  const nodeId = input.nodeId?.trim();
  const startedFrom = input.startedFrom?.trim();
  const startedTo = input.startedTo?.trim();

  return {
    status,
    search: search ? search : undefined,
    subscriberId: subscriberId ? subscriberId : undefined,
    nodeId: nodeId ? nodeId : undefined,
    startedFrom: parseDateStart(startedFrom) ? startedFrom : undefined,
    startedTo: parseDateEnd(startedTo) ? startedTo : undefined,
    page: parsePositiveInt(input.page, 1),
    pageSize: clampPageSize(input.pageSize),
  };
}

function emptySessionHistory(filters: SessionHistoryFilters): SessionHistoryResult {
  return {
    items: [],
    total: 0,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: 1,
    filters,
  };
}

/** Fetches currently ACTIVE sessions through an organization-bound Prisma client. */
export async function getActiveSessionsForOrganization(
  organizationId: string
): Promise<ActiveSessionItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const sessions = await tenantDb.session.findMany({
    where: { status: "ACTIVE" },
    orderBy: { started_at: "desc" },
    select: {
      id: true,
      ip_address: true,
      mac_address: true,
      started_at: true,
      data_up_mb: true,
      data_down_mb: true,
      subscriber: { select: { full_name: true, username: true } },
      node: { select: { name: true } },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    subscriberName: session.subscriber.full_name || session.subscriber.username,
    nodeName: session.node.name,
    ipAddress: session.ip_address,
    macAddress: session.mac_address,
    startedAt: session.started_at.toISOString(),
    dataUpMb: session.data_up_mb,
    dataDownMb: session.data_down_mb,
  }));
}

/** Fetches recent tenant sessions (active + terminated) for accounting visibility. */
export async function getRecentSessionsForOrganization(
  organizationId: string,
  input: SessionHistoryFilterInput = {}
): Promise<SessionHistoryResult> {
  const filters = normalizeSessionHistoryFilters(input);
  const tenantDb = createTenantClient(prisma, organizationId);

  if (filters.subscriberId) {
    const subscriber = await tenantDb.subscriber.findFirst({
      where: { id: filters.subscriberId },
      select: { id: true },
    });
    if (!subscriber) return emptySessionHistory(filters);
  }

  if (filters.nodeId) {
    const node = await tenantDb.networkNode.findFirst({
      where: { id: filters.nodeId },
      select: { id: true },
    });
    if (!node) return emptySessionHistory(filters);
  }

  const startedFrom = parseDateStart(filters.startedFrom);
  const startedTo = parseDateEnd(filters.startedTo);
  const startedAtFilter =
    startedFrom || startedTo
      ? {
          ...(startedFrom ? { gte: startedFrom } : {}),
          ...(startedTo ? { lte: startedTo } : {}),
        }
      : undefined;

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.subscriberId ? { subscriber_id: filters.subscriberId } : {}),
    ...(filters.nodeId ? { node_id: filters.nodeId } : {}),
    ...(startedAtFilter ? { started_at: startedAtFilter } : {}),
    ...(filters.search
      ? {
          OR: [
            { subscriber: { username: { contains: filters.search, mode: "insensitive" as const } } },
            { subscriber: { full_name: { contains: filters.search, mode: "insensitive" as const } } },
            { subscriber: { email: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const total = await tenantDb.session.count({ where });
  const totalPages = Math.max(Math.ceil(total / filters.pageSize), 1);
  const page = Math.min(filters.page, totalPages);
  const skip = (page - 1) * filters.pageSize;

  const sessions = await tenantDb.session.findMany({
    where,
    orderBy: { started_at: "desc" },
    skip,
    take: filters.pageSize,
    select: {
      id: true,
      status: true,
      started_at: true,
      ended_at: true,
      duration_sec: true,
      data_up_mb: true,
      data_down_mb: true,
      termination_cause: true,
      subscriber: { select: { full_name: true, username: true } },
      node: { select: { name: true } },
    },
  });

  const items = sessions.map((session) => ({
    id: session.id,
    subscriberName: session.subscriber.full_name || session.subscriber.username,
    nodeName: session.node.name,
    status: session.status,
    startedAt: session.started_at.toISOString(),
    endedAt: session.ended_at?.toISOString() ?? null,
    durationSec: session.duration_sec,
    dataUpMb: session.data_up_mb,
    dataDownMb: session.data_down_mb,
    terminationCause: session.termination_cause,
  }));

  return { items, total, page, pageSize: filters.pageSize, totalPages, filters };
}

/** Fetches tenant-owned router options for filtering session history. */
export async function getSessionNodeFilterOptionsForOrganization(
  organizationId: string
): Promise<SessionNodeFilterOption[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const nodes = await tenantDb.networkNode.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return nodes.map((node) => ({ id: node.id, name: node.name }));
}

/** Serializes session-history rows for CSV download/reporting workflows. */
export function serializeSessionHistoryCsv(items: RecentSessionItem[]): string {
  const rows = [
    [
      "Session ID",
      "Subscriber",
      "Router",
      "Status",
      "Started At",
      "Ended At",
      "Duration Sec",
      "Data Up MB",
      "Data Down MB",
      "Termination Cause",
    ],
    ...items.map((item) => [
      item.id,
      item.subscriberName,
      item.nodeName,
      item.status,
      item.startedAt,
      item.endedAt ?? "",
      item.durationSec,
      item.dataUpMb,
      item.dataDownMb,
      item.terminationCause ?? "",
    ]),
  ];

  return rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
}

/** Computes tenant-scoped operational alerts from session/accounting data. */
export async function getSessionOperationalAlertsForOrganization(
  organizationId: string,
  now = Date.now()
): Promise<SessionOperationalAlert[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const longActiveCutoff = new Date(now - LONG_ACTIVE_HOURS * 60 * 60 * 1000);
  const recentTerminationCutoff = new Date(now - TERMINATION_WINDOW_HOURS * 60 * 60 * 1000);

  const [longActiveCount, recentTerminatedCount, highUsageActiveCount] = await Promise.all([
    tenantDb.session.count({
      where: {
        status: "ACTIVE",
        started_at: { lte: longActiveCutoff },
      },
    }),
    tenantDb.session.count({
      where: {
        status: "TERMINATED",
        ended_at: { gte: recentTerminationCutoff },
      },
    }),
    tenantDb.session.count({
      where: {
        status: "ACTIVE",
        OR: [
          { data_up_mb: { gte: HIGH_USAGE_MB_THRESHOLD } },
          { data_down_mb: { gte: HIGH_USAGE_MB_THRESHOLD } },
        ],
      },
    }),
  ]);

  const alerts: SessionOperationalAlert[] = [];

  if (longActiveCount > 0) {
    alerts.push({
      key: "long-active",
      severity: "warning",
      message: `Active sessions older than ${LONG_ACTIVE_HOURS}h`,
      count: longActiveCount,
    });
  }

  if (recentTerminatedCount >= TERMINATION_SPIKE_THRESHOLD) {
    alerts.push({
      key: "termination-spike",
      severity: "warning",
      message: `High session terminations in the last ${TERMINATION_WINDOW_HOURS}h`,
      count: recentTerminatedCount,
    });
  }

  if (highUsageActiveCount > 0) {
    alerts.push({
      key: "high-usage-active",
      severity: "info",
      message: "High-usage active sessions detected",
      count: highUsageActiveCount,
    });
  }

  return alerts;
}
