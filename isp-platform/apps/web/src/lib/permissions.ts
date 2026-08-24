import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const ORGANIZATION_PERMISSIONS = ["STAFF_MANAGE", "RESELLER_MANAGE"] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

/** Requires an authenticated tenant user with the named permission; ISP admins retain full access. */
export async function requireOrganizationPermission(permission: OrganizationPermission) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (context.role === "ISP_ADMIN") return context;
  const user = await prisma.user.findFirst({ where: { id: context.userId, organization_id: context.organizationId, is_active: true, deleted_at: null }, select: { permissions: true } });
  if (!user?.permissions.includes(permission)) redirect("/login");
  return context;
}
