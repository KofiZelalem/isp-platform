import { createTenantClient } from "database";
import { Activity, CreditCard, Users, Wifi } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatMoney(amount: { toString(): string } | number, currency: string): string {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount.toString()));
}

function relativeTime(value: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - value.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export default async function AdminDashboardPage() {
  const { organizationId, organization } = await requireCurrentOrganization();
  const tenantDb = createTenantClient(prisma, organizationId);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [organizationRecord, customerCount, routerCount, activeSessions, monthlyPayments, recentPayments, recentSubscriptions] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } }),
    tenantDb.subscriber.count({ where: { deleted_at: null } }),
    tenantDb.networkNode.count({ where: { node_type: "MIKROTIK" } }),
    tenantDb.session.count({ where: { status: "ACTIVE" } }),
    tenantDb.payment.aggregate({ where: { status: "SUCCESS", paid_at: { gte: monthStart } }, _sum: { amount: true } }),
    tenantDb.payment.findMany({
      where: { status: "SUCCESS" }, orderBy: { paid_at: "desc" }, take: 4,
      select: { amount: true, currency: true, paid_at: true, subscriber: { select: { full_name: true } }, subscription: { select: { plan: { select: { name: true } } } } },
    }),
    tenantDb.subscription.findMany({
      where: { status: "ACTIVE" }, orderBy: { started_at: "desc" }, take: 4,
      select: { started_at: true, subscriber: { select: { full_name: true } }, plan: { select: { name: true } } },
    }),
  ]);

  const activity = [
    ...recentPayments.map((payment) => ({ title: "Payment received", detail: `${payment.subscriber?.full_name ?? "Customer"} paid ${formatMoney(payment.amount, payment.currency)} for ${payment.subscription?.plan.name ?? "a package"}`, at: payment.paid_at ?? new Date() })),
    ...recentSubscriptions.map((subscription) => ({ title: "Package activated", detail: `${subscription.subscriber.full_name} started ${subscription.plan.name}`, at: subscription.started_at })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, 5);

  const metrics = [
    { title: "Total customers", value: customerCount.toLocaleString(), detail: "In your organization", icon: Users },
    { title: "Registered routers", value: routerCount.toLocaleString(), detail: "MikroTik nodes", icon: Wifi },
    { title: "Monthly revenue", value: formatMoney(monthlyPayments._sum.amount ?? 0, organizationRecord?.currency ?? "GHS"), detail: "Successful payments this month", icon: CreditCard },
    { title: "Active sessions", value: activeSessions.toLocaleString(), detail: "Reported by RADIUS", icon: Activity },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2"><h1 className="text-3xl font-bold tracking-tight">Dashboard</h1><p className="text-muted-foreground">Live overview for {organization.name}.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Card key={metric.title} className="border-border/50 bg-background/50"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{metric.title}</CardTitle><metric.icon className="size-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{metric.value}</div><p className="text-xs text-muted-foreground">{metric.detail}</p></CardContent></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50 bg-background/50"><CardHeader><CardTitle>Network traffic</CardTitle><CardDescription>Usage charts appear after RADIUS accounting is connected.</CardDescription></CardHeader><CardContent className="flex min-h-44 items-center justify-center text-center text-sm text-muted-foreground">No traffic data has been reported yet.</CardContent></Card>
        <Card className="border-border/50 bg-background/50"><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Latest payments and package activations in {organization.name}.</CardDescription></CardHeader><CardContent>{activity.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No activity yet. Add customers or sell a package to see it here.</p> : <div className="space-y-4">{activity.map((item, index) => <div key={`${item.title}-${item.at.toISOString()}-${index}`} className="flex gap-3"><div className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.detail}</p></div><span className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.at)}</span></div>)}</div>}</CardContent></Card>
      </div>
    </div>
  );
}