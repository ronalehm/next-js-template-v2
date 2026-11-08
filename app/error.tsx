"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Never render error.message or the stack: it may leak internals (E8).
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground">No se pudo cargar esta página. Inténtalo de nuevo.</p>
      <Button onClick={() => retry()}>Reintentar</Button>
    </main>
  );
}
