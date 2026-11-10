import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IDENTITY_LABELS } from "../utils/identityStatus";
import type { IdentityState } from "../types/users.types";

type IdentityBadgeProps = {
  state: IdentityState;
  // false (table): warning only for not_found, otherwise nothing. true (detail): the state label.
  detail?: boolean;
  className?: string;
};

export function IdentityBadge({ state, detail = false, className }: IdentityBadgeProps) {
  if (detail) {
    return (
      <Badge variant={state === "not_found" ? "destructive" : "secondary"} className={className}>
        {IDENTITY_LABELS[state]}
      </Badge>
    );
  }
  if (state !== "not_found") return null;
  return (
    <Badge variant="destructive" className={className}>
      <TriangleAlert aria-hidden="true" data-icon="inline-start" />
      Identidad no encontrada
    </Badge>
  );
}
