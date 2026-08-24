import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { requireCurrentOrganization } from "@/lib/auth"
import { getUsageForOrganization } from "@/lib/api/usage"
import Link from "next/link"

export const dynamic = "force-dynamic"

type UsageWindow = "7d" | "30d" | "all"

function parseUsageWindow(value: string | undefined): UsageWindow {
  if (value === "7d" || value === "30d" || value === "all") return value
  return "30d"
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb} MB`
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const params = await searchParams
  const window = parseUsageWindow(params.window)
  const sinceDays = window === "7d" ? 7 : window === "30d" ? 30 : undefined

  const { organizationId } = await requireCurrentOrganization()
  const usage = await getUsageForOrganization(organizationId, sinceDays)

  const maxTotal = Math.max(
    ...usage.perSubscriber.map((row) => row.totalUpMb + row.totalDownMb),
    1
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">Bandwidth consumption per subscriber across all sessions.</p>
        <div className="mt-3 inline-flex rounded-md border border-border bg-background p-1 text-sm">
          {([
            { key: "7d", label: "Last 7 days" },
            { key: "30d", label: "Last 30 days" },
            { key: "all", label: "All time" },
          ] as const).map((option) => (
            <Link
              key={option.key}
              href={`/admin/usage?window=${option.key}`}
              className={`rounded px-3 py-1.5 transition-colors ${
                window === option.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMb(usage.totalUpMb)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total downloaded</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMb(usage.totalDownMb)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage by subscriber</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usage.perSubscriber.map((row) => {
            const total = row.totalUpMb + row.totalDownMb
            return (
              <div key={row.subscriberId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.subscriberName}</span>
                  <span className="text-muted-foreground">
                    {formatMb(total)} · {row.sessionCount} session{row.sessionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <Progress value={(total / maxTotal) * 100} />
              </div>
            )
          })}
          {usage.perSubscriber.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No session data recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
