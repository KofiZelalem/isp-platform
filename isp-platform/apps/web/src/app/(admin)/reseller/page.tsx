import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireRole } from "@/lib/auth"
import { getResellerOperationsForUser } from "@/lib/api/reseller-operations"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RevokeVoucherButton } from "./revoke-voucher-button"
import Link from "next/link"
import { createTenantClient } from "database"
import { prisma } from "@/lib/db"
import { ResellerCustomerForm } from "./customer-form"
import { EditResellerCustomerForm } from "./edit-customer-form"
import { VoucherBatchForm } from "./voucher-batch-form"
import { RequestPayoutForm } from "./request-payout-form"

export const dynamic = "force-dynamic"

/**
 * The current repository has no auth/session adapter yet. Until one is added,
 * the first active RESELLER user is the development identity; the role check
 * remains mandatory before any reseller data is loaded.
 */
export default async function ResellerDashboardPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const params = await searchParams
  const context = await requireRole("RESELLER")
  const reseller = await getResellerOperationsForUser(context.organizationId, context.userId, params.search)
  const tenantDb = createTenantClient(prisma, context.organizationId)
  const plans = await tenantDb.servicePlan.findMany({ where: { is_active: true }, orderBy: { price: "asc" }, select: { id: true, name: true } })
  if (!reseller) return <p className="text-muted-foreground">Reseller profile is not configured.</p>

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Reseller dashboard</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Reseller operations
        </h1>
        <p className="text-muted-foreground">Track your voucher sales and commission wallet.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Wallet balance</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{reseller.walletBalance}</p>
            <p className="text-xs text-muted-foreground">Wallet balance · {reseller.commissionRate}% commission rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Assigned batches</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{reseller.assignedCustomers.length}</p>
            <p className="text-xs text-muted-foreground">Assigned customers</p>
          </CardContent>
        </Card>
      </div>

      <ResellerCustomerForm plans={plans} />
      <VoucherBatchForm plans={plans} />
      <RequestPayoutForm />
      <form method="get" className="flex gap-2"><Input name="search" defaultValue={params.search} placeholder="Search assigned customers" /><Button type="submit" variant="outline">Search</Button>{params.search && <Button variant="ghost" render={<Link href="/reseller" />}>Reset</Button>}</form>

      <Card><CardHeader><CardTitle>Assigned customers</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">Customer</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Assigned</th><th className="p-3">Edit</th></tr></thead><tbody>{reseller.assignedCustomers.map((customer) => <tr key={customer.id} className="border-b last:border-0"><td className="p-3 font-medium">{customer.name}<div className="text-xs text-muted-foreground">{customer.username}</div></td><td className="p-3">{customer.email ?? "-"}</td><td className="p-3"><Badge>{customer.status}</Badge></td><td className="p-3 text-muted-foreground">{customer.createdAt.slice(0, 10)}</td><td className="p-3"><EditResellerCustomerForm customer={customer} /></td></tr>)}{reseller.assignedCustomers.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No assigned customers found.</td></tr>}</tbody></table></div></CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Voucher batches</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50 bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">Batch</th>
                  <th className="p-3 font-medium">Quantity</th>
                  <th className="p-3 font-medium">Inventory</th>
                  <th className="p-3 font-medium">Created</th>
                  <th className="p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {reseller.voucherBatches.map((batch) => (
                    <tr key={batch.id} className="border-b border-border/50 last:border-0"><td className="p-3 font-medium">{batch.name}</td><td className="p-3">{batch.quantity}</td><td className="p-3"><Badge variant="secondary">Available {batch.available}</Badge> <Badge>Redeemed {batch.redeemed}</Badge></td><td className="p-3 text-muted-foreground">{batch.createdAt.slice(0, 10)}</td><td className="p-3">Inventory managed by batch</td></tr>
                  ))}
                {reseller.voucherBatches.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No voucher batches assigned yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Voucher inventory</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">Batch</th><th className="p-3">Code</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{reseller.inventory.map((voucher) => <tr key={voucher.id} className="border-b last:border-0"><td className="p-3">{voucher.batchName}</td><td className="p-3 font-mono">{voucher.code}</td><td className="p-3"><Badge variant={voucher.status === "REDEEMED" || voucher.status === "REVOKED" ? "destructive" : "secondary"}>{voucher.status}</Badge></td><td className="p-3">{(voucher.status === "GENERATED" || voucher.status === "SOLD") && <RevokeVoucherButton voucherId={voucher.id} />}</td></tr>)}{reseller.inventory.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No voucher inventory found.</td></tr>}</tbody></table></div></CardContent></Card>
    </div>
  )
}
