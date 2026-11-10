# Recuperación de inconsistencias Clerk–Neon

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-sync-clerk-neon
- Riesgo: alto (identidad, estado de acceso y borrado/escritura en BD con integración externa)
- Ruta: SDD-ADVANCED (disparador: autenticación, roles y permisos, estado de acceso, integración externa Clerk)
- Fase actual: 1

## Objetivo

Neon es la autoridad de roles, permisos y estado; Clerk, de identidad y autenticación. Hoy, si una persona se borra desde el dashboard de Clerk, su fila de Neon queda `active` (o `revoked`) con un `clerk_user_id` muerto: no puede entrar, el admin no puede editarle el nombre (404 de Clerk se relanza como error genérico), `inviteUser` la rechaza ("ya tiene acceso") y la única salida es Eliminar + reinvitar, que pierde perfil (cascade) y rol (`users-hard-delete.md` l.213 lo declara riesgo residual).

Se entrega un mecanismo mínimo: acción manual "Recuperar acceso" que un admin/superadmin lanza desde el panel de usuarios. La acción confirma contra Clerk que la cuenta ya no existe y devuelve la fila a `invited` conservando `id`, rol y perfil, con una invitación nueva. El re-vínculo sigue siendo el de D2 (invitación + email primario verificado).

## Alcance y reglas

- Incluye (Fase 1): service `recoverUserAccess`, server action, schema de entrada, `rowActions(...).recover`, entrada de menú y diálogo de confirmación (con casilla de verificación de identidad para filas admin); tabla de estados PARTIAL (análisis).
- No incluye:
  - Webhooks (`user.deleted` u otros), `verifyWebhook`, ruta `app/api/webhooks/*`, svix, dependencias nuevas: diferidos a una iniciativa posterior.
  - Jobs, colas, cron, reconciliación automática o masiva, barrido de toda la tabla.
  - Migraciones, DDL o cambios en `db/`: el esquema actual basta (`clerk_user_id` nullable, `status='invited'`, `invitation_id` unique). Sin tabla de auditoría (YAGNI, ver No funcionales).
  - Re-vínculo automático por coincidencia de email; detección o mutación automática; detección por email.
  - Recuperar filas `revoked`, `invited` o de superadmin; recuperarse a sí mismo.
  - Cambios en `lib/auth.ts`, `lib/roles*`, `proxy.ts`, `package.json`, `app/layout.tsx`, `docs/SETUP.md`, `.claude/*` (SEC-1 los toca en otro worktree; ninguno es necesario en esta fase).
  - Cambiar el mensaje genérico de editar nombre ante 404 (mejora posible, fuera de alcance; la acción recuperar es la salida).
