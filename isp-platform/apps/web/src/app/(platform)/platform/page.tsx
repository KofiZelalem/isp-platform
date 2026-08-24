import { Building2, CreditCard, Router, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPlatformOverview } from "@/lib/api/platform"
import { requireRole } from "@/lib/auth"

import { toggleOrganizationStatusAction } from "./actions"
import { getPlatformAuditLogs, getPlatformFeatureFlags, getPlatformHealth } from "@/lib/api/platform-administration"
import { FeatureFlagControl } from "./feature-flag-control"
import { HealthPanel } from "./health-panel"
import { AuditTable } from "./audit-table"
import { OrganizationForm } from "./organization-form"

export const dynamic = "force-dynamic"

function money(value: number): string {
  return value.toFixed(2)
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "ACTIVE") return "default"
  if (status === "SUSPENDED" || status === "TERMINATED") return "destructive"
  return "secondary"
}

export default async function PlatformDashboardPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string }> }) {
  await requireRole("PLATFORM_ADMIN")
  const params = await searchParams

  const [overview, health, flags, auditLogs] = await Promise.all([
    getPlatformOverview(),
    getPlatformHealth(),
    getPlatformFeatureFlags(),
    getPlatformAuditLogs({ action: params.action, entity: params.entity }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Platform administration</p>
        <h1 className="text-3xl font-bold tracking-tight">ISP-OS Control Plane</h1>
        <p className="text-muted-foreground">System-wide organization health and processed volume.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Active ISPs" value={overview.activeIsps.toLocaleString()} icon={Building2} />
        <MetricCard title="Total revenue" value={money(overview.totalRevenue)} detail="Raw sum across tenant currencies" icon={CreditCard} />
        <MetricCard title="Connected routers" value={overview.connectedRouters.toLocaleString()} icon={Router} />
      </div>

      <HealthPanel health={health} />

      <Card><CardHeader><CardTitle>Health checks</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{health.checks.map((check) => <div key={check.name} className="rounded-md border border-border/50 p-3"><div className="flex items-center justify-between"><span className="font-medium">{check.name}</span><Badge variant={check.status === "UP" ? "default" : check.status === "UNKNOWN" ? "secondary" : "destructive"}>{check.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{check.detail}</p></div>)}</CardContent></Card>

      <Card><CardHeader><CardTitle>Organization feature flags</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Organization</th><th className="p-3">Feature</th><th className="p-3">State</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{flags.map((flag) => <tr key={`${flag.organizationId}-${flag.key}`} className="border-t border-border/50"><td className="p-3">{flag.organizationName}</td><td className="p-3">{flag.key}</td><td className="p-3"><Badge variant={flag.enabled ? "default" : "secondary"}>{flag.enabled ? "Enabled" : "Disabled"}</Badge></td><td className="p-3 text-right"><FeatureFlagControl organizationId={flag.organizationId} keyName={flag.key} enabled={flag.enabled} /></td></tr>)}</tbody></table></div></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50 bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">Organization</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Subscribers</th>
                  <th className="p-3 font-medium">Routers</th>
                  <th className="p-3 font-medium">Processed volume</th>
                  <th className="p-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.organizations.map((organization) => {
                  const activate = toggleOrganizationStatusAction.bind(null, organization.id, "ACTIVE")
                  const suspend = toggleOrganizationStatusAction.bind(null, organization.id, "SUSPENDED")
                  return (
                    <tr key={organization.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-medium">{organization.name}</p>
                        <p className="text-xs text-muted-foreground">{organization.slug} · {organization.currency}</p>
                      </td>
                      <td className="p-3"><Badge variant={statusVariant(organization.status)}>{organization.status.toLowerCase()}</Badge></td>
                      <td className="p-3"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />{organization.subscriberCount}</span></td>
                      <td className="p-3">{organization.activeRouterCount}</td>
                      <td className="p-3">{money(organization.processedVolume)}</td>
                      <td className="p-3 text-right">
                        <OrganizationForm organization={{ id: organization.id, name: organization.name, planTier: "starter", timezone: "UTC" }} />
                        {organization.status === "ACTIVE" ? (
                          <form action={suspend}><Button type="submit" variant="destructive" size="sm">Suspend</Button></form>
                        ) : organization.status === "SUSPENDED" ? (
                          <form action={activate}><Button type="submit" size="sm">Activate</Button></form>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {overview.organizations.length === 0 && (
                  <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No organizations registered.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-md border border-border/50 p-4"><div><label htmlFor="action" className="text-xs text-muted-foreground">Action</label><input id="action" name="action" defaultValue={params.action} className="ml-2 h-9 rounded-md border border-input bg-background px-2 text-sm" placeholder="organization.status" /></div><div><label htmlFor="entity" className="text-xs text-muted-foreground">Entity</label><select id="entity" name="entity" defaultValue={params.entity ?? ""} className="ml-2 h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">All entities</option><option value="Organization">Organization</option><option value="OrganizationFeatureFlag">Feature flag</option></select></div><Button type="submit" size="sm">Filter audit</Button></form>
      <AuditTable entries={auditLogs} />
    </div>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string
  value: string
  detail?: string
  icon: typeof Building2
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  )
}
