"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCustomFieldAction,
  deleteCustomFieldAction,
  moveCustomFieldAction,
  updateCustomFieldAction,
} from "../actions/profile.actions";
import { addCustomFieldInputSchema, updateCustomFieldInputSchema } from "../schemas/profile.schema";
import type { CustomField, CustomFieldDirection, CustomFieldsActionResult } from "../types/profile.types";

export type CustomDialogProps = {
  // Saved fields in position order; `id` is the one being edited, or null for a new one.
  fields: CustomField[];
  id: string | null;
  // Moving persists at once and keeps the dialog open.
  onChange: (fields: CustomField[]) => void;
  // Save or delete: the parent replaces its list and closes the dialog.
  onSaved: (fields: CustomField[]) => void;
};

type Errors = { label?: string; value?: string; form?: string };

// Mounted on each open, so the draft starts from the saved field.
export function CustomFieldForm({
  fields,
  id,
  onChange,
  onSaved,
  onCancel,
}: CustomDialogProps & { onCancel: () => void }) {
  // Frozen at mount: after delete the field leaves `fields` before the close animation ends.
  const [initial] = useState(() => fields.find((item) => item.id === id) ?? null);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [moveError, setMoveError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const focusAfter = useRef<CustomFieldDirection | null>(null);
  const [isPending, startTransition] = useTransition();
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const valueId = useId();
  const labelErrorId = useId();
  const valueErrorId = useId();
  const formErrorId = useId();
  const moveErrorId = useId();

  const index = fields.findIndex((item) => item.id === id);
  const saved = index >= 0 ? fields[index] : initial;
  const isLast = index === fields.length - 1;

  // Focus stays on the pressed button; if it became disabled (field at an end), it goes to the opposite one.
  useEffect(() => {
    const direction = focusAfter.current;
    if (!direction || isPending) return;
    const atEnd = direction === "up" ? index <= 0 : isLast;
    const target = (direction === "up") === atEnd ? downRef : upRef;
    target.current?.focus();
    focusAfter.current = null;
  }, [isPending, index, isLast]);

  function run(action: () => Promise<CustomFieldsActionResult>, done: (fields: CustomField[]) => void, fail: (error: string) => void) {
    startTransition(async () => {
      const result = await action();

      if (result.ok) {
        done(result.customFields);
      } else {
        fail(result.error);
      }
    });
  }

  // Same validation as the server; the server stays the authority. Raw input is sent, not parsed.data.
  function save() {
    const input = id ? { id, label, value } : { label, value };
    const parsed = (id ? updateCustomFieldInputSchema : addCustomFieldInputSchema).safeParse(input);

    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "label" ? "label" : issue.path[0] === "value" ? "value" : "form";
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    run(
      () => (id ? updateCustomFieldAction(input) : addCustomFieldAction(input)),
      onSaved,
      (error) => setErrors({ form: error }),
    );
  }

  function remove() {
    if (!id) return;
    setErrors({});
    run(() => deleteCustomFieldAction({ id }), onSaved, (error) => setErrors({ form: error }));
  }

  function move(direction: CustomFieldDirection) {
    if (!id || !saved) return;
    setMoveError(null);
    focusAfter.current = direction;
    run(
      () => moveCustomFieldAction({ id, direction }),
      (next) => {
        const position = next.findIndex((item) => item.id === id) + 1;
        setStatus(`«${saved.label}» movido a la posición ${position} de ${next.length}`);
        onChange(next);
      },
      (error) => {
        setMoveError(error);
        setStatus(error);
      },
    );
  }

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">
          {initial ? "Editar campo personalizado" : "Añadir campo personalizado"}
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={labelId}>Etiqueta</Label>
        <Input
          id={labelId}
          value={label}
          disabled={isPending}
          onChange={(event) => setLabel(event.target.value)}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? labelErrorId : undefined}
        />
        {errors.label ? (
          <p id={labelErrorId} className="text-[13px] text-destructive">
            {errors.label}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={valueId}>Valor</Label>
        <Input
          id={valueId}
          value={value}
          disabled={isPending}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={errors.value || errors.form ? true : undefined}
          aria-describedby={errors.value ? valueErrorId : errors.form ? formErrorId : undefined}
        />
        {errors.value ? (
          <p id={valueErrorId} className="text-[13px] text-destructive">
            {errors.value}
          </p>
        ) : null}
        {errors.form ? (
          <p id={formErrorId} className="text-[13px] text-destructive">
            {errors.form}
          </p>
        ) : null}
      </div>

      {initial && saved ? (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Button
              ref={upRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Subir «${saved.label}»`}
              aria-describedby={moveError ? moveErrorId : undefined}
              disabled={isPending || index <= 0}
              onClick={() => move("up")}
            >
              <ChevronUp aria-hidden />
              Subir
            </Button>
            <Button
              ref={downRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Bajar «${saved.label}»`}
              aria-describedby={moveError ? moveErrorId : undefined}
              disabled={isPending || isLast}
              onClick={() => move("down")}
            >
              <ChevronDown aria-hidden />
              Bajar
            </Button>
          </div>
          {moveError ? (
            <p id={moveErrorId} className="text-[13px] text-destructive">
              {moveError}
            </p>
          ) : null}
        </div>
      ) : null}

      <p role="status" className="sr-only">
        {status}
      </p>

      <DialogFooter className="sm:justify-between">
        {initial ? (
          <Button type="button" variant="destructive" disabled={isPending} onClick={remove}>
            Eliminar
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
