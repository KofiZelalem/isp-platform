import "server-only";

import { prisma } from "@/lib/db";

export type StaffMember = {
  id: string;
  fullName: string | null;
  email: string;
  role: "ISP_ADMIN" | "STAFF" | "RESELLER";
  isActive: boolean;
  lastLoginAt: string | null;
  permissions: string[];
};

/**
 * User is not a tenant-isolated model (it spans organizations for the
 * platform admin), so this filters organization_id explicitly.
 */
export async function getStaffForOrganization(organizationId: string): Promise<StaffMember[]> {
  const staff = await prisma.user.findMany({
    where: { organization_id: organizationId, role: { in: ["ISP_ADMIN", "STAFF", "RESELLER"] }, deleted_at: null },
    orderBy: { created_at: "asc" },
    select: { id: true, full_name: true, email: true, role: true, is_active: true, last_login_at: true, permissions: true },
  });

  return staff.map((member) => ({
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    role: member.role as StaffMember["role"],
    isActive: member.is_active,
    lastLoginAt: member.last_login_at?.toISOString() ?? null,
    permissions: member.permissions,
  }));
}
