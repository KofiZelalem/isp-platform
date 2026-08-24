import "server-only";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { createSupabaseServerClient, supabaseIsConfigured } from "@/lib/supabase/server";

export type AuthRole =
  | "PLATFORM_ADMIN"
  | "ISP_ADMIN"
  | "STAFF"
  | "RESELLER"
  | "CUSTOMER";

export type AuthContext = {
  authUserId: string;
  userId: string;
  role: AuthRole;
  organizationId: string;
};

export type OrganizationContext = AuthContext & {
  organization: {
    id: string;
    slug: string;
    name: string;
  };
};

/** Resolves the Supabase user to the application User record and tenant. */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (!supabaseIsConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = await prisma.user.findFirst({
    where: { supabase_uid: data.user.id, is_active: true, deleted_at: null },
    select: { id: true, role: true, organization_id: true },
  });
  if (!user) return null;

  return {
    authUserId: data.user.id,
    userId: user.id,
    role: user.role,
    organizationId: user.organization_id,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireRole(
  role: AuthContext["role"]
): Promise<AuthContext> {
  const context = await requireAuth();
  if (context.role !== role) redirect("/login");
  return context;
}

export async function getCurrentOrganizationContext(): Promise<OrganizationContext | null> {
  const context = await getAuthContext();
  if (!context || context.role === "PLATFORM_ADMIN") return null;

  const organization = await prisma.organization.findFirst({
    where: { id: context.organizationId, status: "ACTIVE", deleted_at: null },
    select: { id: true, slug: true, name: true },
  });
  if (!organization) return null;

  return {
    ...context,
    organizationId: organization.id,
    organization,
  };
}

export async function requireCurrentOrganization(): Promise<OrganizationContext> {
  const context = await getCurrentOrganizationContext();
  if (!context) redirect("/login");
  return context;
}

export async function getCurrentOrganizationId(): Promise<string | null> {
  return (await getCurrentOrganizationContext())?.organization.id ?? null;
}

export async function requireOrganizationSlugAccess(
  slug: string
): Promise<OrganizationContext> {
  const context = await requireCurrentOrganization();
  if (context.organization.slug !== slug) redirect("/login");
  return context;
}

export async function requireOrganizationMember(): Promise<OrganizationContext> {
  return requireCurrentOrganization();
}
