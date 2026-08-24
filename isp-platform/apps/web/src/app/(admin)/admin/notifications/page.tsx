import { Bell, CircleAlert, CreditCard, Router } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { requireCurrentOrganization } from "@/lib/auth"
import { getNotificationsForOrganization } from "@/lib/api/notifications"
import { RetryButton } from "./retry-button"

export const dynamic = "force-dynamic"

function iconForType(type: string) {
  if (type === "PAYMENT_SUCCESS" || type === "PACKAGE_ACTIVATED") return CreditCard
  if (type === "ROUTER_DISCONNECTED" || type === "ROUTER_ERROR") return Router
  return Bell
}

function labelForType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export default async function NotificationsPage() {
  const { organizationId } = await requireCurrentOrganization()
  const notifications = await getNotificationsForOrganization(organizationId)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">Latest payment, router, and platform alerts.</p>
      </div>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        {notifications.map((notification) => {
          const Icon = iconForType(notification.type)
          return (
            <article key={notification.id} className="flex gap-4 p-4 hover:bg-muted/30">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{labelForType(notification.type)}</h2>
                  <Badge variant={notification.status === "FAILED" ? "destructive" : "secondary"}>
                    {notification.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                {notification.retryOfId ? (
                  <p className="mt-1 text-xs text-muted-foreground">Retry attempt {notification.retryCount} for an earlier notification</p>
                ) : notification.retryCount > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{notification.retryCount} retry attempt{notification.retryCount === 1 ? "" : "s"}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(notification.createdAt)} · {notification.channel.toLowerCase()}
                </p>
                {notification.status === "FAILED" && !notification.retryOfId && <RetryButton notificationId={notification.id} />}
              </div>
            </article>
          )
        })}
        {notifications.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <CircleAlert className="h-8 w-8" />
            <p>No notifications yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
