import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Screen 11 (D39): shown inside the shell when the actor lacks users:manage.
export function UsersNoAccess() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="text-[17px] leading-[22px] font-semibold">No tienes acceso a Usuarios</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tu rol no permite gestionar usuarios. Si lo necesitas, pídeselo a un administrador del panel.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: "secondary", className: "mt-2" })}>
        Volver al inicio
      </Link>
    </div>
  );
}
