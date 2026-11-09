# Edición administrativa unificada: nombre, apellido y rol (USERS-1b)

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-admin-edit-role
- Riesgo: alto (amplía permisos de cambio de rol a admin; escribe identidad ajena en Clerk y datos personales en Neon)
- Ruta: SDD-ADVANCED (disparadores: autorización, roles y permisos; datos personales; integración externa con Clerk)
- Fase actual: Fase 1

## Objetivo

Unificar en un solo formulario «Editar usuario» (Nombre, Apellido, Correo de solo lectura y Rol) lo que hoy son dos acciones separadas («Editar» de USERS-1 y «Cambiar rol» de AUTH-3), y ampliar quién puede cambiar el rol: ahora también un admin, sobre usuarios `user`. Es una spec COMPLEMENTARIA de `docs/specs/users-admin-edit.md` (aprobada y firmada, no se edita): donde esta spec contradice a esa o a las históricas, manda esta (ver «Decisiones y qué sustituyen»). Coincide con la matriz visual de `docs/specs/users-management-design.md` (pantalla 05 con Rol; fila «Cambiar rol» con admin sobre usuarios `user`), que D34 había recortado.

## Alcance y reglas

- Incluye: campo Rol en `EditUserDialog` (admin y superadmin); servicio `updateUser` que orquesta `updateUserName` y `changeUserRole`; acción `updateUserAction`; retirar «Cambiar rol» del menú de fila y del detalle (el detalle queda «Cerrar · Editar»); `changeUserRole` deja de ser solo de superadmin; `rowActions` pasa a una sola regla `edit`. NUEVO (Decisión 1 del propietario): se conserva la edición del rol de filas `invited`: un superadmin usa «Editar» sobre una fila `invited` y el diálogo muestra solo el Rol (modo «solo Rol», RN-08).
- No incluye: asignar `superadmin` (R6); cambios en `lib/roles.ts`, `canManageRole` o `assignableRoles` (ver (a)); invitar con rol `admin` por parte de un admin (el invitar sigue con `assignableRoles`); editar filas `revoked` o sin `clerk_user_id` que no sean `invited`; editar nombre, apellido o correo de una fila `invited`; que un admin edite filas `invited`; cambiar reenviar, revocar o cualquier otra operación sobre invitaciones; editar la propia cuenta o a un superadmin; edición de correo, contraseña o foto; rollback o reintentos automáticos; operación atómica nueva; avisos por correo; auditoría nueva; migraciones; webhooks; dependencias nuevas.
- Declaración de ampliación de permisos: esta spec amplía los permisos vigentes de AUTH-3 (hoy cambiar rol es solo de superadmin; el admin solo gestiona filas `user` y no asigna `admin`). Tras esta spec un admin puede cambiar el rol de una fila `user` a `admin` (y de `user` a `user`, sin efecto). Consecuencia aceptada por el propietario (Decisión 2): un admin que asciende a un `user` a `admin` ya no puede revertirlo (no gestiona filas `admin`; solo un superadmin) y no hay confirmación adicional en esta fase.
- RN-01 (R1, R2, R3; CAMBIADA): Editar lo permite `rowActions.edit`: actor con `users:manage` que gestiona la fila (`canManageRole`) y que no es la propia, en uno de dos casos: (i) fila `active` con `clerk_user_id` (admin sobre `user`; superadmin sobre `user` y `admin`): edita nombre, apellido y rol (RN-03 de la spec vigente, se mantiene); (ii) fila `invited` y actor superadmin: edita solo el rol (RN-08). El campo Rol aparece siempre que el formulario es accesible.
- RN-02 (R4, R5, R6): Nadie modifica su propio rol: la fila propia no es editable (se mantiene RN-02 de la spec vigente, también para nombre). Un `user` no accede al formulario ni a las acciones. Nadie asigna `superadmin`: el rol nuevo solo puede ser `user` o `admin` (`PANEL_ROLES`).
- RN-03 (R7): La autorización se repite en servidor: acción (`authorize`: sesión, fila activa, `users:manage`, schema estricto), servicio (`assertManager`, fila gestionable, rol nuevo en `PANEL_ROLES`, propia fila) y SQL (`id <> actor`, `role = any(assignableRoles(actor.role))` y una de dos ramas de fila: `status = 'active'` y `clerk_user_id is not null`; o, solo si el actor es superadmin, `status = 'invited'` y `clerk_user_id is null`). La UI solo oculta.
- RN-04 (sustituye RN-04 vigente; CAMBIADA): el cliente envía `id` de fila, el rol nuevo y el rol previo esperado; en modo completo (fila `active`) envía además nombre, apellido y sus valores previos esperados; en modo solo Rol (fila `invited`) NO envía nombre ni apellido (el schema estricto los rechaza). Nunca el id de Clerk ni el correo. `expectedRole` solo decide si hay que escribir el rol (si coincide con `role`, no se toca); la autoridad es siempre la fila leída y el SQL en servidor.
- RN-05 (R8): una sola acción «Editar»; sin «Cambiar rol» en menú ni detalle. `ChangeRoleDialog` y `updateUserRoleAction` se eliminan (código muerto y punto de entrada duplicado).
- RN-06 (extiende RN-06 vigente): orden y resultados al guardar:
  1. Se validan permisos y el rol nuevo antes de escribir nada (`assertManager`, rol nuevo en `PANEL_ROLES`, no propia fila).
  2. Si cambió el nombre o el apellido respecto de lo esperado: `updateUserName` (Clerk primero, luego Neon, con todas sus comprobaciones y su estado parcial propio, sin cambios). Si lanza, no se intenta el rol.
  3. Si cambió el rol respecto de `expectedRole`: `changeUserRole` (un `update` en Neon). Si falla y el paso 2 ya escribió el nombre: resultado parcial `ROLE_PARTIAL`. Si no hubo paso 2, se propaga su mensaje (nada se escribió).
  4. Si no cambió nada, no se llama a nada y la acción termina bien.
  Sin rollback ni reintentos automáticos: solo reintenta la persona, a mano. La acción responde `{ ok: false }` en todo resultado parcial, nunca éxito.
