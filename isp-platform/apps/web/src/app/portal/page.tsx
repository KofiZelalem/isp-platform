import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPublicServicePlans } from "@/lib/api/packages"
import { getPortalNasConfig } from "@/lib/api/hotspots"
import { resolvePublicOrganizationFromRequest } from "@/lib/organizations"
import {
  buildPortalNasHandoff,
  readPortalAuthState,
  resolvePortalRedirectDestination,
} from "@/lib/portal-security"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { PortalClient } from "./portal-client"

export const dynamic = "force-dynamic"

type PortalPageProps = {
  searchParams: Promise<{
    organization?: string
    destination?: string
    nasNode?: string
    "link-orig"?: string
    "link-login-only"?: string
    "chap-id"?: string
    "chap-challenge"?: string
    mac?: string
    ip?: string
  }>
}

export default async function PortalPage({ searchParams }: PortalPageProps) {
  const params = await searchParams
  const organization = await resolvePublicOrganizationFromRequest(params.organization)

  if (!organization) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Portal unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>This portal URL is not mapped to an active organization.</p>
            <p>Use the organization&apos;s custom domain or add <code>?organization=your-slug</code> while developing locally.</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const authToken = (await cookies()).get("isp_portal_auth")?.value;
  const portalAuth = readPortalAuthState(authToken, organization.id);
  if (portalAuth) {
    redirect(resolvePortalRedirectDestination(portalAuth.destination));
  }

  const plans = await getPublicServicePlans(organization.id)
  const nas = await getPortalNasConfig(organization.id, params.nasNode)
  const handoff = buildPortalNasHandoff({
    destination: params.destination,
    linkOrig: params["link-orig"],
    linkLoginOnly: params["link-login-only"],
    chapId: params["chap-id"],
    chapChallenge: params["chap-challenge"],
    mac: params.mac,
    ip: params.ip,
  })

  return (
    <PortalClient
      organizationName={organization.name}
      organizationSlug={organization.slug}
      handoff={handoff}
      nasLoginUrl={nas?.loginUrl ?? null}
      plans={plans}
    />
  )
}
