import "server-only";

import { createTenantClient } from "database";
import type { ReportStatus, ReportType } from "database";

import { prisma } from "@/lib/db";
import { serializeSessionHistoryCsv } from "@/lib/api/sessions";

type ReportGenerationInput = {
  organizationId: string;
  requestedByUserId: string;
  type: ReportType;
  windowStart: string;
  windowEnd: string;
};

export type ReportListItem = {
  id: string;
  type: ReportType;
  status: ReportStatus;
  windowStart: string;
  windowEnd: string;
  fileName: string;
  rowCount: number;
  error: string | null;
  generatedAt: string | null;
  createdAt: string;
  requestedBy: {
    id: string;
    name: string;
  };
};

type ReportDownload = {
  fileName: string;
  contentType: string;
  content: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 366;

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileToken(value: string): string {
  const sanitized = value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
  return sanitized || "report";
}

function parseWindowDateStart(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Start date must be in YYYY-MM-DD format.");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Start date is invalid.");
  }

  return parsed;
}

function parseWindowDateEnd(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("End date must be in YYYY-MM-DD format.");
  }

  const parsed = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("End date is invalid.");
  }

  return parsed;
}

function normalizeWindow(windowStart: string, windowEnd: string): {
  start: Date;
  end: Date;
  days: number;
} {
  const start = parseWindowDateStart(windowStart);
  const end = parseWindowDateEnd(windowEnd);

  if (end.getTime() < start.getTime()) {
    throw new Error("End date must be on or after start date.");
  }

  const days = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (days > MAX_WINDOW_DAYS) {
    throw new Error(`Date range is too large. Maximum window is ${MAX_WINDOW_DAYS} days.`);
  }

  return { start, end, days };
}

function serializeUsageSummaryCsv(rows: {
  subscriberId: string;
  subscriberName: string;
  sessionCount: number;
  totalUpMb: number;
  totalDownMb: number;
}[]): string {
  const csvRows = [
    ["Subscriber ID", "Subscriber", "Session Count", "Total Up MB", "Total Down MB", "Total MB"],
    ...rows.map((row) => [
      row.subscriberId,
      row.subscriberName,
      row.sessionCount,
      row.totalUpMb,
      row.totalDownMb,
      row.totalUpMb + row.totalDownMb,
    ]),
  ];

  return csvRows
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n");
}

async function buildSessionUsageCsv(
  organizationId: string,
  start: Date,
  end: Date
): Promise<{ content: string; rowCount: number; metadata: Record<string, unknown> }> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const sessions = await tenantDb.session.findMany({
    where: { started_at: { gte: start, lte: end } },
    orderBy: { started_at: "desc" },
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

  const content = serializeSessionHistoryCsv(
    sessions.map((session) => ({
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
    }))
  );

  const statusCounts = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.status] = (acc[session.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    content,
    rowCount: sessions.length,
    metadata: {
      statusCounts,
    },
  };
}

async function buildUsageSummaryCsv(
  organizationId: string,
  start: Date,
  end: Date
): Promise<{ content: string; rowCount: number; metadata: Record<string, unknown> }> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const sessions = await tenantDb.session.findMany({
    where: { started_at: { gte: start, lte: end } },
    select: {
      data_up_mb: true,
      data_down_mb: true,
      subscriber: { select: { id: true, full_name: true, username: true } },
    },
  });

  const bySubscriber = new Map<string, {
    subscriberId: string;
    subscriberName: string;
    sessionCount: number;
    totalUpMb: number;
    totalDownMb: number;
  }>();

  let totalUpMb = 0;
  let totalDownMb = 0;

  for (const session of sessions) {
    totalUpMb += session.data_up_mb;
    totalDownMb += session.data_down_mb;

    const subscriberId = session.subscriber.id;
    const existing = bySubscriber.get(subscriberId);

    if (existing) {
      existing.sessionCount += 1;
      existing.totalUpMb += session.data_up_mb;
      existing.totalDownMb += session.data_down_mb;
      continue;
    }

    bySubscriber.set(subscriberId, {
      subscriberId,
      subscriberName: session.subscriber.full_name || session.subscriber.username,
      sessionCount: 1,
      totalUpMb: session.data_up_mb,
      totalDownMb: session.data_down_mb,
    });
  }

  const rows = Array.from(bySubscriber.values()).sort(
    (a, b) => b.totalUpMb + b.totalDownMb - (a.totalUpMb + a.totalDownMb)
  );

  return {
    content: serializeUsageSummaryCsv(rows),
    rowCount: rows.length,
    metadata: {
      totalUpMb,
      totalDownMb,
      totalSessions: sessions.length,
    },
  };
}

