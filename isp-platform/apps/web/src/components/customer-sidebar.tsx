import * as React from "react"
import Link from "next/link"
import {
  Home,
  Package,
  Activity,
  RefreshCcw,
  Receipt,
  Smartphone,
  LifeBuoy,
  User,
  Wifi,
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
  { title: "Home", url: "/customer", icon: Home },
  { title: "My Package", url: "/customer/package", icon: Package },
  { title: "Usage", url: "/customer/usage", icon: Activity },
  { title: "Renew", url: "/customer/renew", icon: RefreshCcw },
  { title: "Payment History", url: "/customer/history", icon: Receipt },
  { title: "Devices", url: "/customer/devices", icon: Smartphone },
  { title: "Support", url: "/customer/support", icon: LifeBuoy },
  { title: "Profile", url: "/customer/profile", icon: User },
]

export function CustomerSidebar() {
  return (
    <Sidebar className="border-r border-border/50 bg-background/80 backdrop-blur-xl">
      <SidebarHeader className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <Wifi className="h-4 w-4 text-primary-foreground" />
          </div>
          My Portal
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
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
          Powered by ISP-OS
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
