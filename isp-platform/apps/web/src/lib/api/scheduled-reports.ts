import "server-only";

import { createTenantClient } from "database";
import type { ReportDeliveryChannel, ReportFrequency, ReportStatus, ReportType } from "database";
import { randomUUID } from "node:crypto";

import { sendConfiguredNotification } from "@/lib/api/configured-notifications";

import { prisma } from "@/lib/db";
import { generateReportForOrganization } from "@/lib/api/reports";
import { assertSafeWebhookDestination, isSyntacticallySafeWebhookUrl } from "@/lib/ssrf-guard";

type ScheduleInput = {
  organizationId: string;
  createdByUserId: string;
  type: ReportType;
  frequency: ReportFrequency;
  deliveryChannel?: ReportDeliveryChannel;
  deliveryTarget?: string;
  nextRunAt?: Date;
};

export type ScheduledReportItem = {
  id: string;
  type: ReportType;
  frequency: ReportFrequency;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  lastStatus: ReportStatus | null;
  lastError: string | null;
  deliveryChannel: ReportDeliveryChannel;
  deliveryTarget: string | null;
  createdAt: string;
};

export type ScheduledReportExecutionResult = {
  scheduleId: string;
  executionId: string;
  status: "COMPLETED" | "FAILED";
  reportId?: string;
  deliveryStatus?: "SENT" | "FAILED";
  error?: string;
};

const CLAIM_DURATION_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 100;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calculateNextRunAt(frequency: ReportFrequency, from: Date): Date {
  const next = startOfUtcDay(from);
  if (frequency === "DAILY") return addDays(next, 1);
  if (frequency === "WEEKLY") return addDays(next, 7);
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1));
}

function reportWindowForOccurrence(
  frequency: ReportFrequency,
  occurrence: Date
): { start: string; end: string } {
  const day = startOfUtcDay(occurrence);
  if (frequency === "DAILY") {
    const previous = addDays(day, -1);
    return { start: dateInput(previous), end: dateInput(previous) };
  }

  if (frequency === "WEEKLY") {
    return { start: dateInput(addDays(day, -7)), end: dateInput(addDays(day, -1)) };
  }

  const monthStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
  return { start: dateInput(monthStart), end: dateInput(monthEnd) };
}

function validateDeliveryTarget(channel: ReportDeliveryChannel, target: string | null | undefined): string | null {
  const normalized = target?.trim() || null;
  if (channel === "IN_APP") return normalized;
  if (!normalized) throw new Error(`${channel.toLowerCase()} delivery requires a target.`);
  if (channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Delivery email address is invalid.");
  }
  if (channel === "WEBHOOK") {
    const url = new URL(normalized);
    if (url.protocol !== "https:") throw new Error("Webhook delivery requires an HTTPS URL.");
    if (!isSyntacticallySafeWebhookUrl(normalized)) {
      throw new Error("Webhook delivery URL must not target a private, loopback, or internal address.");
    }
  }
  return normalized;
}

export async function createScheduledReport(input: ScheduleInput): Promise<{ id: string }> {
  const deliveryChannel = input.deliveryChannel ?? "IN_APP";
  const deliveryTarget = validateDeliveryTarget(deliveryChannel, input.deliveryTarget);
  const nextRunAt = input.nextRunAt ?? calculateNextRunAt(input.frequency, new Date());

  const tenantDb = createTenantClient(prisma, input.organizationId);
  return tenantDb.scheduledReport.create({
    data: {
      organization_id: input.organizationId,
      created_by_user_id: input.createdByUserId,
      type: input.type,
      frequency: input.frequency,
      enabled: true,
      next_run_at: nextRunAt,
      delivery_channel: deliveryChannel,
      delivery_target: deliveryTarget,
    },
    select: { id: true },
  });
}

export async function listScheduledReportsForOrganization(
  organizationId: string
): Promise<ScheduledReportItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const schedules = await tenantDb.scheduledReport.findMany({
    orderBy: { next_run_at: "asc" },
    select: {
      id: true,
      type: true,
      frequency: true,
      enabled: true,
      next_run_at: true,
      last_run_at: true,
      last_successful_run_at: true,
      last_status: true,
      last_error: true,
      delivery_channel: true,
      delivery_target: true,
      created_at: true,
    },
  });

  return schedules.map((schedule) => ({
    id: schedule.id,
    type: schedule.type,
    frequency: schedule.frequency,
    enabled: schedule.enabled,
    nextRunAt: schedule.next_run_at.toISOString(),
    lastRunAt: schedule.last_run_at?.toISOString() ?? null,
    lastSuccessfulRunAt: schedule.last_successful_run_at?.toISOString() ?? null,
    lastStatus: schedule.last_status,
    lastError: schedule.last_error,
    deliveryChannel: schedule.delivery_channel,
    deliveryTarget: schedule.delivery_target,
    createdAt: schedule.created_at.toISOString(),
  }));
}