- RN-07: Los logs llevan solo `code`, `message` y una etiqueta fija de paso, nunca nombres, correos ni ids de Clerk (D42). El fallo del rol tras escribir el nombre usa `step: "neon-role-after-name"`.
- RN-08 (NUEVA, Decisión 1): edición del rol de una fila `invited`. Solo superadmin; admin no (No incluye). Solo cambia el rol: `updateUser` con un payload sin nombre ni apellido llama solo a `changeUserRole`, sin Clerk, sin leer ni escribir nombre ni correo. Control de concurrencia: `expectedRole` (decide si hay escritura) y el `update` condicionado (`status = 'invited'`, `clerk_user_id is null`, `role is distinct from` el nuevo). Si la persona aceptó la invitación mientras tanto (fila ya `active`), el `update` no la afecta por esa rama y devuelve cero filas: `No se pudo cambiar el rol. Recarga la página.` Un payload completo (con nombre) contra una fila `invited` termina en `CHANGED` en `updateUserName` sin escribir nada. El rol guardado en la fila es el que se aplica al aceptar (ver (f)).

## Decisiones y qué sustituyen (las specs históricas y la vigente no se editan)

- D-U1b-1 (sustituye a D-U1-2 de la spec vigente y a la línea de D34 «la pantalla 05 solo cambia el rol / reducida»): la pantalla 05 es completa: Nombre, Apellido, Correo (solo lectura) y Rol.
- D-U1b-2 (sustituye a D-U1-6 punto 3): el detalle muestra «Cerrar · Editar»; «Editar» solo si `rowActions.edit`. «Editar» pasa a ser el botón primario del pie.
- D-U1b-3 (sustituye a RN-04 vigente): ver RN-04 de esta spec. `strictObject` sigue rechazando `clerkUserId`, `email` y claves extra; `role` pasa a ser una clave válida, restringida a `user | admin`.
- D-U1b-4 (sustituye en lo que hace falta a D34 «Un admin no cambia roles (A6)», a la fila «Cambiar rol» y a la frase «Los roles asignables son los que el actor gestiona. Cambiar rol es solo de superadmin» de D37, y a R43/CA-14 de `auth-clerk-neon.md`): cambiar rol lo permiten admin y superadmin. Los roles que se pueden asignar al cambiar rol son `user` y `admin` para ambos; las filas sobre las que se actúa siguen siendo las que el actor gestiona (`assignableRoles`). D4 y R12 no cambian. D37 sigue vigente para invitar, inactivar, activar y reenviar.
- D-U1b-5 (sustituye a D-U1-5 solo en la matriz): la matriz de abajo reemplaza la fila «Editar nombre y apellido» y la fila «Cambiar rol» de D37. Se mantiene que no cambia `lib/roles.ts`.
- D-U1b-6 (NUEVA, Decisión 1; conserva la capacidad de AUTH-3 «superadmin cambia el rol de una fila `invited`»): «Editar» sobre filas `invited` abre el diálogo en modo solo Rol, solo para superadmin. Sustituye, para ese caso, a RN-03 vigente («Editar» solo en filas `active` vinculadas).
- También quedan sin efecto de la spec vigente: el «No incluye … rol (ChangeRoleDialog sigue independiente y solo superadmin)» y «sin campo Rol» de su Alcance; sus AC-14 (botones «Cerrar · Editar · Cambiar rol», diálogo sin Rol), AC-17 en lo que dice de Cambiar rol (se retira; Inactivar, Activar y Reenviar no cambian) y AC-18; y en AC-07 la parte «`role` rechazado» (ahora `role: user | admin` es válido; `superadmin` se rechaza). Sus AC-01 a AC-06, AC-08 a AC-13, AC-15 y AC-16 siguen aplicando al paso de nombre.

## Actores y matriz de acceso

Filas objetivo «activas y vinculadas» (`status = 'active'` y `clerk_user_id` no nulo), salvo las filas `invited` indicadas. Valores de rol aceptados al cambiar: solo `user` o `admin`. Columnas: «Editar nombre y apellido» y «Cambiar rol» son lo que permite el único botón «Editar»; en filas `invited` el diálogo se abre en modo solo Rol.

