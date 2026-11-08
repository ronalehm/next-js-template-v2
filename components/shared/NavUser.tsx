"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ChevronsUpDown, LogOut, Settings, UserRound } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

// Signed-in user at the bottom of the sidebar (screen 02). Identity comes from Clerk (D23).
export function NavUser() {
  const { isLoaded, user } = useUser();

  if (!isLoaded || !user) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Usuario";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const avatar = <UserAvatar id={user.id} name={name} imageUrl={user.hasImage ? user.imageUrl : null} />;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={`Menú de ${name}`}
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            {avatar}
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-59 rounded-xl shadow-popover">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-foreground">
                {avatar}
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-sm font-semibold">{name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/profile" />}>
              <UserRound />
              Ver perfil
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
              <Settings />
              Configuración
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/sign-out" />}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
