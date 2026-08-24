import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createTenantClient } from "database"

import { revokeVoucherAction, revokeVoucherBatchAction } from "../actions"

export const dynamic = "force-dynamic"

type VoucherBatchPageProps = { params: Promise<{ id: string }> }

async function revokeVoucher(voucherId: string): Promise<void> {
  "use server"
  const data = new FormData()
  data.set("voucherId", voucherId)
  await revokeVoucherAction(null, data)
}

async function revokeBatch(batchId: string): Promise<void> {
  "use server"
  const data = new FormData()
  data.set("batchId", batchId)
  await revokeVoucherBatchAction(null, data)
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "REDEEMED" || status === "REVOKED" || status === "EXPIRED") return "destructive"
  if (status === "SOLD") return "secondary"
  return "default"
}

export default async function VoucherBatchPage({ params }: VoucherBatchPageProps) {
  const { id } = await params
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)
  const batch = await tenantDb.voucherBatch.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      prefix: true,
      quantity: true,
      selling_price: true,
      created_at: true,
      plan: { select: { name: true, validity_days: true } },
      organization: { select: { currency: true } },
      vouchers: {
        orderBy: { created_at: "asc" },
        select: { id: true, code: true, status: true, sold_to: true, sold_at: true, expires_at: true, created_at: true },
      },
    },
  })
  if (!batch) notFound()

  const revoke = revokeBatch.bind(null, batch.id)

  return <div className="flex flex-col gap-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Link href="/admin/vouchers" className="text-sm text-muted-foreground hover:underline">Back to vouchers</Link><h1 className="mt-2 text-3xl font-bold tracking-tight">{batch.name}</h1><p className="text-muted-foreground">{batch.plan.name} · {batch.quantity} codes · {batch.organization.currency} {batch.selling_price.toString()} each</p></div><div className="flex gap-2"><a href={`/admin/vouchers/${batch.id}/export`}><Button variant="outline">Export CSV</Button></a><form action={revoke}><Button type="submit" variant="destructive">Revoke available codes</Button></form></div></div><Card><CardHeader><CardTitle>Voucher codes</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left"><tr><th className="p-2">Code</th><th className="p-2">Status</th><th className="p-2">Sold to</th><th className="p-2">Created</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{batch.vouchers.map((voucher) => { const revokeOne = revokeVoucher.bind(null, voucher.id); return <tr key={voucher.id} className="border-b last:border-0"><td className="p-2 font-mono font-medium">{voucher.code}</td><td className="p-2"><Badge variant={statusVariant(voucher.status)}>{voucher.status}</Badge></td><td className="p-2 text-muted-foreground">{voucher.sold_to ?? "—"}</td><td className="p-2 text-muted-foreground">{voucher.created_at.toISOString().slice(0, 10)}</td><td className="p-2 text-right">{(voucher.status === "GENERATED" || voucher.status === "SOLD") && <form action={revokeOne}><Button type="submit" size="sm" variant="ghost">Revoke</Button></form>}</td></tr> })}</tbody></table></CardContent></Card></div>
}
