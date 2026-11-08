import { UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requirePermission } from "@/lib/auth";
import { APP_NAME } from "@/lib/navigation";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const actor = await requirePermission("dashboard:view");

  return (
    <SidebarProvider>
      <AppSidebar role={actor.role} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">{APP_NAME}</span>
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