| Actor | Fila objetivo | Editar nombre y apellido | Cambiar rol | Condición |
|---|---|---|---|---|
| user | cualquiera | No | No | Sin `users:manage` (R5) |
| admin | `user`, activa y vinculada | Sí | Sí: `user` ↔ `admin` | R2 |
| admin | `admin` | No | No | `canManageRole` falso |
| admin | `superadmin` | No | No | `canManageRole` falso |
| admin | su propia fila | No | No | `actor.id === row.id` (R4) |
| superadmin | `user`, activa y vinculada | Sí | Sí: `user` ↔ `admin` | R3 |
| superadmin | `admin`, activa y vinculada | Sí | Sí: `user` ↔ `admin` | R3 |
| superadmin | `superadmin` | No | No | `canManageRole` falso |
| superadmin | su propia fila | No | No | `actor.id === row.id` (R4) |
| superadmin | fila `invited` de rol `user` o `admin` (NUEVA) | No (el diálogo no lo muestra) | Sí: `user` ↔ `admin`, solo el Rol | RN-08, Decisión 1 |
| admin | fila `invited` (NUEVA) | No | No | RN-08 (sin «Editar») |
| admin o superadmin | fila `revoked` o `active` sin `clerk_user_id` | No | No | RN-01 |
| cualquiera | asignar `superadmin` | — | No | R6, D4 |

Salvo las filas `invited` (solo Rol, solo superadmin), nunca hay una fila con «Editar nombre» = Sí y «Cambiar rol» = No (ni viceversa): ambos dependen de la misma regla `edit`.

## Puntos resueltos

- (a) `lib/roles.ts`, `canManageRole` y `assignableRoles` NO cambian. `canManageRole` define qué filas gestiona el actor (admin: `user`; superadmin: `user` y `admin`) y esa regla sigue siendo la correcta. Lo que cambia es el rol que se puede asignar al editar, que deja de salir de `assignableRoles` (admin tendría `[user]`) y pasa a `PANEL_ROLES` (`user | admin`, ya existente en `users.schema.ts`). Cambiar `assignableRoles` ampliaría sin pedirlo la invitación del admin a `admin` y los `role = any(...)` de inactivar, activar y reenviar. `lib/roles*` es ruta sensible: al no tocarlo no hay `## Archivos sensibles` ni `## Cambios de gobierno`. Ningún archivo del plan tiene `auth` en su nombre ni está en `.claude/` o en la lista de gobierno.
- (a2) Control técnico obligatorio: admin `user → admin` SIN tocar `assignableRoles` ni relajar invitar, inactivar, activar ni reenviar. Verificado en `users.service.ts` actual: `inviteUser` (`assignableRoles(actor.role).includes(input.role)`), `revokeUser`, `activateUser` y `resendInvitation` (`role = any(${assignableRoles(actor.role)})`) usan `assignableRoles` y no se modifican; hoy `changeUserRole` es el único que lo combina con `actor.role !== "superadmin"`. Solo se modifica `changeUserRole`: el rol NUEVO se valida contra `PANEL_ROLES` (no contra `assignableRoles`) y las filas gestionables siguen filtradas por `role = any(assignableRoles(actor.role))` (admin: solo filas `user`; superadmin: `user` y `admin`). `assignableRoles("admin")` sigue siendo `[user]`; `updateUserName` ya usa `assignableRoles` para la fila y no cambia. Se comprueba con AC-16 y los tests de «límites del admin sin cambios».
- (b) Orden y semántica: nombre primero (RN-06). Es la operación con externo y con sus propias comprobaciones previas (fila cambiada, estado, vínculo, permiso): si falla antes de escribir, nada se escribió y el rol tampoco; luego el rol, un solo `update` en Neon sin dependencia de Clerk (D11: el rol solo vive en `app_users`). Solo cambió uno: solo se llama a ese servicio (sin llamada a Clerk si solo cambió el rol; sin escritura de rol si solo cambió el nombre). Falla la segunda (nombre ya escrito, rol falla): `{ ok: false }` con `ROLE_PARTIAL`, sin rollback, sin reintento; la persona recarga y repite solo el rol. Si falla el nombre en su resultado parcial (Clerk escrito, Neon no), el rol no se intenta y rige el mensaje parcial vigente (el reintento desde el mismo diálogo es idempotente porque Neon conserva los valores esperados). Alternativa descartada: operación atómica nueva (un solo `update` de Neon con nombre y rol tras Clerk). Duplicaría las comprobaciones y el SQL de ambos servicios y obligaría a cambiar `updateUserName`, a cambio de evitar solo la combinación «nombre escrito y falla el rol», que exige un fallo de Neon justo después de un éxito de Neon y se cubre con recargar y repetir. Clerk y Neon no pueden ser atómicos entre sí en ningún caso.
- (c) El cliente recibe/envía lo de RN-04. El `UserRow` no cambia (ya trae `role`); el id de Clerk no sale del servidor (D38).
- (d) Rol visible y habilitado siempre dentro del formulario. No hay fila con formulario accesible y rol no cambiable: la regla `edit` es la misma para ambos (ver matriz), y una fila donde el actor no puede cambiar rol es una fila donde no ve «Editar» en absoluto (menú y detalle sin la opción). Si la UI estuviera desactualizada, el servidor rechaza con `No tienes permiso para esta acción.`. Se descarta «Rol deshabilitado»: no existe ningún caso que lo necesite (YAGNI). El selector lista solo `user` y `admin`; no muestra `superadmin`.
- (e) Tests mínimos y ronda manual: ver «Tests» y AC-12.
- (f) Hallazgo (Decisión 1, verificado leyendo código; no se ejecutó nada): el rol de la fila `invited` es el que se aplica al aceptar la invitación. `lib/auth.ts`, función `findActor` (primer inicio de sesión): el `update app_users set clerk_user_id, status = 'active', first_name, last_name … where email = <correo verificado> and status = 'invited' and clerk_user_id is null returning id, clerk_user_id, email, role` NO escribe `role`; devuelve el que ya tenía la fila y `toActor` lo toma de ahí. Además `inviteUser` (`createInvitation`) no envía `publicMetadata` a Clerk, y `findActor` nunca lee metadata (D11): el rol vive solo en `app_users`. Una edición hecha antes de aceptar se aplica; si el `update` de rol y el vínculo compiten, uno gana de forma atómica por fila y el otro ve cero filas (el cambio de rol devuelve `No se pudo cambiar el rol…`; nunca queda un rol a medias). No hay riesgo abierto. `lib/auth.ts` no se modifica.

