"use client";

import { useId, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { inviteUserAction } from "../actions/users.actions";
import { inviteInputSchema } from "../schemas/users.schema";

type FormProps = { roles: Role[]; onInvited: () => void; onCancel: () => void };

// Mounted on each open (the popup unmounts when closed), so every invitation starts empty.
function InviteForm({ roles, onInvited, onCancel }: FormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(roles[0] ?? "user");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const emailId = useId();
  const roleId = useId();
  const errorId = useId();

  // Same validation as the server (R42); the server stays the authority.
  function submit() {
    const parsed = inviteInputSchema.safeParse({ email, role });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos no válidos.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction(parsed.data);
      if (result.ok) onInvited();
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
      <DialogHeader className="gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UserPlus className="size-5" aria-hidden />
        </span>
        <DialogTitle className="text-[22px] leading-7 font-bold tracking-[-0.005em]">Invitar usuario</DialogTitle>
        <DialogDescription>Recibirá un correo con un enlace para crear su cuenta.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor={emailId} className="text-[13px] text-muted-foreground">
          Correo
        </Label>
        <Input
          id={emailId}
          type="email"
          autoComplete="off"
          placeholder="nombre@empresa.com"
          value={email}
          disabled={isPending}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-9"
        />
        {error ? (
          <p id={errorId} className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
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
          <SelectTrigger className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((item) => (
              <SelectItem key={item} value={item}>
                {ROLE_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Solo un superadmin puede invitar administradores.</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          Enviar invitación
        </Button>
      </DialogFooter>
    </form>
  );
}

// Screen 04. `roles` are the ones the actor can assign (D37); for an admin, only "Usuario".
export function InviteUserDialog({
  open,
  onOpenChange,
  ...formProps
}: Omit<FormProps, "onCancel"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-110">
        <InviteForm {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
