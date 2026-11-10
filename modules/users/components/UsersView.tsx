"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Ellipsis, Eye, Search, UserPlus, UserX } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
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
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { activateUserAction, resendInvitationAction, revokeUserAction } from "../actions/users.actions";
import { usersQuerySchema } from "../schemas/users.schema";
import type { ActionResult, ClerkActivity, SortKey, UserRow, UsersPage, UsersQuery } from "../types/users.types";
import { canSeeIdentity, identityOf } from "../utils/identityStatus";
import { assignableRoles, rowActions } from "../utils/userPermissions";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { IdentityBadge } from "./IdentityBadge";
import { InviteUserDialog } from "./InviteUserDialog";
import { RecoverUserDialog } from "./RecoverUserDialog";
import { displayName, formatLastAccess, StatusBadge, UserDetailSheet } from "./UserDetailSheet";

const BASE_PATH = "/dashboard/users";
const DEFAULT_QUERY = usersQuerySchema.parse({});
const SEARCH_DELAY_MS = 300;
const PAGE_SIZE = 8;

const STATUS_FILTERS: Record<UsersQuery["status"], string> = {
  all: "Todos",
  active: "Activos",
  revoked: "Inactivos",
  invited: "Invitados",
};
const ROLE_FILTERS: Record<UsersQuery["role"], string> = { all: "Todos", ...ROLE_LABELS };
const SORT_LABELS: Record<SortKey, string> = {
  name: "Nombre A–Z",
  "-name": "Nombre Z–A",
  email: "Correo A–Z",
  "-created": "Alta más reciente",
};

// Only non-default values go to the URL; the page validates them again (R39).
function usersHref(query: UsersQuery): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_QUERY) as (keyof UsersQuery)[]) {
    if (query[key] !== DEFAULT_QUERY[key]) params.set(key, String(query[key]));
  }
  const search = params.toString();
  return search ? `${BASE_PATH}?${search}` : BASE_PATH;
}

type Notice = { ok: boolean; text: string };