## Diseño y dependencias

Sin rutas nuevas: `app/dashboard/users/page.tsx`, `modules/users/index.ts` y `modules/users/server.ts` no cambian.

| Capa | Archivo | Origen |
|---|---|---|
| Schema | `modules/users/schemas/users.schema.ts`: añade `editUserInputSchema` (unión de modo completo y modo solo Rol) | existente. Reutiliza `nameField`/`nameInputSchema`; `roleInputSchema` y `nameInputSchema` se conservan |
| Tipos | `modules/users/types/users.types.ts`: añade `EditUserInput` | existente |
| Permisos | `modules/users/utils/userPermissions.ts`: `editName` pasa a `edit` (ahora también verdadero para superadmin sobre `invited`), se elimina `changeRole`; `assignableRoles` sin cambios | existente |
| Servicio | `modules/users/services/users.service.ts`: `changeUserRole` abierto a admin; nuevo `updateUser` | existente; reutiliza `updateUserName`, `changeUserRole`, `assertManager`, `UsersError`, `logError`, `FORBIDDEN`, `PANEL_ROLES` |
| Acción | `modules/users/actions/users.actions.ts`: `updateUserAction`; se elimina `updateUserRoleAction` y `updateUserNameAction` | existente |
| Diálogo | `modules/users/components/EditUserDialog.tsx`: añade el selector Rol y envía `updateUserAction`; si `row.status === "invited"` muestra solo Rol (sin Nombre, Apellido ni Correo) y envía el payload sin nombres | existente (de USERS-1); el patrón del selector se toma de `ChangeRoleDialog` |
| Vista | `modules/users/components/UsersView.tsx`: quita estado, ítem y diálogo de «Cambiar rol» | existente |
| Detalle | `modules/users/components/UserDetailSheet.tsx`: quita `canChangeRole`/`onChangeRole` | existente |
| Eliminado | `modules/users/components/ChangeRoleDialog.tsx` | existente; se borra |
| UI | Dialog, Select, Input, Label, Button, DropdownMenu, `UserAvatar` | shadcn (instalado) / existente (`components/shared/UserAvatar`) |

Sin componentes shadcn nuevos ni dependencias. Integración externa: sin cambios (`users.updateUser` solo por `updateUserName`).

## Contratos y datos

```ts
// users.schema.ts
const roleFields = {
  role: z.enum(PANEL_ROLES, "Elige un rol válido."), // nunca superadmin
  expectedRole: z.enum(ROLES),                       // rol de la fila que vio la UI
};
// Modo completo (fila active): nombre, apellido y rol. Estricto: rechaza clerkUserId, email y otras claves.
const editFullSchema = z.strictObject({ ...nameInputSchema.shape, ...roleFields });
// Modo solo Rol (fila invited): sin nombre ni apellido; si se envían, strictObject rechaza el payload.
const editRoleOnlySchema = z.strictObject({ id: z.uuid(), ...roleFields });
export const editUserInputSchema = z.union([editFullSchema, editRoleOnlySchema]);
export type EditUserInput = z.output<typeof editUserInputSchema>;
```

Opción elegida para el modo solo Rol (la más simple y estricta): no enviar nombre ni apellido y que el schema estricto los rechace; no se aceptan ni se ignoran. Un payload con solo `firstName` o solo `lastName` no encaja en ninguna de las dos formas y se rechaza.