- RN-01: Solo `users:manage` y con la matriz vigente: el actor gestiona el rol de la fila (`canManageRole`), no es la propia fila y el objetivo nunca es superadmin. Se valida en servidor contra el rol leído de Neon en la petición.
- RN-02: Solo filas `status='active'` con `clerk_user_id` no nulo. `revoked` queda excluida de forma definitiva: Recuperar acceso nunca reactiva una fila revocada (decisión del propietario). Camino manual existente: Activar y, si procede, Recuperar acceso.
- RN-03: Solo un 404 válido de `users.getUser(clerk_user_id)` (el id leído de la fila en servidor) confirma ausencia. Es válido únicamente si `isClerkAPIResponseError(error)` Y `error.status === 404` Y `error.errors[0]?.code === "resource_not_found"` (constante nombrada y privada en `users.service.ts`). Esto es MÁS estricto que el repo actual, que valida 404 solo por `status` (`users.service.ts` l.103 y l.437): aquí un 404 falso autorizaría invalidar un vínculo vivo. Un 404 con otro código, o un error que no sea de Clerk, bloquea sin invitación ni UPDATE. Cualquier otro resultado (200, 401, 403, 429, 5xx, error de red) aborta igual, sin escribir en Neon ni crear invitación. Supuesto a verificar antes de implementar (T3): que el código real de Clerk para usuario inexistente es `resource_not_found` (no se pudo leer los `.d.ts`; no hay `node_modules`); si el implementador no puede confirmarlo, debe detenerse y consultar, no relajar la validación.
- RN-04: El cliente envía `id` y, solo para filas admin, `identityVerified`. El `clerk_user_id` y el rol se leen en servidor (D38); nunca vienen del cliente.
- RN-05: La escritura en Neon es una única sentencia condicional que pone `clerk_user_id=null`, `status='invited'`, `invitation_id=<nueva>` y `updated_at=now()`, con `where` sobre `id` original, `status='active'`, `clerk_user_id` igual al leído, `invitation_id is not distinct from` el leído, `role` leído, `email` leído, `id <> actor.id`, `role = any(assignableRoles(actor.role))` y `role <> 'superadmin'`. Conserva `id`, rol, email y perfil (filas hijas por FK). Afectar 0 filas devuelve CHANGED. No se recuperan permisos por email.
- RN-06: Orden sin transacción cross-system: (1) leer fila, validar estado, matriz y confirmación (RN-11) ANTES de llamar a Clerk, (2) confirmar 404 en Clerk, (3) crear invitación SIN `ignoreExisting` (RN-12), (4) UPDATE condicional. Si (4) lanza o afecta 0 filas: `revokeQuietly(nueva)`, que ante fallo de la revocación lo registra con `logError("compensating revoke", error)` (`users.service.ts` l.110-116, verificado) y el error original prevalece. La compensación se considera exitosa SOLO si `revokeInvitation` resuelve sin error. Decisión sobre 404: un 404 al revocar significa que Clerk confirma que esa invitación no existe (no hay invitación viva que revocar) y cuenta como hecho, coherente con R6/E7 del código actual (l.94-107). Cualquier otro error: `revokeQuietly` no lanza, registra `logError("compensating revoke")` con code/message/step y queda el riesgo residual: invitación viva en Clerk sin fila coherente en Neon. Vía de limpieza verificada en el código: ninguna automática, y ninguna desde el panel, porque Revocar/Reenviar/Eliminar operan sobre `invitation_id` de la fila de Neon, que nunca recibió la invitación huérfana; solo queda revocarla manualmente en el dashboard de Clerk (fuera del código del repo).
- RN-07: Idempotencia. Repetir tras éxito: la fila ya es `invited` y sin `clerk_user_id`; la validación de estado del paso (1) responde CHANGED sin llamar a `getUser` ni a `createInvitation` ni escribir. Repetir tras fallo en (3) o (4): no se escribió nada en Neon; una invitación huérfana (compensación fallida) queda viva en Clerk y no se reutiliza: el reintento puede fallar por RN-12 hasta que se revoque manualmente en el dashboard de Clerk (el panel no la ve; ver RN-06). No hay estado intermedio nuevo en Neon.
- RN-08: El re-vínculo no cambia: `findActor` vincula solo por email primario verificado, `status='invited'` y `clerk_user_id is null` (D2). Esta spec no modifica ese flujo ni sincroniza por coincidencia de email.
- RN-09: Los logs llevan `code`, `message` y `step`; nunca email, nombre ni ids de Clerk (D42). El usuario ve solo mensajes de `UsersError`; el resto, el mensaje genérico.
- RN-10: Detección solo lectura y a demanda: el único acceso a Clerk previo a mutar es `getUser` dentro de la acción. No hay señal automática en el listado en Fase 1. El botón se muestra en todas las filas elegibles (active, vinculadas, dentro de `manages`) a managers con permiso; el 404 de Clerk se verifica al ejecutar, no para mostrar.
- RN-11: Recuperar una fila `admin` exige actor superadmin y `identityVerified: true` (el superadmin atestigua haber verificado la identidad de la persona por un canal administrativo fuera de banda). El servidor decide si se exige por el rol leído de la fila, nunca por el cliente; sin la confirmación se rechaza antes de llamar a Clerk. Para filas `user`, admin o superadmin recuperan sin confirmación.
- RN-12: Si ya existe otra cuenta o invitación Clerk con el mismo email, es un fallo controlado: `UsersError` con mensaje, sin cambios en Neon. Prohibido `ignoreExisting: true` en esta operación y prohibida la revinculación automática. `createInvitation` privado se parametriza (`{ ignoreExisting = true } = {}`); invitar y reenviar siguen con el default `true` (sin cambio de comportamiento) y Recuperar pasa `{ ignoreExisting: false }`. Cualquier error de `createInvitation` en Recuperar se trata como fallo controlado sin cambios en Neon; supuesto a verificar en test con mock (no verificado contra Clerk real): que Clerk rechace el duplicado sin `ignoreExisting`. No se inventan códigos de error.

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| superadmin | Recuperar acceso de fila `user` `active` vinculada | Sí | Clerk confirma 404; no es sí mismo |
| superadmin | Recuperar acceso de fila `admin` `active` vinculada | Sí | Clerk confirma 404; `identityVerified: true` (RN-11); no es sí mismo |
| superadmin | Recuperar fila `admin` sin `identityVerified` | No | Rechazo antes de Clerk (RN-11) |
| admin | Recuperar acceso de fila `user` `active` vinculada | Sí | Clerk confirma 404; no es sí mismo |
| admin | Recuperar fila `admin` o `superadmin` | No | `canManageRole` falso (escalada horizontal/vertical) |
| superadmin | Recuperar otro superadmin | No | `canManageRole` falso; nunca se toca un superadmin |
| admin / superadmin | Recuperar su propia fila | No | `id <> actor.id` |
| admin / superadmin | Recuperar fila `revoked` o `invited` | No | RN-02: `revoked` nunca se reactiva |
| user, sin sesión, fila revocada | Cualquier uso de la acción | No | `getActor()` nulo o sin `users:manage` (revocado: `findActor` ya lo deniega) |
| Cualquiera | Recuperar con `id` ajeno al módulo o inexistente | No | readRow vacío → CHANGED; el cliente no aporta `clerk_user_id` |

