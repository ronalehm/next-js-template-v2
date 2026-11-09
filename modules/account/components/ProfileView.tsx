"use client";

import { useId, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAX_CUSTOM_FIELDS } from "../schemas/profile.schema";
import type { CustomField, Profile, ProfileFieldKey } from "../types/profile.types";
import { formatPhone, PHONE_TYPE_LABELS } from "../utils/phone";
import { formatProfileValue, OPTIONAL_PROFILE_FIELDS, PROFILE_FIELD_LABELS } from "../utils/profileFields";
import { SectionLabel } from "./AccountSummary";
import { ProfileFieldDialog } from "./ProfileFieldDialog";

const ROW = "relative flex h-11 items-center gap-3 px-4 text-sm transition-colors hover:bg-accent";
const ROW_FOCUS = "has-focus-visible:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset";

// The button covers the whole row (after:inset-0); a link in the value stays clickable on top of it.
function Row({
  label,
  value,
  primary = false,
  onOpen,
}: {
  label: string;
  value?: React.ReactNode;
  primary?: boolean;
  onOpen: (opener: HTMLElement) => void;
}) {
  const valueId = useId();

  return (
    <div className={cn(ROW, ROW_FOCUS)}>
      <button
        type="button"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-describedby={value ? valueId : undefined}
        className={cn("min-w-0 flex-1 truncate text-left outline-none after:absolute after:inset-0", primary && "text-primary")}
      >
        {label}
      </button>
      {value ? (
        <span id={valueId} className="max-w-[60%] truncate text-muted-foreground">
          {value}
        </span>
      ) : null}
      <ChevronRight className="size-3.5 shrink-0 text-placeholder" aria-hidden />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <Card className="gap-0 divide-y overflow-hidden rounded-xl py-0 shadow-card ring-0">{children}</Card>
    </section>
  );
}

function FieldValue({ field, value }: { field: ProfileFieldKey; value: string }) {
  // Only http(s) becomes a link (R32), never javascript: or other schemes.
  if (field === "website" && /^https?:\/\//i.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="relative text-primary underline-offset-4 hover:underline"
      >
        {value}
      </a>
    );
  }

  return formatProfileValue(field, value);
}

// Ver perfil (screens 08 and 19, D29). Identity comes from Clerk and is edited only in its modal (D24);
// phone and optional fields come from the server as `profile` and are edited here (R30, R31).
export function ProfileView({
  profile: initialProfile,
  customFields: initialCustomFields = [],
}: {
  profile: Profile;
  customFields?: CustomField[];
}) {
  const { isLoaded, user } = useUser();
  const { openUserProfile } = useClerk();
  const [profile, setProfile] = useState(initialProfile);
  const [customFields, setCustomFields] = useState(initialCustomFields);
  const [customMode, setCustomMode] = useState(false);
  const [customId, setCustomId] = useState<string | null>(null);
  const [field, setField] = useState<ProfileFieldKey>("phone");
  const [dialogOpen, setDialogOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const addInfoTrigger = useRef<HTMLButtonElement>(null);

  if (!isLoaded || !user) {
    return <Skeleton className="h-96 w-full max-w-180 rounded-xl" />;
  }

  const openClerk = () => openUserProfile();
  const edit = (key: ProfileFieldKey, from: HTMLElement | null) => {
    opener.current = from;
    setCustomMode(false);
    setField(key);
    setDialogOpen(true);
  };
  // id null = new custom field.
  const editCustom = (id: string | null, from: HTMLElement | null) => {
    opener.current = from;
    setCustomMode(true);
    setCustomId(id);
    setDialogOpen(true);
  };
  const hasCustomRoom = customFields.length < MAX_CUSTOM_FIELDS;

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || "Usuario";
  const primaryEmail = user.primaryEmailAddress;
  // R30: without a primary email, only "Añadir correo". R8: only verified secondaries are listed.
  const secondaryEmails = primaryEmail
    ? user.emailAddresses.filter(
        (email) => email.id !== primaryEmail.id && email.verification?.status === "verified",
      )
    : [];
  const filledOptional = OPTIONAL_PROFILE_FIELDS.filter((key) => profile[key]);
  const missingOptional = OPTIONAL_PROFILE_FIELDS.filter((key) => !profile[key]);

  return (
    <div className="flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <UserAvatar id={user.id} name={name} imageUrl={user.hasImage ? user.imageUrl : null} size="lg" />
        <h1 className="mt-2 max-w-full truncate text-[22px] leading-7 font-bold tracking-[-0.005em]">{name}</h1>
        {primaryEmail ? (
          <p className="max-w-full truncate text-[13px] text-muted-foreground">{primaryEmail.emailAddress}</p>
        ) : null}
        <Button variant="link" className="h-auto px-0" onClick={openClerk}>
          Cambiar foto
        </Button>
      </header>

      <Group title="Información personal">
        <Row label="Nombre" value={user.firstName} onOpen={openClerk} />
        <Row label="Apellido" value={user.lastName} onOpen={openClerk} />
        {profile.phone ? (
          <Row
            label={PROFILE_FIELD_LABELS.phone}
            value={
              profile.phoneType
                ? `${PHONE_TYPE_LABELS[profile.phoneType]} · ${formatPhone(profile.phone)}`
                : formatPhone(profile.phone)
            }
            onOpen={(from) => edit("phone", from)}
          />
        ) : (
          <Row label="Añadir teléfono" primary onOpen={(from) => edit("phone", from)} />
        )}
        {filledOptional.map((key) => (
          <Row
            key={key}
            label={PROFILE_FIELD_LABELS[key]}
            value={<FieldValue field={key} value={profile[key] as string} />}
            onOpen={(from) => edit(key, from)}
          />
        ))}
        {customFields.map((item) => (
          <Row key={item.id} label={item.label} value={item.value} onOpen={(from) => editCustom(item.id, from)} />
        ))}
        {missingOptional.length > 0 || hasCustomRoom ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={addInfoTrigger}
              className={cn(ROW, "w-full text-left text-primary outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset")}
            >
              + Añadir información
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60 rounded-xl shadow-popover">
              {missingOptional.map((key) => (
                <DropdownMenuItem key={key} onClick={() => edit(key, addInfoTrigger.current)}>
                  {PROFILE_FIELD_LABELS[key]}
                </DropdownMenuItem>
              ))}
              {hasCustomRoom ? (
                <>
                  {missingOptional.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onClick={() => editCustom(null, addInfoTrigger.current)}>
                    Campo personalizado…
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </Group>

      <Group title="Correos">
        {primaryEmail ? (
          <Row label={primaryEmail.emailAddress} value={<Badge variant="secondary">Principal</Badge>} onOpen={openClerk} />
        ) : null}
        {secondaryEmails.map((email) => (
          <Row key={email.id} label={email.emailAddress} onOpen={openClerk} />
        ))}
        <Row label="Añadir correo" primary onOpen={openClerk} />
      </Group>

      <Group title="Seguridad">
        <Row label="Contraseña" onOpen={openClerk} />
        <Row label="Sesiones activas" onOpen={openClerk} />
      </Group>

      <ProfileFieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        finalFocus={() => (opener.current?.isConnected ? opener.current : null)}
        field={field}
        value={profile[field]}
        phoneType={profile.phoneType}
        onSaved={(saved) => {
          setProfile(saved);
          setDialogOpen(false);
        }}
        custom={
          customMode
            ? {
                fields: customFields,
                id: customId,
                onChange: setCustomFields,
                onSaved: (saved) => {
                  setCustomFields(saved);
                  setDialogOpen(false);
                },
              }
            : undefined
        }
      />
    </div>
  );
}
