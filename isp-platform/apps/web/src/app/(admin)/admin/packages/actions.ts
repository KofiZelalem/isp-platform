"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFormData, requireSameOrigin, requiredId } from "@/lib/request-security";
import { z } from "zod";

export type CreateServicePlanState =
  | { error: string }
  | { success: true }
  | null;

export type PackageActionState = CreateServicePlanState;

const positiveWholeNumber = (message: string) => z.preprocess(
  (value) => value === "" || value === undefined ? null : Number(value),
  z.number().int().positive(message).nullable()
);

const planFieldsSchema = z.object({
  name: z.string().trim().min(1, "Package name is required and must be 120 characters or fewer.").max(120, "Package name is required and must be 120 characters or fewer."),
  description: z.string().trim().max(2000),
  price: z.preprocess((value) => Number(value), z.number().finite("Enter a valid non-negative price.").nonnegative("Enter a valid non-negative price.")),
  validityDays: z.preprocess((value) => Number(value), z.number().int().positive("Enter a valid duration in days.")),
  planType: z.enum(["TIME_BASED", "DATA_BASED", "UNLIMITED", "VOUCHER"], { message: "Choose a valid package type." }),
  planPeriod: z.enum(["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"], { message: "Choose a valid package period." }),
  dataLimitMb: positiveWholeNumber("Data limit must be a positive whole number."),
  speedUploadKbps: positiveWholeNumber("Upload speed must be a positive whole number."),
  speedDownloadKbps: positiveWholeNumber("Download speed must be a positive whole number."),
});

const planInputSchema = planFieldsSchema.transform((value) => ({
  name: value.name,
  description: value.description || null,
  price: value.price,
  validity_days: value.validityDays,
  plan_type: value.planType,
  plan_period: value.planPeriod,
  data_limit_mb: value.dataLimitMb,
  speed_upload_kbps: value.speedUploadKbps,
  speed_download_kbps: value.speedDownloadKbps,
}));


/** Server Action backing the "Add package" form; validates and creates a ServicePlan. */
export async function createServicePlan(
  _prevState: CreateServicePlanState,
  formData: FormData
): Promise<CreateServicePlanState> {
  const fields = parseFormData(formData, planInputSchema);
  if (!fields.success) return { error: fields.error };

  await requireSameOrigin();
  const { organizationId } = await requireCurrentOrganization();

  const tenantDb = createTenantClient(prisma, organizationId);
  await tenantDb.servicePlan.create({
    data: {
      organization_id: organizationId,
      ...fields.data,
      is_active: true,
      is_public: true,
    },
  });

  revalidatePath("/admin/packages");
  return { success: true };
}

export async function updateServicePlan(
  _prevState: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const parsed = parseFormData(formData, planFieldsSchema.extend({ planId: requiredId }));
  if (!parsed.success) return { error: parsed.error };
  const { planId, ...input } = parsed.data;
  const fields = planInputSchema.parse(input);
  await requireSameOrigin();
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  try {
    await tenantDb.servicePlan.update({ where: { id: planId }, data: fields });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return { error: "Package not found." };
    throw error;
  }
  revalidatePath("/admin/packages");
  return { success: true };
}

export async function setServicePlanActive(
  _prevState: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const parsed = parseFormData(formData, z.object({ planId: requiredId, isActive: z.enum(["true", "false"]) }));
  if (!parsed.success) return { error: parsed.error };
  const planId = parsed.data.planId;
  const isActive = parsed.data.isActive === "true";
  await requireSameOrigin();
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const result = await tenantDb.servicePlan.updateMany({ where: { id: planId, deleted_at: null }, data: { is_active: isActive } });
  if (result.count === 0) return { error: "Package not found." };
  revalidatePath("/admin/packages");
  return { success: true };
}

export async function archiveServicePlan(
  _prevState: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const parsed = parseFormData(formData, z.object({ planId: requiredId }));
  if (!parsed.success) return { error: parsed.error };
  const planId = parsed.data.planId;
  await requireSameOrigin();
  const { organizationId } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const activeSubscriptions = await tenantDb.subscription.count({ where: { plan_id: planId, status: "ACTIVE" } });
  if (activeSubscriptions > 0) return { error: "This package has active subscriptions and cannot be archived." };
  const result = await tenantDb.servicePlan.updateMany({ where: { id: planId, deleted_at: null }, data: { deleted_at: new Date(), is_active: false, is_public: false } });
  if (result.count === 0) return { error: "Package not found." };
  revalidatePath("/admin/packages");
  return { success: true };
}
