"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { retryFailedNotification } from "@/lib/api/notification-retries";

export type RetryNotificationState = { error: string } | { success: true } | null;

export async function retryNotificationAction(
  _previousState: RetryNotificationState,
  formData: FormData
): Promise<RetryNotificationState> {
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return { error: "Missing notification id." };
  const { organizationId } = await requireCurrentOrganization();

  try {
    const result = await retryFailedNotification(organizationId, notificationId);
    if (result.status === "FAILED") return { error: result.error ?? "Retry failed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Retry failed." };
  }

  revalidatePath("/admin/notifications");
  return { success: true };
}