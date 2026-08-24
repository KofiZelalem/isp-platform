import { createTenantClient } from "database"

import { Badge } from "@/components/ui/badge"
import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getAgentHealthForOrganization } from "@/lib/api/agent-heartbeats"

import { CreateRouterSheet } from "./create-router-sheet"
import { CheckConnectionButton } from "./check-connection-button"

export const dynamic = "force-dynamic"

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "CONNECTED") return "default"
  if (status === "ERROR") return "destructive"
  return "secondary"
}

export default async function RoutersPage() {
  const { organizationId } = await requireCurrentOrganization()
  const [routers, agentHealth] = await Promise.all([
    getRouters(organizationId),
    getAgentHealthForOrganization(organizationId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Routers</h1>
          <p className="text-muted-foreground">
            Manage MikroTik routers and their secure WireGuard tunnels.
          </p>
        </div>
        <div className="w-full sm:w-auto"><CreateRouterSheet /></div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b border-border/50 text-left">
                <th className="p-3 font-medium">Router</th>
                <th className="p-3 font-medium">Connection</th>
                <th className="p-3 font-medium">VPN IP</th>
                <th className="p-3 font-medium">Public endpoint</th>
                <th className="p-3 font-medium">Agent health</th>
                <th className="p-3 font-medium">WireGuard setup</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => (
                <tr key={router.id} className="border-b border-border/50 align-top last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-semibold">{router.name}</div>
                    <div className="text-xs text-muted-foreground">{router.location ?? "No location"}</div>
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant(router.connectionStatus)}>
                      {router.connectionStatus.toLowerCase()}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{router.nodeStatus.toLowerCase()}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{router.vpnIpAddress ?? "Not assigned"}</td>
                  <td className="p-3 font-mono text-xs">{router.ipAddress}:{router.port}</td>
                  <td className="p-3">
                    {(() => {
                      const health = agentHealth.find((item) => item.nodeId === router.id)
                      return health ? <>
                        <Badge variant={health.availability === "HEALTHY" ? "default" : health.availability === "DEGRADED" ? "secondary" : "destructive"}>
                          {health.availability.toLowerCase()}
                        </Badge>
                        <div className="mt-1 text-xs text-muted-foreground">Tunnel: {health.tunnelState.toLowerCase()}</div>
                        <div className="text-xs text-muted-foreground">{health.heartbeatAgeSec === null ? "No heartbeat" : `${health.heartbeatAgeSec}s ago`}</div>
                        {health.lastError && <div className="mt-1 max-w-48 text-xs text-destructive">{health.lastError}</div>}
                      </> : <Badge variant="destructive">offline</Badge>
                    })()}
                  </td>
                  <td className="p-3">
                    <span className="text-sm text-muted-foreground">
                      WireGuard configuration available through the secured provisioning service
                    </span>
                    <CheckConnectionButton nodeId={router.id} />
                  </td>
                </tr>
              ))}
              {routers.length === 0 && (
                <tr>
                  <td colSpan={6} className="h-24 p-3 text-center text-muted-foreground">
                    No routers registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function getRouters(organizationId: string) {
  const tenantDb = createTenantClient(prisma, organizationId)
  const routers = await tenantDb.networkNode.findMany({
    where: { node_type: "MIKROTIK" },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      name: true,
      ip_address: true,
      port: true,
      location: true,
      status: true,
      connection_status: true,
      vpn_ip_address: true,
    },
  })
  return routers.map((router) => ({
    id: router.id,
    name: router.name,
    ipAddress: router.ip_address,
    port: router.port,
    location: router.location,
    nodeStatus: router.status,
    connectionStatus: router.connection_status,
    vpnIpAddress: router.vpn_ip_address,
  }))
}