- Acción: `updateUserAction(input: unknown): Promise<ActionResult>` con `mutate("updateUserAction", editUserInputSchema, input, updateUser)` (revalida `/dashboard/users`). `ActionResult` no cambia.
- `rowActions(actor, row)` devuelve `{ edit, revoke, activate, resend }` con `edit = manages && ((status === "active" && linked) || (status === "invited" && actor.role === "superadmin"))`, donde `manages = actor.id !== row.id && canManageRole(actor.role, row.role)`. Mínimo cambio: sigue siendo un solo booleano `edit`; el modo del diálogo (completo o solo Rol) lo decide la UI con `row.status === "invited"`, y el servidor no confía en eso (RN-03). `revoke`, `activate` y `resend` no cambian.
- `changeUserRole(actor, input: RoleInput)`:
  1. `assertManager(actor)`; `!PANEL_ROLES.includes(input.role)` o `input.id === actor.id`: `FORBIDDEN` (se elimina la condición `actor.role !== "superadmin"` y el uso de `assignableRoles` para el rol nuevo). Control técnico (a2): `assignableRoles` solo sigue filtrando las filas gestionables en el SQL.
  2. Un `update app_users set role = $role, updated_at = now() where id = $id and id <> $actor and role = any(assignableRoles(actor.role)) and ((status = 'active' and clerk_user_id is not null) or ($isSuperadmin::boolean and status = 'invited' and clerk_user_id is null)) and role is distinct from $role and <R12> returning id`, con `$isSuperadmin = actor.role === "superadmin"` calculado en el servidor (sustituye `role in ('user','admin')` y `status <> 'revoked'`). La rama `invited` no exige `clerk_user_id is not null` y solo existe para superadmin: un admin nunca la satisface aunque falsee el payload. Cero filas: `No se pudo cambiar el rol. Recarga la página.`
- `updateUser(actor, input: EditUserInput): Promise<void>`:
  1. `assertManager(actor)`; `input.id === actor.id` o rol nuevo fuera de `PANEL_ROLES`: `FORBIDDEN` (antes de escribir).
  2. `nameChanged = "firstName" in input && (firstName !== expectedFirstName || lastName !== expectedLastName)` (modo solo Rol: siempre falso); `roleChanged = role !== expectedRole`.
  3. `nameChanged`: `await updateUserName(actor, { id, firstName, lastName, expectedFirstName, expectedLastName })`; cualquier error se propaga y termina. En modo solo Rol no se llama (sin Clerk, sin leer ni escribir nombre).
  4. `roleChanged`: `try { await changeUserRole(actor, { id, role }) } catch (error) { if (!nameChanged) throw error; logError("updateUser", error, { step: "neon-role-after-name" }); throw new UsersError(ROLE_PARTIAL); }`.
- Mensaje nuevo (D42): `ROLE_PARTIAL = "El nombre se guardó, pero el rol no se pudo cambiar. Recarga la página y vuelve a intentarlo."`. Los demás mensajes no cambian.
- Datos: `app_users.role`, `first_name`, `last_name`, `updated_at` ya existen. Sin migraciones, índices ni cambios en `db/`.

## No funcionales

- Privacidad: no se registran nombres, correos ni ids de Clerk; no se lee `user_profiles` (D31); el id de Clerk no sale del servidor.
- Como mucho una llamada a Clerk y tres sentencias SQL por edición (lectura previa, escritura de nombre, escritura de rol). Sin auditoría nueva.
- Accesibilidad: etiqueta asociada al selector, error con `aria-describedby`, foco devuelto con `finalFocus`.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Escalada vertical: admin pone `superadmin`, o cualquiera lo asigna | `PANEL_ROLES` en schema y servicio | Rechazo genérico o `FORBIDDEN`; nada escrito | — |
| Escalada horizontal: admin sobre admin o superadmin | `canManageRole` en `rowActions`, `assignableRoles` en servicio y SQL | `FORBIDDEN`, sin Clerk ni escritura | — |
| Cambio del propio rol | `input.id === actor.id` y `id <> actor` en SQL | `FORBIDDEN` | — |
| Rol `user` invoca la acción | `authorize` y `assertManager` | Genérico o `FORBIDDEN` | — |
| IDOR / id de Clerk, correo o clave extra enviados | `strictObject`; el id de Clerk sale de `app_users` | Rechazo genérico | — |
| Rol esperado desactualizado o `expectedRole` manipulado | El SQL de `changeUserRole` filtra por filas gestionables, activas, vinculadas y rol distinto del nuevo | Cero filas: `No se pudo cambiar el rol…` (o parcial si el nombre ya se escribió) | Recargar y repetir |
| Fila obsoleta antes de escribir | Comprobación previa de `updateUserName` | `CHANGED`, nada escrito | Recargar |
| Fila `invited` aceptada mientras se edita el rol (NUEVA) | Rama `invited` del `update` exige `status = 'invited'` y `clerk_user_id is null` | Cero filas: `No se pudo cambiar el rol. Recarga la página.`; nada a medias | Recargar; la fila ya aparece activa (y editable en modo completo) |
| Admin falsea el payload para editar una fila `invited` (NUEVA) | `$isSuperadmin` calculado en servidor; `role = any(assignableRoles)` | Cero filas: mensaje de rol no cambiado; nada escrito | — |
| Payload con nombre contra una fila `invited`, o con nombre en modo solo Rol (NUEVA) | `updateUserName` (`status !== 'active'` → `CHANGED`) y `strictObject` | `CHANGED` sin Clerk ni escritura, o rechazo genérico | Recargar |
| Rol de la fila `invited` ya no coincide con el esperado (NUEVA) | `role is distinct from` y filtro por filas gestionables | Cero filas: mensaje de rol no cambiado | Recargar y repetir |
| Clerk falla | Excepción de `updateUser` | Genérico (422: mensaje de nombre); no se escribe Neon ni el rol | Reintentar; nada que revertir |
| Clerk escrito y Neon (nombre) falla | `updateUserName` | Mensaje parcial vigente; el rol no se intenta | Reintento manual idempotente; D32 |
| Nombre escrito y el rol falla | `catch` del paso 4 | `ROLE_PARTIAL`; log `step: "neon-role-after-name"` con `code` y `message` | Sin rollback ni reintentos automáticos: recargar y repetir solo el rol (el reintento desde el diálogo desactualizado devolvería `CHANGED` y pide recargar) |
| Dos administradores a la vez | Comprobación previa y `where` | `CHANGED`, parcial o `No se pudo cambiar el rol…` según el punto | Recargar |
| Último superadmin | R12 en el `update` (no aplica a filas `user`/`admin`; se conserva) | — | — |
| Datos personales en logs | Test de logs | Solo `code`, `message` y `step` | — |

