import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { requireCurrentOrganization } from "@/lib/auth"
import { getActiveServicePlanOptions, getVoucherBatchesForOrganization } from "@/lib/api/vouchers"
import { getResellerOptionsForOrganization } from "@/lib/api/resellers"

import { CreateVoucherBatchSheet } from "./create-voucher-batch-sheet"

export const dynamic = "force-dynamic"

export default async function VouchersPage() {
  const { organizationId } = await requireCurrentOrganization()
  const [batches, plans, resellers] = await Promise.all([
    getVoucherBatchesForOrganization(organizationId),
    getActiveServicePlanOptions(organizationId),
    getResellerOptionsForOrganization(organizationId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-muted-foreground">
            Generate and track pre-paid Wi-Fi voucher batches.
          </p>
        </div>
        <CreateVoucherBatchSheet plans={plans} resellers={resellers} />
      </div>

      <div className="rounded-md border border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Selling price</TableHead>
                <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{batch.name}</span>
                    {batch.prefix && (
                      <span className="text-xs text-muted-foreground">Prefix: {batch.prefix}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{batch.planName}</TableCell>
                <TableCell className="font-medium">{batch.currency} {batch.sellingPrice}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1"><Badge variant="default">{batch.redeemedCount} redeemed</Badge><Badge variant="secondary">{batch.generatedCount} available</Badge>{batch.revokedCount > 0 && <Badge variant="destructive">{batch.revokedCount} revoked</Badge>}</div>
                </TableCell>
                <TableCell className="text-right"><Link className="text-sm text-primary hover:underline" href={`/admin/vouchers/${batch.id}`}>View codes</Link></TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {batch.createdAt.slice(0, 10)}
                </TableCell>
              </TableRow>
            ))}
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No voucher batches yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
