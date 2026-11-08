"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Lock } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useBrowserTimeZone, useUiPreferences } from "../hooks/useUiPreferences";
import { THEME_LABELS } from "../utils/uiPreferences";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-[13px] font-semibold tracking-[0.04em] text-placeholder uppercase">{children}</p>
  );
}

// Every actor that reaches the panel has status `active` in app_users (R13).
export function ActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      Activo
    </span>
  );
}

// Dashboard home (screen 17). Identity from Clerk, role from app_users (D23); nothing is written.
export function AccountSummary({ role }: { role: Role }) {
  const { isLoaded, user } = useUser();
  const { preferences } = useUiPreferences();
  const timeZone = useBrowserTimeZone();

  if (!isLoaded || !user) {
    return <Skeleton className="h-64 w-full max-w-3xl rounded-xl" />;
  }

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Usuario";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-[32px] leading-[38px] font-bold tracking-[-0.01em]">Hola, {user.firstName || name}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-4 rounded-xl p-5 shadow-card ring-0">
          <SectionLabel>Tu cuenta</SectionLabel>
          <div className="flex items-center gap-3">
            <UserAvatar id={user.id} name={name} imageUrl={user.hasImage ? user.imageUrl : null} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{ROLE_LABELS[role]}</span>
                <ActiveBadge />
              </div>
            </div>
          </div>
          <Link href="/dashboard/profile" className={cn(buttonVariants({ variant: "secondary" }), "self-start")}>
            Ver perfil
          </Link>
        </Card>

        <Card className="gap-4 rounded-xl p-5 shadow-card ring-0">
          <SectionLabel>Preferencias</SectionLabel>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Tema</dt>
            <dd>{THEME_LABELS[preferences.theme]}</dd>
            <dt className="text-muted-foreground">Idioma</dt>
            <dd>Español</dd>
            <dt className="text-muted-foreground">Zona horaria</dt>
            <dd className="truncate">{timeZone || "—"}</dd>
          </dl>
          <Link href="/dashboard/settings" className={cn(buttonVariants({ variant: "secondary" }), "self-start")}>
            Configuración
          </Link>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        Tu rol lo gestiona un administrador del panel.
      </p>
    </div>
  );
}
