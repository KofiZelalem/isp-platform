import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireCurrentOrganization } from "@/lib/auth"
import {
  getActiveSessionsForOrganization,
  getSessionOperationalAlertsForOrganization,
  getSessionNodeFilterOptionsForOrganization,
  getRecentSessionsForOrganization,
} from "@/lib/api/sessions"
import Link from "next/link"

import { DisconnectSessionButton } from "./disconnect-session-button"

export const dynamic = "force-dynamic"

type SessionsPageSearchParams = {
  status?: string
  search?: string
  subscriberId?: string
  nodeId?: string
  startedFrom?: string
  startedTo?: string
  page?: string
  pageSize?: string
}

function formatDuration(startedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatSeconds(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SessionsPageSearchParams>
}) {
  const { organizationId } = await requireCurrentOrganization()
  const params = await searchParams

  const [sessions, recentSessions, nodeOptions, alerts] = await Promise.all([
    getActiveSessionsForOrganization(organizationId),
    getRecentSessionsForOrganization(organizationId, {
      status: params.status,
      search: params.search,
      subscriberId: params.subscriberId,
      nodeId: params.nodeId,
      startedFrom: params.startedFrom,
      startedTo: params.startedTo,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    }),
    getSessionNodeFilterOptionsForOrganization(organizationId),
    getSessionOperationalAlertsForOrganization(organizationId),
  ])

  const activeFilterBadges = [
    recentSessions.filters.status ? `Status: ${recentSessions.filters.status}` : null,
    recentSessions.filters.search ? `Search: ${recentSessions.filters.search}` : null,
    recentSessions.filters.subscriberId ? `Subscriber ID: ${recentSessions.filters.subscriberId}` : null,
    recentSessions.filters.nodeId
      ? `Router: ${nodeOptions.find((option) => option.id === recentSessions.filters.nodeId)?.name ?? recentSessions.filters.nodeId}`
      : null,
    recentSessions.filters.startedFrom ? `From: ${recentSessions.filters.startedFrom}` : null,
    recentSessions.filters.startedTo ? `To: ${recentSessions.filters.startedTo}` : null,
  ].filter((value): value is string => Boolean(value))

  const queryLink = (page: number) => {
    const query = new URLSearchParams()
    if (recentSessions.filters.status) query.set("status", recentSessions.filters.status)
    if (recentSessions.filters.search) query.set("search", recentSessions.filters.search)
    if (recentSessions.filters.subscriberId) query.set("subscriberId", recentSessions.filters.subscriberId)
    if (recentSessions.filters.nodeId) query.set("nodeId", recentSessions.filters.nodeId)
    if (recentSessions.filters.startedFrom) query.set("startedFrom", recentSessions.filters.startedFrom)
    if (recentSessions.filters.startedTo) query.set("startedTo", recentSessions.filters.startedTo)
    query.set("page", String(page))
    query.set("pageSize", String(recentSessions.pageSize))
    return `/admin/sessions?${query.toString()}`
  }

  const exportLink = () => {
    const query = new URLSearchParams()
    if (recentSessions.filters.status) query.set("status", recentSessions.filters.status)
    if (recentSessions.filters.search) query.set("search", recentSessions.filters.search)
    if (recentSessions.filters.subscriberId) query.set("subscriberId", recentSessions.filters.subscriberId)
    if (recentSessions.filters.nodeId) query.set("nodeId", recentSessions.filters.nodeId)
    if (recentSessions.filters.startedFrom) query.set("startedFrom", recentSessions.filters.startedFrom)
    if (recentSessions.filters.startedTo) query.set("startedTo", recentSessions.filters.startedTo)
    return `/admin/sessions/export?${query.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground">
          Monitor active subscriber sessions and disconnect them from the network.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Subscriber</TableHead>
              <TableHead>Router</TableHead>
              <TableHead>IP / MAC</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Data (up / down)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{session.subscriberName}</TableCell>
                <TableCell>{session.nodeName}</TableCell>
                <TableCell className="font-mono text-xs">
                  <div>{session.ipAddress ?? "—"}</div>
                  <div className="text-muted-foreground">{session.macAddress ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{formatDuration(session.startedAt)}</Badge>
                </TableCell>
                <TableCell>
                  {session.dataUpMb} MB / {session.dataDownMb} MB
                </TableCell>
                <TableCell className="text-right">
                  <DisconnectSessionButton sessionId={session.id} />
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No active sessions right now.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operational alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {alerts.map((alert) => (
                <div key={alert.key} className="rounded-md border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{alert.message}</span>
                    <Badge variant={alert.severity === "warning" ? "destructive" : "secondary"}>
                      {alert.count}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Recent accounting sessions</CardTitle>
            <Button variant="outline" render={<Link href={exportLink()} />}>Export CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="grid gap-3 rounded-md border border-border/50 p-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="search" className="text-xs text-muted-foreground">Subscriber search</label>
              <Input
                id="search"
                name="search"
                defaultValue={recentSessions.filters.search}
                placeholder="username, name, or email"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="subscriberId" className="text-xs text-muted-foreground">Subscriber ID</label>
              <Input
                id="subscriberId"
                name="subscriberId"
                defaultValue={recentSessions.filters.subscriberId}
                placeholder="exact subscriber id"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="status" className="text-xs text-muted-foreground">Status</label>
              <select
                id="status"
                name="status"
                defaultValue={recentSessions.filters.status ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="">All</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="TERMINATED">TERMINATED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="nodeId" className="text-xs text-muted-foreground">Router / NAS</label>
              <select
                id="nodeId"
                name="nodeId"
                defaultValue={recentSessions.filters.nodeId ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="">All routers</option>
                {nodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="startedFrom" className="text-xs text-muted-foreground">Started from</label>
              <Input id="startedFrom" name="startedFrom" type="date" defaultValue={recentSessions.filters.startedFrom} />
            </div>
            <div className="space-y-1">
              <label htmlFor="startedTo" className="text-xs text-muted-foreground">Started to</label>
              <Input id="startedTo" name="startedTo" type="date" defaultValue={recentSessions.filters.startedTo} />
            </div>
            <div className="space-y-1">
              <label htmlFor="pageSize" className="text-xs text-muted-foreground">Rows per page</label>
              <select
                id="pageSize"
                name="pageSize"
                defaultValue={String(recentSessions.pageSize)}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <input type="hidden" name="page" value="1" />
            <div className="flex items-end gap-2">
              <Button type="submit">Apply filters</Button>
              <Button variant="outline" render={<Link href="/admin/sessions" />}>Reset</Button>
            </div>
          </form>

          {activeFilterBadges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterBadges.map((value) => (
                <Badge key={value} variant="secondary">{value}</Badge>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Router</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Data (up / down)</TableHead>
                  <TableHead>Termination</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.items.map((session) => (
                  <TableRow key={session.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{session.subscriberName}</TableCell>
                    <TableCell>
                      <Badge variant={session.status === "ACTIVE" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{session.nodeName}</TableCell>
                    <TableCell>{new Date(session.startedAt).toLocaleString()}</TableCell>
                    <TableCell>{session.endedAt ? new Date(session.endedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>{formatSeconds(session.durationSec)}</TableCell>
                    <TableCell>
                      {session.dataUpMb} MB / {session.dataDownMb} MB
                    </TableCell>
                    <TableCell>{session.terminationCause ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {recentSessions.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No session accounting records yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{recentSessions.total} session{recentSessions.total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Link
                className="rounded-md border px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href={queryLink(Math.max(recentSessions.page - 1, 1))}
                aria-disabled={recentSessions.page <= 1}
              >
                Previous
              </Link>
              <span>Page {recentSessions.page} of {recentSessions.totalPages}</span>
              <Link
                className="rounded-md border px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href={queryLink(Math.min(recentSessions.page + 1, recentSessions.totalPages))}
                aria-disabled={recentSessions.page >= recentSessions.totalPages}
              >
                Next
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