Último superadmin: no aplica, porque el objetivo nunca es superadmin y el conteo de superadmins activos no cambia (misma justificación que `deleteUser`).

## Diseño y dependencias

- Rutas `app/`: sin cambios (la acción vive en la página existente `/dashboard/users`).
- `modules/users/utils/userPermissions.ts` — existente; se añade `recover` a `rowActions` (`manages && status==='active' && linked && role!=='superadmin'`).
- `modules/users/services/users.service.ts` — existente; se añade `recoverUserAccess(actor, input, redirectUrl)` reutilizando `assertManager`, `readRow`, `revokeQuietly`, `logError`, `UsersError`, `CHANGED`; y se parametriza el `createInvitation` privado (l.83-92, hoy fija `ignoreExisting: true`) con `{ ignoreExisting = true } = {}` sin cambiar invitar/reenviar. En Recuperar se envuelve la llamada en try/catch: `logError("recover invitation", error)` y `throw new UsersError(<mensaje de RN-12>)`. Se evita archivo nuevo porque esos helpers son privados del archivo.
- `modules/users/actions/users.actions.ts` — existente; `recoverUserAccessAction(input)` con `mutate` + `recoverInputSchema` + `signUpUrl()` (patrón de `resendInvitationAction`).
- `modules/users/schemas/users.schema.ts` y `users.schema.test.ts` — existentes; se añade `recoverInputSchema` (estricto) y sus pruebas.
- `modules/users/components/RecoverUserDialog.tsx` — nuevo (no existe diálogo de confirmación equivalente; sigue la forma de `DeleteUserDialog.tsx`, usa los componentes shadcn ya instalados que éste usa). Para filas admin muestra una casilla obligatoria de verificación de identidad; si el componente `checkbox` no está instalado, se usa el input nativo `<input type="checkbox">` (sin tocar `components/ui/`).
- `modules/users/components/UsersView.tsx` — existente; entrada de menú "Recuperar acceso" condicionada a `actions.recover`, con `runAction` como en "Reenviar invitación".
- Clerk: `clerkClient().users.getUser`, `invitations.createInvitation`/`revokeInvitation`. Sin dependencias nuevas.

