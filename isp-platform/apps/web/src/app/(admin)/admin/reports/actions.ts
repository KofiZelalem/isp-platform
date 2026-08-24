"use server";

import type { ReportType } from "database";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { generateReportForOrganization } from "@/lib/api/reports";

export type GenerateReportState =
  | { error: string }
  | { success: true }
  | null;

const REPORT_TYPES: ReportType[] = ["SESSION_USAGE_CSV", "USAGE_SUMMARY_CSV"];

function parseReportType(value: string): ReportType | null {
  return REPORT_TYPES.includes(value as ReportType) ? (value as ReportType) : null;
}

export async function generateReportAction(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const typeValue = String(formData.get("type") ?? "").trim();
  const windowStart = String(formData.get("windowStart") ?? "").trim();
  const windowEnd = String(formData.get("windowEnd") ?? "").trim();

  const type = parseReportType(typeValue);
  if (!type) return { error: "Select a valid report type." };
  if (!windowStart) return { error: "Start date is required." };
  if (!windowEnd) return { error: "End date is required." };

  const { organizationId, userId } = await requireCurrentOrganization();

  try {
    await generateReportForOrganization({
      organizationId,
      requestedByUserId: userId,
      type,
      windowStart,
      windowEnd,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate report." };
  }

  revalidatePath("/admin/reports");
  return { success: true };
}
