import "server-only";

import { prisma } from "@/lib/db";

export const PLATFORM_FEATURE_FLAGS = ["CAPTIVE_PORTAL", "REMOTE_ROUTER_MANAGEMENT", "SCHEDULED_REPORTS"] as const;
export type PlatformFeatureFlag = (typeof PLATFORM_FEATURE_FLAGS)[number];

export type PlatformFeatureFlagItem = {
  organizationId: string;
  organizationName: string;
  key: PlatformFeatureFlag;
  enabled: boolean;
};

export type PlatformHealth = {
  database: "UP" | "DOWN";
  configured: { supabase: boolean; database: boolean; workerSecret: boolean };
  agents: { healthy: number; degraded: number; offline: number };
  checks: Array<{ name: string; status: "UP" | "DOWN" | "UNKNOWN"; detail: string }>;
  checkedAt: string;
};

export async function getPlatformFeatureFlags(): Promise<PlatformFeatureFlagItem[]> {
  const organizations = await prisma.organization.findMany({
    where: { deleted_at: null, NOT: { slug: "isp-os-platform" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, feature_flags: { where: { key: { in: [...PLATFORM_FEATURE_FLAGS] } }, select: { key: true, enabled: true } } },
  });
  return organizations.flatMap((organization) => PLATFORM_FEATURE_FLAGS.map((key) => ({
    organizationId: organization.id,
    organizationName: organization.name,
    key,
    enabled: organization.feature_flags.find((flag) => flag.key === key)?.enabled ?? false,
  })));
}

export async function setPlatformFeatureFlag(input: { actorId: string; organizationId: string; key: string; enabled: boolean }): Promise<void> {
  if (!PLATFORM_FEATURE_FLAGS.includes(input.key as PlatformFeatureFlag)) throw new Error("Unknown feature flag.");
  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
  if (actor?.role !== "PLATFORM_ADMIN") throw new Error("Only platform administrators can change feature flags.");
  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, slug: true } });
  if (!organization || organization.slug === "isp-os-platform") throw new Error("Organization not found.");
  await prisma.$transaction([
    prisma.organizationFeatureFlag.upsert({ where: { organization_id_key: { organization_id: input.organizationId, key: input.key } }, create: { organization_id: input.organizationId, key: input.key, enabled: input.enabled, updated_by: input.actorId }, update: { enabled: input.enabled, updated_by: input.actorId } }),
    prisma.platformAuditLog.create({ data: { action: "organization.feature_flag_changed", entity: "OrganizationFeatureFlag", entity_id: input.organizationId, actor_id: input.actorId, details: { key: input.key, enabled: input.enabled } } }),
  ]);
}

export async function updatePlatformOrganization(input: { actorId: string; organizationId: string; name: string; planTier: string; timezone: string }): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
  if (actor?.role !== "PLATFORM_ADMIN") throw new Error("Only platform administrators can edit organizations.");
  if (!input.name.trim() || input.name.length > 120) throw new Error("Organization name is invalid.");
  if (!input.planTier.trim() || input.planTier.length > 40) throw new Error("Plan tier is invalid.");
  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, slug: true, name: true, plan_tier: true, timezone: true } });
  if (!organization || organization.slug === "isp-os-platform") throw new Error("Organization not found.");
  await prisma.$transaction([
    prisma.organization.update({ where: { id: organization.id }, data: { name: input.name.trim(), plan_tier: input.planTier.trim(), timezone: input.timezone.trim() || "UTC" } }),
    prisma.platformAuditLog.create({ data: { action: "organization.details_changed", entity: "Organization", entity_id: organization.id, actor_id: input.actorId, details: { previous: { name: organization.name, plan_tier: organization.plan_tier, timezone: organization.timezone }, next: { name: input.name.trim(), plan_tier: input.planTier.trim(), timezone: input.timezone.trim() || "UTC" } } } }),
  ]);
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  let database: PlatformHealth["database"] = "UP";
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = "DOWN"; }
  const heartbeats = await prisma.agentHeartbeat.findMany({ select: { last_heartbeat_at: true } });
  const now = Date.now();
  const healthy = heartbeats.filter((heartbeat) => now - heartbeat.last_heartbeat_at.getTime() < 90_000).length;
  const degraded = heartbeats.filter((heartbeat) => { const age = now - heartbeat.last_heartbeat_at.getTime(); return age >= 90_000 && age < 300_000; }).length;
  return { database, configured: { supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), database: Boolean(process.env.DATABASE_URL), workerSecret: Boolean(process.env.ISP_OS_WORKER_SECRET) }, agents: { healthy, degraded, offline: Math.max(0, heartbeats.length - healthy - degraded) }, checks: [
    { name: "Database query", status: database, detail: database === "UP" ? "SELECT 1 succeeded." : "Database query failed." },
    { name: "Supabase configuration", status: process.env.NEXT_PUBLIC_SUPABASE_URL ? "UP" : "DOWN", detail: process.env.NEXT_PUBLIC_SUPABASE_URL ? "Supabase URL is configured." : "Supabase URL is missing." },
    { name: "Worker authentication", status: process.env.ISP_OS_WORKER_SECRET ? "UP" : "DOWN", detail: process.env.ISP_OS_WORKER_SECRET ? "Worker secret is configured." : "Worker secret is missing." },
    { name: "Agent heartbeats", status: heartbeats.length === 0 ? "UNKNOWN" : heartbeats.length === healthy ? "UP" : "DOWN", detail: `${healthy} healthy, ${degraded} degraded, ${Math.max(0, heartbeats.length - healthy - degraded)} offline.` },
  ], checkedAt: new Date().toISOString() };
}

export async function getPlatformAuditLogs(input: { limit?: number; action?: string; entity?: string } = {}) {
  return prisma.platformAuditLog.findMany({ where: { ...(input.action ? { action: { contains: input.action, mode: "insensitive" as const } } : {}), ...(input.entity ? { entity: input.entity } : {}) }, orderBy: { created_at: "desc" }, take: Math.max(1, Math.min(input.limit ?? 100, 200)), select: { id: true, action: true, entity: true, entity_id: true, actor_id: true, details: true, created_at: true } });
}
