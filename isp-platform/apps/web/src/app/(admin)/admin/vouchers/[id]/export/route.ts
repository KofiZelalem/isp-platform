import { NextResponse } from "next/server"

import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createTenantClient } from "database"

type ExportRouteContext = { params: Promise<{ id: string }> }

function csvCell(value: string | null | undefined): string {
  const text = value ?? ""
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(_request: Request, { params }: ExportRouteContext) {
  const { id } = await params
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)
  const batch = await tenantDb.voucherBatch.findUnique({
    where: { id },
    select: {
      name: true,
      plan: { select: { name: true } },
      vouchers: { orderBy: { created_at: "asc" }, select: { code: true, status: true, sold_to: true, expires_at: true } },
    },
  })
  if (!batch) return new NextResponse("Voucher batch not found.", { status: 404 })

  const rows = [
    ["Batch", "Package", "Code", "Status", "Sold To", "Expires At"],
    ...batch.vouchers.map((voucher) => [batch.name, batch.plan.name, voucher.code, voucher.status, voucher.sold_to ?? "", voucher.expires_at?.toISOString() ?? ""]),
  ]
  const csv = rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vouchers"}.csv"`,
    },
  })
}