## Criterios de aceptación

- [ ] AC-01 (RN-01, R2) Dado un admin y una fila `user` activa y vinculada, cuando cambia solo el rol a `admin`, entonces se llama solo a `changeUserRole` (sin Clerk), se actualiza el rol y se revalida `/dashboard/users`.
- [ ] AC-02 (RN-01, R3) Dado un superadmin y una fila `user` o `admin` activa y vinculada, cuando cambia el rol entre `user` y `admin`, entonces se actualiza el rol; cuando cambia además el nombre, el orden es Clerk, `update` de nombre en Neon y `update` de rol.
- [ ] AC-03 (RN-01) Dado un actor que cambia solo nombre o apellido, cuando guarda, entonces solo se ejecuta `updateUserName` y el rol no se toca.
- [ ] AC-04 (RN-02, R4, negativo; sin cambios) Dado un actor (user, admin o superadmin) y su propia fila, cuando intenta editarla o cambiar su rol, entonces se rechaza sin Clerk ni escritura; `rowActions.edit` es falso.
- [ ] AC-05 (RN-01, negativo) Dado un admin y una fila `admin` o `superadmin`, o un superadmin y una fila `superadmin`, cuando intenta editar o cambiar rol, entonces `FORBIDDEN` sin Clerk ni escritura.
- [ ] AC-06 (RN-02, R5, negativo) Dado un actor con rol `user`, cuando invoca la acción o el servicio, entonces se rechaza antes de tocar Clerk o la base.
- [ ] AC-07 (RN-02, R6, negativo; sin cambio de texto, aplica también al modo solo Rol) Dado un payload con `role: "superadmin"`, cuando se valida o llega al servicio, entonces se rechaza sin Clerk ni escritura; el selector de la UI no lista `superadmin`.
- [ ] AC-08 (RN-04, negativo; CAMBIADO) Dado un payload con `clerkUserId`, `email` u otra clave extra, o `expectedRole` no válido, o un payload solo Rol con `firstName` o `lastName`, o un payload con solo uno de los dos nombres, cuando se valida, entonces el schema lo rechaza y la acción devuelve el error genérico sin llamar al servicio.
- [ ] AC-09 (RN-01, negativo; CAMBIADO: `invited` sale de este AC y pasa a AC-14/AC-15) Dado una fila `revoked` o `active` sin `clerk_user_id`, cuando se intenta editar o cambiar rol, entonces no hay opción «Editar» y el servidor no escribe en Clerk ni en el rol.
- [ ] AC-10 (RN-06) Dado que cambiaron nombre y rol y el nombre falla (Clerk, comprobación previa o estado parcial de Neon), cuando termina, entonces el rol no se intenta y el mensaje es el del paso de nombre. Dado que el nombre se escribió y el rol falla, entonces `{ ok: false }` con `ROLE_PARTIAL` (nunca éxito), sin reintento automático (`updateUser` de Clerk una sola vez), con log `code`, `message` y `step: "neon-role-after-name"` sin datos personales. Dado que solo cambió el rol y falla, entonces se muestra su propio mensaje, no `ROLE_PARTIAL`.
- [ ] AC-11 (RN-05, R8; sustituye AC-14 vigente) Dado cualquier actor, cuando ve la lista o el detalle, entonces no existe «Cambiar rol» en el menú de fila ni en el detalle; el detalle muestra «Cerrar · Editar» (con «Editar» solo si `rowActions.edit`). El diálogo muestra Nombre, Apellido, Correo deshabilitado con «El correo lo cambia la propia persona desde su perfil.» y Rol (solo `user` y `admin`), con la nota «Solo un administrador o un superadmin puede cambiar el rol.»; «Guardar cambios» está deshabilitado sin cambios o durante el envío; el `Input` sigue sin `maxLength` (RN-05 vigente). CAMBIADO: esto describe el modo completo (fila activa); el modo solo Rol de filas `invited` es AC-14.
- [ ] AC-12 (manual, una ronda en DEV, solo tras aprobación e implementación; sin mutaciones en DEV antes) Con cuentas de prueba: un admin edita nombre y rol de un `user` (a `admin`) y comprueba que esa fila ya no tiene «Editar» para él; un superadmin cambia un `admin` a `user` y viceversa y edita nombre y rol a la vez; no aparece «Editar» en la propia fila de admin ni de superadmin, en filas `superadmin` ni inactivas; un admin no ve «Editar» en un `admin` ni en una fila invitada; un `user` ve la pantalla sin acceso. Verificar el nombre en Clerk y la lista tras guardar. CAMBIADO: «ni invitadas» sale de la lista y se añade: un superadmin cambia el rol de una fila invitada (el diálogo solo muestra Rol), la invitada acepta y entra con ese rol.
- [ ] AC-13 (regresión; CAMBIADO: ahora con pruebas explícitas del control técnico) Dado Inactivar, Activar, Reenviar, Invitar y la lista, cuando los usa un admin o un superadmin, entonces se comportan como antes: el admin sigue invitando solo con rol `user`, no inactiva, activa ni reenvía filas `admin` ni `superadmin`, y `assignableRoles` no cambia.
- [ ] AC-14 (NUEVO, RN-08, Decisión 1) Dado un superadmin y una fila `invited` de rol `user` o `admin` (no propia), cuando pulsa «Editar», entonces el diálogo muestra solo el selector Rol (sin Nombre, Apellido ni Correo), «Guardar cambios» se habilita solo si el rol cambió, y al guardar se llama solo a `changeUserRole` (sin Clerk, sin leer ni escribir nombre) con `expectedRole`; el `update` exige `status = 'invited'` y `clerk_user_id is null`, y se revalida `/dashboard/users`. Si la fila ya no es `invited`, o el rol ya cambió, cero filas y `No se pudo cambiar el rol. Recarga la página.`
- [ ] AC-15 (NUEVO, RN-08, negativo) Dado un admin y una fila `invited` (cualquier rol), cuando se intenta editarla por UI o invocando la acción o el servicio con un payload de solo Rol, entonces no hay «Editar» en la UI y el servidor no escribe (cero filas). Dado cualquier actor y una fila `invited` con un payload completo (con nombre), entonces `CHANGED` sin Clerk ni escritura. Las filas `revoked` siguen sin «Editar». Reenviar y revocar invitaciones no cambian.
- [ ] AC-16 (NUEVO, control técnico (a2)) Dado un admin y una fila `user` activa y vinculada, cuando cambia el rol a `admin`, entonces se permite; y, con el mismo código, `assignableRoles("admin")` sigue siendo `[user]`, `inviteUser` de un admin con rol `admin` sigue en `FORBIDDEN`, y `revokeUser`, `activateUser` y `resendInvitation` de un admin sobre filas `admin` o `superadmin` siguen rechazados, sin cambio de comportamiento.
- [ ] AC-17 (NUEVO, hallazgo (f)) Dado el vínculo al primer inicio de sesión, cuando el reviewer lee el diff, entonces `lib/auth.ts` (`findActor`) no se modifica y sigue sin escribir `role` al vincular una fila `invited`: el rol guardado es el que rige tras aceptar.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | Matriz; `rowActions.edit` | AC-01 a AC-05, AC-09, AC-14, AC-15 | `utils/userPermissions.test.ts`, `services/users.service.test.ts` |
| RN-02 | `PANEL_ROLES`, `assertManager`, `id <> actor` | AC-04 a AC-07 | `schemas/users.schema.test.ts`, `services/users.service.test.ts` |
| RN-03 | acción, servicio y SQL | AC-04 a AC-06, AC-15, AC-16 | `services/users.service.test.ts` |
| RN-04 | `editUserInputSchema` estricto (unión) | AC-07, AC-08 | `schemas/users.schema.test.ts` |
| RN-05 | UI y eliminación de `ChangeRoleDialog` | AC-11, AC-14 | revisión del reviewer y AC-12 |
| RN-08 | `rowActions.edit` sobre `invited`; rama `invited` del SQL; modo solo Rol; hallazgo (f) | AC-14, AC-15, AC-17 | `utils/userPermissions.test.ts`, `services/users.service.test.ts`, `schemas/users.schema.test.ts`; AC-17 por lectura del diff |
| (a2) | `PANEL_ROLES` solo en `changeUserRole`; `assignableRoles` intacto | AC-13, AC-16 | `services/users.service.test.ts`, `utils/userPermissions.test.ts` |
| RN-06 | `updateUser` pasos 1 a 4; tabla de fallos | AC-01 a AC-03, AC-10 | `services/users.service.test.ts` |
| RN-07 | `logError` | AC-10 | `services/users.service.test.ts` |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Auth, sesión, RBAC (edición administrativa con rol) | Policies, schema y servicio con Clerk y SQL simulados | No (sin pruebas contra base) | Una ronda breve en DEV (AC-12); sin mutaciones hasta la aprobación e implementación | Escalada vertical y horizontal, IDOR, rol propio, `superadmin` (AC-04 a AC-08) | No aplica: sin cambios de esquema |

