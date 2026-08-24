"use client"

import { useState, useActionState, useEffect, useRef } from "react"
import { useFormStatus } from "react-dom"
import { Wifi, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PortalServicePlan } from "@/lib/api/packages"

import {
  redeemVoucherAction,
  initializePaymentAction,
  portalLoginAction,
  type RedeemVoucherState,
  type InitializePaymentState,
  type PortalLoginState,
} from "./actions"

function formatExpiry(iso: string | null): string {
  if (!iso) return "no expiry"
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  )
}

function formatDataLimit(mb: number | null): string {
  if (mb === null) return "Unlimited"
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`
  return `${mb} MB`
}

function VoucherSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Activating..." : "Connect"}
    </Button>
  )
}

function PaySubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Redirecting to payment..." : "Pay Now"}
    </Button>
  )
}

type PortalHandoffFields = {
  destination: string
  linkOrig: string | null
  linkLoginOnly: string | null
  chapId: string | null
  chapChallenge: string | null
  mac: string | null
  ip: string | null
}

function NasHandoffHiddenFields({ handoff }: { handoff: PortalHandoffFields }) {
  return (
    <>
      <input type="hidden" name="dst" value={handoff.destination} />
      {handoff.linkOrig ? <input type="hidden" name="link-orig" value={handoff.linkOrig} /> : null}
      {handoff.linkLoginOnly ? <input type="hidden" name="link-login-only" value={handoff.linkLoginOnly} /> : null}
      {handoff.chapId ? <input type="hidden" name="chap-id" value={handoff.chapId} /> : null}
      {handoff.chapChallenge ? <input type="hidden" name="chap-challenge" value={handoff.chapChallenge} /> : null}
      {handoff.mac ? <input type="hidden" name="mac" value={handoff.mac} /> : null}
      {handoff.ip ? <input type="hidden" name="ip" value={handoff.ip} /> : null}
    </>
  )
}

function VoucherTab({
  organizationSlug,
  handoff,
  nasLoginUrl,
}: {
  organizationSlug: string
  handoff: PortalHandoffFields
  nasLoginUrl: string | null
}) {
  const [state, formAction] = useActionState<RedeemVoucherState, FormData>(
    redeemVoucherAction,
    null
  )
  const connected = state && "success" in state
  const handoffFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (connected && nasLoginUrl) handoffFormRef.current?.requestSubmit()
  }, [connected, nasLoginUrl])

  if (connected) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="font-semibold">{nasLoginUrl ? "Connecting to hotspot..." : "Authorization accepted"}</p>
          <p className="text-sm text-muted-foreground">
            Plan: {state.planName}
            <br />
            Active until {formatExpiry(state.expiresAt)}
          </p>
        </div>
        {nasLoginUrl && (
          <form ref={handoffFormRef} action={nasLoginUrl} method="post" className="hidden">
            <input type="hidden" name="username" value={state.accessUsername} />
            <input type="hidden" name="password" value={state.accessPassword} />
            <NasHandoffHiddenFields handoff={handoff} />
          </form>
        )}
      </>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="destination" value={handoff.destination} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Voucher code</Label>
        <Input
          id="code"
          name="code"
          placeholder="e.g. NEXA-7K3P9QRT2M"
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
      </div>
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <VoucherSubmitButton />
    </form>
  )
}

function LoginTab({
  organizationSlug,
  handoff,
  nasLoginUrl,
}: {
  organizationSlug: string
  handoff: PortalHandoffFields
  nasLoginUrl: string | null
}) {
  const [state, formAction] = useActionState<PortalLoginState, FormData>(portalLoginAction, null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const handoffFormRef = useRef<HTMLFormElement>(null)
  const connected = state && "success" in state

  useEffect(() => {
    if (connected && nasLoginUrl) handoffFormRef.current?.requestSubmit()
  }, [connected, nasLoginUrl])

  if (connected) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="font-semibold">{nasLoginUrl ? "Connecting to hotspot..." : "Authorization accepted"}</p>
          <p className="text-sm text-muted-foreground">
            Plan: {state.planName}
            <br />
            Session limit: {Math.ceil(state.sessionTimeoutSec / 60)} minutes
          </p>
        </div>
        {nasLoginUrl && (
          <form ref={handoffFormRef} action={nasLoginUrl} method="post" className="hidden">
            <input type="hidden" name="username" value={username} />
            <input type="hidden" name="password" value={password} />
            <NasHandoffHiddenFields handoff={handoff} />
          </form>
        )}
      </>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="destination" value={handoff.destination} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      {state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full">Connect</Button>
    </form>
  )
}

function BuyPlanTab({
  organizationSlug,
  destination,
  plans,
}: {
  organizationSlug: string
  destination: string
  plans: PortalServicePlan[]
}) {
  const [state, formAction] = useActionState<InitializePaymentState, FormData>(
    initializePaymentAction,
    null
  )

  if (plans.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No plans are available for purchase right now.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="destination" value={destination} />
      <div className="flex flex-col gap-2">
        {plans.map((plan) => (
          <label
            key={plan.id}
            className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors"
          >
            <input
              type="radio"
              name="planId"
              value={plan.id}
              className="mt-0.5 accent-primary"
              required
            />
            <div className="flex flex-1 items-baseline justify-between gap-2">
              <div>
                <span className="font-medium text-sm">{plan.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDataLimit(plan.dataLimitMb)} · {plan.validityDays}d
                </span>
              </div>
              <span className="font-semibold text-sm shrink-0">GHS {plan.price}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Mobile money / receipt phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="024 123 4567"
          autoComplete="tel"
          inputMode="tel"
          required
        />
        <p className="text-xs text-muted-foreground">
          We use this number for your payment receipt and connection updates.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address <span className="text-muted-foreground">(optional)</span></Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />
        <p className="text-xs text-muted-foreground">
          Add an email only if you also want a copy of the receipt there.
        </p>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <PaySubmitButton />
    </form>
  )
}

type Tab = "pay" | "voucher" | "login"

export function PortalClient({
  organizationName,
  organizationSlug,
  handoff,
  nasLoginUrl,
  plans,
}: {
  organizationName: string
  organizationSlug: string
  handoff: PortalHandoffFields
  nasLoginUrl: string | null
  plans: PortalServicePlan[]
}) {
  const [tab, setTab] = useState<Tab>("pay")

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
            <Wifi className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">Welcome to {organizationName}</CardTitle>
          <p className="text-sm text-muted-foreground">Get online in seconds.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Tab toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
            <button
              type="button"
              onClick={() => setTab("pay")}
              className={`flex-1 py-1.5 transition-colors ${
                tab === "pay"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Buy a plan
            </button>
            <button
              type="button"
              onClick={() => setTab("voucher")}
              className={`flex-1 py-1.5 transition-colors ${
                tab === "voucher"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Enter voucher
            </button>
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`flex-1 py-1.5 transition-colors ${
                tab === "login"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              Login
            </button>
          </div>

          {tab === "pay" ? (
            <BuyPlanTab organizationSlug={organizationSlug} destination={handoff.destination} plans={plans} />
          ) : tab === "voucher" ? (
            <VoucherTab organizationSlug={organizationSlug} handoff={handoff} nasLoginUrl={nasLoginUrl} />
          ) : (
            <LoginTab organizationSlug={organizationSlug} handoff={handoff} nasLoginUrl={nasLoginUrl} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
