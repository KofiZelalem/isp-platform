"use client"

import Link from "next/link"
import { Building, LogOut, Search, Settings } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signOutAction } from "@/components/admin-header-actions"
import { ThemeToggle } from "@/components/theme-toggle"

export function AdminHeader({
  organizationName = "ISP-OS Platform",
  userName = "Platform admin",
  settingsHref = "/admin/settings",
}: {
  organizationName?: string
  userName?: string
  settingsHref?: string
}) {
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]).join("").toUpperCase() || "U"

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-3 backdrop-blur-xl transition-all sm:h-16 sm:gap-4 sm:px-6">
      <SidebarTrigger className="-ml-2 hover:bg-primary/10 hover:text-primary transition-colors" />
      
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-sm hidden md:flex">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search customers, packages..."
            className="w-full bg-muted/50 pl-9 border-transparent focus-visible:bg-background focus-visible:ring-primary transition-all rounded-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <div className="hidden items-center gap-2 rounded-full border border-border/50 bg-background/50 px-3 py-1.5 text-sm md:flex">
          <Building className="h-4 w-4 text-primary" />
          <span className="max-w-40 truncate">{organizationName}</span>
        </div>
        <Link href={settingsHref} aria-label="Account settings" title="Account settings" className="flex h-9 items-center gap-2 rounded-full px-1.5 text-sm hover:bg-muted sm:px-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">{initials}</span>
          <span className="hidden max-w-28 truncate sm:inline">{userName}</span>
          <Settings className="hidden size-4 text-muted-foreground sm:block" />
        </Link>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Log out" title="Log out"><LogOut /></Button>
        </form>
      </div>
    </header>
  )
}
