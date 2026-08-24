import { Badge } from "@/components/ui/badge"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireCurrentOrganization } from "@/lib/auth"
import { getHotspotOverview } from "@/lib/api/hotspots"

export const dynamic = "force-dynamic"

function nodeStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "ONLINE") return "default"
  if (status === "DEGRADED") return "destructive"
  return "secondary"
}

export default async function HotspotsPage() {
  const { organizationId } = await requireCurrentOrganization()
  const overview = await getHotspotOverview(organizationId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hotspots</h1>
        <p className="text-muted-foreground">
          Manage MikroTik hotspot profiles and walled garden access for your network.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hotspot profiles</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.profiles.map((profile) => (
              <div
                key={profile.planId}
                className="flex items-center justify-between rounded-md border border-border/50 p-3"
              >
                <div>
                  <p className="font-medium">{profile.planName}</p>
                  <p className="text-xs text-muted-foreground">
                    Profile: {profile.mikrotikProfile ?? "Not set"} · RADIUS group: {profile.radiusGroup ?? "Not set"}
                  </p>
                </div>
                <Badge variant={profile.isActive ? "default" : "secondary"}>
                  {profile.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
            {overview.profiles.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active packages define a hotspot profile yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MikroTik routers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between rounded-md border border-border/50 p-3"
              >
                <div>
                  <p className="font-medium">{node.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{node.ipAddress}</p>
                </div>
                <Badge variant={nodeStatusVariant(node.status)}>{node.status.toLowerCase()}</Badge>
              </div>
            ))}
            {overview.nodes.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No MikroTik routers registered yet. Add one from the Routers page.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Walled garden</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.walledGarden.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {overview.walledGarden.map((domain) => (
                <li key={domain}>
                  <Badge variant="outline">{domain}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No walled garden domains configured yet. Add the payment or help domains customers need before login in {" "}
              <Link href="/admin/settings" className="text-primary underline underline-offset-4">Settings</Link>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
