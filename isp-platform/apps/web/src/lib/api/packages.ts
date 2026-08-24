import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type ServicePlanListItem = {
  id: string;
  name: string;
  description: string | null;
  planType: string;
  planPeriod: string;
  price: string;
  dataLimitMb: number | null;
  speedUploadKbps: number | null;
  speedDownloadKbps: number | null;
  validityDays: number;
  isActive: boolean;
  currency: string;
  subscriptionCount: number;
};

/**
 * Fetches service plans only through an organization-bound Prisma client.
 * Callers must provide the authenticated organization ID; the tenant client
 * also adds that ID to the query as a safeguard.
 */
export async function getServicePlansForOrganization(
  organizationId: string
): Promise<ServicePlanListItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const plans = await tenantDb.servicePlan.findMany({
    where: { deleted_at: null },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      plan_type: true,
      plan_period: true,
      price: true,
      data_limit_mb: true,
      speed_upload_kbps: true,
      speed_download_kbps: true,
      validity_days: true,
      is_active: true,
      organization: { select: { currency: true } },
      _count: { select: { subscriptions: true } },
    },
  });

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    planType: plan.plan_type,
    planPeriod: plan.plan_period,
    price: plan.price.toString(),
    dataLimitMb: plan.data_limit_mb,
    speedUploadKbps: plan.speed_upload_kbps,
    speedDownloadKbps: plan.speed_download_kbps,
    validityDays: plan.validity_days,
    isActive: plan.is_active,
    currency: plan.organization.currency,
    subscriptionCount: plan._count.subscriptions,
  }));
}

export type PortalServicePlan = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  dataLimitMb: number | null;
  validityDays: number;
};

/** Fetches only is_active + is_public plans for the captive portal. */
export async function getPublicServicePlans(organizationId: string): Promise<PortalServicePlan[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const plans = await tenantDb.servicePlan.findMany({
    where: { is_active: true, is_public: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, description: true, price: true, data_limit_mb: true, validity_days: true },
  });

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price.toString(),
    dataLimitMb: plan.data_limit_mb,
    validityDays: plan.validity_days,
  }));
}
