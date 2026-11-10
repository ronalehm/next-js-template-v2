"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteUserAction } from "../actions/users.actions";
import type { UserRow } from "../types/users.types";

// RN-07: "Eliminar" only enables when the typed text equals the row email (trim, case-insensitive).
// The server revalidates it and reports CHANGED / PARTIAL_DELETE through result.error.
export function DeleteUserDialog({
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
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const matches = !!row && text.trim().toLowerCase() === row.email.toLowerCase();

  function confirm() {
    if (!row || !matches) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUserAction({ id: row.id, email: row.email });
      if (result.ok) onDone("Usuario eliminado.");
      else setError(result.error);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setText("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent size="sm" finalFocus={finalFocus} className="data-[size=sm]:max-w-85">
        <AlertDialogHeader>
          <AlertDialogMedia className="size-12 rounded-full bg-destructive-soft text-destructive">
            <Trash2 aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-[17px] leading-[22px] font-semibold">
            {row ? `¿Eliminar definitivamente a ${row.email}?` : null}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se borrarán su cuenta, su perfil y sus datos. No se puede deshacer. El correo quedará libre y podrá
            invitarse de nuevo.
          </AlertDialogDescription>
          <div className="grid gap-1.5 text-left">
            <Label htmlFor="delete-user-email">Escribe el correo para confirmar</Label>
            <Input
              id="delete-user-email"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={row?.email}
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={!matches || isPending} onClick={confirm}>
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
