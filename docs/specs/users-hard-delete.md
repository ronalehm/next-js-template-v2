# Borrado definitivo de usuarios (USERS-DELETE)

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-hard-delete
- Riesgo: alto (borrado irreversible de datos personales en Neon y de la cuenta en Clerk; autorización por rol)
- Ruta: SDD-ADVANCED (disparadores: autorización, roles y permisos; borrado de registros; datos personales; integración externa con Clerk)
- Fase actual: Fase 1

## Objetivo

Que un superadmin pueda eliminar de forma definitiva a un usuario o administrador desde `/dashboard/users`: su cuenta en Clerk y su fila en `app_users` (con su perfil y campos personalizados por cascada). Hoy "Inactivar" (`revokeUser`) solo cambia `status` a `revoked` y el correo queda bloqueado para siempre (`inviteUser`: "Ese correo fue inactivado y no puede invitarse de nuevo"); no hay forma de limpiar usuarios de prueba ni de liberar un correo. Solo existe DEV; no hay PROD operativo, pero la spec se diseña como si lo hubiera.

## Estado actual verificado en código

- **Neon** (`db/migrations/0001..0004`): `app_users` (`id uuid pk`, `clerk_user_id text unique` nullable, `email unique` lower, `role`, `status in (invited, active, revoked)`, `invitation_id unique`). `user_profiles.user_id` (pk) y `user_profile_custom_fields.user_id` referencian `app_users(id)` con `on delete cascade`. No hay otras tablas que referencien `app_users` (grep del esquema y de `modules/`, `lib/`, `app/`: solo `lib/auth.ts`, `modules/users/**`, `modules/account/**`). No hay tabla de auditoría ni webhooks de Clerk (`auth-clerk-neon.md` D2: "Vinculación sin webhooks").
- **Clerk**: identidad solamente. `lib/auth.ts` `findActor` resuelve rol y estado siempre desde `app_users` por `clerk_user_id`; sin fila vinculada y sin fila `invited` con ese correo verificado, el usuario autenticado no tiene acceso. Por tanto, una cuenta Clerk sin fila no accede a nada.
- **Permisos**: `lib/roles.ts` (`can`, `canManageRole`: actor estrictamente por encima del objetivo, así que nadie gestiona a un superadmin). `modules/users/utils/userPermissions.ts` `rowActions` oculta opciones en UI y `users.service.ts` repite la matriz (D37) leyendo la fila de Neon (`readRow` + `rowActions(actor, {id, ...row})`, como `revokeUser`). Las server actions (`modules/users/actions/users.actions.ts`: `authorize` + `mutate`) exigen sesión, fila activa, `users:manage` y schema estricto.
- **Patrón de dos sistemas** (`users-admin-edit.md` RN-06, `updateUserName`): Clerk primero, luego `update` condicional en Neon; sin rollback ni reintentos automáticos; estado parcial con mensaje propio (`PARTIAL`), reintento manual idempotente.
- **Revocar invitación**: `revokeInvitation(invitationId)` en `users.service.ts` (404 cuenta como hecho, otro error aborta antes de tocar Neon).
- **UI**: `UsersView.tsx` contiene `RevokeDialog` (AlertDialog `size="sm"`, `AlertDialogMedia`, error `role="alert"`, `useTransition`, `finalFocus`). `EditUserDialog.tsx` usa `Dialog`. Componentes de `components/ui/`: `alert-dialog`, `dialog`, `input`, `label`, `button`, `dropdown-menu`.
- **Guarda existente a actualizar**: `users.service.test.ts` describe "module source (CA-15, R48)" prohíbe `delete from|deleteUser|deleteInvitation` en cualquier archivo no-test de `modules/users`. Este cambio lo contradice a propósito; se reescribe (ver RN-10).

## Alcance y reglas

