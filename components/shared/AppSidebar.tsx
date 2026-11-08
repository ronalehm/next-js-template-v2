"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_NAME, visibleNavItems } from "@/lib/navigation";
import { ROLE_LABELS, type Role } from "@/lib/roles";

// Filters navigation only; access is enforced on the server by each route (D14).
export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 py-1.5 text-sm font-semibold">{APP_NAME}</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems(role).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Rol</span>
          <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
