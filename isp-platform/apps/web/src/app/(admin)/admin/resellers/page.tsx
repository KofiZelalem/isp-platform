import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireCurrentOrganization } from "@/lib/auth"
import { getResellerProfilesForOrganization } from "@/lib/api/resellers"
import { createTenantClient } from "database"
import { prisma } from "@/lib/db"
import { CreateResellerForm } from "./create-reseller-form"
import { ResellerProfileControls } from "./profile-controls"
import { AssignmentForm } from "./assignment-form"
import { getCustomersForOrganization } from "@/lib/api/customers"
import { PayoutControls } from "./payout-controls"

export const dynamic = "force-dynamic"

export default async function ResellersPage() {
  const { organizationId } = await requireCurrentOrganization()
  const [resellers, customerResult] = await Promise.all([
    getResellerProfilesForOrganization(organizationId),
    getCustomersForOrganization(organizationId, { pageSize: 100 }),
  ])
  const tenantDb = createTenantClient(prisma, organizationId)
  const availableUsers = await tenantDb.user.findMany({
    where: { role: "RESELLER", deleted_at: null, reseller_profile: null },
    orderBy: { created_at: "asc" },
    select: { id: true, full_name: true, email: true },
  })
  const payouts = await tenantDb.resellerPayout.findMany({ orderBy: { created_at: "desc" }, take: 50, select: { id: true, amount: true, status: true, created_at: true, reseller: { select: { user: { select: { full_name: true, email: true } } } } } })
  const auditEntries = await tenantDb.auditLog.findMany({ where: { resource_type: { in: ["ResellerPayout", "Subscriber", "User", "Invitation", "VoucherBatch"] } }, orderBy: { created_at: "desc" }, take: 30, select: { id: true, action: true, resource_type: true, resource_id: true, created_at: true, after_state: true } })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Resellers</h1>
        <p className="text-muted-foreground">
          Track reseller commission rates, wallet balances, and voucher batches.
        </p>
      </div>

      {availableUsers.length > 0 && <CreateResellerForm users={availableUsers.map((user) => ({ id: user.id, name: user.full_name || user.email }))} />}
      {resellers.length > 0 && customerResult.customers.length > 0 && <AssignmentForm profiles={resellers.map((reseller) => ({ id: reseller.id, name: reseller.userName }))} customers={customerResult.customers.map((customer) => ({ id: customer.id, name: `${customer.fullName} (${customer.username})` }))} />}

      <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Reseller</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Wallet balance</TableHead>
              <TableHead>Voucher batches</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Commission activity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resellers.map((reseller) => (
              <TableRow key={reseller.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{reseller.userName}</span>
                    <span className="text-xs text-muted-foreground">{reseller.email}</span>
                  </div>
                </TableCell>
                <TableCell>{reseller.commissionRate}%</TableCell>
                <TableCell className="font-medium">{reseller.walletBalance}</TableCell>
                <TableCell>{reseller.voucherBatchCount}</TableCell>
                <TableCell><div className="text-sm">{reseller.assignedCustomerCount} customers</div><div className="text-xs text-muted-foreground">{reseller.redeemedVoucherCount}/{reseller.voucherCount} vouchers redeemed</div></TableCell>
                <TableCell><div>{reseller.successfulSalesAmount} sales</div><div className="text-xs text-muted-foreground">{reseller.commissionEarned} commission</div></TableCell>
                <TableCell>
                  <Badge variant={reseller.isActive ? "default" : "destructive"}>
                    {reseller.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right"><ResellerProfileControls profileId={reseller.id} rate={reseller.commissionRate} active={reseller.isActive} /></TableCell>
              </TableRow>
            ))}
            {resellers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No resellers registered yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-md border border-border/50 p-4"><h2 className="mb-3 font-semibold">Commission payouts</h2><div className="space-y-2 text-sm">{payouts.map((payout) => <div key={payout.id} className="flex flex-wrap items-center justify-between gap-2"><span>{payout.reseller.user.full_name || payout.reseller.user.email} · {payout.amount.toString()} · {payout.created_at.toISOString().slice(0, 10)}</span><div className="flex items-center gap-2"><Badge variant={payout.status === "PAID" ? "default" : payout.status === "REJECTED" ? "destructive" : "secondary"}>{payout.status}</Badge><PayoutControls id={payout.id} status={payout.status} /></div></div>)}{payouts.length === 0 && <p className="text-sm text-muted-foreground">No payout requests.</p>}</div></div>
      <div className="rounded-md border border-border/50 p-4"><h2 className="mb-3 font-semibold">Recent staff and reseller activity</h2><div className="space-y-2 text-sm">{auditEntries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2"><span>{entry.action} · {entry.resource_type}{entry.resource_id ? ` · ${entry.resource_id}` : ""}</span><span className="text-xs text-muted-foreground">{entry.created_at.toISOString().slice(0, 19).replace("T", " ")}</span></div>)}{auditEntries.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded.</p>}</div></div>
    </div>
  )
}