export async function setScheduledReportEnabled(
  organizationId: string,
  scheduleId: string,
  enabled: boolean
): Promise<boolean> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const result = await tenantDb.scheduledReport.updateMany({
    where: { id: scheduleId },
    data: { enabled, ...(enabled ? { last_error: null } : {}) },
  });
  return result.count === 1;
}

async function dispatchReportDelivery(input: {
  organizationId: string;
  reportId: string;
  reportType: ReportType;
  channel: ReportDeliveryChannel;
  target: string | null;
  fileName: string;
}): Promise<"SENT" | "FAILED"> {
  const tenantDb = createTenantClient(prisma, input.organizationId);
  const delivery = await tenantDb.reportDelivery.create({
    data: {
      organization_id: input.organizationId,
      report_id: input.reportId,
      channel: input.channel,
      target: input.target,
    },
    select: { id: true },
  });

  try {
    if (input.channel === "EMAIL") {
      const notification = await sendConfiguredNotification({
        organizationId: input.organizationId,
        type: "GENERAL",
        channel: "EMAIL",
        email: input.target ?? undefined,
        subject: `ISP-OS ${input.reportType === "SESSION_USAGE_CSV" ? "session usage" : "usage summary"} report`,
        message: `Your scheduled report ${input.fileName} is ready. Download it from the ISP-OS Reports page.`,
      });
      if (notification.status === "FAILED") {
        throw new Error(notification.providerError ?? "Email delivery failed.");
      }
    } else if (input.channel === "WEBHOOK") {
      // Re-check at delivery time (not only at creation time) to guard against DNS rebinding.
      await assertSafeWebhookDestination(input.target as string);
      const response = await fetch(input.target as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "report.generated",
          reportId: input.reportId,
          reportType: input.reportType,
          fileName: input.fileName,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
      if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
    }

    await tenantDb.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", delivered_at: new Date() },
    });
    return "SENT";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tenantDb.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: message },
    });
    return "FAILED";
  }
}

export async function runDueScheduledReports(
  now = new Date(),
  limit = MAX_BATCH_SIZE
): Promise<ScheduledReportExecutionResult[]> {
  const schedules = await prisma.scheduledReport.findMany({
    where: {
      enabled: true,
      next_run_at: { lte: now },
      OR: [{ claimed_until: null }, { claimed_until: { lt: now } }],
    },
    orderBy: { next_run_at: "asc" },
    take: Math.max(1, Math.min(limit, MAX_BATCH_SIZE)),
  });

  const results: ScheduledReportExecutionResult[] = [];

  for (const schedule of schedules) {
    const executionId = randomUUID();
    const nextRunAt = calculateNextRunAt(schedule.frequency, schedule.next_run_at);
    const claim = await prisma.$transaction((transaction) =>
      transaction.scheduledReport.updateMany({
        where: {
          id: schedule.id,
          organization_id: schedule.organization_id,
          enabled: true,
          next_run_at: schedule.next_run_at,
          OR: [{ claimed_until: null }, { claimed_until: { lt: now } }],
        },
        data: {
          claim_id: executionId,
          claimed_until: new Date(now.getTime() + CLAIM_DURATION_MS),
          next_run_at: nextRunAt,
          last_run_at: now,
          last_status: "PENDING",
          last_error: null,
        },
      })
    );

    if (claim.count !== 1) continue;

    const result: ScheduledReportExecutionResult = {
      scheduleId: schedule.id,
      executionId,
      status: "FAILED",
    };

    try {
      const window = reportWindowForOccurrence(schedule.frequency, schedule.next_run_at);
      const report = await generateReportForOrganization({
        organizationId: schedule.organization_id,
        requestedByUserId: schedule.created_by_user_id,
        type: schedule.type,
        windowStart: window.start,
        windowEnd: window.end,
      });
      result.reportId = report.id;

      const storedReport = await prisma.report.findFirst({
        where: { id: report.id, organization_id: schedule.organization_id },
        select: { file_name: true },
      });
      if (!storedReport) throw new Error("Generated report could not be loaded for delivery.");

      result.deliveryStatus = await dispatchReportDelivery({
        organizationId: schedule.organization_id,
        reportId: report.id,
        reportType: schedule.type,
        channel: schedule.delivery_channel,
        target: schedule.delivery_target,
        fileName: storedReport.file_name,
      });
      result.status = "COMPLETED";

      await prisma.scheduledReport.updateMany({
        where: { id: schedule.id, organization_id: schedule.organization_id, claim_id: executionId },
        data: {
          last_status: "COMPLETED",
          last_successful_run_at: now,
          claim_id: null,
          claimed_until: null,
          last_error: result.deliveryStatus === "FAILED" ? "Report generated, but delivery failed." : null,
        },
      });
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      await prisma.scheduledReport.updateMany({
        where: { id: schedule.id, organization_id: schedule.organization_id, claim_id: executionId },
        data: {
          last_status: "FAILED",
          last_error: result.error,
          claim_id: null,
          claimed_until: null,
        },
      });
    }

    results.push(result);
  }

  return results;
}
