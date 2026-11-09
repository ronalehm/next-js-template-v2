"use client";

import { useId, useState, useTransition } from "react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";
import { updateUserRoleAction } from "../actions/users.actions";
import { roleInputSchema } from "../schemas/users.schema";
import type { UserRow } from "../types/users.types";
import { displayName } from "./UserDetailSheet";

const ROLE_HINTS: Record<Role, string> = {
  user: "Acceso básico al panel",
  admin: "Gestiona usuarios",
  superadmin: "No se asigna desde el panel",
};

type FormProps = { row: UserRow; imageUrl: string | null; onSaved: () => void; onCancel: () => void };

// Mounted on each open, so the select starts from the row's current role.
function RoleForm({ row, imageUrl, onSaved, onCancel }: FormProps) {
  const [role, setRole] = useState<Role>(row.role);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const roleId = useId();
  const errorId = useId();
  const name = displayName(row);

  function submit() {
    const parsed = roleInputSchema.safeParse({ id: row.id, role });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos no válidos.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateUserRoleAction(parsed.data);
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-[22px] leading-7 font-bold tracking-[-0.005em]">Cambiar rol</DialogTitle>
      </DialogHeader>

      {/* Name and email are read only: only their owner changes them (D24, D34). */}
      <div className="flex items-center gap-3">
        <UserAvatar id={row.id} name={name} imageUrl={imageUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{row.email}</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={roleId} className="text-[13px] text-muted-foreground">
          Rol
        </Label>
        <Select
          id={roleId}
          items={ROLE_LABELS}
          value={role}
          disabled={isPending}
          onValueChange={(value) => value && setRole(value as Role)}
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((item) => (
              <SelectItem key={item} value={item} disabled={item === "superadmin"}>
                <span>{ROLE_LABELS[item]}</span>
                <span className="text-muted-foreground">· {ROLE_HINTS[item]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? (
          <p id={errorId} className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || role === row.role}>
          Guardar cambios
        </Button>
      </DialogFooter>
    </form>
  );
}

// Screens 05 (reduced) and 14: superadmin only, user <-> admin (R43, D37). The server repeats every check.
export function ChangeRoleDialog({
  open,
  onOpenChange,
  row,
  finalFocus,
  ...formProps
}: Omit<FormProps, "onCancel" | "row"> & {
  row: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: () => HTMLElement | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="sm:max-w-110">
        {row ? <RoleForm {...formProps} row={row} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
