import { createTenantClient } from "database"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { prisma } from "@/lib/db"
import { readPortalAuthState } from "@/lib/portal-security"

export const dynamic = "force-dynamic"

type SessionEvidence = {
  startedAt: string
  ipAddress: string | null
  nodeName: string
  dataUpMb: number
  dataDownMb: number
} | null

type SubscriptionEvidence = {
  planName: string
  expiresAt: string | null
} | null

async function getSubscriptionEvidence(organizationId: string, subscriptionId: string): Promise<SubscriptionEvidence> {
  const tenantDb = createTenantClient(prisma, organizationId)
  const subscription = await tenantDb.subscription.findUnique({
    where: { id: subscriptionId },
    select: { expires_at: true, plan: { select: { name: true } } },
  })
  if (!subscription) return null
  return { planName: subscription.plan.name, expiresAt: subscription.expires_at?.toISOString() ?? null }
}

async function getSessionEvidence(organizationId: string, subscriberId: string): Promise<SessionEvidence> {
  const tenantDb = createTenantClient(prisma, organizationId)
  const session = await tenantDb.session.findFirst({
    where: { subscriber_id: subscriberId, status: "ACTIVE" },
    orderBy: { started_at: "desc" },
    select: {
      started_at: true,
      ip_address: true,
      data_up_mb: true,
      data_down_mb: true,
      node: { select: { name: true } },
    },
  })

  if (!session) return null
  return {
    startedAt: session.started_at.toISOString(),
    ipAddress: session.ip_address,
    nodeName: session.node.name,
    dataUpMb: session.data_up_mb,
    dataDownMb: session.data_down_mb,
  }
}

export default async function PortalConnectedPage() {
  const authToken = (await cookies()).get("isp_portal_auth")?.value
  const authState = readPortalAuthState(authToken)
  if (!authState) redirect("/portal")

  const organization = await prisma.organization.findUnique({
    where: { id: authState.organizationId },
    select: { id: true, slug: true, name: true, status: true },
  })
  if (!organization || organization.status !== "ACTIVE") redirect("/portal")

  const [session, subscription] = await Promise.all([
    getSessionEvidence(organization.id, authState.subscriberId),
    getSubscriptionEvidence(organization.id, authState.subscriptionId),
  ])

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Connected to {organization.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {session ? (
            <>
              <p className="text-foreground">Your hotspot session is active and reported by RADIUS accounting.</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Node</dt>
                  <dd>{session.nodeName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IP Address</dt>
                  <dd>{session.ipAddress ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd>{new Date(session.startedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Usage</dt>
                  <dd>{session.dataUpMb + session.dataDownMb} MB</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="text-foreground">Payment confirmed{subscription ? ` and ${subscription.planName} is active` : " and your package is active"}.</p>
              {subscription?.expiresAt ? <p className="text-muted-foreground">Your access is valid until {new Date(subscription.expiresAt).toLocaleString()}.</p> : null}
              <p className="text-muted-foreground">
                Connect through the MikroTik hotspot. Refresh this page in a few seconds after connecting to see RADIUS session evidence.
              </p>
            </>
          )}
          <a
            href={`/portal?organization=${encodeURIComponent(organization.slug)}`}
            className="inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Return to portal
          </a>
        </CardContent>
      </Card>
    </main>
  )
}