## Tests

Unitarios junto a cada archivo, solo lo nuevo o cambiado (sin repetir los casos de nombre ya cubiertos por USERS-1); sin tests de componentes (la UI solo compone):

- `modules/users/utils/userPermissions.test.ts`: `editName` pasa a `edit` y se elimina `changeRole` de las igualdades. Casos: `edit` verdadero para admin sobre `user` activo vinculado y superadmin sobre `user` y `admin` activos vinculados; falso para admin sobre `admin` y `superadmin`, superadmin sobre `superadmin`, `user`, propia fila, y filas `revoked` o `active` sin vínculo. NUEVO: `edit` verdadero para superadmin sobre `invited` de rol `user` y `admin`; falso para admin sobre `invited`. `assignableRoles` y las reglas `revoke`, `activate` y `resend` conservan sus casos existentes (sin añadir).
- `modules/users/schemas/users.schema.test.ts`: `editUserInputSchema` acepta un payload completo válido con `role` `user` y `admin` y un payload solo Rol (`id`, `role`, `expectedRole`); rechaza `role: "superadmin"`, `expectedRole` no válido, claves extra (`clerkUserId`, `email`), solo Rol con `firstName` o `lastName`, y solo uno de los dos nombres.
- `modules/users/services/users.service.test.ts` (se actualizan los casos existentes de `changeUserRole`, donde admin hoy es rechazado):
  - `changeUserRole`: admin `user` a `admin` correcto; admin sobre `admin` y sobre `superadmin` rechazado; superadmin sobre `user` y `admin` correcto; `user` rechazado; propia fila y rol nuevo `superadmin` rechazados sin SQL; el SQL contiene `id <> actor`, `status = 'active'` y `clerk_user_id is not null` y, para la rama `invited`, `status = 'invited'` y `clerk_user_id is null`. NUEVO: superadmin sobre fila `invited` correcto (el parámetro de superadmin va en `true`); admin sobre `invited` devuelve cero filas con `No se pudo cambiar el rol…` (parámetro en `false`); cero filas propaga ese mensaje.
  - Límites del admin sin cambios (AC-13, AC-16; se reutilizan los casos existentes de `inviteUser`, `revokeUser`, `activateUser` y `resendInvitation` y solo se añade el que falte): admin invita con rol `admin` → `FORBIDDEN`; admin revoca, activa y reenvía sobre filas `admin` y `superadmin` → `FORBIDDEN`; en la misma pasada admin cambia `user` a `admin` → permitido.
  - `updateUser`: payload solo Rol (modo `invited`): solo `changeUserRole`, sin Clerk y sin `updateUserName`; payload completo contra fila `invited`: `CHANGED` sin Clerk ni escritura; solo nombre (sin llamada al rol); solo rol (sin Clerk); ambos en orden Clerk, `update` de nombre, `update` de rol; ninguno cambió (sin llamadas); rol nuevo `superadmin` o propia fila sin tocar nada; el nombre falla (Clerk o comprobación previa) y el rol no se intenta; el rol falla tras escribir el nombre devuelve `ROLE_PARTIAL`, `updateUser` de Clerk una vez y log con `step: "neon-role-after-name"` y sin datos personales; el rol falla sin cambio de nombre propaga su mensaje, no `ROLE_PARTIAL`.
