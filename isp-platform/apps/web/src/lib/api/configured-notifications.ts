import "server-only";

import { createTenantClient } from "database";
import { sendNotification, type SendNotificationInput, type SendNotificationResult } from "notifications";
import { decodeNodeCredential } from "mikrotik";

import { prisma } from "@/lib/db";

/** Resolves tenant provider credentials server-side and never returns them. */
export async function sendConfiguredNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const tenantDb = createTenantClient(prisma, input.organizationId);
  const settings = await prisma.organizationSettings.findUnique({
    where: { organization_id: input.organizationId },
    select: {
      notification_email_provider: true,
      notification_email_api_key_enc: true,
      notification_email_from: true,
      notification_sms_provider: true,
      notification_sms_api_key_enc: true,
      notification_sms_sender: true,
    },
  });

  const configured: SendNotificationInput = { ...input };
  if (input.channel === "EMAIL" && settings?.notification_email_provider === "resend") {
    if (settings.notification_email_api_key_enc) configured.emailApiKey = decodeNodeCredential(settings.notification_email_api_key_enc);
    if (settings.notification_email_from) configured.emailFrom = settings.notification_email_from;
  }
  if (input.channel === "SMS" && settings?.notification_sms_provider === "arkesel") {
    if (settings.notification_sms_api_key_enc) configured.smsApiKey = decodeNodeCredential(settings.notification_sms_api_key_enc);
    if (settings.notification_sms_sender) configured.smsSender = settings.notification_sms_sender;
  }

  return sendNotification(tenantDb, configured);
}
