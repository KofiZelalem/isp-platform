import Link from "next/link"
import { Activity, BarChart3, CreditCard, Database, Users, type LucideIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAnalyticsForOrganization, type AnalyticsRange } from "@/lib/api/analytics"
import { requireCurrentOrganization } from "@/lib/auth"

export const dynamic = "force-dynamic"

type AnalyticsPageProps = {
  searchParams: Promise<{ range?: string }>
}

function parseRange(value: string | undefined): AnalyticsRange {
  const parsed = Number(value)
  return parsed === 30 || parsed === 90 ? parsed : 7
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`
}

function growthLabel(value: number | null): string {
  if (value === null) return "New revenue in this period"
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}% vs previous period`
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const params = await searchParams
  const range = parseRange(params.range)
  const { organizationId } = await requireCurrentOrganization()
  const analytics = await getAnalyticsForOrganization(organizationId, range)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Revenue, subscriber health, package demand, and network usage.
          </p>
        </div>
        <nav aria-label="Analytics date range" className="flex rounded-lg border border-border p-1 text-sm">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/admin/analytics?range=${days}`}
              aria-current={range === days ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                range === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {days} days
            </Link>
          ))}
          <Link href={`/admin/analytics/export?range=${range}`} className="ml-2 rounded-md border px-3 py-1.5 text-muted-foreground hover:bg-muted">Export CSV</Link>
        </nav>
      </div>

      {analytics ? (
        <>
          <p className="text-sm text-muted-foreground">
            {analytics.startDate} to {analytics.endDate}
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Total revenue" value={money(analytics.totalRevenue, analytics.currency)} detail={growthLabel(analytics.revenueGrowthRate)} icon={CreditCard} />
            <MetricCard title="Active subscribers" value={analytics.activeSubscribers.toLocaleString()} detail={`${analytics.expiredSubscriptions} expired in period`} icon={Users} />
            <MetricCard title="ARPU" value={money(analytics.arpu, analytics.currency)} detail="Revenue per active subscriber" icon={BarChart3} />
            <MetricCard title="Total bandwidth" value={`${analytics.totalDataGb.toFixed(2)} GB`} detail="Upload + download consumed" icon={Database} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Payment success" value={`${analytics.paymentSuccessRate.toFixed(1)}%`} detail="Successful payment attempts" icon={CreditCard} />
            <MetricCard title="Voucher redemption" value={`${analytics.voucherRedemptionRate.toFixed(1)}%`} detail="Redeemed of issued vouchers" icon={Database} />
            <MetricCard title="Average session" value={`${analytics.averageSessionDurationMinutes.toFixed(1)} min`} detail="Average recorded session duration" icon={Activity} />
            <MetricCard title="Revenue trend" value={money(analytics.forecast.nextPeriodRevenue, analytics.currency)} detail={`Next ${range} days · ${analytics.forecast.confidence}% confidence`} icon={BarChart3} />
          </div>

          <div className="grid gap-4 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Daily revenue</CardTitle>
                <CardDescription>Successful payments by UTC day</CardDescription>
              </CardHeader>
              <CardContent>
                <DailyRevenueChart points={analytics.dailyRevenue} currency={analytics.currency} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Package popularity</CardTitle>
                <CardDescription>Subscriptions and revenue in this period</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.packagePopularity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No package activity in this period.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {analytics.packagePopularity.map((item) => (
                      <div key={item.planId} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.planName}</p>
                          <p className="text-xs text-muted-foreground">{item.subscriptions} subscriptions</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold">{money(item.revenue, analytics.currency)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Router usage</CardTitle>
              <CardDescription>Bandwidth and sessions by tenant router</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.routerUsage.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No router usage in this period.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {analytics.routerUsage.map((router) => (
                    <div key={router.nodeId} className="rounded-md border border-border/50 p-3">
                      <p className="font-medium">{router.nodeName}</p>
                      <p className="text-sm text-muted-foreground">{router.dataGb.toFixed(2)} GB · {router.sessions} sessions</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <TrendCard title="Subscriber growth" headers={["Date", "New", "Churn", "Net"]} rows={analytics.subscriberTrend.map((point) => [point.date, point.newSubscribers, point.churnedSubscribers, point.netChange])} empty="No subscriber changes in this period." />
            <TrendCard title="Payment status" headers={["Status", "Count", "Amount"]} rows={analytics.paymentStatusTrend.map((point) => [point.status, point.count, money(point.amount, analytics.currency)])} empty="No payments in this period." />
            <TrendCard title="Peak concurrency" headers={["Date", "Sessions"]} rows={analytics.sessionConcurrency.filter((point) => point.peakConcurrent > 0).map((point) => [point.date, point.peakConcurrent])} empty="No session concurrency in this period." />
          </div>
          <Card>
            <CardHeader><CardTitle>Trend projection</CardTitle><CardDescription>Robust median-slope projection from the selected period, for planning only</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Projected revenue</p><p className="text-2xl font-bold">{money(analytics.forecast.nextPeriodRevenue, analytics.currency)}</p></div><div><p className="text-sm text-muted-foreground">Projected subscriber net change</p><p className="text-2xl font-bold">{analytics.forecast.nextPeriodNetSubscriberChange >= 0 ? "+" : ""}{analytics.forecast.nextPeriodNetSubscriberChange}</p></div><div><p className="text-sm text-muted-foreground">Forecast quality</p><p className="text-2xl font-bold">{analytics.forecast.quality}</p></div></CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-base">Voucher performance</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm">{Object.entries(analytics.voucherPerformance).map(([label, value]) => <div key={label}><p className="text-muted-foreground capitalize">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Reseller performance</CardTitle></CardHeader><CardContent>{analytics.resellerPerformance.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No reseller activity.</p> : <div className="space-y-3">{analytics.resellerPerformance.map((item) => <div key={item.resellerId} className="flex items-center justify-between gap-2 text-sm"><div><p className="font-medium">{item.resellerName}</p><p className="text-xs text-muted-foreground">{item.vouchersRedeemed} redeemed · {item.voucherBatches} batches</p></div><span className="font-semibold">{money(item.salesAmount, analytics.currency)}</span></div>)}</div>}</CardContent></Card>
            <TrendCard title="Session duration" headers={["Duration", "Sessions"]} rows={analytics.sessionDuration.map((item) => [item.label, item.sessions])} empty="No session duration data." />
          </div>
        </>
      ) : (
        <div className="rounded-md border border-border/50 p-12 text-center text-muted-foreground">
          Analytics are unavailable for this organization.
        </div>
      )}
    </div>
  )
}

function TrendCard({ title, headers, rows, empty }: { title: string; headers: string[]; rows: (string | number)[][]; empty: string }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr>{headers.map((header) => <th key={header} className="p-3 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`} className="border-t border-border/50">{row.map((value, valueIndex) => <td key={`${title}-${index}-${valueIndex}`} className="p-3">{value}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={headers.length} className="p-6 text-center text-muted-foreground">{empty}</td></tr>}</tbody></table></div></CardContent></Card>
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string
  value: string
  detail: string
  icon: LucideIcon
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function DailyRevenueChart({
  points,
  currency,
}: {
  points: { date: string; revenue: number }[]
  currency: string
}) {
  const max = Math.max(...points.map((point) => point.revenue), 1)

  return (
    <div className="flex h-64 items-end gap-1 border-b border-l border-border/60 px-2 pb-0 pt-4">
      {points.map((point) => {
        const height = point.revenue ? Math.max((point.revenue / max) * 100, 4) : 1
        return (
          <div key={point.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-primary/75 transition-colors group-hover:bg-primary"
              style={{ height: `${height}%` }}
              title={`${point.date}: ${money(point.revenue, currency)}`}
            />
            {points.length <= 14 && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                {point.date.slice(5)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
