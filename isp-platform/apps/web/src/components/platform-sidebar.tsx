import Link from "next/link";
import { Activity, Building2, ShieldCheck } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function PlatformSidebar() {
  return (
    <Sidebar className="border-r border-border/50 bg-background/80 backdrop-blur-xl">
      <SidebarHeader className="flex h-16 items-center border-b border-border/50 px-6">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight"><div className="flex size-6 items-center justify-center rounded-md bg-primary"><ShieldCheck className="size-4 text-primary-foreground" /></div>ISP-OS</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Control plane</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton render={<Link href="/platform" />} tooltip="Control Plane"><Building2 className="size-4" /><span>Organizations</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton render={<Link href="/platform" />} tooltip="System Health"><Activity className="size-4" /><span>System health</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/50 p-4"><div className="text-center text-xs text-muted-foreground">Platform owner console</div></SidebarFooter>
    </Sidebar>
  );
}