// R44: same alert style as screen 06. Stays open with the error if it fails.
function RevokeDialog({
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const invited = row?.status === "invited";

  function confirm() {
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeUserAction({ id: row.id });
      if (result.ok) onDone(invited ? "Invitación revocada." : "Usuario inactivado.");
      else setError(result.error);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent size="sm" finalFocus={finalFocus} className="data-[size=sm]:max-w-85">
        <AlertDialogHeader>
          <AlertDialogMedia className="size-12 rounded-full bg-destructive-soft text-destructive">
            <UserX aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-[17px] leading-[22px] font-semibold">
            {row ? (invited ? `¿Revocar la invitación de ${row.email}?` : `¿Inactivar a ${displayName(row)}?`) : null}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {invited
              ? "La invitación dejará de funcionar y no podrá reactivarse."
              : "Perderá el acceso en su próxima acción. Podrás activarlo de nuevo."}
          </AlertDialogDescription>
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={isPending} onClick={confirm}>
            Inactivar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Screens 01, 03, 07, 15 and 16. The UI only hides: every action and the page check permissions on the server (R47).
export function UsersView({
  actor,
  page,
  query,
  activity,
}: {
  actor: { id: string; role: Role };
  page: UsersPage;
  query: UsersQuery;
  activity: ClerkActivity;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [isActing, startAction] = useTransition();
  const [search, setSearch] = useState(query.q);
  const [searchPending, setSearchPending] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<UserRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [revokeRow, setRevokeRow] = useState<UserRow | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<UserRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recoverRow, setRecoverRow] = useState<UserRow | null>(null);
  const [recoverOpen, setRecoverOpen] = useState(false);

  // A pending search must not navigate back here after leaving the page.
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const finalFocus = () => (opener.current?.isConnected ? opener.current : null);
  const isSuperadmin = actor.role === "superadmin";
  const hasFilters = query.q !== "" || query.status !== "all" || query.role !== "all";

  // Follows navigations made elsewhere (sidebar link, back button) with another q. Skipped while this view
  // is searching or navigating, so a slower response never overwrites what is being typed.
  if (!searchPending && !isNavigating && search.trim() !== query.q.trim()) {
    setSearch(query.q);
  }

  function cancelSearch() {
    clearTimeout(searchTimer.current);
    setSearchPending(false);
  }

  // Each change goes back to page 1 unless it is the page itself (R39). It carries the typed search and
  // cancels its pending timer, so that timer never overwrites this change with an older query.
  function navigate(changes: Partial<UsersQuery>) {
    cancelSearch();
    startNavigation(() => router.replace(usersHref({ ...query, q: search.trim(), page: 1, ...changes })));
  }

  function onSearch(value: string) {
    setSearch(value);
    setSearchPending(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: value.trim() }), SEARCH_DELAY_MS);
  }

  function clearFilters() {
    cancelSearch();
    setSearch("");
    startNavigation(() => router.replace(BASE_PATH));
  }

  function runAction(action: () => Promise<ActionResult>, success: string) {
    setNotice(null);
    startAction(async () => {
      const result = await action();
      setNotice(result.ok ? { ok: true, text: success } : { ok: false, text: result.error });
    });
  }

  function openDetail(row: UserRow) {
    setDetailRow(row);
    setDetailOpen(true);
  }

  function openEdit(row: UserRow) {
    setEditRow(row);
    setEditOpen(true);
  }

  const from = page.total === 0 ? 0 : (page.page - 1) * PAGE_SIZE + 1;
  const to = (page.page - 1) * PAGE_SIZE + page.rows.length;

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-[38px] font-bold tracking-[-0.01em]">Usuarios</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {isSuperadmin
              ? `${page.total} ${page.total === 1 ? "usuario" : "usuarios"}`
              : "Puedes gestionar a quienes tienen rol Usuario"}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus aria-hidden />
          Invitar usuario
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-75">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-placeholder" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar por nombre o correo"
            maxLength={100}
            className="border-0 bg-secondary pl-8 placeholder:text-placeholder dark:bg-secondary"
          />
        </div>

        <ToggleGroup
          aria-label="Estado"
          value={[query.status]}
          onValueChange={(value: string[]) => {
            const status = value[0] as UsersQuery["status"] | undefined;
            if (status) navigate({ status });
          }}
          spacing={0}
          className="rounded-lg bg-secondary p-0.5"
        >
          {(Object.keys(STATUS_FILTERS) as UsersQuery["status"][]).map((status) => (
            <ToggleGroupItem
              key={status}
              value={status}
              size="sm"
              className="h-7 rounded-md! px-3 text-[13px] data-pressed:bg-segment-active data-pressed:font-medium data-pressed:shadow-control"
            >
              {STATUS_FILTERS[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <Select
            items={ROLE_FILTERS}
            value={query.role}
            onValueChange={(value) => value && navigate({ role: value as UsersQuery["role"] })}
          >
            <SelectTrigger className="bg-card shadow-control">
              <SelectValue>{(value: UsersQuery["role"]) => `Rol: ${ROLE_FILTERS[value]}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_FILTERS) as UsersQuery["role"][]).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_FILTERS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={SORT_LABELS}
            value={query.sort}
            onValueChange={(value) => value && navigate({ sort: value as SortKey })}
          >
            <SelectTrigger className="bg-card shadow-control">
              <SelectValue>{(value: SortKey) => `Ordenar: ${SORT_LABELS[value]}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Always mounted so screen readers announce each new message; only its content changes. */}
      <p
        role="status"
        className={cn("text-[13px] empty:sr-only", notice?.ok ? "text-success" : "text-destructive")}
      >
        {notice?.text}
      </p>

      <Card
        aria-busy={isNavigating || isActing}
        className={cn("gap-0 rounded-xl py-0 shadow-card ring-0 transition-opacity", isNavigating && "opacity-70")}
      >
        {page.rows.length === 0 ? (
          <div className="flex min-h-110 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Search className="size-6" aria-hidden />
            </span>
            <p className="text-[17px] leading-[22px] font-semibold">
              {query.q ? `Sin resultados para “${query.q}”` : "Sin resultados"}
            </p>
            {hasFilters ? (
              <>
                <p className="text-sm text-muted-foreground">Prueba con otro nombre o correo, o quita los filtros.</p>
                <Button variant="link" onClick={clearFilters}>
                  Quitar filtros
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <Table className="min-w-160">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-4 text-xs font-normal text-muted-foreground">Nombre</TableHead>
                <TableHead className="h-9 w-37.5 px-4 text-xs font-normal text-muted-foreground">Rol</TableHead>
                <TableHead className="h-9 w-30 px-4 text-xs font-normal text-muted-foreground">Estado</TableHead>
                <TableHead className="h-9 w-30 px-4 text-xs font-normal text-muted-foreground">Último acceso</TableHead>
                <TableHead className="h-9 w-20 px-4">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => {
                const name = displayName(row);
                const actions = rowActions(actor, row);
                const hasActions = actions.edit || actions.revoke || actions.activate || actions.resend || actions.remove || actions.recover;

                return (
                  <TableRow key={row.id} className="hover:bg-accent">
                    <TableCell className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar id={row.id} name={name} imageUrl={activity[row.id]?.imageUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="truncate text-[13px] text-muted-foreground">{row.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">{ROLE_LABELS[row.role]}</TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={row.status} />
                        {row.status === "active" && canSeeIdentity(actor.role, row.role) ? (
                          <IdentityBadge state={identityOf(row, activity[row.id])} />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">
                      <span suppressHydrationWarning>{formatLastAccess(activity[row.id]?.lastSignInAt)}</span>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ver detalles de ${name}`}
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            openDetail(row);
                          }}
                        >
                          <Eye />
                        </Button>
                        {hasActions ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon-sm" aria-label={`Más acciones para ${name}`} />}
                              onClick={(event) => {
                                opener.current = event.currentTarget;
                              }}
                            >
                              <Ellipsis />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-50 rounded-xl shadow-popover">
                              <DropdownMenuItem onClick={() => openDetail(row)}>Ver detalles</DropdownMenuItem>
                              {actions.edit ? (
                                <DropdownMenuItem onClick={() => openEdit(row)}>Editar</DropdownMenuItem>
                              ) : null}
                              {actions.activate ? (
                                <DropdownMenuItem
                                  disabled={isActing}
                                  onClick={() => runAction(() => activateUserAction({ id: row.id }), "Usuario activado.")}
                                >
                                  Activar
                                </DropdownMenuItem>
                              ) : null}
                              {actions.resend ? (
                                <DropdownMenuItem
                                  disabled={isActing}
                                  onClick={() => runAction(() => resendInvitationAction({ id: row.id }), "Invitación reenviada.")}
                                >
                                  Reenviar invitación
                                </DropdownMenuItem>
                              ) : null}
                              {actions.recover ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRecoverRow(row);
                                    setRecoverOpen(true);
                                  }}
                                >
                                  Recuperar acceso
                                </DropdownMenuItem>
                              ) : null}
                              {actions.revoke ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => {
                                      setRevokeRow(row);
                                      setRevokeOpen(true);
                                    }}
                                  >
                                    Inactivar
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {actions.remove ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => {
                                      setDeleteRow(row);
                                      setDeleteOpen(true);
                                    }}
                                  >
                                    Eliminar definitivamente
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          // R39: without actions the slot is kept so the columns stay aligned.
                          <span aria-hidden className="size-7" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
          <span>{page.total === 0 ? "0 resultados" : `${from}–${to} de ${page.total} usuarios`}</span>
          <div className="flex items-center gap-2">
            <span>
              Página {page.page} de {page.pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={page.page <= 1}
              onClick={() => navigate({ page: page.page - 1 })}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Página siguiente"
              disabled={page.page >= page.pageCount}
              onClick={() => navigate({ page: page.page + 1 })}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={assignableRoles(actor.role)}
        onInvited={() => {
          setInviteOpen(false);
          setNotice({ ok: true, text: "Invitación enviada." });
        }}
      />

      <UserDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        row={detailRow}
        activity={detailRow ? activity[detailRow.id] : undefined}
        identity={
          detailRow && canSeeIdentity(actor.role, detailRow.role)
            ? identityOf(detailRow, activity[detailRow.id])
            : null
        }
        canEdit={detailRow ? rowActions(actor, detailRow).edit : false}
        onEdit={() => {
          setDetailOpen(false);
          if (detailRow) openEdit(detailRow);
        }}
        finalFocus={finalFocus}
      />

      <EditUserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        row={editRow}
        imageUrl={editRow ? (activity[editRow.id]?.imageUrl ?? null) : null}
        finalFocus={finalFocus}
        onSaved={() => {
          setEditOpen(false);
          setNotice({ ok: true, text: "Usuario actualizado." });
        }}
      />

      <RevokeDialog
        row={revokeRow}
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        finalFocus={finalFocus}
        onDone={(text) => {
          setRevokeOpen(false);
          setNotice({ ok: true, text });
        }}
      />

      <RecoverUserDialog
        row={recoverRow}
        open={recoverOpen}
        onOpenChange={setRecoverOpen}
        finalFocus={finalFocus}
        onDone={(text) => {
          setRecoverOpen(false);
          setNotice({ ok: true, text });
        }}
      />

      <DeleteUserDialog
        row={deleteRow}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        finalFocus={finalFocus}
        onDone={(text) => {
          setDeleteOpen(false);
          setNotice({ ok: true, text });
        }}
      />
    </div>
  );
}
