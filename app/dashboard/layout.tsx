import type { CSSProperties } from "react";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { UiPreferencesRoot } from "@/components/shared/UiPreferencesRoot";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requirePermission } from "@/lib/auth";
import { APP_NAME } from "@/lib/navigation";

const SIDEBAR_SIZES = { "--sidebar-width": "260px", "--sidebar-width-icon": "64px" } as CSSProperties;

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const actor = await requirePermission("dashboard:view");

  return (
    <UiPreferencesRoot>
      <SidebarProvider style={SIDEBAR_SIZES}>
        <AppSidebar role={actor.role} />
        <SidebarInset className="bg-muted">
          {/* Mobile only: the sidebar opens as a sheet (R20). */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
            <SidebarTrigger aria-label="Abrir barra lateral" />
            <span className="text-sm font-semibold">{APP_NAME}</span>
          </div>
          <div data-slot="dashboard-content" className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-8 md:px-10 md:pt-9">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </UiPreferencesRoot>
  );
}
