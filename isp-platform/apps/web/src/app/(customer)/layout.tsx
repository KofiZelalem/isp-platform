import * as React from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { CustomerSidebar } from "@/components/customer-sidebar"
import { CustomerHeader } from "@/components/customer-header"

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background/95">
        <CustomerSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px] pointer-events-none" />
          <CustomerHeader />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 z-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
