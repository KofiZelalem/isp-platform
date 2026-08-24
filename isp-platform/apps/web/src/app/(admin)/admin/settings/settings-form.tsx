"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { updateOrganizationSettingsAction, type UpdateSettingsState } from "./actions"
import type { OrganizationSettingsData } from "@/lib/api/settings"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save settings"}
    </Button>
  )
}

export function SettingsForm({ settings }: { settings: OrganizationSettingsData }) {
  const [state, formAction] = useActionState<UpdateSettingsState, FormData>(
    updateOrganizationSettingsAction,
    null
  )
  const walledGarden = settings.captivePortalConfig?.walledGarden
  const walledGardenValue = Array.isArray(walledGarden)
    ? walledGarden.filter((domain): domain is string => typeof domain === "string").join("\n")
    : ""

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" name="name" defaultValue={settings.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customDomain">Custom domain</Label>
          <Input id="customDomain" name="customDomain" defaultValue={settings.customDomain ?? ""} placeholder="isp.example.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Default currency</Label>
          <Input id="currency" name="currency" defaultValue={settings.currency} maxLength={3} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={settings.timezone} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryColor">Primary color</Label>
          <Input id="primaryColor" name="primaryColor" defaultValue={settings.primaryColor ?? ""} placeholder="#0ea5e9" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="secondaryColor">Secondary color</Label>
          <Input id="secondaryColor" name="secondaryColor" defaultValue={settings.secondaryColor ?? ""} placeholder="#1e293b" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentProvider">Payment gateway</Label>
          <Input id="paymentProvider" name="paymentProvider" defaultValue={settings.paymentProvider ?? ""} placeholder="paystack" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smsGatewayProvider">SMS gateway</Label>
          <Input id="smsGatewayProvider" name="smsGatewayProvider" defaultValue={settings.smsGatewayProvider ?? ""} placeholder="arkesel" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationEmailProvider">Notification email provider</Label>
          <Input id="notificationEmailProvider" name="notificationEmailProvider" defaultValue={settings.notificationEmailProvider ?? ""} placeholder="resend" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationEmailFrom">Notification sender address</Label>
          <Input id="notificationEmailFrom" name="notificationEmailFrom" type="email" defaultValue={settings.notificationEmailFrom ?? ""} placeholder="alerts@example.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationEmailApiKey">Notification email API key</Label>
          <Input id="notificationEmailApiKey" name="notificationEmailApiKey" type="password" placeholder={settings.notificationEmailConfigured ? "Configured; leave blank to keep" : "Provider API key"} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationSmsProvider">Notification SMS provider</Label>
          <Input id="notificationSmsProvider" name="notificationSmsProvider" defaultValue={settings.notificationSmsProvider ?? ""} placeholder="arkesel" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationSmsSender">Notification SMS sender</Label>
          <Input id="notificationSmsSender" name="notificationSmsSender" defaultValue={settings.notificationSmsSender ?? ""} placeholder="ISP-OS" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notificationSmsApiKey">Notification SMS API key</Label>
          <Input id="notificationSmsApiKey" name="notificationSmsApiKey" type="password" placeholder={settings.notificationSmsConfigured ? "Configured; leave blank to keep" : "Provider API key"} autoComplete="new-password" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="walledGarden">Walled garden domains</Label>
        <textarea
          id="walledGarden"
          name="walledGarden"
          defaultValue={walledGardenValue}
          placeholder={"paystack.com\napi.paystack.co"}
          className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">One domain per line. These sites stay reachable before a hotspot user signs in.</p>
      </div>

      {state && "error" in state && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Settings saved.
        </p>
      )}

      <div>
        <SubmitButton />
      </div>
    </form>
  )
}