- `modules/users/actions/users.actions.ts`: sin archivo de test (no existe hoy; es composición de `mutate`, ya cubierta en servicio y schema).
- Verificación del reviewer: estilos y reglas de `docs/SETUP.md` (SOLID, DRY, KISS, YAGNI, `"use client"`, lint, build); confirmar en el diff real que no se tocó `lib/roles*`, `lib/auth.ts` (AC-17) ni archivos de gobierno; no quedan referencias a `ChangeRoleDialog`, `updateUserRoleAction`, `updateUserNameAction`, `editName` ni `changeRole`.

## Plan de tareas

### Fase 1
- [x] T1 — Schema (unión completo/solo Rol), tipo y regla `edit` (incluye superadmin sobre `invited`) con sus tests · archivos: `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts`, `modules/users/types/users.types.ts`, `modules/users/utils/userPermissions.ts`, `modules/users/utils/userPermissions.test.ts` · depende de: — · secuencial (base)
- [x] T2 — `changeUserRole` abierto a admin (y rama `invited` solo superadmin), `updateUser` con modo solo Rol, `updateUserAction`, y tests incluidos los límites del admin sin cambios · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`, `modules/users/actions/users.actions.ts` · depende de: T1 · secuencial (la UI importa la acción)
- [x] T3 — UI: Rol en el diálogo (modo solo Rol para filas `invited`), retirar «Cambiar rol» del menú y del detalle, borrar `ChangeRoleDialog` · archivos: `modules/users/components/EditUserDialog.tsx`, `modules/users/components/UsersView.tsx`, `modules/users/components/UserDetailSheet.tsx`, `modules/users/components/ChangeRoleDialog.tsx` (se elimina) · depende de: T1, T2 · secuencial

Total: 12 archivos (5 + 3 + 4; ninguno nuevo, uno eliminado), 3 tareas, una fase. No hay tareas paralelizables: T3 importa lo de T2, que usa lo de T1, y los tres tocan módulos compartidos del mismo dominio. No hay archivos sensibles ni de gobierno.

## Preguntas abiertas

Ninguna. Resueltas por el propietario e incorporadas: filas `invited` (Decisión 1: se conserva la edición de rol, solo superadmin, RN-08) y ascenso de admin sin reversión ni confirmación (Decisión 2, en «Declaración de ampliación de permisos»). El hallazgo (f) no deja riesgo abierto.