- Incluye: acción "Eliminar definitivamente" para superadmin sobre filas de rol `user` o `admin` en cualquier estado (`active`, `revoked`, `invited`); service `deleteUser`; server action `deleteUserAction`; schema de entrada; diálogo de confirmación escribiendo el correo; actualización de `rowActions`; pruebas.
- No incluye: borrar superadmins ni la propia cuenta; borrado por admins; borrado en lote; papelera/restauración (soft-delete con purga); tabla de auditoría; webhook `user.deleted` de Clerk; migraciones o cambios de esquema; botón de borrar en `UserDetailSheet`; borrar la cuenta propia desde `/dashboard/profile`; limpieza retroactiva de cuentas Clerk huérfanas.
- RN-01: Solo `superadmin` puede eliminar. Objetivos válidos: filas `user` y `admin`. Se aplica en el servidor (`rowActions` en el service y condición SQL), no solo en UI.
- RN-02: Nunca se elimina la fila del propio actor (`id` y `clerk_user_id`) ni ninguna fila `superadmin` (cualquier estado).
- RN-03: Cubre las cuatro formas de fila: (a) `active`/`revoked` con `clerk_user_id` → borrar usuario Clerk + fila; (b) `invited` con `invitation_id` → revocar invitación Clerk + fila; (c) `revoked` sin `clerk_user_id` (invitación revocada) → solo fila; (d) `invited` sin `invitation_id` → solo fila.
- RN-04: Orden **Clerk primero, Neon después** (alternativa recomendada, ver "Fallos"). Todas las comprobaciones de permiso y de objetivo ocurren **antes** de llamar a Clerk (la acción de Clerk es irreversible). La clasificación de errores de Clerk es la de RN-11.
- RN-05: El `delete` de Neon es una sola sentencia condicional sobre lo leído antes de llamar a Clerk (`id`, `email`, `role` leído (`role = $role`) y `role <> 'superadmin'`, `status`, `clerk_user_id`, `invitation_id`, `id <> actor.id`; además `clerk_user_id is distinct from actor.clerkUserId` si se dispone de él); 0 filas = `CHANGED` si no hubo llamada a Clerk, `PARTIAL_DELETE` si la hubo (RN-06). Perfil y campos personalizados se borran por `on delete cascade`; no se necesita migración.
- RN-06: Estado parcial (Clerk borrado, Neon falló o devolvió 0 filas): `{ ok: false }` con mensaje de estado parcial, log `step: "neon-after-clerk"`. Sin rollback ni reintentos automáticos; reintentar es idempotente (Clerk 404 = hecho, luego el `delete`). La fila sigue visible, sin poder iniciar sesión, hasta que se complete.
- RN-07: Confirmación: el diálogo habilita "Eliminar" solo si el texto escrito coincide con el correo de la fila (sin distinguir mayúsculas, con trim). El servidor revalida: la entrada trae `email` y debe coincidir con el de la fila leída, si no `CHANGED`.
- RN-08: Tras eliminar, el correo queda libre (`inviteUser` ya no lo encuentra) y puede invitarse de nuevo; esto es una consecuencia buscada y se informa en el diálogo.
- RN-09: Los logs llevan solo `code`, `message` y `step` (D42); nunca correos ni nombres.
- RN-10: La guarda "module source" de `users.service.test.ts` se reduce a: `delete from`, `deleteUser` y `deleteInvitation` solo pueden aparecer en `users.service.ts` y dentro de `deleteUser`; ningún otro archivo no-test de `modules/users` los contiene.
- RN-11: Clasificación de errores de Clerk en `deleteUser`, discriminando por estado **y** código (`error.errors[0].code`), nunca solo por estado. Todo lo no listado como "hecho" **detiene** el borrado antes de tocar Neon (sin `PARTIAL_DELETE`: Clerk no actuó o no se sabe que actuó), con `logError` (`code`, `message`, `step: "clerk-delete-user"` o `"clerk-revoke-invitation"`) y mensaje genérico existente.
  - `users.deleteUser(clerkUserId)`: hecho = 404 (usuario inexistente). Detiene = cualquier otro estado/código (4xx distinto, 5xx, red, error no `ClerkAPIResponseError`).
  - `invitations.revokeInvitation(invitationId)`: hecho = 404 (no encontrada) o 400 con código `invitation_already_revoked` (ya revocada). Detiene = 400 con otro código, invitación ya aceptada (código/estado distinto, ver abajo), 5xx, red y cualquier error no reconocido.
  - Invitación ya aceptada: **detiene** con el mensaje genérico (en esta fase no se borra solo la fila ni se busca la cuenta por correo; la cuenta Clerk creada quedaría huérfana y sin lookup seguro). Pregunta 4 resuelta así.
  - La tolerancia a `invitation_already_revoked` se aplica solo en `deleteUser` (parámetro opcional del helper `revokeInvitation`, p. ej. `{ tolerateRevoked: true }`); los demás llamadores (`revokeUser`, reenvío, reactivación) conservan su comportamiento actual (solo 404).
- RN-12: Riesgo residual TOCTOU: entre `readRow`/validación y la llamada irreversible a Clerk no hay transacción, así que otro superadmin o un script puede cambiar rol, estado, `clerk_user_id` o `invitation_id` de la fila en esa ventana. Mitigación parcial: validaciones antes de Clerk, `delete` condicional con identidad y estado leídos, `PARTIAL_DELETE` visible y reintento manual. No se elimina la ventana (Clerk no es transaccional ni se añade bloqueo/infra).

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| superadmin | Eliminar fila `user` | Sí | Fila distinta del actor; cualquier estado |
| superadmin | Eliminar fila `admin` | Sí | Ídem |
| superadmin | Eliminar fila `superadmin` | No | Nunca (incluida la propia) |
| superadmin | Eliminarse a sí mismo | No | `id` o `clerk_user_id` del actor |
| admin | Eliminar cualquier fila | No | El service rechaza con `FORBIDDEN`; la UI no muestra la opción |
| user, sin sesión, fila no activa | Eliminar | No | `authorize` / `getActor` devuelve null: mensaje genérico |

