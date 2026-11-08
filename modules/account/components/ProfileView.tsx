"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronRight, Lock } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { ActiveBadge, SectionLabel } from "./AccountSummary";

function Row({ label, value, onOpen }: { label: string; value?: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset active:scale-[0.99]"
    >
      <span className="flex-1">{label}</span>
      {value ? <span className="max-w-[60%] truncate text-muted-foreground">{value}</span> : null}
      <ChevronRight className="size-3.5 text-placeholder" aria-hidden />
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <Card className="gap-0 divide-y overflow-hidden rounded-xl py-0 shadow-card ring-0">{children}</Card>
    </section>
  );
}

// Ver perfil (screen 08, partial). Read-only: identity is edited only in Clerk's modal (D24).
// Optional fields and "+ Añadir información" are postponed (P-POST-1).
export function ProfileView({ role }: { role: Role }) {
  const { isLoaded, user } = useUser();
  const { openUserProfile } = useClerk();

  if (!isLoaded || !user) {
    return <Skeleton className="h-96 w-full max-w-180 rounded-xl" />;
  }

  const open = () => openUserProfile();
  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Usuario";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="flex w-full max-w-180 flex-col gap-6">
      <Card className="items-center gap-2 rounded-xl p-6 text-center shadow-card ring-0">
        <UserAvatar id={user.id} name={name} imageUrl={user.hasImage ? user.imageUrl : null} size="lg" />
        <h1 className="mt-2 text-[22px] leading-7 font-bold tracking-[-0.005em]">{name}</h1>
        <p className="text-[13px] text-muted-foreground">{email}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{ROLE_LABELS[role]}</span>
          <ActiveBadge />
        </div>
        <Button variant="link" className="h-auto px-0" onClick={open}>
          Cambiar foto
        </Button>
      </Card>

      <Group title="Información personal">
        <Row label="Nombre" value={user.firstName ?? "—"} onOpen={open} />
        <Row label="Apellido" value={user.lastName ?? "—"} onOpen={open} />
      </Group>

      <Group title="Correos">
        <Row label={email || "Sin correo principal"} value="Principal" onOpen={open} />
        <Row label="Añadir correo" onOpen={open} />
      </Group>

      <Group title="Seguridad">
        <Row label="Contraseña" value="••••••••" onOpen={open} />
        <Row label="Sesiones activas" onOpen={open} />
      </Group>

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        Tu nombre, tus correos y tu contraseña se gestionan en la ventana segura de tu cuenta.
      </p>
    </div>
  );
}
