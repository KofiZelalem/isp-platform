import "server-only";

import { prisma } from "@/lib/db";

export type PlatformOrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country: string | null;
  currency: string;
  createdAt: string;
  subscriberCount: number;
  activeRouterCount: number;
  processedVolume: number;
};

export type PlatformOverview = {
  activeIsps: number;
  totalRevenue: number;
  connectedRouters: number;
  organizations: PlatformOrganizationSummary[];
};

/** System-wide platform metrics. This intentionally does not use tenant isolation. */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const organizationWhere = {
    deleted_at: null,
    NOT: { slug: "isp-os-platform" },
  } as const;

  const [organizations, subscriberCounts, routerCounts, revenueByOrganization, totalRevenue, connectedRouters] =
    await Promise.all([
      prisma.organization.findMany({
        where: organizationWhere,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          country: true,
          currency: true,
          created_at: true,
        },
      }),
      prisma.subscriber.groupBy({
        by: ["organization_id"],
        where: { organization: organizationWhere },
        _count: { _all: true },
      }),
      prisma.networkNode.groupBy({
        by: ["organization_id"],
        where: {
          organization: organizationWhere,
          OR: [{ status: "ONLINE" }, { connection_status: "CONNECTED" }],
        },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ["organization_id"],
        where: { organization: organizationWhere, status: "SUCCESS" },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { organization: organizationWhere, status: "SUCCESS" },
        _sum: { amount: true },
      }),
      prisma.networkNode.count({
        where: {
          organization: organizationWhere,
          OR: [{ status: "ONLINE" }, { connection_status: "CONNECTED" }],
        },
      }),
    ]);

  const subscriberMap = new Map(subscriberCounts.map((row) => [row.organization_id, row._count._all]));
  const routerMap = new Map(routerCounts.map((row) => [row.organization_id, row._count._all]));
  const revenueMap = new Map(
    revenueByOrganization.map((row) => [row.organization_id, Number(row._sum.amount ?? 0)])
  );

  return {
    activeIsps: organizations.filter((organization) => organization.status === "ACTIVE").length,
    totalRevenue: Number((totalRevenue._sum.amount ?? 0).toFixed(2)),
    connectedRouters,
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      country: organization.country,
      currency: organization.currency,
      createdAt: organization.created_at.toISOString(),
      subscriberCount: subscriberMap.get(organization.id) ?? 0,
      activeRouterCount: routerMap.get(organization.id) ?? 0,
      processedVolume: Number((revenueMap.get(organization.id) ?? 0).toFixed(2)),
    })),
  };
}

export async function setOrganizationStatus(
  actorId: string,
  organizationId: string,
  status: "ACTIVE" | "SUSPENDED"
): Promise<void> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true },
  });
  if (!actor || actor.role !== "PLATFORM_ADMIN") {
    throw new Error("Only platform administrators can change organization status.");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, status: true, slug: true },
  });
  if (!organization || organization.slug === "isp-os-platform") {
    throw new Error("Organization not found.");
  }

  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { status } }),
    prisma.platformAuditLog.create({
      data: {
        action: "organization.status_changed",
        entity: "Organization",
        entity_id: organizationId,
        actor_id: actorId,
        details: {
          organization_name: organization.name,
          previous_status: organization.status,
          next_status: status,
        },
      },
    }),
  ]);
}