Decisión de implementación: no se añade el permiso `users:delete` a `lib/roles.ts` (ruta sensible `lib/roles*`). Se sigue el patrón ya usado en `rowActions` (`actor.role === "superadmin"` para editar filas invitadas), con una nueva bandera `remove` en `rowActions`, usada por la UI y por el service. Si el propietario prefiere un permiso en `lib/roles.ts`, hay que añadir esos archivos a `## Archivos sensibles` (ver preguntas abiertas).

## Diseño y dependencias

- Rutas (`app/`): ninguna nueva. `app/dashboard/users/page.tsx` sin cambios (`revalidatePath("/dashboard/users")` y el clamp de página de `listUsers` cubren que desaparezca la última fila de una página).
- `modules/users/schemas/users.schema.ts` — existente: añadir `deleteUserInputSchema = z.strictObject({ id: z.uuid(), email: inviteInputSchema.shape.email })` (reutiliza trim, lowercase, `z.email`, máx 254).
- `modules/users/types/users.types.ts` — existente, sin cambios necesarios (`ActionResult` se reutiliza; si hace falta, `DeleteUserInput = z.output<...>` y exportarlo ahí).
- `modules/users/utils/userPermissions.ts` — existente: `rowActions` devuelve además `remove: boolean` = `actor.role === "superadmin" && manages && row.role !== "superadmin"`. `manages` ya excluye al propio actor y a superadmins. `hasActions` en `UsersView` debe incluir `actions.remove`.
- `modules/users/services/users.service.ts` — existente: `deleteUser(actor, input)`:
  1. `assertManager`; `readRow` (ampliar `StoredRow` para traer `clerk_user_id`; hoy trae `linked` booleano; se añade columna `clerk_user_id` a ese `select`, sin cambiar los usos existentes). Sin fila: `CHANGED`. `row.email !== input.email`: `CHANGED`.
  2. `rowActions(actor, {id, ...row}).remove` falso: `FORBIDDEN` (antes de Clerk).
  3. Si `row.clerk_user_id`: `client.users.deleteUser(clerkUserId)`; 404 = hecho; otro error se relanza (sin tocar Neon). Si no, si `row.status === "invited" && row.invitation_id`: `revokeInvitation` existente con tolerancia adicional a 400 `invitation_already_revoked` (RN-11); cualquier otro error detiene.
  4. `delete from app_users where id=$id and email=$email and role=$role and status=$status and clerk_user_id is not distinct from $clerk and invitation_id is not distinct from $inv and role <> 'superadmin' and id <> $actorId returning id`. Excepción o 0 filas: si ya se llamó a Clerk, `UsersError(PARTIAL_DELETE)` + `logError(..., { step: "neon-after-clerk" })`; si no hubo llamada a Clerk, `CHANGED`.
  No se usa `LAST_SUPERADMIN`: el objetivo nunca es superadmin, así que no puede reducir el conjunto de superadmins activos (se documenta con un comentario).
