"use server";

import { revalidatePath } from "next/cache";

import { createInvitationForOrganization } from "@/lib/api/invitations";
import { resendInvitationForOrganization, revokeInvitationForOrganization } from "@/lib/api/invitations";
import { requireOrganizationPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export type InvitationActionState = { error: string } | { success: true } | null;

export async function createInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (role !== "STAFF" && role !== "RESELLER") return { error: "Select a valid invitation role." };

  const context = await requireOrganizationPermission("STAFF_MANAGE");
  try {
    await createInvitationForOrganization({ organizationId: context.organizationId, invitedByUserId: context.userId, email, role });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invitation could not be created." };
  }

  revalidatePath("/admin/staff");
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "invitation.created", resource_type: "Invitation", after_state: { email, role } } });
  revalidatePath("/admin/resellers");
  return { success: true };
}

export async function revokeInvitationAction(_previousState: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Missing invitation id." };
  const context = await requireOrganizationPermission("STAFF_MANAGE");
  const revoked = await revokeInvitationForOrganization(context.organizationId, invitationId);
  if (!revoked) return { error: "Pending invitation not found." };
  revalidatePath("/admin/staff");
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "invitation.revoked", resource_type: "Invitation", resource_id: invitationId } });
  return { success: true };
}

export async function resendInvitationAction(_previousState: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Missing invitation id." };
  const context = await requireOrganizationPermission("STAFF_MANAGE");
  const resent = await resendInvitationForOrganization({ organizationId: context.organizationId, invitationId, invitedByUserId: context.userId });
  if (!resent) return { error: "Invitation could not be resent." };
  revalidatePath("/admin/staff");
  await prisma.auditLog.create({ data: { organization_id: context.organizationId, actor_id: context.userId, action: "invitation.resent", resource_type: "Invitation", resource_id: invitationId } });
  return { success: true };
}