## Contratos y datos

```ts
// recoverInputSchema: z.strictObject({ id: z.uuid(), identityVerified: z.boolean().optional() })
type RecoverInput = { id: string; identityVerified?: boolean };
// El servidor exige identityVerified === true solo si el rol LEÍDO de la fila es 'admin' (RN-11).
export async function recoverUserAccessAction(input: unknown): Promise<ActionResult>;
// ActionResult = { ok: true } | { ok: false; error: string }
export async function recoverUserAccess(actor: Actor, input: RecoverInput, redirectUrl: string): Promise<void>;
```

Mensajes `UsersError`: FORBIDDEN, CHANGED (existentes); `"La cuenta todavía existe en el proveedor de acceso. No hay nada que recuperar."` (getUser 200); `"Para recuperar a un administrador debes confirmar que verificaste su identidad."` (falta `identityVerified`); y `"No se pudo crear la invitación. Si el correo ya tiene una cuenta o invitación pendiente en el proveedor de acceso, resuélvelo allí e inténtalo de nuevo."` (error de createInvitation).

Datos: sin migraciones. El esquema actual basta (`clerk_user_id` nullable; `invitation_id` unique, la nueva invitación tiene id nuevo; filas de perfil `on delete cascade` no se tocan porque no se borra la fila).

Efecto en Neon (un statement):

```sql
update app_users
set clerk_user_id = null, status = 'invited', invitation_id = $nuevo, updated_at = now()
where id = $id and status = 'active' and clerk_user_id = $leido
  and invitation_id is not distinct from $invitacion_leida and role = $leido
  and email = $leido and id <> $actor and role <> 'superadmin' and role = any($assignable)
returning id
```

## Análisis: estados PARTIAL por operación

Solo se cubren brechas reales; lo ya resuelto no se duplica.

| Operación | Fallo posible | Detección actual | Recuperación actual | Brecha real |
|---|---|---|---|---|
| Invitar | Clerk ok, insert falla | Error del insert | `revokeQuietly` de la invitación | Compensación fallida solo logueada: invitación viva sin fila (inofensiva: sin fila no hay acceso, D2) |
| Editar nombre | Clerk ok, Neon falla o 0 filas | `PARTIAL` | Reintentar editar (idempotente) | Si Clerk responde 404 (usuario borrado en Clerk) error genérico: **cubierta por Recuperar acceso** |
| Editar rol | Nombre ok, rol falla | `ROLE_PARTIAL` | Reintentar | Ninguna (solo Neon) |
| Revocar | Revoca invitación ok, Neon falla | CHANGED/error | Reintentar (404 = hecho) | Ninguna |
| Activar | Solo Neon | Condicional | n/a | Fila activa con id muerto: **cubierta por Recuperar acceso** |
| Reenviar | Invitación nueva ok, UPDATE falla | Compensación | `revokeQuietly` | Igual que Invitar |
| Eliminar | Clerk ok, Neon falla | `PARTIAL_DELETE` | Reintentar (404 = hecho) | Ninguna |
| Vincular primer acceso (`findActor`) | Varias filas, sesión sin email verificado | Denegar | Admin reinvita | Ninguna |
| `syncOwnIdentity` | Falla copia nombre/email | Nunca lanza | Próximo login | Ninguna |
| Borrado de usuario desde dashboard de Clerk | Fila `active`/`revoked` con id muerto | Ninguna (no entra; edición falla) | Eliminar + reinvitar (pierde perfil y rol) | **Brecha única: se cubre en Fase 1** |

## Análisis: webhooks (diferidos a una iniciativa posterior)

