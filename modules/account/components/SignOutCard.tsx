"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Cerrar sesión (screen 10): confirms before calling Clerk's signOut (R25).
export function SignOutCard() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [pending, setPending] = useState(false);

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard");
  };

  const confirm = async () => {
    setPending(true);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      // Let the user try again instead of leaving both buttons disabled.
      setPending(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-105 items-center gap-3 rounded-[14px] p-6 text-center shadow-sheet ring-0">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <LogOut className="size-6" aria-hidden />
        </span>
        <h1 className="text-[22px] leading-7 font-bold">¿Cerrar sesión?</h1>
        <p className="text-sm text-muted-foreground">Tendrás que volver a iniciar sesión para entrar al panel.</p>
        {user ? (
          <div className="flex w-full items-center gap-3 rounded-xl bg-muted p-3 text-left">
            <UserAvatar id={user.id} name={name} imageUrl={user.hasImage ? user.imageUrl : null} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
        ) : null}
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={pending}>
            Cerrar sesión
          </Button>
        </div>
      </Card>
    </div>
  );
}
