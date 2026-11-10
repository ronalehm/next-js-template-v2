"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { recoverUserAccessAction } from "../actions/users.actions";
import type { UserRow } from "../types/users.types";

// RN-11: admin rows need the identity attestation checkbox; the server decides and revalidates it (RN-04).
// Only `id` (and `identityVerified` for admin rows) is sent; the server reads the Clerk id and role.
export function RecoverUserDialog({
  row,
  open,
  onOpenChange,
  onDone,
  finalFocus,
}: {
  row: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
  finalFocus: () => HTMLElement | null;
}) {
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const needsVerification = row?.role === "admin";

  function confirm() {
    if (!row || (needsVerification && !verified)) return;
    setError(null);
    startTransition(async () => {
      const result = await recoverUserAccessAction(
        needsVerification ? { id: row.id, identityVerified: true } : { id: row.id },
      );
      if (result.ok) onDone("Acceso recuperado. Se envió una invitación nueva.");
      else setError(result.error);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setVerified(false);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent size="sm" finalFocus={finalFocus} className="data-[size=sm]:max-w-85">
        <AlertDialogHeader>
          <AlertDialogMedia className="size-12 rounded-full bg-secondary text-foreground">
            <KeyRound aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-[17px] leading-[22px] font-semibold">
            {row ? `¿Recuperar el acceso de ${row.email}?` : null}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Si su cuenta ya no existe, la fila volverá a Invitado conservando su rol y perfil, y se enviará una
            invitación nueva.
          </AlertDialogDescription>
          {needsVerification ? (
            <div className="flex items-start gap-2 text-left">
              <input
                id="recover-identity-verified"
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
                disabled={isPending}
                className="mt-0.5 size-4 shrink-0"
              />
              <Label htmlFor="recover-identity-verified" className="font-normal">
                Confirmo que verifiqué la identidad de esta persona por un canal administrativo fuera de banda.
              </Label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button disabled={(needsVerification && !verified) || isPending} onClick={confirm}>
            Recuperar acceso
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
