import { activateSubscription, assignPlanToSubscriber, expireSubscriptions } from "billing"
import { createTenantClient } from "database"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { EditCustomerSheet } from "../customer-form"
import { deleteCustomerAction } from "../actions"
import { SubscriberNetworkControls } from "../subscriber-network-controls"
import { RatePolicyControl } from "../rate-policy-control"

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>
}

function formatDataUsage(megabytes: number): string {
  if (megabytes < 1024) return `${megabytes} MB`

  return `${(megabytes / 1024).toFixed(2)} GB`
}

function formatDate(date: Date | null): string {
  if (!date) return "No expiry date"

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date)
}

async function assignPlanToCustomer(subscriberId: string, formData: FormData): Promise<void> {
  "use server"

  const planId = String(formData.get("planId") ?? "")
  if (!planId) return

  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)
  const subscription = await assignPlanToSubscriber(tenantDb, { subscriberId, planId })
  await activateSubscription(tenantDb, subscription.id)

  revalidatePath(`/admin/customers/${subscriberId}`)
  revalidatePath("/admin/customers")
}

async function deleteCustomer(subscriberId: string): Promise<void> {
  "use server"

  const formData = new FormData()
  formData.set("customerId", subscriberId)
  await deleteCustomerAction(null, formData)
}

export const dynamic = "force-dynamic"

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)
  await expireSubscriptions(tenantDb)
  const subscriber = await tenantDb.subscriber.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      full_name: true,
      email: true,
      phone: true,
      address: true,
      notes: true,
      status: true,
      created_at: true,
      updated_at: true,
      subscriptions: {
        orderBy: { started_at: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          started_at: true,
          data_used_mb: true,
          expires_at: true,
          plan: { select: { name: true, price: true } },
        },
      },
      payments: {
        orderBy: { created_at: "desc" },
        take: 10,
        select: { id: true, amount: true, currency: true, status: true, provider: true, provider_ref: true, paid_at: true, created_at: true, subscription: { select: { status: true, plan: { select: { name: true } } } } },
      },
      sessions: {
        orderBy: { started_at: "desc" },
        take: 10,
        select: { id: true, ip_address: true, mac_address: true, status: true, started_at: true, ended_at: true, data_up_mb: true, data_down_mb: true, duration_sec: true },
      },
    },
  })

  if (!subscriber) notFound()

  const availablePlans = await tenantDb.servicePlan.findMany({
    where: { is_active: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, price: true },
  })

  const currentSubscription = subscriber.subscriptions.find((subscription) => subscription.status === "ACTIVE")
    ?? subscriber.subscriptions.find((subscription) => subscription.status === "PENDING")
  const assignPlan = assignPlanToCustomer.bind(null, subscriber.id)
  const removeCustomer = deleteCustomer.bind(null, subscriber.id)
  const usage = subscriber.sessions.reduce(
    (total, session) => total + session.data_up_mb + session.data_down_mb,
    0
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Customer profile</p>
        <h1 className="text-3xl font-bold tracking-tight">{subscriber.full_name}</h1>
        <p className="text-muted-foreground">{subscriber.username}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <EditCustomerSheet customer={{ id: subscriber.id, username: subscriber.username, fullName: subscriber.full_name, email: subscriber.email ?? "", phone: subscriber.phone ?? "", address: subscriber.address ?? "", notes: subscriber.notes ?? "", status: subscriber.status }} />
          <form action={removeCustomer}>
            <Button type="submit" variant="destructive">Delete customer</Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={subscriber.status === "ACTIVE" ? "default" : "destructive"}>
              {subscriber.status.charAt(0) + subscriber.status.slice(1).toLowerCase()}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active package</p>
            <p className="font-medium">{currentSubscription?.plan.name ?? "No active package"}</p>
            {currentSubscription && <p className="text-xs text-muted-foreground">{currentSubscription.status}</p>}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data used</p>
            <p className="font-medium">
              {currentSubscription ? formatDataUsage(currentSubscription.data_used_mb) : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expiry date</p>
            <p className="font-medium">{formatDate(currentSubscription?.expires_at ?? null)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{subscriber.phone ?? "Not provided"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{subscriber.email ?? "Not provided"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="font-medium">{formatDate(subscriber.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Updated</p>
            <p className="font-medium">{formatDate(subscriber.updated_at)}</p>
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <SubscriberNetworkControls subscriberId={subscriber.id} suspended={subscriber.status === "SUSPENDED"} />
          <RatePolicyControl subscriberId={subscriber.id} />
        </CardFooter>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{formatDataUsage(usage)}</p><p className="text-sm text-muted-foreground">Recorded upload and download usage across the latest sessions.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent payments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {subscriber.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : subscriber.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0"><div><p className="font-medium">{payment.currency} {payment.amount.toString()}</p><p className="text-xs text-muted-foreground">{payment.provider} · {payment.paid_at ? formatDate(payment.paid_at) : "Unpaid"} · {payment.subscription?.plan.name ?? "No subscription"}</p><p className="font-mono text-xs text-muted-foreground">{payment.provider_ref ?? "Awaiting provider reference"}</p></div><Badge variant={payment.status === "SUCCESS" ? "default" : payment.status === "FAILED" ? "destructive" : "secondary"}>{payment.status}</Badge></div>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent sessions</CardTitle></CardHeader>
        <CardContent>
          {subscriber.sessions.length === 0 ? <p className="text-sm text-muted-foreground">No sessions recorded.</p> : <div className="space-y-3">{subscriber.sessions.map((session) => <div key={session.id} className="grid gap-1 border-b pb-3 text-sm last:border-0 sm:grid-cols-4"><span className="font-medium">{session.status}</span><span>{session.ip_address ?? "No IP"}</span><span>{session.mac_address ?? "No device address"}</span><span className="text-muted-foreground">{formatDate(session.started_at)}</span></div>)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Subscription history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {subscriber.subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions recorded.</p> : subscriber.subscriptions.map((subscription) => <div key={subscription.id} className="grid gap-1 border-b pb-3 text-sm last:border-0 sm:grid-cols-4"><span className="font-medium">{subscription.plan.name}</span><span>{subscription.status}</span><span>{formatDate(subscription.started_at)}</span><span className="text-muted-foreground">{formatDate(subscription.expires_at)}</span></div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign a package</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={assignPlan} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="planId" className="text-sm font-medium">
                Package
              </label>
              <select
                id="planId"
                name="planId"
                required
                defaultValue=""
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="" disabled>
                  Select a package
                </option>
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.price.toString()}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={availablePlans.length === 0}>
              Assign package
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
