import "server-only";

import { PrismaClient } from "database";
import { assertProductionConfig } from "@/lib/production-config";

if (process.env.NEXT_PHASE !== "phase-production-build") assertProductionConfig();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Keep one Prisma client during local hot reloads. Tenant scoping is applied
 * separately at each request boundary with createTenantClient.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
