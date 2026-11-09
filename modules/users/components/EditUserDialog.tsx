"use client";

import { useId, useState, useTransition } from "react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { updateUserAction } from "../actions/users.actions";
import { editUserInputSchema, PANEL_ROLES } from "../schemas/users.schema";
import type { UserRow } from "../types/users.types";
import { displayName } from "./UserDetailSheet";

const TOO_LONG = "Máximo 50 caracteres.";
const ROLE_ITEMS = Object.fromEntries(PANEL_ROLES.map((role) => [role, ROLE_LABELS[role]]));
const ROLE_HINTS: Record<(typeof PANEL_ROLES)[number], string> = {
  user: "Acceso básico al panel",
  admin: "Gestiona usuarios",
};

type FormProps = { row: UserRow; imageUrl: string | null; onSaved: () => void; onCancel: () => void };
type NameField = "firstName" | "lastName";
type ErrorKey = NameField | "role" | "form";

// Mounted on each open, so the inputs start from the row's current values.
function EditForm({ row, imageUrl, onSaved, onCancel }: FormProps) {
  const [values, setValues] = useState({ firstName: row.firstName ?? "", lastName: row.lastName ?? "" });
  const [role, setRole] = useState<Role>(row.role);
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [isPending, startTransition] = useTransition();
  const firstId = useId();
  const lastId = useId();
  const roleId = useId();
  const roleHintId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const errorIds = { firstName: useId(), lastName: useId(), role: useId() };
  const name = displayName(row);
  // Invited rows: role-only mode, no name or email fields (RN-08). The server does not trust this.
  const roleOnly = row.status === "invited";
  const unchanged =
    role === row.role &&
    (roleOnly || (values.firstName === (row.firstName ?? "") && values.lastName === (row.lastName ?? "")));

  // No maxLength on the inputs: a long paste is not cut, the error shows up instead (D-U1-6).
  function fieldError(field: NameField): string | undefined {
    return values[field].length > 50 ? TOO_LONG : errors[field];
  }

  function submit() {
    const parsed = editUserInputSchema.safeParse(
      roleOnly
        ? { id: row.id, role, expectedRole: row.role }
        : {
            id: row.id,
            ...values,
            role,
            expectedFirstName: row.firstName,
            expectedLastName: row.lastName,
            expectedRole: row.role,
          },
    );

    if (!parsed.success) {
      const next: Partial<Record<ErrorKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        const key = path === "firstName" || path === "lastName" || path === "role" ? path : "form";
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await updateUserAction(parsed.data);
      if (result.ok) onSaved();
      else setErrors({ form: result.error });
    });
  }

  function renderField(field: NameField, id: string, label: string, autoComplete: string) {
    const error = fieldError(field);
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id} className="text-[13px] text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          value={values[field]}
          autoComplete={autoComplete}
          disabled={isPending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorIds[field] : undefined}
          onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
        />
        {error ? (
          <p id={errorIds[field]} className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
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
        <DialogTitle className="text-[22px] leading-7 font-bold tracking-[-0.005em]">Editar usuario</DialogTitle>
      </DialogHeader>

      <div className="flex items-center gap-3">
        <UserAvatar id={row.id} name={name} imageUrl={imageUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{row.email}</p>
        </div>
      </div>

      {roleOnly ? null : (
        <>
          {renderField("firstName", firstId, "Nombre", "off")}
          {renderField("lastName", lastId, "Apellido", "off")}

          <div className="grid gap-1.5">
            <Label htmlFor={emailId} className="text-[13px] text-muted-foreground">
              Correo
            </Label>
            <Input id={emailId} value={row.email} disabled readOnly aria-describedby={emailHintId} />
            <p id={emailHintId} className="text-xs text-muted-foreground">
              El correo lo cambia la propia persona desde su perfil.
            </p>
          </div>
        </>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={roleId} className="text-[13px] text-muted-foreground">
          Rol
        </Label>
        <Select
          id={roleId}
          items={ROLE_ITEMS}
          value={role}
          disabled={isPending}
          onValueChange={(value) => value && setRole(value as Role)}
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-invalid={errors.role ? true : undefined}
            aria-describedby={errors.role ? errorIds.role : roleHintId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PANEL_ROLES.map((item) => (
              <SelectItem key={item} value={item}>
                <span>{ROLE_LABELS[item]}</span>
                <span className="text-muted-foreground">· {ROLE_HINTS[item]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role ? (
          <p id={errorIds.role} className="text-[13px] text-destructive">
            {errors.role}
          </p>
        ) : null}
        <p id={roleHintId} className="text-xs text-muted-foreground">
          Solo un administrador o un superadmin puede cambiar el rol.
        </p>
      </div>

      {errors.form ? (
        <p role="alert" className="text-[13px] text-destructive">
          {errors.form}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || unchanged}>
          Guardar cambios
        </Button>
      </DialogFooter>
    </form>
  );
}

// Edits name and role (role only for invited rows); the server repeats every check (RN-01, RN-04).
export function EditUserDialog({
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
        {row ? <EditForm {...formProps} row={row} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
