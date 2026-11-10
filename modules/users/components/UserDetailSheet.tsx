"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { getUserSessionsAction } from "../actions/users.actions";
import type { ClerkActivity, IdentityState, UserRow, UserStatus } from "../types/users.types";
import { IdentityBadge } from "./IdentityBadge";

// Shared by the users components (the module's file list is closed, so they live here).

export function displayName(row: Pick<UserRow, "firstName" | "lastName" | "email">): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email;
}

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

// Relative date in Spanish ("hace 3 días"), or "—" without data (D38).
export function formatLastAccess(lastSignInAt: number | null | undefined): string {
  if (!lastSignInAt) return "—";
  const seconds = (lastSignInAt - Date.now()) / 1000;
  const match = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size);
  return match ? RELATIVE.format(Math.round(seconds / match[1]), match[0]) : "Ahora";
}

const LONG_DATE = new Intl.DateTimeFormat("es", { dateStyle: "long" });

const STATUS: Record<UserStatus, { label: string; badge: string; dot: string }> = {
  active: { label: "Activo", badge: "bg-success-soft text-success", dot: "bg-success" },
  revoked: { label: "Inactivo", badge: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" },
  invited: { label: "Invitado", badge: "bg-warning-soft text-warning", dot: "bg-warning" },
};

// Always with text, not only color (R49).
export function StatusBadge({ status }: { status: UserStatus }) {
  const { label, badge, dot } = STATUS[status];
  return (
    <Badge className={cn("gap-1.5 font-normal", badge)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </Badge>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] leading-[13px] font-semibold tracking-[0.04em] text-placeholder uppercase">{children}</h3>
  );
}

function InfoRow({ label, children, locked = false }: { label: string; children: React.ReactNode; locked?: boolean }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
      <dt className="flex-1 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 truncate text-right">
        {children}
        {locked ? <Lock className="size-3.5 shrink-0 text-placeholder" role="img" aria-label="Solo lectura" /> : null}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-card ring-0">
        <dl className="divide-y">{children}</dl>
      </Card>
    </section>
  );
}

// Mounted on each open (the popup unmounts when closed), so the sessions are asked for every time (R41).
function DetailBody({
  row,
  lastSignInAt,
  imageUrl,
  identity,
}: {
  row: UserRow;
  lastSignInAt: number | null;
  imageUrl: string | null;
  identity: IdentityState | null;
}) {
  const [sessions, setSessions] = useState<{ count: number | null } | null>(null);
  const name = displayName(row);

  useEffect(() => {
    let active = true;
    getUserSessionsAction({ id: row.id }).then(
      (result) => active && setSessions({ count: result.ok ? result.activeSessions : null }),
      () => active && setSessions({ count: null }),
    );
    return () => {
      active = false;
    };
  }, [row.id]);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <UserAvatar id={row.id} name={name} imageUrl={imageUrl} size="lg" />
        <p className="mt-3 max-w-full truncate text-[17px] leading-[22px] font-semibold">{name}</p>
        <p className="max-w-full truncate text-[13px] text-muted-foreground">{row.email}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{ROLE_LABELS[row.role]}</span>
          <StatusBadge status={row.status} />
        </div>
      </div>

      <Group title="Cuenta">
        <InfoRow label="Nombre">{row.firstName || "—"}</InfoRow>
        <InfoRow label="Apellido">{row.lastName || "—"}</InfoRow>
        <InfoRow label="Correo" locked>
          <span className="truncate">{row.email}</span>
        </InfoRow>
        <InfoRow label="Rol">{ROLE_LABELS[row.role]}</InfoRow>
        {identity ? (
          <InfoRow label="Identidad">
            <IdentityBadge state={identity} detail />
          </InfoRow>
        ) : null}
      </Group>
      <p className="-mt-4 text-xs text-muted-foreground">
        Por seguridad, solo {row.firstName || name} puede cambiar su correo o su contraseña desde su perfil.
      </p>

      <Group title="Actividad">
        <InfoRow label="Alta">{LONG_DATE.format(new Date(row.createdAt))}</InfoRow>
        <InfoRow label="Último acceso">{formatLastAccess(lastSignInAt)}</InfoRow>
        <InfoRow label="Sesiones activas">
          {sessions ? (sessions.count ?? "—") : <Skeleton className="h-4 w-8" aria-label="Cargando" />}
        </InfoRow>
      </Group>
    </div>
  );
}

// Screen 12: read only. Nothing from the private profile (R36, R41).
export function UserDetailSheet({
  open,
  onOpenChange,
  row,
  activity,
  identity,
  canEdit,
  onEdit,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: UserRow | null;
  activity: ClerkActivity[string] | undefined;
  // null when the actor cannot see identity for this row (RN-08): no «Identidad» row.
  identity: IdentityState | null;
  canEdit: boolean;
  onEdit: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        finalFocus={finalFocus}
        className="gap-0 shadow-sheet data-[side=right]:w-full data-[side=right]:sm:max-w-105"
      >
        <SheetHeader className="flex-row items-center justify-between border-b px-5 py-3">
          <SheetTitle className="text-[17px] leading-[22px] font-semibold">Detalle de usuario</SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
            <X />
          </SheetClose>
        </SheetHeader>

        {row ? (
          <DetailBody
            row={row}
            lastSignInAt={activity?.lastSignInAt ?? null}
            imageUrl={activity?.imageUrl ?? null}
            identity={identity}
          />
        ) : null}

        <SheetFooter className="flex-row justify-end border-t px-5 py-3">
          <SheetClose render={<Button variant="secondary" />}>Cerrar</SheetClose>
          {canEdit ? <Button onClick={onEdit}>Editar</Button> : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
