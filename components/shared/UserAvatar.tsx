import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-20 text-[28px]",
} as const;

const GRADIENTS = 6;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

// Stable per user: the same id always gets the same gradient (D26).
function gradientFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `avatar-gradient-${hash % GRADIENTS}`;
}

export function UserAvatar({
  id,
  name,
  imageUrl,
  size = "sm",
  className,
}: {
  id: string;
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback className={cn("font-semibold text-primary-foreground", gradientFor(id))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