- `modules/users/actions/users.actions.ts` — existente: `deleteUserAction(input)` = `mutate("deleteUserAction", deleteUserInputSchema, input, deleteUser)`. `authorize` deja pasar a admin (tiene `users:manage`); el rechazo lo hace el service (defensa en profundidad, D37).
- `modules/users/components/DeleteUserDialog.tsx` — **nuevo** (`modules/users`; `UsersView.tsx` ya tiene 529 líneas, no se agrega otro diálogo inline). Compone `AlertDialog` (`alert-dialog`, instalado), `Input` (instalado), `Label` (instalado), `Button`. Mismo patrón que `RevokeDialog`: `AlertDialogMedia` destructivo con icono `Trash2` de lucide, `useTransition`, error `role="alert"`, `finalFocus`, `AlertDialogCancel` deshabilitado mientras corre. Estado local del texto, reseteado al cerrar. Props: `row`, `open`, `onOpenChange`, `onDone(text)`, `finalFocus`.
- `modules/users/components/UsersView.tsx` — existente: estado `deleteRow/deleteOpen`, ítem de menú destructivo "Eliminar definitivamente" tras "Inactivar" (solo si `actions.remove`), render de `DeleteUserDialog`, aviso "Usuario eliminado." vía `setNotice`.
- Rutas protegidas: ninguno de los archivos de esta fase coincide con rutas sensibles (`db/`, `migrations/`, `lib/roles*`, `lib/db*`, `lib/auth*`, nombres con `auth`, `proxy.*`, `.env*`). No se edita `lib/` ni `db/`. Por eso la spec no declara `## Archivos sensibles` ni `## Cambios de gobierno`, y **no requiere "autorizo gobierno"** (no toca `.claude/`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json` ni `docs/SETUP.md`). Basta "apruebo docs/specs/users-hard-delete.md". Si cambia la decisión del permiso en `lib/roles.ts`, se actualiza la spec primero.
- Dependencias externas: `@clerk/nextjs/server` `clerkClient().users.deleteUser(id)` y `invitations.revokeInvitation(id)`. Verificación: este worktree no tiene `node_modules` y las páginas de docs de Clerk consultadas con WebFetch devolvieron 404, así que **no verificado**: (a) nombre exacto `users.deleteUser`; (b) código exacto y estado de "invitación ya aceptada" en `revokeInvitation`; (c) que `invitation_already_revoked` llega como 400 en `error.errors[0].code` (dato aportado por el propietario). Las ya usadas en el repo sí están confirmadas por código existente: `isClerkAPIResponseError`, `error.status` y `invitations.revokeInvitation`. El developer lo confirma al implementar T2 contra los tipos instalados (`ClerkAPIResponseError.errors[].code`); si algo difiere, es un ajuste de la spec, y mientras no se confirme el código de "ya aceptada" cae en "error no reconocido = detiene".

## Contratos y datos

```ts
// Entrada de deleteUserAction (strict, extras rechazadas)
export const deleteUserInputSchema = z.strictObject({
  id: z.uuid(),
  email: inviteInputSchema.shape.email, // correo de la fila que vio la UI, ya en minúsculas
});
// Respuesta: ActionResult = { ok: true } | { ok: false; error: string }
```

Mensajes (español): `FORBIDDEN` existente; `CHANGED` existente; `PARTIAL_DELETE = "La cuenta se eliminó, pero el registro del panel no. Vuelve a intentarlo."`; error genérico existente para fallos de Clerk.

Esquema y migraciones: **sin cambios**. Verificado en `db/migrations/`:

| Tabla | FK a `app_users` | ON DELETE actual | Efecto del borrado | ¿Migración? |
|---|---|---|---|---|
| `user_profiles` | `user_id` (pk) | CASCADE | Se borra el perfil | No |
| `user_profile_custom_fields` | `user_id` | CASCADE | Se borran los campos (incluye el índice único `lower(label)` y la restricción deferrable de posición, que no interfieren con un delete en cascada) | No |
| (auditoría, pedidos, etc.) | — | — | No existen | No |

Huérfanos posibles: (1) cuenta Clerk sin fila en Neon (fallo parcial invertido o invitación ya aceptada pero no vinculada, ver riesgos). No concede acceso (`findActor`). (2) No pueden quedar huérfanos en Neon: las FK con CASCADE lo impiden. No hace falta plan expand/contract ni rollback de esquema.

## No funcionales

- Auditoría: sin tabla de auditoría (fuera de alcance). Solo logs de fallo sin datos personales (RN-09). Los datos de perfil borrados no se pueden recuperar salvo la restauración point-in-time de Neon (DEV).
- Rendimiento: 1 lectura + 1 llamada a Clerk + 1 `delete`; sin bucles.
- Privacidad: el correo escrito en el diálogo no se persiste ni se registra.

## Fallos, seguridad y recuperación

Alternativas de orden evaluadas:

| Opción | Fallo entre pasos | Veredicto |
|---|---|---|
| A. Clerk → Neon (recomendada) | Clerk borrado, Neon falla: la fila queda con `clerk_user_id` ya inexistente; esa persona no puede entrar; el superadmin ve la fila y reintenta (Clerk 404 = hecho) | Recuperable desde la UI, idempotente; coincide con RN-06 de `users-admin-edit.md` |
| B. Neon → Clerk | Neon borrado, Clerk falla: se pierde `clerk_user_id`; la cuenta Clerk queda huérfana y no hay fila desde la que reintentar | Irrecuperable desde la UI; descartada |
| C. Estado intermedio `deleting` en Neon | Ofrece reintentos y estado visible, pero exige migrar el `check` de `status`, tocar `StatusBadge`, filtros, `findActor` y `activateUser` | Más robusta pero desproporcionada (YAGNI) para un único `delete`; descartada |

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Admin o usuario intenta borrar (UI manipulada) | `rowActions(...).remove` falso en el service | `FORBIDDEN`, sin llamar a Clerk | Ninguna necesaria |
| Autoborrado o borrar superadmin | `manages`/`role <> 'superadmin'` | `FORBIDDEN` antes de Clerk; el SQL lo repite | Ninguna |
| IDOR: `id` de otra fila con `email` distinto | Comparación `row.email` vs `input.email` | `CHANGED` | Recargar |
| Fila cambió entre lectura y borrado (estado, invitación) | `delete` con 0 filas | `CHANGED` si no se llamó a Clerk; `PARTIAL_DELETE` si sí | Recargar y reintentar |
| Clerk falla (5xx, red) | Excepción distinta de 404 | Se aborta sin tocar Neon; mensaje genérico | Reintentar |
| Clerk ya borró, Neon falla | Excepción o 0 filas tras Clerk | `PARTIAL_DELETE`; log `neon-after-clerk` | Reintento manual idempotente |
| Doble clic o dos superadmins a la vez | Segundo `delete` con 0 filas / Clerk 404 | Segundo resultado: `CHANGED` o éxito idempotente | Recargar |
| Superadmin promovido entre lectura y Clerk (solo por script `db-grant-superadmin`) | Ventana mínima entre `readRow` y `delete` | El `delete` exige `role <> 'superadmin'` y devuelve 0 filas → `PARTIAL_DELETE` (Clerk ya borrado) | Residual: cuenta Clerk de un superadmin borrada; se re-crea al invitar. Aceptado (ver riesgos residuales) |
| Invitación ya aceptada en Clerk pero fila no vinculada (`invited`, sin `clerk_user_id`) | `revokeInvitation` falla con código distinto de 404/`invitation_already_revoked` | Se detiene antes de Neon con mensaje genérico y log con `code` (RN-11) | La fila permanece; el superadmin la vincula (inicio de sesión) y luego la elimina como usuario `active`. Código exacto por confirmar en T2 |
| Invitación ya revocada en Clerk (400 `invitation_already_revoked`) | Estado 400 y código | Cuenta como hecho: se continúa al `delete` de Neon | Reintento tras `PARTIAL_DELETE` seguro |
| Rol/estado/vínculo cambia entre lectura y Clerk (TOCTOU) | `delete` condicional con 0 filas | `PARTIAL_DELETE` si Clerk ya actuó; si no, `CHANGED` | Recargar y reintentar; ventana residual (RN-12) |
| Spoofing de `Origin`/CSRF | Next compara Origin y Host en server actions | Sin cambios respecto de las demás acciones | Ninguna |

## Criterios de aceptación

Todos pertenecen a la Fase 1.

- [ ] AC-01 (RN-01) Dado un superadmin y una fila `user` activa vinculada, cuando confirma la eliminación escribiendo su correo, entonces se llama a `deleteUser` de Clerk con su `clerk_user_id`, se borra la fila de `app_users`, su perfil y campos personalizados desaparecen por cascada, la tabla se actualiza y aparece "Usuario eliminado.".
- [ ] AC-02 (RN-01) Dado un superadmin y una fila `admin`, cuando confirma, entonces se elimina igual que en AC-01.
- [ ] AC-03 (RN-01, negativo) Dado un actor `admin`, cuando llama a `deleteUserAction` con el id de una fila `user`, entonces responde `{ ok: false, error: FORBIDDEN }` sin llamar a Clerk ni ejecutar `delete`; y `rowActions` devuelve `remove: false` para todo objetivo.
- [ ] AC-04 (RN-02, negativo) Dado un superadmin, cuando intenta eliminar su propia fila, entonces `FORBIDDEN` sin llamar a Clerk; `rowActions` devuelve `remove: false`; y el SQL del `delete` contiene `id <> $actorId`.
- [ ] AC-05 (RN-02, negativo) Dado un superadmin, cuando intenta eliminar otra fila `superadmin` (en cualquier estado), entonces `FORBIDDEN` sin llamar a Clerk, y el SQL contiene `role <> 'superadmin'`.
- [ ] AC-06 (RN-03, RN-11) Dado una fila `invited` con `invitation_id`, cuando se elimina, entonces se revoca la invitación (404 o 400 `invitation_already_revoked` tolerados) y se borra la fila sin llamar a `users.deleteUser`; el correo puede invitarse de nuevo.
- [ ] AC-07 (RN-03) Dado una fila `revoked` sin `clerk_user_id`, cuando se elimina, entonces solo se borra la fila (sin llamadas a Clerk) y el correo queda libre para invitar.
- [ ] AC-08 (RN-03) Dado una fila `revoked` con `clerk_user_id` (usuario inactivado), cuando se elimina, entonces se borra en Clerk y en Neon.
- [ ] AC-09 (RN-04, RN-11) Dado un fallo de `users.deleteUser` distinto de 404 (p. ej. 500, 403, 400, error no Clerk), cuando se elimina, entonces no se ejecuta ningún `delete` en Neon, la fila permanece y el resultado es el error genérico (no `PARTIAL_DELETE`).
- [ ] AC-10 (RN-04, RN-11) Dado que Clerk responde 404 al borrar el usuario o la invitación, cuando se elimina, entonces se continúa con el `delete` de Neon y el resultado es éxito.
- [ ] AC-11 (RN-04) Dado un caso en que la comprobación de permiso falla, cuando se ejecuta, entonces ninguna llamada a Clerk precede a esa comprobación (orden verificado en la prueba).
- [ ] AC-12 (RN-05, RN-06, negativo) Dado que Clerk borró pero el `delete` de Neon lanza excepción o devuelve 0 filas, cuando termina, entonces `{ ok: false, error: PARTIAL_DELETE }` (distinto de `CHANGED` y de éxito), con log `step: "neon-after-clerk"` sin correo, y un segundo intento termina en éxito: Clerk 404 al borrar usuario, o 404/400 `invitation_already_revoked` al revocar invitación.
- [ ] AC-13 (RN-05, negativo) Dado que la fila cambió antes de llamar a Clerk (0 filas y ninguna llamada a Clerk), cuando se elimina, entonces `CHANGED`.
- [ ] AC-14 (RN-07, negativo) Dado un `id` válido con un `email` que no coincide con la fila, cuando se llama a la acción, entonces `CHANGED` sin llamar a Clerk; claves extra o `id` no uuid se rechazan con el mensaje genérico sin llamar al service.
- [ ] AC-15 (RN-07) Dado el diálogo abierto, cuando el texto escrito no coincide con el correo (ignorando mayúsculas y espacios en los extremos), entonces el botón "Eliminar" está deshabilitado; cuando coincide, se habilita.
- [ ] AC-16 (RN-07) Dado el diálogo y una acción en curso, cuando está pendiente, entonces "Cancelar" y "Eliminar" están deshabilitados; si la acción falla, el diálogo permanece abierto con el error en `role="alert"`; al cerrar se limpian texto y error.
- [ ] AC-17 (RN-01) Dado un superadmin, cuando abre el menú de una fila `user`/`admin`, entonces ve "Eliminar definitivamente" tras un separador y en estilo destructivo; en filas superadmin, en la propia o siendo admin no aparece.
- [ ] AC-18 (RN-09) Dado cualquier fallo, cuando se registra, entonces el log incluye solo `code`, `message` y `step`, nunca correo ni nombre.
- [ ] AC-19 (RN-10) Dado el código fuente de `modules/users`, cuando corre la guarda de fuente, entonces `delete from`, `deleteUser` y `deleteInvitation` aparecen solo en `users.service.ts` dentro de `deleteUser`.
- [ ] AC-20 (RN-05) Dado el esquema, cuando se elimina la fila, entonces no se escribe ninguna migración y las FK `on delete cascade` de `user_profiles` y `user_profile_custom_fields` son la única vía que borra datos relacionados (verificado por la lectura de `db/migrations/` y por una prueba de contrato del service que no emite `delete` sobre otras tablas).
- [ ] AC-21 (RN-11) Dado una fila `invited` con `invitation_id` y Clerk responde 400 con código `invitation_already_revoked`, cuando se elimina, entonces cuenta como hecho, se ejecuta el `delete` de Neon y el resultado es éxito.
- [ ] AC-22 (RN-11, negativo) Dado una fila `invited` y `revokeInvitation` falla con 400 de otro código, con un error de invitación ya aceptada (estado/código distinto), con 5xx o con un error no reconocido, cuando se elimina, entonces no se ejecuta `delete` en Neon, la fila permanece, el resultado es el error genérico, no es `PARTIAL_DELETE` y el log lleva `code` y `step` sin correo. Un 400 sin código no se trata como éxito.
- [ ] AC-23 (RN-05, RN-12, negativo) Dado que el rol, estado, `clerk_user_id` o `invitation_id` de la fila cambió entre la lectura y el `delete`, cuando el `delete` condicional devuelve 0 filas, entonces `CHANGED` si no hubo llamada a Clerk y `PARTIAL_DELETE` si sí; el SQL contiene `id`, `email`, `role`, `status`, `clerk_user_id` e `invitation_id` leídos y las cláusulas `role <> 'superadmin'` e `id <> $actorId`.
- [ ] AC-24 (RN-04, RN-11) Dado un actor sin permiso de borrado o un objetivo no permitido, cuando se ejecuta, entonces `users.deleteUser` y `revokeInvitation` no se invocan (comprobado por orden de llamadas); la tolerancia a `invitation_already_revoked` no altera `revokeUser`, reenvío ni reactivación (siguen abortando con 400 distinto de 404).

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | `rowActions.remove`; `deleteUser` | AC-01, AC-02, AC-03, AC-17 | `userPermissions.test.ts`, `users.service.test.ts`, `DeleteUserDialog.test.tsx` |
| RN-02 | `rowActions.remove`; SQL `role <> 'superadmin'` | AC-04, AC-05 | `userPermissions.test.ts`, `users.service.test.ts` |
| RN-03 | `deleteUser` (4 ramas) | AC-06, AC-07, AC-08 | `users.service.test.ts` |
| RN-04 | `deleteUser` (orden) | AC-09, AC-10, AC-11, AC-24 | `users.service.test.ts` |
| RN-05 | `delete` condicional; FK cascade | AC-12, AC-13, AC-20, AC-23 | `users.service.test.ts` |
| RN-06 | `PARTIAL_DELETE` | AC-12, AC-23 | `users.service.test.ts` |
| RN-11 | clasificación de errores Clerk | AC-06, AC-09, AC-10, AC-21, AC-22, AC-24 | `users.service.test.ts` |
| RN-12 | `delete` condicional; riesgo TOCTOU | AC-23 | `users.service.test.ts` |
| RN-07 | `deleteUserInputSchema`; diálogo | AC-14, AC-15, AC-16 | `users.schema.test.ts`, `users.service.test.ts`, `DeleteUserDialog.test.tsx` |
| RN-08 | `inviteUser` sin fila previa | AC-06, AC-07 | `users.service.test.ts` |
| RN-09 | `logError` | AC-18 | `users.service.test.ts` |
| RN-10 | guarda de fuente | AC-19 | `users.service.test.ts` |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Auth, sesión, RBAC (matriz de borrado) | `userPermissions.test.ts`: `remove` por actor, objetivo, estado, propio | Service con Neon y Clerk mockeados (patrón `users.service.test.ts`) | Manual en DEV: superadmin borra un usuario de prueba | Obligatoria: admin rechazado, escalada vertical (admin → borrar), IDOR por `email` distinto, autoborrado, superadmin objetivo | No aplica: sin cambios de esquema |
| Borrado en dos sistemas | `users.service.test.ts`: 4 ramas, 404, orden, parcial, reintento | NO EJECUTADO con Neon/Clerk reales salvo orden expresa (SETUP.md: no borrar datos reales) | Manual DEV con orden expresa del usuario | Logs sin datos personales | No aplica |
| Schema | `users.schema.test.ts`: `deleteUserInputSchema` (id no uuid, email inválido/mayúsculas, clave extra) | — | — | Entrada estricta | No aplica |
| Diálogo | `DeleteUserDialog.test.tsx`: habilitación por texto, pending, error, reset | — | Smoke visual | — | No aplica |

## Tests

- `modules/users/utils/userPermissions.test.ts`: `remove` verdadero solo para superadmin sobre `user`/`admin` ajenos en `active`/`revoked`/`invited`; falso para admin, user, propio, superadmin; `edit/revoke/activate/resend` no cambian.
- `modules/users/schemas/users.schema.test.ts`: `deleteUserInputSchema` acepta uuid + correo (normaliza mayúsculas/espacios); rechaza id inválido, correo inválido, >254, claves extra.
- `modules/users/services/users.service.test.ts` (mocks existentes `sqlMock`, `clerk`; añadir `deleteUser: vi.fn()` a `clerk.users`): AC-01..AC-14, AC-18, AC-19 (reescribir la guarda "module source"), AC-21..AC-24, SQL con las cláusulas de RN-05, y que no se emite `delete` sobre otras tablas. Casos de errores Clerk con `new ClerkAPIResponseError("clerk", { data: [{ code, message }], status })` (helper `clerkError` existente, ampliado con código opcional): usuario 404 (hecho), usuario 500/403 (detiene), invitación 404 y 400 `invitation_already_revoked` (hecho), invitación 400 con otro código, 400 sin código, ya aceptada (código supuesto, ajustar en T2), 500 y `Error` genérico (detienen); reintento tras `PARTIAL_DELETE` en ambas ramas; los llamadores existentes de `revokeInvitation` mantienen su comportamiento.
- `modules/users/components/DeleteUserDialog.test.tsx` (Testing Library; mock de `../actions/users.actions`): AC-15, AC-16.
- Las acciones (`users.actions.ts`) no tienen archivo de prueba en el módulo y solo componen `authorize` + `mutate` + service; se cubren a través del service y del schema, sin archivo nuevo (YAGNI).

## Reutilización

`rowActions`/`canManageRole` (matriz), `readRow`, `revokeInvitation` (404 tolerado), `UsersError`, `logError`, `PARTIAL` como patrón, `authorize`/`mutate`/`fail` en acciones, `inviteInputSchema.shape.email`, `ActionResult`, `setNotice` y `finalFocus` de `UsersView`, `AlertDialog*`, `Input`, `Label`, `Button`, `DropdownMenuItem variant="destructive"` y el patrón de `RevokeDialog`. Nada de shadcn por instalar.

## Plan de tareas

### Fase 1
- [x] T1 — Permisos y schema: `remove` en `rowActions`, `deleteUserInputSchema` y sus pruebas · archivos: `modules/users/utils/userPermissions.ts`, `modules/users/utils/userPermissions.test.ts`, `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts` · depende de: — · secuencial (base)
- [x] T2 — Service `deleteUser`, `deleteUserAction` y pruebas (incluye reescribir la guarda "module source") · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`, `modules/users/actions/users.actions.ts` · depende de: T1 · secuencial
- [x] T3 — `DeleteUserDialog` con prueba · archivos: `modules/users/components/DeleteUserDialog.tsx`, `modules/users/components/DeleteUserDialog.test.tsx` · depende de: T2 · secuencial (importa `deleteUserAction`)
- [x] T4 — Integrar en `UsersView` (ítem de menú, estado, aviso, `hasActions`) · archivos: `modules/users/components/UsersView.tsx` · depende de: T3 · secuencial

Una sola fase: 4 tareas, 10 archivos, sin archivos compartidos fuera de `modules/users`. Casi todo es secuencial por dependencia de símbolos; los archivos son disjuntos entre tareas, pero T3 depende de la acción de T2 y T4 del diálogo de T3.

## Riesgos y riesgos residuales

- Irreversibilidad: borrado de cuenta Clerk y de datos personales (perfil, campos). Mitigaciones: solo superadmin, confirmación con correo, comprobaciones antes de Clerk. Sin papelera ni auditoría.
- Residual (RN-12, TOCTOU): ventana entre `readRow`/validación y la llamada irreversible a Clerk sin transacción (Clerk no es transaccional). Un cambio concurrente de rol, estado o vínculo en esa ventana no se puede impedir; el `delete` condicional evita borrar una fila distinta de la validada y `PARTIAL_DELETE` lo hace visible. Aceptada, igual que en `users-admin-edit.md`.
- Residual: cuenta Clerk huérfana cuando una invitación ya fue aceptada en Clerk pero la fila no se vinculó (no hay lookup por correo). Sin acceso; no se limpia en esta fase.
- Residual: superadmin promovido por script en la ventana; cuenta Clerk borrada aunque la fila sobrevive.
- Residual: no hay webhook, así que un borrado hecho desde el dashboard de Clerk deja la fila de Neon con un `clerk_user_id` inexistente; "Eliminar" lo limpia (Clerk 404 = hecho).
- Residual: re-invitar un correo que aún existe en Clerk (borrado fallido) depende del comportamiento de `createInvitation` con `ignoreExisting`; a confirmar en DEV.
- No hay entorno PROD: ninguna aprobación de esta spec autoriza borrar datos reales ni migrar; la verificación manual con Neon/Clerk de DEV requiere orden expresa.

## Preguntas abiertas

1. Orden Clerk/Neon. Opciones: A) Clerk → Neon; B) Neon → Clerk; C) estado `deleting` con migración. Recomendación: A (la spec ya lo asume).
2. ¿Hard delete o soft-delete con purga? Opciones: hard (esta spec; libera el correo, borra perfil por cascada); mantener solo "Inactivar" y añadir "purgar" más tarde. Recomendación: hard delete, porque Inactivar ya es el camino reversible.
3. Destino de datos relacionados. Opciones: cascada actual (perfil y campos se borran); anonimizar/conservar. Recomendación: cascada (no hay otras tablas ni auditoría que lo impidan).
4. Invitaciones pendientes. **Decidido** (propietario, RN-11): revocar invitación Clerk + borrar fila; 404 y 400 `invitation_already_revoked` = hecho; invitación ya aceptada u otro error = detener con mensaje genérico, sin borrar la fila ni buscar la cuenta por correo. Pendiente solo confirmar en T2 el código/estado exacto de "ya aceptada" (hasta entonces cae en "no reconocido = detiene"). Un mensaje específico para ese caso sería mejora posterior.
5. Borrado de admins. Opciones: superadmin puede borrar admins (propuesta inicial, esta spec); excluir admins. Recomendación: permitirlo, como pidió el propietario.
6. ¿Admin puede borrar usuarios de rol `user` (hoy gestiona su revocación)? Opciones: no (propuesta); sí solo `user`. Recomendación: no, hasta tener auditoría.
7. Confirmación. Opciones: escribir el correo (recomendado), escribir "ELIMINAR", checkbox. Recomendación: correo (se verifica además en el servidor).
8. Permiso: ¿bandera `remove` en `rowActions` (sin tocar `lib/roles.ts`, esta spec) o nuevo `users:delete` en `lib/roles.ts`? Recomendación: `rowActions`; la segunda opción añade `lib/roles.ts` y `lib/roles.test.ts` a `## Archivos sensibles`.
9. ¿Registrar auditoría (quién borró a quién y cuándo)? Opciones: no ahora (esta spec); tabla `user_audit` (requiere migración y una spec propia). Recomendación: no ahora; evaluarlo antes de cualquier uso en PROD.
10. ¿Permitir que el superadmin elimine su propia cuenta desde el perfil? Recomendación: no, fuera de alcance.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz (pruebas con Neon y Clerk reales) figura como NO EJECUTADO con su motivo.
