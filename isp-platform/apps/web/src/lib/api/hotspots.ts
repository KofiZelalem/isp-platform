import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type HotspotNode = {
  id: string;
  name: string;
  ipAddress: string;
  status: string;
  connectionStatus: string;
};

export type HotspotProfile = {
  planId: string;
  planName: string;
  mikrotikProfile: string | null;
  radiusGroup: string | null;
  isActive: boolean;
};

export type HotspotOverview = {
  nodes: HotspotNode[];
  profiles: HotspotProfile[];
  walledGarden: string[];
};

export type PortalNasConfig = {
  nodeId: string;
  loginUrl: string;
};

/** Returns only a tenant-owned, explicitly configured RouterOS hotspot endpoint. */
export async function getPortalNasConfig(
  organizationId: string,
  nodeId?: string | null
): Promise<PortalNasConfig | null> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const node = await tenantDb.networkNode.findFirst({
    where: {
      node_type: "MIKROTIK",
      hotspot_login_url: { not: null },
      ...(nodeId ? { id: nodeId } : {}),
    },
    select: { id: true, hotspot_login_url: true },
  });
  if (!node?.hotspot_login_url) return null;

  return { nodeId: node.id, loginUrl: node.hotspot_login_url };
}

function parseWalledGarden(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const value = (config as Record<string, unknown>).walledGarden;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Fetches MikroTik nodes, their service-plan hotspot profiles, and configured walled garden domains. */
export async function getHotspotOverview(organizationId: string): Promise<HotspotOverview> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const [nodes, plans, settings] = await Promise.all([
    tenantDb.networkNode.findMany({
      where: { node_type: "MIKROTIK" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ip_address: true, status: true, connection_status: true },
    }),
    tenantDb.servicePlan.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mikrotik_profile: true, radius_group: true, is_active: true },
    }),
    prisma.organizationSettings.findUnique({
      where: { organization_id: organizationId },
      select: { captive_portal_config: true },
    }),
  ]);

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      ipAddress: node.ip_address,
      status: node.status,
      connectionStatus: node.connection_status,
    })),
    profiles: plans.map((plan) => ({
      planId: plan.id,
      planName: plan.name,
      mikrotikProfile: plan.mikrotik_profile,
      radiusGroup: plan.radius_group,
      isActive: plan.is_active,
    })),
    walledGarden: parseWalledGarden(settings?.captive_portal_config),
  };
}
