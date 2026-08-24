"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { sendConfiguredNotification } from "@/lib/api/configured-notifications";
import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type TestNotificationState = { error: string } | { success: true } | null;

function normalizeGhanaPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(compact)) return `+233${compact.slice(1)}`;
  if (/^233\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+233\d{9}$/.test(compact)) return compact;
  return null;
}

export async function testNotificationProviderAction(
  _previousState: TestNotificationState,
  formData: FormData
): Promise<TestNotificationState> {
  const channel = String(formData.get("channel") ?? "");
  const requestedPhone = normalizeGhanaPhone(String(formData.get("phone") ?? ""));
  if (channel !== "EMAIL" && channel !== "SMS") return { error: "Select a valid notification channel." };

  const context = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const user = await tenantDb.user.findUnique({ where: { id: context.userId }, select: { email: true, phone: true } });
  if (!user) return { error: "Your notification recipient could not be found." };
  if (channel === "EMAIL" && !user.email) return { error: "Your account has no email address." };
  if (channel === "SMS" && !requestedPhone && !user.phone) return { error: "Enter a Ghana phone number for the SMS test." };

  const result = await sendConfiguredNotification({
    organizationId: context.organizationId,
    userId: context.userId,
    recipientId: context.userId,
    type: "GENERAL",
    channel,
    subject: "ISP-OS notification provider test",
    message: "This is a provider configuration test from ISP-OS.",
    email: user.email,
    phone: requestedPhone ?? user.phone ?? undefined,
  });
  revalidatePath("/admin/notifications");
  if (result.status === "FAILED") return { error: result.providerError ?? "Provider test failed." };
  return { success: true };
}
