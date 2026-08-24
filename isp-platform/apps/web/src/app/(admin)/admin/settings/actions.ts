"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encodeNodeCredential } from "mikrotik";

export type UpdateSettingsState = { error: string } | { success: true } | null;

function parseWalledGarden(value: string): string[] | null {
  const domains = [...new Set(value.split(/[\n,]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  if (domains.some((domain) => !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))) {
    return null;
  }
  return domains;
}

/** Updates organization branding, defaults, and provider settings. */
export async function updateOrganizationSettingsAction(
  _prevState: UpdateSettingsState,
  formData: FormData
): Promise<UpdateSettingsState> {
  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const customDomain = String(formData.get("customDomain") ?? "").trim();
  const primaryColor = String(formData.get("primaryColor") ?? "").trim();
  const secondaryColor = String(formData.get("secondaryColor") ?? "").trim();
  const paymentProvider = String(formData.get("paymentProvider") ?? "").trim();
  const smsGatewayProvider = String(formData.get("smsGatewayProvider") ?? "").trim();
  const notificationEmailProvider = String(formData.get("notificationEmailProvider") ?? "").trim();
  const notificationEmailApiKey = String(formData.get("notificationEmailApiKey") ?? "").trim();
  const notificationEmailFrom = String(formData.get("notificationEmailFrom") ?? "").trim();
  const notificationSmsProvider = String(formData.get("notificationSmsProvider") ?? "").trim();
  const notificationSmsApiKey = String(formData.get("notificationSmsApiKey") ?? "").trim();
  const notificationSmsSender = String(formData.get("notificationSmsSender") ?? "").trim();
  const walledGarden = parseWalledGarden(String(formData.get("walledGarden") ?? ""));

  if (!name) return { error: "Organization name is required." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Enter a valid 3-letter currency code, e.g. USD." };
  if (!timezone) return { error: "Timezone is required." };
  if (!walledGarden) return { error: "Enter valid domain names for the walled garden, one per line." };

  const { organizationId } = await requireCurrentOrganization();

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        name,
        currency,
        timezone,
        custom_domain: customDomain || null,
        primary_color: primaryColor || null,
        secondary_color: secondaryColor || null,
      },
    }),
    prisma.organizationSettings.upsert({
      where: { organization_id: organizationId },
      update: {
        payment_provider: paymentProvider || null,
        sms_gateway_provider: smsGatewayProvider || null,
        notification_email_provider: notificationEmailProvider || null,
        ...(notificationEmailApiKey ? { notification_email_api_key_enc: encodeNodeCredential(notificationEmailApiKey) } : {}),
        notification_email_from: notificationEmailFrom || null,
        notification_sms_provider: notificationSmsProvider || null,
        ...(notificationSmsApiKey ? { notification_sms_api_key_enc: encodeNodeCredential(notificationSmsApiKey) } : {}),
        notification_sms_sender: notificationSmsSender || null,
        captive_portal_config: { walledGarden },
      },
      create: {
        organization_id: organizationId,
        payment_provider: paymentProvider || null,
        sms_gateway_provider: smsGatewayProvider || null,
        notification_email_provider: notificationEmailProvider || null,
        notification_email_api_key_enc: notificationEmailApiKey ? encodeNodeCredential(notificationEmailApiKey) : null,
        notification_email_from: notificationEmailFrom || null,
        notification_sms_provider: notificationSmsProvider || null,
        notification_sms_api_key_enc: notificationSmsApiKey ? encodeNodeCredential(notificationSmsApiKey) : null,
        notification_sms_sender: notificationSmsSender || null,
        captive_portal_config: { walledGarden },
      },
    }),
  ]);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/hotspots");
  return { success: true };
}
