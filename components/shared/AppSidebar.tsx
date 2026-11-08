"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavUser } from "@/components/shared/NavUser";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME, visibleNavItems } from "@/lib/navigation";
import type { Role } from "@/lib/roles";

function CollapseButton() {
  const { state } = useSidebar();
  const label = state === "collapsed" ? "Expandir barra lateral" : "Contraer barra lateral";
  return (
    <SidebarTrigger
      aria-label={label}
      title={label}
      className="hidden h-8 w-10 text-muted-foreground hover:bg-sidebar-accent active:scale-[0.97] md:inline-flex"
    />
  );
}

// Filters navigation only; access is enforced on the server by each route (D14).
// Collapsible to icons (screen 13): 260 px expanded, 64 px collapsed (widths set in the dashboard layout).
export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2 px-3 pt-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:flex-col">
          <span
            aria-hidden
            className="brand-gradient flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground"
          >
            P
          </span>
          <span className="flex-1 truncate text-[17px] leading-[22px] font-semibold tracking-[-0.3px] group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
          <CollapseButton />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] leading-[13px] font-semibold tracking-[0.04em] text-placeholder uppercase">
            General
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems(role).map((item) => {
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                      className="h-8.5 gap-2.5 rounded-lg px-2.5 data-active:font-semibold data-active:[&_svg]:text-primary"
                    >
                      <item.icon strokeWidth={1.75} className="size-4.5!" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
