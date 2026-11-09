import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getActor } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";

export default async function Home() {
  const { userId } = await auth();
  const actor = userId ? await getActor() : null;

  if (actor && can(actor.role, "dashboard:view")) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Bienvenido</h1>
      {!userId ? (
        <SignInButton>
          <Button>Iniciar sesión</Button>
        </SignInButton>
      ) : (
        <>
          <UserButton />
          {actor ? (
            <p>
              Rol: <strong>{ROLE_LABELS[actor.role]}</strong>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Tu cuenta no tiene acceso. Pide una invitación a un administrador.
            </p>
          )}
        </>
      )}
    </main>
  );
}