Se difieren por compatibilidad y costo frente a un beneficio no demostrado:
- `proxy.ts` solo protege `/dashboard(.*)`, pero su matcher incluye `/(api|trpc)(.*)`: una ruta `/api/webhooks/*` sería pública; solo la verificación de firma svix la protege y exigiría tocar archivos compartidos o sensibles.
- Entrega at-least-once, con reintentos, duplicados y fuera de orden: requiere idempotencia y un estado de "huérfano" que hoy no existe en el esquema (migración).
- `user.deleted` solo podría señalar un huérfano; nunca debe cambiar rol, permisos o estado de negocio (Neon es la autoridad). Con señal o sin ella, el admin sigue necesitando la acción manual de esta fase.
- `auth-clerk-neon.md` D2/D32 decidieron "sin webhooks".
Si en el futuro hay evidencia de necesidad: solo evento `user.deleted` → marcar/señalar, jamás roles, en una spec nueva (la disponibilidad de `verifyWebhook` se verificaría entonces).

## Análisis: riesgo de toma de cuenta y revoked

- El re-vínculo exige acción manual de un manager, invitación Clerk, email primario verificado y `status='invited'` (D2, igual que cualquier invitación hoy). La fila no queda vinculable por email sin esa acción. Riesgo residual: quien controle el email lo vincula con el rol conservado; es el mismo modelo de confianza de una invitación nueva, y el admin puede revocar mientras esté `invited`.
- Si el usuario ya se volvió a registrar en Clerk con el mismo email (id nuevo), o existe otra invitación con ese email, la invitación sin `ignoreExisting` falla de forma controlada (RN-12): no hay revinculación automática ni cambios en Neon; el admin resuelve el conflicto en Clerk.
- Recuperar una cuenta `admin` es el vector de mayor riesgo (quien controle el email hereda el rol admin): solo superadmin y con atestación explícita de verificación de identidad fuera de banda (RN-11).
- `revoked`: nunca se reactiva con esta acción (RN-02).

## No funcionales

- Una llamada getUser + una createInvitation + un UPDATE por acción; acción manual, sin carga recurrente. Sin reintentos automáticos.
- Auditoría/privacidad: logs estructurados (`code`, `message`, `step`, sin PII) vía `logError`. Sin tabla de auditoría (decisión del propietario; añadirla exigiría migración).
- `revalidatePath("/dashboard/users")` vía `mutate`.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| IDOR: id de otra fila o inexistente | readRow vacío; matriz | CHANGED o FORBIDDEN sin tocar Clerk | n/a |
| Escalada vertical/horizontal (admin sobre admin/superadmin) | `rowActions.recover` en servidor | FORBIDDEN antes de Clerk | n/a |
| Acción sobre sí mismo | `id === actor.id` | FORBIDDEN | n/a |
| Usuario existe en Clerk (falso huérfano) | getUser 200 | Mensaje "todavía existe"; no se escribe | n/a |
| getUser falla (401/403/429/5xx/red; no 404) | Error de Clerk | Aborta, mensaje genérico, log; sin invitación ni UPDATE | Reintentar |
| Admin objetivo sin `identityVerified` | Rol leído de la fila | UsersError, sin llamar a Clerk | Confirmar en el diálogo |
| Email ya existe en Clerk (cuenta o invitación) | createInvitation lanza (sin `ignoreExisting`) | UsersError RN-12; Neon intacto; sin revinculación | Admin resuelve en Clerk y reintenta |
| createInvitation falla (otro motivo) | Excepción | Mismo tratamiento; Neon intacto | Reintentar |
| UPDATE falla o 0 filas | Excepción / returning vacío | `revokeQuietly` (loguea si falla), error/CHANGED | Recargar y reintentar; invitación huérfana, si queda, se revoca en Clerk |
| Doble clic / repetición tras éxito | Fila ya `invited` (paso 1) | CHANGED sin llamar a Clerk | Usar Reenviar invitación |
| Fila cambió entre lectura y escritura | WHERE condicional | CHANGED | Recargar |
| Rol del actor revocado | `getActor()` / `can` | Denegado en acción y service | n/a |
| Fuga de PII en logs | Revisión + prueba | Solo code/message/step | n/a |

