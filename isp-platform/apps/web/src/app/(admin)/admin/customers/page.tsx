import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import Link from "next/link"
import {
  getCustomersForOrganization,
} from "@/lib/api/customers"
import { requireCurrentOrganization } from "@/lib/auth"
import { CreateCustomerSheet } from "./customer-form"
import { CustomerActionsMenu } from "./customer-actions-menu"

export const dynamic = "force-dynamic"

type CustomersPageProps = { searchParams: Promise<{ search?: string; status?: string; page?: string }> }

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { organizationId } = await requireCurrentOrganization()
  const params = await searchParams
  const status = ["ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"].includes(params.status ?? "")
    ? params.status as "ACTIVE" | "SUSPENDED" | "EXPIRED" | "TERMINATED"
    : undefined
  const result = await getCustomersForOrganization(organizationId, {
    search: params.search,
    status,
    page: Number(params.page) || 1,
  })
  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1)
  const queryLink = (page: number) => {
    const query = new URLSearchParams()
    if (params.search) query.set("search", params.search)
    if (status) query.set("status", status)
    query.set("page", String(page))
    return `/admin/customers?${query.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your ISP customers, their packages and status.</p>
        </div>
        <CreateCustomerSheet />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xl">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <form className="flex w-full flex-col gap-2 sm:flex-row" method="get">
          <Input
            type="search"
            name="search"
            defaultValue={params.search}
            placeholder="Search by name, email, or ID..."
            className="w-full bg-background/50 pl-9"
          />
          <Button type="submit" variant="outline" className="w-full sm:w-auto">Search</Button>
          </form>
          <form method="get" className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            {params.search && <input type="hidden" name="search" value={params.search} />}
            <label htmlFor="status" className="text-sm text-muted-foreground sm:sr-only">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto">
              <option value="">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="EXPIRED">Expired</option><option value="TERMINATED">Terminated</option>
            </select>
          </form>
        </div>
        {/* Additional filters can go here */}
      </div>

      <div className="rounded-md border border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Customer ID</TableHead>
              <TableHead>Name / Email</TableHead>
              <TableHead>Current Package</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Recent Activity</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.customers.map((customer) => (
              <TableRow key={customer.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-primary">{customer.username}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{customer.fullName}</span>
                    <span className="text-xs text-muted-foreground">{customer.email ?? "No email"}</span>
                  </div>
                </TableCell>
                <TableCell>{customer.currentPackage}</TableCell>
                <TableCell>
                  <Badge variant={customer.status === "ACTIVE" ? "default" : "destructive"}>
                    {customer.status.charAt(0) + customer.status.slice(1).toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {customer.lastActivityAt?.slice(0, 10) ?? "No activity"}
                </TableCell>
                <TableCell className="text-right">
                  <CustomerActionsMenu customerId={customer.id} />
                </TableCell>
              </TableRow>
            ))}
            {result.customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No customers found for this organization.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{result.total} customer{result.total === 1 ? "" : "s"}</span>
        <div className="flex flex-wrap items-center gap-2"><Link className="rounded-md border px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50" href={queryLink(Math.max(result.page - 1, 1))} aria-disabled={result.page <= 1}>Previous</Link><span className="px-2 py-1.5">Page {result.page} of {totalPages}</span><Link className="rounded-md border px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50" href={queryLink(Math.min(result.page + 1, totalPages))} aria-disabled={result.page >= totalPages}>Next</Link></div>
      </div>
    </div>
  )
}
