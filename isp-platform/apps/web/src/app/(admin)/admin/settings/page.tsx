import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getOrganizationSettingsData } from "@/lib/api/settings"
import { requireCurrentOrganization } from "@/lib/auth"

import { SettingsForm } from "./settings-form"
import { TestNotificationControls } from "./test-notification-controls"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const { organizationId } = await requireCurrentOrganization()
  const settings = await getOrganizationSettingsData(organizationId)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Organization branding, default currency, timezone, and payment gateway configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent>
          {settings ? (
            <SettingsForm settings={settings} />
          ) : (
            <p className="text-sm text-muted-foreground">
                Organization settings are unavailable right now.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notification delivery tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Send an email test to the administrator email, or enter a Ghana phone number for an SMS test.</p>
          <TestNotificationControls />
        </CardContent>
      </Card>
    </div>
  )
}