Plan de recuperación/rollback: no hay migración que revertir. Revertir la fase es revertir el código; una fila ya devuelta a `invited` se corrige con Revocar (existente) o Reenviar invitación; si la persona quedó sin acceso por error, no se perdió rol ni perfil. No se ejecuta nada contra Clerk/Neon reales durante el desarrollo.

## Criterios de aceptación

- [x] AC-01 (RN-01, RN-05) Dado un admin y una fila `user` `active` vinculada cuyo Clerk responde 404, cuando recupera acceso, entonces `createInvitation` se llama con `ignoreExisting: false`, la fila queda `invited`, `clerk_user_id` nulo, con la nueva `invitation_id`, y conserva `id`, rol, email y perfil.
- [x] AC-02 (RN-01, negativo) Dado un actor admin y una fila `admin` o `superadmin` (con o sin `identityVerified`), o un superadmin y una fila `superadmin`, cuando recupera, entonces FORBIDDEN y no se llama a Clerk.
- [x] AC-03 (RN-01, negativo) Dado un actor y su propia fila, cuando recupera, entonces FORBIDDEN.
- [x] AC-04 (RN-02, negativo) Dado una fila `revoked` (nunca se reactiva), `invited` o sin vínculo, cuando recupera, entonces CHANGED/FORBIDDEN, la fila no cambia y no se llama a Clerk.
- [x] AC-05 (RN-03, negativo) Dado que getUser responde 200 (la cuenta existe), cuando recupera, entonces mensaje "todavía existe" y ni invitación ni UPDATE. Con 404 y `code: "resource_not_found"` sobre un error de Clerk (`isClerkAPIResponseError`) sí procede (caso positivo de la validación).
- [x] AC-06 (RN-03, negativo) Dado que getUser falla con 401 o 403, o con 404 con otro código (distinto de `resource_not_found`), o con 404 que no es `isClerkAPIResponseError`, cuando recupera, entonces error genérico, Neon intacto y `createInvitation` sin llamar (cada caso es una prueba explícita).
- [x] AC-07 (RN-04, negativo) Dado un input con `clerkUserId` u otra clave extra, o `id` no uuid, cuando se llama la acción, entonces se rechaza por `recoverInputSchema` estricto sin llamar al service.
- [x] AC-08 (RN-06) Dado que createInvitation falla por cualquier motivo, cuando recupera, entonces Neon queda sin cambios y se lanza el `UsersError` de RN-12.
- [x] AC-09 (RN-05, RN-06) Dado que el UPDATE lanza o afecta 0 filas (p. ej. cambió `status`, `clerk_user_id` o `invitation_id` entre lectura y escritura, o el rol salió de `assignableRoles`), cuando recupera, entonces se revoca la invitación nueva y se devuelve error/CHANGED; el SQL incluye `id`, `status='active'`, `clerk_user_id` e `invitation_id` leídos, `id <> actor.id`, `role <> 'superadmin'` y `role = any(assignableRoles)`.
- [x] AC-10 (RN-06, RN-07) Dado que el UPDATE falla y se compensa con `revokeInvitation`, cuando: (a) resuelve OK, entonces compensación exitosa; (b) responde 404, entonces cuenta como hecho (sin log de fallo); (c) falla con otro error, entonces `revokeQuietly` no lanza, registra `logError("compensating revoke")` con code/message/step y la operación original igual falla con su propio error.
- [x] AC-11 (RN-07) Dado que la acción ya tuvo éxito (fila `invited`, sin `clerk_user_id`), cuando se repite, entonces CHANGED y la prueba afirma cero llamadas a `getUser` y a `createInvitation` y ningún UPDATE.
- [x] AC-12 (RN-08) Dado el código de esta fase, cuando se revisa el diff, entonces `lib/auth.ts` no cambia y no existe búsqueda ni vínculo por email fuera de D2.
- [x] AC-13 (RN-09) Dado cualquier fallo, cuando se registra, entonces el log contiene solo `code`, `message`, `step`; ningún email, nombre ni id de Clerk.
- [x] AC-14 (RN-01) Dado `rowActions`, cuando se evalúa por rol y estado, entonces `recover` es verdadero solo para active+linked, no self, `canManageRole` y no superadmin, sin consultar Clerk (RN-10); la UI lo oculta si es falso.
- [x] AC-15 (RN-01, negativo) Dado un actor sin `users:manage` o sin sesión, cuando llama la acción, entonces mensaje genérico sin llamar al service.
- [x] AC-16 (RN-10) Dado el diff de la fase, cuando se revisa, entonces no hay rutas en `app/api`, webhooks, `verifyWebhook`, migraciones, `db/`, dependencias nuevas ni archivos de gobierno ni de SEC-1.
- [x] AC-17 (RN-03, negativo) Dado que getUser responde 429, cuando recupera, entonces error genérico, Neon intacto y sin invitación.
- [x] AC-18 (RN-03, negativo) Dado que getUser falla con 5xx o error de red, cuando recupera, entonces error genérico, Neon intacto y sin invitación.
- [x] AC-19 (RN-12, negativo) Dado que Clerk rechaza createInvitation porque el email ya tiene cuenta o invitación (mock), cuando recupera, entonces `UsersError` de RN-12, sin UPDATE, sin revinculación, y `createInvitation` nunca se invoca con `ignoreExisting: true`; invitar y reenviar siguen llamándolo con `true` (prueba de no regresión).
- [x] AC-20 (RN-11, negativo) Dado un actor superadmin y una fila `admin` sin `identityVerified: true`, cuando recupera, entonces `UsersError` y no se llama a Clerk; la decisión se basa en el rol leído de la fila aunque el cliente no lo declare.
- [x] AC-21 (RN-11) Dado un actor superadmin y una fila `admin` con `identityVerified: true` y Clerk 404, cuando recupera, entonces la fila queda `invited` conservando rol admin.
- [x] AC-22 (RN-11) Dado un actor admin o superadmin y una fila `user`, cuando recupera sin `identityVerified`, entonces procede (no se exige).
- [x] AC-23 (RN-11, UI) Dado el diálogo de una fila admin, cuando se abre, entonces muestra la casilla de verificación de identidad y deshabilita Confirmar hasta marcarla; para filas `user` no la muestra.
- [x] AC-24 (RN-10, UI) Dado un manager con permiso y una fila elegible, cuando se abre su menú, entonces aparece "Recuperar acceso" sin consultar a Clerk; para actores sin permiso o filas no elegibles no aparece.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | Matriz de acceso, `rowActions.recover` | AC-01, AC-02, AC-03, AC-14, AC-15 | `modules/users/utils/userPermissions.test.ts`, `modules/users/services/users.service.test.ts` |
| RN-02 | Matriz de acceso | AC-04 | `modules/users/services/users.service.test.ts` |
| RN-03 | Fallos | AC-05, AC-06, AC-17, AC-18 | `modules/users/services/users.service.test.ts` (404 válido; 404 con otro código; 404 sin `isClerkAPIResponseError`; 401/403/429/5xx/red) |
| RN-04 | Contrato | AC-07 | `modules/users/schemas/users.schema.test.ts` y `users.service.test.ts` |
| RN-05 | SQL | AC-01, AC-09 | `modules/users/services/users.service.test.ts` |
| RN-06 | Orden y compensación | AC-08, AC-09, AC-10 | `modules/users/services/users.service.test.ts` (revoke OK; revoke 404 = hecho; revoke otro error: registrado, no lanza, el error original prevalece) |
| RN-07 | Idempotencia | AC-10, AC-11 | `modules/users/services/users.service.test.ts` |
| RN-11 | Contrato, matriz | AC-20, AC-21, AC-22, AC-23 | `users.service.test.ts`, `users.schema.test.ts`, `RecoverUserDialog.test.tsx` |
| RN-12 | Diseño, fallos | AC-19, AC-08 | `modules/users/services/users.service.test.ts` |
| RN-08 | Diseño | AC-12 | Revisión del reviewer sobre el diff |
| RN-09 | No funcionales | AC-13 | `modules/users/services/users.service.test.ts` (espía `console.error`) |
| RN-10 | Alcance, UI | AC-16, AC-24 | Revisión del reviewer sobre el diff; `modules/users/utils/userPermissions.test.ts` (visibilidad de la entrada de menú vía `rowActions`) |

