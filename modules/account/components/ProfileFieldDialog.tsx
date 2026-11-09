"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateProfileFieldAction } from "../actions/profile.actions";
import { profileFieldInputSchema } from "../schemas/profile.schema";
import type { Profile, ProfileFieldInput, ProfileFieldKey } from "../types/profile.types";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  PHONE_TYPE_LABELS,
  PHONE_TYPES,
  phoneCountryLabel,
  splitPhone,
  type PhoneCountry,
  type PhoneType,
} from "../utils/phone";
import { PROFILE_FIELD_LABELS } from "../utils/profileFields";
import { CustomFieldForm, type CustomDialogProps } from "./CustomFieldForm";

const INPUT_TYPES: Partial<Record<ProfileFieldKey, string>> = { birthday: "date", website: "url" };

// Same tokens as Input, shared by the textarea and the native selects (R6).
const FIELD_CLASS =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

type FieldFormProps = {
  field: ProfileFieldKey;
  value: string | null;
  phoneType: PhoneType | null;
  onSaved: (profile: Profile) => void;
  onCancel: () => void;
};

// Mounted on each open (the popup unmounts when closed), so the draft always starts from the saved value.
function FieldForm({ field, value, phoneType, onSaved, onCancel }: FieldFormProps) {
  const isPhone = field === "phone";
  // R2: a saved phone opens split into country and national number.
  const savedPhone = isPhone && value ? splitPhone(value) : null;
  // Frozen at mount: the saved profile updates before the 100 ms close animation ends, which would flip the title and "Quitar".
  const [initial] = useState(value);
  const [draft, setDraft] = useState(savedPhone?.national ?? value ?? "");
  const [country, setCountry] = useState<PhoneCountry>(savedPhone?.country ?? DEFAULT_PHONE_COUNTRY);
  // D7: the saved type, or Personal.
  const [type, setType] = useState<PhoneType>(phoneType ?? "personal");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputId = useId();
  const countryId = useId();
  const typeId = useId();
  const errorId = useId();
  const label = PROFILE_FIELD_LABELS[field];

  // Same validation as the server (R32); the server stays the authority. An empty value removes the field.
  // The raw input is sent, not parsed.data: the transforms are not idempotent (R6).
  function save(next: string | null) {
    const input: ProfileFieldInput =
      field === "phone"
        ? { field, value: next === null ? null : { country, national: next, type } }
        : { field, value: next };
    const parsed = profileFieldInputSchema.safeParse(input);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos no válidos.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateProfileFieldAction(input);

      if (result.ok) {
        onSaved(result.profile);
      } else {
        setError(result.error);
      }
    });
  }

  const fieldProps = {
    id: inputId,
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">
          {initial ? "Editar" : "Añadir"} {label.toLowerCase()}
        </DialogTitle>
      </DialogHeader>

      {isPhone ? (
        <div className="grid gap-2">
          <Label htmlFor={countryId}>País</Label>
          <select
            id={countryId}
            value={country}
            disabled={isPending}
            onChange={(event) => setCountry(event.target.value as PhoneCountry)}
            className={cn(FIELD_CLASS, "h-8")}
          >
            {PHONE_COUNTRIES.map(({ code }) => (
              <option key={code} value={code}>
                {phoneCountryLabel(code)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={inputId}>{isPhone ? "Número" : label}</Label>
        {field === "note" ? (
          <textarea {...fieldProps} rows={4} className={cn(FIELD_CLASS, "resize-none py-2")} />
        ) : isPhone ? (
          <Input {...fieldProps} type="tel" inputMode="tel" autoComplete="tel-national" disabled={isPending} />
        ) : (
          <Input {...fieldProps} type={INPUT_TYPES[field] ?? "text"} />
        )}
        {error ? (
          <p id={errorId} className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {isPhone ? (
        <div className="grid gap-2">
          <Label htmlFor={typeId}>Tipo</Label>
          <select
            id={typeId}
            value={type}
            disabled={isPending}
            onChange={(event) => setType(event.target.value as PhoneType)}
            className={cn(FIELD_CLASS, "h-8")}
          >
            {PHONE_TYPES.map((item) => (
              <option key={item} value={item}>
                {PHONE_TYPE_LABELS[item]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <DialogFooter className="sm:justify-between">
        {initial ? (
          <Button type="button" variant="destructive" disabled={isPending} onClick={() => save(null)}>
            Quitar
          </Button>
        ) : (
          <span aria-hidden className="hidden sm:block" />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            Guardar
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

// R31: one field per dialog. On error it stays open, keeps the draft and shows the message next to the field.
export function ProfileFieldDialog({
  open,
  onOpenChange,
  finalFocus,
  custom,
  ...formProps
}: Omit<FieldFormProps, "onCancel"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: () => HTMLElement | null;
  // When present, the dialog edits a custom field instead of a fixed one.
  custom?: CustomDialogProps;
}) {
  const onCancel = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="sm:max-w-110">
        {custom ? <CustomFieldForm {...custom} onCancel={onCancel} /> : <FieldForm {...formProps} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  );
}
