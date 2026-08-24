import "server-only";

import { prisma } from "@/lib/db";

export type OrganizationSettingsData = {
  name: string;
  currency: string;
  timezone: string;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  paymentProvider: string | null;
  smsGatewayProvider: string | null;
  notificationEmailProvider: string | null;
  notificationEmailFrom: string | null;
  notificationEmailConfigured: boolean;
  notificationSmsProvider: string | null;
  notificationSmsSender: string | null;
  notificationSmsConfigured: boolean;
  captivePortalConfig: Record<string, unknown> | null;
};

export async function getOrganizationSettingsData(
  organizationId: string
): Promise<OrganizationSettingsData | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      currency: true,
      timezone: true,
      custom_domain: true,
      primary_color: true,
      secondary_color: true,
      settings: { select: { payment_provider: true, sms_gateway_provider: true, notification_email_provider: true, notification_email_from: true, notification_email_api_key_enc: true, notification_sms_provider: true, notification_sms_sender: true, notification_sms_api_key_enc: true, captive_portal_config: true } },
    },
  });
  if (!organization) return null;

  return {
    name: organization.name,
    currency: organization.currency,
    timezone: organization.timezone,
    customDomain: organization.custom_domain,
    primaryColor: organization.primary_color,
    secondaryColor: organization.secondary_color,
    paymentProvider: organization.settings?.payment_provider ?? null,
    smsGatewayProvider: organization.settings?.sms_gateway_provider ?? null,
    notificationEmailProvider: organization.settings?.notification_email_provider ?? null,
    notificationEmailFrom: organization.settings?.notification_email_from ?? null,
    notificationEmailConfigured: Boolean(organization.settings?.notification_email_api_key_enc),
    notificationSmsProvider: organization.settings?.notification_sms_provider ?? null,
    notificationSmsSender: organization.settings?.notification_sms_sender ?? null,
    notificationSmsConfigured: Boolean(organization.settings?.notification_sms_api_key_enc),
    captivePortalConfig: organization.settings?.captive_portal_config && typeof organization.settings.captive_portal_config === "object"
      ? organization.settings.captive_portal_config as Record<string, unknown>
      : null,
  };
}
