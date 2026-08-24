"use server";

import type { ReportDeliveryChannel, ReportFrequency, ReportType } from "database";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import {
  createScheduledReport,
  setScheduledReportEnabled,
} from "@/lib/api/scheduled-reports";

export type ScheduleActionState = { error: string } | { success: true } | null;

const reportTypes: ReportType[] = ["SESSION_USAGE_CSV", "USAGE_SUMMARY_CSV"];
const frequencies: ReportFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];
const channels: ReportDeliveryChannel[] = ["IN_APP", "EMAIL", "WEBHOOK"];

export async function createScheduleAction(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const type = String(formData.get("type") ?? "") as ReportType;
  const frequency = String(formData.get("frequency") ?? "") as ReportFrequency;
  const deliveryChannel = String(formData.get("deliveryChannel") ?? "IN_APP") as ReportDeliveryChannel;
  const deliveryTarget = String(formData.get("deliveryTarget") ?? "").trim() || undefined;

  if (!reportTypes.includes(type)) return { error: "Select a valid report type." };
  if (!frequencies.includes(frequency)) return { error: "Select a valid frequency." };
  if (!channels.includes(deliveryChannel)) return { error: "Select a valid delivery channel." };

  const { organizationId, userId } = await requireCurrentOrganization();
  try {
    await createScheduledReport({
      organizationId,
      createdByUserId: userId,
      type,
      frequency,
      deliveryChannel,
      deliveryTarget,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create schedule." };
  }

  revalidatePath("/admin/reports");
  return { success: true };
}

export async function toggleScheduleAction(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  if (!scheduleId) return { error: "Missing schedule id." };

  const { organizationId } = await requireCurrentOrganization();
  const updated = await setScheduledReportEnabled(organizationId, scheduleId, enabled);
  if (!updated) return { error: "Schedule not found." };

  revalidatePath("/admin/reports");
  return { success: true };
}
