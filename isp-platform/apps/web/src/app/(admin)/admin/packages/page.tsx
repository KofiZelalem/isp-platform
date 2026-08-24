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
import {
  getServicePlansForOrganization,
  type ServicePlanListItem,
} from "@/lib/api/packages"
import { requireCurrentOrganization } from "@/lib/auth"
import { archiveServicePlan, setServicePlanActive } from "./actions"

import { CreatePackageSheet } from "./create-package-sheet"
import { EditPackageSheet } from "./edit-package-sheet"

export const dynamic = "force-dynamic"

async function togglePackage(formData: FormData): Promise<void> {
  "use server"
  await setServicePlanActive(null, formData)
}

async function archivePackage(formData: FormData): Promise<void> {
  "use server"
  await archiveServicePlan(null, formData)
}

function formatDataLimit(plan: ServicePlanListItem): string {
  if (plan.dataLimitMb === null) return "Unlimited"
  if (plan.dataLimitMb >= 1024) return `${(plan.dataLimitMb / 1024).toFixed(1)} GB`
  return `${plan.dataLimitMb} MB`
}

function formatSpeed(kbps: number | null): string {
  if (!kbps) return "—"
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} Mbps`
  return `${kbps} Kbps`
}

export default async function PackagesPage() {
  const { organizationId } = await requireCurrentOrganization()
  const plans = await getServicePlansForOrganization(organizationId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Packages</h1>
          <p className="text-muted-foreground">
            Manage the service plans available to your customers.
          </p>
        </div>
        <CreatePackageSheet />
      </div>

      <div className="rounded-md border border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Data limit</TableHead>
              <TableHead className="hidden md:table-cell">Down / Up speed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Subscriptions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{plan.name}</span>
                    <span className="text-xs text-muted-foreground">{plan.description}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{plan.currency} {plan.price}</TableCell>
                <TableCell>{plan.validityDays} day(s)</TableCell>
                <TableCell>{formatDataLimit(plan)}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {formatSpeed(plan.speedDownloadKbps)} / {formatSpeed(plan.speedUploadKbps)}
                </TableCell>
                <TableCell>
                  <Badge variant={plan.isActive ? "default" : "destructive"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">{plan.subscriptionCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <EditPackageSheet plan={plan} />
                    <form action={togglePackage}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="isActive" value={String(!plan.isActive)} />
                      <Button type="submit" variant="ghost" size="sm">{plan.isActive ? "Deactivate" : "Activate"}</Button>
                    </form>
                    <form action={archivePackage}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <Button type="submit" variant="ghost" size="sm">Archive</Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No packages found for this organization.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
