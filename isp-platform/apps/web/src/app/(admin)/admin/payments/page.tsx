import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getPaymentsForOrganization } from "@/lib/api/payments"
import { requireCurrentOrganization } from "@/lib/auth"

export const dynamic = "force-dynamic"

type PaymentsPageProps = { searchParams: Promise<{ search?: string; status?: string }> }

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const { organizationId } = await requireCurrentOrganization()
  const params = await searchParams
  const status = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"].includes(params.status ?? "")
    ? params.status as "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED"
    : undefined
  const payments = await getPaymentsForOrganization(organizationId, { search: params.search, status })

  return <div className="flex flex-col gap-6"><div><h1 className="text-3xl font-bold tracking-tight">Payments</h1><p className="text-muted-foreground">Review payment attempts and their subscription outcomes for your organization.</p></div><form method="get" className="flex flex-col gap-3 sm:flex-row"><Input name="search" defaultValue={params.search} placeholder="Search customer or payment reference" /><select name="status" defaultValue={status ?? ""} className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="SUCCESS">Successful</option><option value="FAILED">Failed</option><option value="REFUNDED">Refunded</option></select><Button type="submit">Filter</Button></form><div className="overflow-hidden rounded-md border border-border/50 bg-background/50"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Customer</th><th className="p-3">Package</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="hidden p-3 md:table-cell">Reference</th><th className="hidden p-3 lg:table-cell">Date</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-border/50"><td className="p-3"><div className="font-medium">{payment.customerName}</div><div className="text-xs text-muted-foreground">{payment.customerUsername}</div></td><td className="p-3">{payment.packageName ?? "—"}</td><td className="p-3">{payment.currency} {payment.amount}</td><td className="p-3"><Badge variant={payment.status === "SUCCESS" ? "default" : payment.status === "FAILED" ? "destructive" : "secondary"}>{payment.status}</Badge><div className="text-xs text-muted-foreground">Subscription: {payment.subscriptionStatus ?? "—"}</div>{payment.failureReason && <div className="text-xs text-destructive">{payment.failureReason}</div>}</td><td className="hidden p-3 font-mono text-xs md:table-cell">{payment.providerReference ?? payment.internalReference}</td><td className="hidden p-3 text-muted-foreground lg:table-cell">{new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString("en-GB")}</td></tr>)}{payments.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No payments match this filter.</td></tr>}</tbody></table></div></div>
}