export async function generateReportForOrganization(input: ReportGenerationInput): Promise<{ id: string }> {
  const { organizationId, requestedByUserId, type, windowStart, windowEnd } = input;
  const { start, end, days } = normalizeWindow(windowStart, windowEnd);

  const tenantDb = createTenantClient(prisma, organizationId);
  const fileName = [
    type === "SESSION_USAGE_CSV" ? "session-usage" : "usage-summary",
    safeFileToken(windowStart),
    safeFileToken(windowEnd),
  ].join("_");

  const report = await tenantDb.report.create({
    data: {
      organization_id: organizationId,
      requested_by_user_id: requestedByUserId,
      type,
      status: "PENDING",
      window_start: start,
      window_end: end,
      file_name: `${fileName}.csv`,
      content_type: "text/csv",
      row_count: 0,
      metadata: {
        requestedWindowDays: days,
      },
    },
    select: { id: true },
  });

  try {
    const generated =
      type === "SESSION_USAGE_CSV"
        ? await buildSessionUsageCsv(organizationId, start, end)
        : await buildUsageSummaryCsv(organizationId, start, end);

    await tenantDb.report.update({
      where: { id: report.id },
      data: {
        status: "COMPLETED",
        content: generated.content,
        row_count: generated.rowCount,
        metadata: {
          requestedWindowDays: days,
          ...generated.metadata,
        },
        error: null,
        generated_at: new Date(),
      },
    });
  } catch (error) {
    await tenantDb.report.update({
      where: { id: report.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Report generation failed.",
      },
    });
    throw error;
  }

  return { id: report.id };
}

export async function listReportsForOrganization(
  organizationId: string,
  limit = 50
): Promise<ReportListItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const reports = await tenantDb.report.findMany({
    orderBy: { created_at: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      id: true,
      type: true,
      status: true,
      window_start: true,
      window_end: true,
      file_name: true,
      row_count: true,
      error: true,
      generated_at: true,
      created_at: true,
      requester: {
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      },
    },
  });

  return reports.map((report) => ({
    id: report.id,
    type: report.type,
    status: report.status,
    windowStart: report.window_start.toISOString(),
    windowEnd: report.window_end.toISOString(),
    fileName: report.file_name,
    rowCount: report.row_count,
    error: report.error,
    generatedAt: report.generated_at?.toISOString() ?? null,
    createdAt: report.created_at.toISOString(),
    requestedBy: {
      id: report.requester.id,
      name: report.requester.full_name || report.requester.email,
    },
  }));
}

export async function getReportDownloadForOrganization(
  organizationId: string,
  reportId: string
): Promise<ReportDownload | null> {
  if (!reportId.trim()) return null;

  const tenantDb = createTenantClient(prisma, organizationId);
  const report = await tenantDb.report.findFirst({
    where: {
      id: reportId,
      status: "COMPLETED",
    },
    select: {
      file_name: true,
      content_type: true,
      content: true,
    },
  });

  if (!report || !report.content) return null;

  return {
    fileName: report.file_name,
    contentType: report.content_type || "text/csv",
    content: report.content,
  };
}

export function reportTypeLabel(type: ReportType): string {
  return type === "SESSION_USAGE_CSV" ? "Session usage CSV" : "Usage summary CSV";
}
