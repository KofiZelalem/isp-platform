import * as React from "react"
import { CheckCircle2, Router, Package } from "lucide-react"

import { SidebarProvider } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { requireOrganizationMember } from "@/lib/auth"
import { prisma } from "@/lib/db"

function WelcomeSetupChecklist() {
  return (
    <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
            Welcome to ISP-OS
          </h2>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Complete these setup steps to get your ISP live.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border/80 bg-background/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Router className="h-4 w-4 text-primary" />
            Connect your first router
          </div>
          <p className="text-sm text-muted-foreground">
            Register the first MikroTik or RADIUS node to start serving customers.
          </p>
        </div>

        <div className="rounded-lg border border-border/80 bg-background/60 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Package className="h-4 w-4 text-primary" />
            Create your first data package
          </div>
          <p className="text-sm text-muted-foreground">
            Define a plan with pricing, data limits, and validity for your subscribers.
          </p>
        </div>
      </div>
    </div>
  )
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context = await requireOrganizationMember()

  const [networkNodeCount, servicePlanCount] = await Promise.all([
    prisma.networkNode.count({
      where: { organization_id: context.organizationId },
    }),
    prisma.servicePlan.count({
      where: { organization_id: context.organizationId, deleted_at: null },
    }),
  ])
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { full_name: true },
  })

  const shouldShowSetupChecklist = networkNodeCount === 0 || servicePlanCount === 0

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background/95">
        <AdminSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px] pointer-events-none" />
          <AdminHeader organizationName={context.organization.name} userName={user?.full_name ?? "User"} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 z-0">
            {shouldShowSetupChecklist ? <WelcomeSetupChecklist /> : null}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