AC-14, AC-23 y AC-24 (UI): `modules/users/components/RecoverUserDialog.test.tsx` cubre confirmar/cancelar/error y la casilla admin.

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Auth, sesión, RBAC (acción de recuperación) | `rowActions.recover`; schema; service con Clerk y `getDb` mockeados (nunca servicios reales): éxito, 200, 401/403/429/5xx/red, IDOR, self, superadmin, revoked, invited, email existente en Clerk, confirmación admin, compensación, repetición con cero llamadas a createInvitation, logs sin PII | NO EJECUTADO: sin Clerk ni BD reales en esta fase; mocks (motivo: no autorizados contra servicios reales) | Manual solo por el usuario en entorno de desarrollo: borrar usuario en Clerk de prueba, Recuperar acceso, aceptar invitación | Obligatoria: IDOR, escalada horizontal y vertical, rol revocado, self | No aplica: sin migraciones; rollback = revertir código |
| Diálogo de UI | Confirmar, cancelar, mensaje de error | No | Smoke visual | No | No |

## Plan de tareas

### Fase 1
- [x] T1 — `recover` en `rowActions` y sus pruebas · archivos: `modules/users/utils/userPermissions.ts`, `modules/users/utils/userPermissions.test.ts` · depende de: — · paralelo (con T2; archivos disjuntos)
- [x] T2 — `recoverInputSchema` y sus pruebas · archivos: `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts` · depende de: — · paralelo (con T1)
- [x] T3 — Service `recoverUserAccess` + parametrizar `createInvitation`, con pruebas con mocks · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts` · depende de: T1, T2 · secuencial
- [x] T4 — Server action `recoverUserAccessAction` · archivos: `modules/users/actions/users.actions.ts` · depende de: T3 · paralelo (con T5; archivos disjuntos, contrato fijado en esta spec)
- [x] T5 — Diálogo y entrada de menú · archivos: `modules/users/components/RecoverUserDialog.tsx`, `modules/users/components/RecoverUserDialog.test.tsx`, `modules/users/components/UsersView.tsx` · depende de: T3 (consume `recoverUserAccessAction` por contrato de T4) · paralelo (con T4)

Total: 5 tareas, 10 archivos, sin archivos compartidos ni de SEC-1. Una iniciativa posterior (webhook `user.deleted`, solo señal) no está planificada: requiere evidencia de necesidad y una spec nueva.

## Preguntas abiertas

Ninguna decisión pendiente del propietario. Verificación técnica previa:
- Antes de T3: `npm ci` en entorno autorizado y confirmar por tipos que `createInvitation` acepta `ignoreExisting: false`, `getUser`, `revokeInvitation` y los campos `status`/`errors[0].code` de `isClerkAPIResponseError` (@clerk/nextjs 7.9.25, @clerk/backend 3.27.0 según package-lock); si no compila, bloquear. Incluye confirmar el código `resource_not_found` (RN-03).

Supuesto a verificar en test con mock (no bloquea): que Clerk rechace `createInvitation` duplicado sin `ignoreExisting` (RN-12); cualquier error se trata como fallo controlado.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz figura como NO EJECUTADO con su motivo.
