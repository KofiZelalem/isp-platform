import * as React from "react"

import { AdminHeader } from "@/components/admin-header"
import { PlatformSidebar } from "@/components/platform-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db"

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole("PLATFORM_ADMIN")
  const user = await prisma.user.findUnique({ where: { id: context.userId }, select: { full_name: true } })

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background/95">
        <PlatformSidebar />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px]" />
          <AdminHeader organizationName="ISP-OS Platform" userName={user?.full_name ?? "Platform admin"} settingsHref="/platform" />
          <main className="z-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
