import { PrismaClient } from "@prisma/client";

/**
 * The models that contain tenant-owned operational data.  The product calls
 * these Customers, Packages, Subscriptions, Routers, and Payments; their
 * Prisma model names are Subscriber, ServicePlan, Subscription, NetworkNode,
 * and Payment respectively. Session, VoucherBatch, Voucher, and VoucherUse
 * were added for RADIUS/voucher integration (Stage 7).
 */
export const TENANT_SCOPED_MODELS = new Set([
  "Subscriber",
  "ServicePlan",
  "Subscription",
  "NetworkNode",
  "Payment",
  "Session",
  "VoucherBatch",
  "Voucher",
  "VoucherUse",
  "Notification",
  "ResellerProfile",
  "Report",
  "ScheduledReport",
  "ReportDelivery",
  "AgentHeartbeat",
  "Invitation",
  "ResellerPayout",
  "AuditLog",
  "OrganizationFeatureFlag",
]);

type QueryArguments = Record<string, unknown>;
type TenantData = Record<string, unknown>;

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** Throws early rather than allowing an unscoped database call. */
export function requireOrganizationId(organizationId: string): string {
  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    throw new TenantIsolationError(
      "An organizationId is required for tenant-scoped database access."
    );
  }

  return organizationId;
}

/**
 * Adds an organization filter while preserving any caller-supplied filters.
 * `AND` is used deliberately so a caller cannot replace the tenant condition
 * with a different organization_id.
 */
export function organizationWhere<T extends QueryArguments>(
  organizationId: string,
  where?: T
): T {
  const tenantId = requireOrganizationId(organizationId);

  return {
    AND: [where ?? {}, { organization_id: tenantId }],
  } as unknown as T;
}

function tenantData(organizationId: string, data: unknown): unknown {
  const tenantId = requireOrganizationId(organizationId);

  if (Array.isArray(data)) {
    return data.map((item) => tenantData(tenantId, item));
  }

  if (!data || typeof data !== "object") {
    return data;
  }

  const record = data as TenantData;
  const suppliedOrganizationId = record.organization_id;
  if (
    suppliedOrganizationId !== undefined &&
    suppliedOrganizationId !== tenantId
  ) {
    throw new TenantIsolationError(
      "The supplied organization_id does not match the tenant database client."
    );
  }

  return { ...record, organization_id: tenantId };
}

function withTenantWhere(organizationId: string, args: QueryArguments): QueryArguments {
  return {
    ...args,
    where: organizationWhere(
      organizationId,
      args.where as QueryArguments | undefined
    ),
  };
}

/**
 * `findUnique`, `update`, `delete`, and `upsert` require a top-level unique
 * field in Prisma's WhereUniqueInput. Unlike normal filters, they therefore
 * cannot use an `AND` wrapper. A top-level organization_id is still combined
 * with the unique field by Prisma as an AND condition.
 */
function withTenantUniqueWhere(
  organizationId: string,
  args: QueryArguments
): QueryArguments {
  const tenantId = requireOrganizationId(organizationId);
  const where = (args.where ?? {}) as TenantData;
  const suppliedOrganizationId = where.organization_id;

  if (
    suppliedOrganizationId !== undefined &&
    suppliedOrganizationId !== tenantId
  ) {
    throw new TenantIsolationError(
      "The supplied organization_id does not match the tenant database client."
    );
  }

  return {
    ...args,
    where: { ...where, organization_id: tenantId },
  };
}

/**
 * Returns a Prisma client bound to exactly one organization.
 *
 * Use this at every request boundary and pass the authenticated organization
 * ID to it.  The returned client automatically scopes reads, aggregates,
 * updates, deletes, and upserts for tenant-owned models. Creates receive the
 * bound organization_id and reject an attempt to supply another tenant ID.
 *
 * ```ts
 * const db = createTenantClient(prisma, session.organizationId);
 * const customers = await db.subscriber.findMany();
 * // The query is always filtered by session.organizationId.
 * ```
 */
export function createTenantClient(prisma: PrismaClient, organizationId: string) {
  const tenantId = requireOrganizationId(organizationId);

  return prisma.$extends({
    name: "organization-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const queryArgs = (args ?? {}) as QueryArguments;

          switch (operation) {
            case "create":
              return query({
                ...queryArgs,
                data: tenantData(tenantId, queryArgs.data),
              } as never);

            case "createMany":
              return query({
                ...queryArgs,
                data: tenantData(tenantId, queryArgs.data),
              } as never);

            case "upsert":
              return query({
                ...withTenantUniqueWhere(tenantId, queryArgs),
                create: tenantData(tenantId, queryArgs.create),
                update: tenantData(tenantId, queryArgs.update),
              } as never);

            case "update":
              return query({
                ...withTenantUniqueWhere(tenantId, queryArgs),
                data: tenantData(tenantId, queryArgs.data),
              } as never);

            case "updateMany":
              return query({
                ...withTenantWhere(tenantId, queryArgs),
                data: tenantData(tenantId, queryArgs.data),
              } as never);

            case "findUnique":
            case "findUniqueOrThrow":
            case "delete":
              return query(withTenantUniqueWhere(tenantId, queryArgs) as never);

            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "deleteMany":
              return query(withTenantWhere(tenantId, queryArgs) as never);

            default:
              return query(args);
          }
        },
      },
    },
  });
}

/** Convenient aliases for application code that uses product terminology. */
export type TenantPrismaClient = ReturnType<typeof createTenantClient>;
export type TenantModelName =
  | "Customer"
  | "Package"
  | "Subscription"
  | "Router"
  | "Payment";

/**
 * Narrows a Prisma where input to the authenticated organization.  It is
 * useful for explicit repository helpers and remains exported for callers
 * that cannot use a Prisma client extension.
 */
export function tenantFilter<T extends QueryArguments>(
  organizationId: string,
  where?: T
): T {
  return organizationWhere(
    organizationId,
    where as QueryArguments | undefined
  ) as T;
}
