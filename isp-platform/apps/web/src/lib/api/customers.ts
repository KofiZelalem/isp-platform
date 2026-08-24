import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type CustomerListItem = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "TERMINATED";
  currentPackage: string;
  lastPaymentAt: string | null;
  lastActivityAt: string | null;
};

export type CustomerListQuery = {
  search?: string;
  status?: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "TERMINATED";
  page?: number;
  pageSize?: number;
};

export type CustomerListResult = {
  customers: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Fetches subscribers only through an organization-bound Prisma client.
 * Callers must provide the authenticated organization ID; the tenant client
 * also adds that ID to the query as a safeguard.
 */
export async function getCustomersForOrganization(
  organizationId: string,
  query: CustomerListQuery = {}
): Promise<CustomerListResult> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const search = query.search?.trim();
  const where = {
    deleted_at: null,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { full_name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, subscribers] = await Promise.all([
    tenantDb.subscriber.count({ where }),
    tenantDb.subscriber.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    orderBy: { full_name: "asc" },
    select: {
      id: true,
      username: true,
      full_name: true,
      email: true,
      status: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { started_at: "desc" },
        take: 1,
        select: { plan: { select: { name: true } } },
      },
      payments: {
        where: { status: "SUCCESS" },
        orderBy: { paid_at: "desc" },
        take: 1,
        select: { paid_at: true },
      },
      sessions: {
        orderBy: { started_at: "desc" },
        take: 1,
        select: { started_at: true, ended_at: true },
      },
    },
    }),
  ]);

  return {
    customers: subscribers.map((subscriber) => ({
      id: subscriber.id,
      username: subscriber.username,
      fullName: subscriber.full_name,
      email: subscriber.email,
      status: subscriber.status,
      currentPackage: subscriber.subscriptions[0]?.plan.name ?? "No active package",
      lastPaymentAt: subscriber.payments[0]?.paid_at?.toISOString() ?? null,
      lastActivityAt: subscriber.sessions[0]?.started_at.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}
