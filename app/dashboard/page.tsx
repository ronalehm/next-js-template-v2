import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";

export default async function DashboardPage() {
  const actor = await requirePermission("dashboard:view");

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <p className="text-muted-foreground">
        Hola. Tu rol es <strong>{ROLE_LABELS[actor.role]}</strong>.
      </p>
    </div>
  );
}
