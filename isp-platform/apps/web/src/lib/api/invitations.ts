import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createTenantClient } from "database";
import type { InvitationRole, InvitationStatus } from "database";

import { sendConfiguredNotification } from "@/lib/api/configured-notifications";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient, supabaseIsConfigured } from "@/lib/supabase/server";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationListItem = {
  id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function invitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is required to send invitations.");
  return `${new URL(base).toString().replace(/\/$/, "")}/invite?token=${encodeURIComponent(token)}`;
}

export async function createInvitationForOrganization(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: InvitationRole;
}): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.role !== "STAFF" && input.role !== "RESELLER") throw new Error("Invalid invitation role.");

  const tenantDb = createTenantClient(prisma, input.organizationId);
  const existingUser = await tenantDb.user.findFirst({ where: { email }, select: { id: true } });
  if (existingUser) throw new Error("A user with this email already belongs to the organization.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitation = await tenantDb.invitation.create({
    data: {
      organization_id: input.organizationId,
      invited_by_user_id: input.invitedByUserId,
      email,
      role: input.role,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    },
    select: { id: true },
  });

  const notification = await sendConfiguredNotification({
    organizationId: input.organizationId,
    type: "GENERAL",
    channel: "EMAIL",
    email,
    subject: "You are invited to ISP-OS",
    message: `You have been invited to join ISP-OS as ${input.role.toLowerCase()}. Complete setup here: ${invitationUrl(token)}`,
  });
  if (notification.status === "FAILED") {
    await tenantDb.invitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });
    throw new Error(notification.providerError ?? "Invitation email could not be sent.");
  }

  return invitation;
}

export async function listInvitationsForOrganization(organizationId: string): Promise<InvitationListItem[]> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const now = new Date();
  await tenantDb.invitation.updateMany({ where: { status: "PENDING", expires_at: { lte: now } }, data: { status: "EXPIRED" } });
  const invitations = await tenantDb.invitation.findMany({ orderBy: { created_at: "desc" }, take: 50, select: { id: true, email: true, role: true, status: true, expires_at: true, created_at: true } });
  return invitations.map((invitation) => ({ id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expires_at.toISOString(), createdAt: invitation.created_at.toISOString() }));
}

export const getInvitationsForOrganization = listInvitationsForOrganization;

export async function acceptInvitation(input: { token: string; fullName: string; password: string }): Promise<{ organizationId: string; role: InvitationRole }> {
  const token = input.token.trim();
  if (!token) throw new Error("Invitation token is required.");
  if (!input.fullName.trim()) throw new Error("Full name is required.");
  if (input.password.length < 8) throw new Error("Choose a password with at least 8 characters.");
  if (!supabaseIsConfigured()) throw new Error("Supabase Auth is not configured.");

  const invitation = await prisma.invitation.findUnique({ where: { token_hash: hashToken(token) }, select: { id: true, organization_id: true, email: true, role: true, status: true, expires_at: true } });
  if (!invitation) throw new Error("Invitation is invalid.");
  if (invitation.status !== "PENDING") throw new Error("Invitation is no longer available.");
  if (invitation.expires_at.getTime() <= Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new Error("Invitation has expired.");
  }

  const supabase = await createSupabaseServerClient();
  const signup = await supabase.auth.signUp({ email: invitation.email, password: input.password, options: { data: { full_name: input.fullName.trim(), role: invitation.role, organization_id: invitation.organization_id } } });
  if (signup.error || !signup.data.user) throw new Error(signup.error?.message ?? "Account creation failed.");
  const supabaseUser = signup.data.user;

  const tenantDb = createTenantClient(prisma, invitation.organization_id);
  const existing = await tenantDb.user.findFirst({ where: { email: invitation.email }, select: { id: true } });
  if (existing) throw new Error("An account already exists for this invitation.");

  await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({ data: { organization_id: invitation.organization_id, supabase_uid: supabaseUser.id, email: invitation.email, full_name: input.fullName.trim(), role: invitation.role }, select: { id: true } });
    const consumed = await transaction.invitation.updateMany({ where: { id: invitation.id, status: "PENDING", expires_at: { gt: new Date() } }, data: { status: "ACCEPTED", accepted_at: new Date(), accepted_user_id: created.id } });
    if (consumed.count !== 1) throw new Error("Invitation was already accepted.");
    return created;
  });

  await supabase.auth.updateUser({ data: { role: invitation.role, organization_id: invitation.organization_id, full_name: input.fullName.trim() } });
  return { organizationId: invitation.organization_id, role: invitation.role };
}

export async function revokeInvitationForOrganization(organizationId: string, invitationId: string): Promise<boolean> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const result = await tenantDb.invitation.updateMany({ where: { id: invitationId, status: "PENDING" }, data: { status: "REVOKED" } });
  return result.count === 1;
}

export async function resendInvitationForOrganization(input: {
  organizationId: string;
  invitationId: string;
  invitedByUserId: string;
}): Promise<boolean> {
  const tenantDb = createTenantClient(prisma, input.organizationId);
  const invitation = await tenantDb.invitation.findFirst({ where: { id: input.invitationId, status: "PENDING" }, select: { id: true, email: true, role: true } });
  if (!invitation) return false;
  const revoked = await tenantDb.invitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "REVOKED" } });
  if (revoked.count !== 1) return false;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const replacement = await tenantDb.invitation.create({
    data: {
      organization_id: input.organizationId,
      invited_by_user_id: input.invitedByUserId,
      email: invitation.email,
      role: invitation.role,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    },
    select: { id: true },
  });
  const notification = await sendConfiguredNotification({
    organizationId: input.organizationId,
    type: "GENERAL",
    channel: "EMAIL",
    email: invitation.email,
    subject: "Your ISP-OS invitation has been renewed",
    message: `Your invitation has been renewed. Complete setup here: ${invitationUrl(token)}`,
  });
  if (notification.status === "FAILED") {
    await tenantDb.invitation.update({ where: { id: replacement.id }, data: { status: "REVOKED" } });
    return false;
  }

  return true;
}
