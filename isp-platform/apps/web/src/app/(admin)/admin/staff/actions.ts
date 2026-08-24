"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOrganizationPermission } from "@/lib/permissions";

export type ToggleStaffState = { error: string } | { success: true } | null;
export type StaffRoleState = ToggleStaffState;
export type StaffPermissionState = ToggleStaffState;

/** Toggles a staff member's active flag, scoped to the caller's organization. */
export async function toggleStaffActiveAction(
  _prevState: ToggleStaffState,
  formData: FormData
): Promise<ToggleStaffState> {
  const userId = String(formData.get("userId") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!userId) return { error: "Missing staff member id." };

  const { organizationId } = await requireOrganizationPermission("STAFF_MANAGE");

  const updated = await prisma.user.updateMany({
    where: { id: userId, organization_id: organizationId },
    data: { is_active: nextActive },
  });

  if (updated.count === 0) return { error: "Staff member not found." };
  await prisma.auditLog.create({ data: { organization_id: organizationId, action: "staff.active_changed", resource_type: "User", resource_id: userId, after_state: { is_active: nextActive } } });

  revalidatePath("/admin/staff");
  return { success: true };
}

export async function updateStaffRoleAction(_previousState: StaffRoleState, formData: FormData): Promise<StaffRoleState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!userId) return { error: "Missing user id." };
  if (role !== "STAFF" && role !== "RESELLER") return { error: "Select a valid staff role." };
  const context = await requireOrganizationPermission("STAFF_MANAGE");
  const updated = await prisma.user.updateMany({ where: { id: userId, organization_id: context.organizationId, role: { in: ["STAFF", "RESELLER"] } }, data: { role } });
  if (updated.count === 0) return { error: "Staff member not found or cannot be changed." };
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, action: "staff.role_changed", resource_type: "User", resource_id: userId, after_state: { role } } });
  revalidatePath("/admin/staff");
  revalidatePath("/admin/resellers");
  return { success: true };
}

export async function updateStaffPermissionsAction(_previousState: StaffPermissionState, formData: FormData): Promise<StaffPermissionState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const permissions = formData.getAll("permission").filter((permission): permission is string => permission === "STAFF_MANAGE" || permission === "RESELLER_MANAGE");
  if (!userId) return { error: "Missing user id." };
  const context = await requireOrganizationPermission("STAFF_MANAGE");
  const updated = await prisma.user.updateMany({ where: { id: userId, organization_id: context.organizationId, role: { in: ["STAFF", "RESELLER"] } }, data: { permissions } });
  if (updated.count === 0) return { error: "Staff member not found or cannot be changed." };
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, action: "staff.permissions_changed", resource_type: "User", resource_id: userId, after_state: { permissions } } });
  revalidatePath("/admin/staff");
  return { success: true };
}
