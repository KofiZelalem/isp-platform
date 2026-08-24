import * as React from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  Users,
  Package,
  CreditCard,
  Receipt,
  Ticket,
  Router,
  Wifi,
  Activity,
  BarChart,
  UserCheck,
  Building2,
  Bell,
  FileText,
  LifeBuoy,
  Settings,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"

const navItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Customers", url: "/admin/customers", icon: Users },
  { title: "Packages", url: "/admin/packages", icon: Package },
  { title: "Subscriptions", url: "/admin/subscriptions", icon: CreditCard },
  { title: "Payments", url: "/admin/payments", icon: Receipt },
  { title: "Vouchers", url: "/admin/vouchers", icon: Ticket },
  { title: "Routers", url: "/admin/routers", icon: Router },
  { title: "Hotspots", url: "/admin/hotspots", icon: Wifi },
  { title: "Sessions", url: "/admin/sessions", icon: Activity },
  { title: "Usage", url: "/admin/usage", icon: Activity },
  { title: "Reports", url: "/admin/reports", icon: FileText },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart },
  { title: "Staff", url: "/admin/staff", icon: UserCheck },
  { title: "Resellers", url: "/admin/resellers", icon: Building2 },
  { title: "Notifications", url: "/admin/notifications", icon: Bell },
  { title: "Support", url: "/admin/support", icon: LifeBuoy },
  { title: "Settings", url: "/admin/settings", icon: Settings },
]

export function AdminSidebar() {
  return (
    <Sidebar className="border-r border-border/50 bg-background/80 backdrop-blur-xl">
      <SidebarHeader className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <Wifi className="h-4 w-4 text-primary-foreground" />
          </div>
          ISP-OS
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    tooltip={item.title}
                    className="transition-all hover:bg-primary/10 hover:text-primary"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/50 p-4">
        <div className="text-xs text-muted-foreground text-center">
          v0.1.0-alpha
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
