# Detección de identidades Clerk eliminadas (SYNC-2)

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-sync-2-detection
- Riesgo: alto (identidad, estado de acceso, integración externa Clerk, pantalla de gobierno de acceso; solo lectura)
- Ruta: SDD-ADVANCED (disparador: autenticación/roles y permisos, integración externa Clerk)
- Fase actual: Fase 1

## Objetivo

SYNC-1 permite recuperar a mano a un usuario `active` cuya cuenta fue borrada en Clerk, pero hoy el admin no tiene forma de saber qué filas están afectadas: el botón «Recuperar acceso» se ofrece en todas las filas elegibles y la ausencia solo se comprueba al ejecutar (SYNC-1 RN-10). SYNC-2 añade detección de solo lectura al consultar `/dashboard/users`: las filas `active` cuya identidad vinculada Clerk confirma como inexistente muestran la advertencia «Identidad no encontrada». Neon sigue siendo la autoridad de roles, permisos y estado; Clerk, de identidad. La detección es informativa: nunca modifica Neon ni dispara recuperación, revocación o invitaciones.

## Alcance y reglas

- Incluye (Fase 1):
  - Estado de identidad por fila (`verified`, `not_found`, `unverified`, y `unlinked` derivado de `linked`) calculado en servidor para las filas de la página actual (≤ PAGE_SIZE = 8).
  - Ampliar `getClerkActivity` (misma llamada por lote `getUserList`) con verificación individual `getUser` solo para los ids ausentes del lote cuya fila el actor puede gestionar (RN-08), bajo un presupuesto total de 5 s (RN-10). El sitio de llamada en `page.tsx` cambia solo para pasar el conjunto de filas verificables.
  - Advertencia visual en filas `active` con `not_found` que el actor puede gestionar; estado de identidad visible en el detalle solo para esas filas.
  - La recuperación manual de SYNC-1 (`rowActions.recover`, `RecoverUserDialog`, `recoverUserAccess`) se reutiliza tal cual como salida; la advertencia no abre nada por sí sola.
- No incluye:
  - Webhooks (SYNC-3 posterior), jobs, cron, reconciliación o barrido masivo; solo se verifica la página consultada.
  - Escritura en Neon, revocación, recuperación, activación o invitación automáticas; cambiar `active/invited/revoked`.
  - Cambiar los mecanismos de recuperación de SYNC-1 (sin cambio de matriz, diálogo, orden ni SQL). Único toque permitido, sin cambio de comportamiento: extraer el predicado de «404 resource_not_found» ya existente a un helper privado compartido (RN-04).
  - Migraciones, `db/`, dependencias nuevas, rutas `app/api`, archivos de gobierno o sensibles.
  - Reintentos, caché, timeout configurable (el presupuesto es una constante), persistencia del estado de identidad, detección por email, ni cambios en `lib/auth.ts`.
  - Advertencia en filas `revoked` o `invited` (la detección las calcula pero solo la fila `active` la muestra; el detalle sí muestra el estado, si el actor puede gestionar la fila).
  - Ampliar permisos: no hay permisos nuevos ni cambios a `rowActions`, `canManageRole` ni `assignableRoles`.
- RN-01 Autoridad: Neon decide rol, permisos y estado; el resultado de Clerk solo produce una señal de presentación. Ningún estado de identidad cambia qué acciones ofrece `rowActions` ni su validación en servidor.
- RN-02 Cuatro estados, calculados así:
  - `unlinked`: la fila no tiene `clerk_user_id` (`row.linked === false`); no se llama a Clerk.
  - `verified`: el id aparece en el lote `getUserList`, o el `getUser` individual responde 200.
  - `not_found`: `getUser(id)` falla con `isClerkAPIResponseError` Y `status === 404` Y `errors[0]?.code === "resource_not_found"` (misma regla estricta de SYNC-1 RN-03). Nunca se concluye `not_found` solo por ausencia en el lote.
  - `unverified`: cualquier otro resultado: timeout del presupuesto (RN-10), error de red, 401/403, 429, 5xx, 404 con otro código o sin `isClerkAPIResponseError`, o fallo del lote completo. Además, toda fila que el actor no puede gestionar (RN-08) sale `unverified` del servidor sin llamar a `getUser`. Timeout, 429 y cualquier error nunca producen `not_found`; este solo se concluye con 404 + `resource_not_found` recibido dentro del presupuesto.
- RN-03 Cómo distinguir 404 real de ausencia por lote (decisión de diseño con el código real): `getUserList({ userId: [...], limit })` devuelve solo los usuarios que existen; un id ausente en `data` es indistinguible de uno que no se pudo consultar por la API (la lista no reporta errores por id), y un fallo del lote es un error único. Por tanto: (1) un lote exitoso es la fuente de `verified`; (2) cada id vinculado ausente del lote se confirma con `getUser(id)`, el mismo método que SYNC-1 usa para confirmar antes de recuperar, de modo que SYNC-2 y SYNC-1 nunca discrepan; (3) si el lote entero falla (429/5xx/red), TODOS los ids vinculados quedan `unverified` y NO se hacen `getUser` individuales (no amplificar llamadas contra un Clerk que ya falla ni agravar un 429); (4) el costo en el caso normal es 1 llamada SDK a `getUserList`, que hace 2 peticiones HTTP (la lista y un `getCount` interno en `Promise.all`, `@clerk/backend/dist/chunk-CSXNUYCW.mjs:3281-3292`); en el peor caso 2 + k = 10 peticiones HTTP con k ≤ 8 (`getUser` solo por ids ausentes y verificables por el actor), en paralelo (`Promise.all`), sin reintentos. Si `getCount` falla o cuelga, falla/cuelga `getUserList` entero y todo el lote queda `unverified`.
- RN-04 Reutilización del predicado: el helper privado `isClerkNotFound(error)` (404 + `resource_not_found`, constante `CLERK_NOT_FOUND_CODE` existente) lo usan `clerkUserIsGone` (SYNC-1, sin cambio de comportamiento) y la nueva verificación. Un solo punto de definición de «404 real».
- RN-05 `getClerkActivity` sigue sin lanzar nunca y sin escribir en la base (tampoco por timeout). Ni el catch del lote ni el de `getUser` pasan el error crudo a `logError`: cada uno construye un objeto explícito `{ code, status, step }` (como el `clerkFailure` de SYNC-1). El fallo del lote deja `unverified` por fila y `identityOf` trata también «vinculada sin entrada» como `unverified` (redundancia deliberada). Amplía `ClerkActivity[rowId]` con `identity: "verified" | "not_found" | "unverified"` para toda fila vinculada de la página; las filas sin vínculo no tienen entrada (el estado `unlinked` se deriva de `row.linked`). Los campos `lastSignInAt`/`imageUrl` son `null` salvo filas `verified` (por lote o `getUser` 200) que el actor puede gestionar (RN-08); toda fila no gestionable sale con `lastSignInAt`/`imageUrl` = `null` e `identity: "unverified"`, aunque el lote la traiga.
- RN-06 Privacidad (D38/D42): los `clerk_user_id` solo existen en servidor (`UsersListing.clerkUserIds` no cambia); al cliente solo llega el estado por `row.id`. Los logs llevan `code`, `status` y `step`; nunca email, nombre, ids de Clerk, mensajes de Clerk (pueden contener identificadores) ni `DATABASE_URL`.
- RN-07 Presentación: la advertencia usa texto, no solo color (R49): «Identidad no encontrada», con ícono, en la celda Estado de la fila `active` afectada. No se muestra para `verified`, `unverified` ni `unlinked` en la tabla; `unverified` no debe presentarse como error de la cuenta (sin falso positivo). El detalle muestra una fila «Identidad» con las cuatro etiquetas: «Verificada», «No encontrada», «Sin verificar», «Sin vincular».
- RN-08 Visibilidad por permiso (decisión del propietario Q1; sin permisos nuevos). La advertencia «Identidad no encontrada» y la fila «Identidad» del detalle se muestran solo si `canSeeIdentity(actor.role, row.role)`, que es exactamente `canManageRole(actor.role, row.role)` (rango estrictamente mayor; la fila propia nunca cumple porque el rol es igual). Con la jerarquía real (`ROLES = user < admin < superadmin`): admin ve identidad solo en filas `user`; superadmin, en filas `user` y `admin`; nadie la ve en filas `superadmin` (incluida la propia) ni un admin en filas `admin`/`superadmin`. Es la misma condición que gobierna `rowActions` (`manages`); `rowActions` no cambia y «Recuperar acceso» sigue gobernada solo por `rowActions.recover` (manager, no self, no superadmin, `active`+vinculada); filas admin exigen superadmin + atestación (SYNC-1 RN-11). Decisión de servidor: no se verifica ni se llama a Clerk (`getUser`) por filas no visibles, y esas filas se devuelven con regla única de privacidad: `identity: "unverified"`, `lastSignInAt = null` e `imageUrl = null` (el servidor NO conserva avatar ni último acceso de esas filas aunque vengan en el lote; no filtrar estado ni datos derivados de Clerk en el payload RSC). El lote `getUserList` no cambia (no hay llamada extra); solo se descarta su dato para filas no gestionables. Riesgo aceptado, no negado: el listado ya muestra al admin las filas admin/superadmin (`users.service.ts:139-161`) y cualquier inferencia previa (p. ej. avatar o último acceso) existía antes de SYNC-2; esta regla la reduce, no la crea. Como `getClerkActivity` no conoce roles, `listUsers` (que ya recibe `actor`) calcula `identityRowIds: string[]` (ids de fila vinculadas cuyo rol el actor gestiona; excluye explícitamente las filas sin `clerk_user_id`) en `UsersListing`, solo servidor, y `page.tsx` lo pasa como segundo argumento. La UI aplica `canSeeIdentity` como segunda barrera.
- RN-09 Sin efectos: la detección no cambia ninguna decisión del servidor; `recoverUserAccess` sigue verificando con su propio `getUser` al ejecutar (no confía en el estado mostrado, que puede estar obsoleto).
- RN-10 Presupuesto de tiempo (decisión del propietario Q2). Constante `CLERK_IDENTITY_BUDGET_MS = 5000` en `users.service.ts` (no configurable: YAGNI), un solo deadline compartido por `clerkClient()`, `getUserList` y todos los `getUser` de la página (no 5 s por llamada; el peor caso total es 5 s, no 10 ni 5 + k·5). Viabilidad con el SDK real (`@clerk/backend` 3.27.0, igual que el lockfile; inspeccionado en un checkout hermano con la misma versión 3.27.0 porque este worktree no tiene `node_modules`; límite de validación en el apartado Límites): no hay cancelación nativa. `ClerkOptions`/`CreateBackendApiOptions` (`dist/index.d.ts`, `dist/api/factory.d.ts`) no exponen `signal`, `timeout` ni `fetch`; `ClerkBackendApiRequestOptions` (`dist/api/request.d.ts`) no admite `signal`; la implementación llama `runtime.fetch(url, { method, headers, body })` sin signal (`dist/chunk-CSXNUYCW.mjs`, símbolo `runtime.fetch`, tipado en `dist/runtime.d.ts` como `typeof globalThis.fetch` y no sobreescribible por el cliente); `clerkClient` de `@clerk/nextjs` es `() => Promise<ClerkClient>` sin parámetros. Por tanto el diseño es a nivel de aplicación con `Promise.race` contra un único temporizador (`setTimeout`, limpiado con un único `clearTimeout` en el `finally` de un solo `try/finally` que envuelve el lote y todos los `getUser`); no se usa `AbortController` porque no hay dónde pasarlo. `Promise.race` NO cancela las solicitudes HTTP subyacentes (tampoco el `getCount` interno de `getUserList`): solo deja de esperarlas. Toda la cadena `clerkClient().then(c => c.users.getUserList(...))` entra dentro del `race` (no hay `await clerkClient()` fuera de él), con `.catch(noop)` sobre esa cadena; igual cada `getUser` (`clientP.then(c => c.users.getUser(id))`). Consecuencias aceptadas y documentadas: la llamada subyacente puede seguir pendiente tras el vencimiento (hasta el timeout propio de Node/undici) y consume rate limit de Clerk. Tratamiento de llamadas pendientes: resultado tardío descartado (el resultado se toma solo del `race`, nunca se escribe después en `activity`), sin efectos ni escritura, sin reintento, y se adjunta `.catch(() => {})` a cada promesa subyacente para evitar unhandled rejection. Reglas: vence el lote (o `clerkClient()`) ⇒ todas `unverified`, sin `getUser`; vence con resultados parciales ⇒ las filas ya confirmadas (lote o `getUser` resueltos antes del deadline) conservan su estado y las pendientes quedan `unverified`; 429 y cualquier error ⇒ `unverified`. El timeout se registra una vez por paso con `{ code: "timeout", step }` (`get-user-list` o `get-user`), sin datos sensibles.

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| superadmin | Ver estado de identidad y advertencia de filas `user` y `admin` | Sí | `users:manage` + `canManageRole` (RN-08) |
| superadmin | Ver estado de identidad de filas `superadmin` (incluida la propia) | No | `canManageRole` falso; la fila sale `unverified` del servidor y la UI la oculta |
| admin | Ver estado de identidad y advertencia de filas `user` | Sí | `users:manage` + `canManageRole` |
| admin | Ver estado de identidad de filas `admin` (incluida la propia) o `superadmin` | No | `canManageRole` falso; sin `getUser` ni estado en el payload |
| user, sin sesión, revocado | Ver la página con datos de identidad | No | `UsersNoAccess` / redirect existente; `listUsers`/`getClerkActivity` no se invocan |
| admin | Recuperar desde advertencia de fila `user` | Sí | `rowActions.recover` + SYNC-1 |
| superadmin | Recuperar fila `admin` desde la advertencia | Sí | SYNC-1 RN-11 (atestación) |
| Cualquiera | Obtener `clerk_user_id` | No | Solo servidor (D38) |
| Cualquiera | Disparar escritura en Neon por la detección | No | La detección es solo lectura |

## Diseño y dependencias

Rutas `app/`: `app/dashboard/users/page.tsx` cambia una línea (pasa `listing.identityRowIds` como segundo argumento de `getClerkActivity`); no es ruta sensible ni de gobierno.

| Pieza | Ruta | Origen | Cambio |
|---|---|---|---|
| Tipos | `modules/users/types/users.types.ts` | existente | `ClerkActivity[rowId]` gana `identity`; nuevo `IdentityState` (incluye `unlinked`) |
| Derivación de estado | `modules/users/utils/identityStatus.ts` | nuevo (funciones puras `identityOf(row, activity)`, `canSeeIdentity(actorRole, rowRole)` + etiquetas; no existe equivalente; en `utils/` por convención, sin React) | crea |
| Service | `modules/users/services/users.service.ts` | existente | `isClerkNotFound` privado; `CLERK_IDENTITY_BUDGET_MS`; `getClerkActivity` amplía con deadline único y filas verificables; `listUsers` calcula `identityRowIds`; `clerkUserIsGone` reutiliza el helper |
| Página | `app/dashboard/users/page.tsx` | existente | pasa `listing.identityRowIds` a `getClerkActivity` |
| Badge de identidad | `modules/users/components/IdentityBadge.tsx` | nuevo (no existe; compone `Badge` shadcn instalado, patrón de `StatusBadge`) | crea |
| Lista | `modules/users/components/UsersView.tsx` | existente | muestra la advertencia bajo `StatusBadge` en filas `active`+`not_found` con `canSeeIdentity` |
| Detalle | `modules/users/components/UserDetailSheet.tsx` | existente | `InfoRow` «Identidad» en el grupo Cuenta/Actividad, solo si `canSeeIdentity` (recibe `canSeeIdentity` como prop booleana desde `UsersView`) |
| Reuso sin cambio | `RecoverUserDialog.tsx`, `rowActions`, `recoverUserAccess`, `server.ts`, `index.ts` | existente | no se tocan |
| shadcn | `Badge` | shadcn (instalado) | ninguno nuevo |

Dependencias externas: Clerk Backend API (`users.getUserList`, `users.getUser`), solo lectura. Sin dependencias nuevas.

Pseudocódigo de `getClerkActivity` (contrato de comportamiento):

```
entries = Object.entries(clerkUserIds); if empty -> {}
verifiable = new Set(identityRowIds)
deadline = promesa que resuelve TIMEOUT a los CLERK_IDENTITY_BUDGET_MS (un solo setTimeout)
try {   // UN ÚNICO try/finally envuelve lote Y todos los getUser
  clientP = clerkClient(); clientP.catch(noop)
  batchP  = clientP.then(c => c.users.getUserList({ userId: ids, limit })); batchP.catch(noop)   // cadena ENTERA dentro del race; el race NO cancela el HTTP (lista + getCount)
  try { batch = await race([ batchP, deadline ]) }
  catch o TIMEOUT -> logError({code, status, step:"get-user-list"}) (code "timeout" si vence; objeto explícito, nunca el error crudo)
                     return todos {identity:"unverified", lastSignInAt:null, imageUrl:null}; sin getUser   // el return pasa por el finally
  por cada entry presente en batch.data -> si está en verifiable: verified (+ lastSignInAt, imageUrl);
                                           si NO: {identity:"unverified", lastSignInAt:null, imageUrl:null}   // regla única de privacidad (RN-08)
  ausentes y en verifiable (<= 8) -> Promise.all(ids.map(id => verifyOne(id)))  // verifyOne tiene su PROPIO try/catch y clasifica ahí: siempre resuelve a un estado, nunca rechaza, así que Promise.all nunca rechaza
     verifyOne(id): try { await race([clientP.then(c => c.users.getUser(id)), deadline]) } catch (e) { clasifica } (cada promesa subyacente .catch(noop)):
     200 -> verified (+datos); isClerkNotFound -> not_found;
     TIMEOUT -> unverified + logError({code:"timeout",step:"get-user"}) una sola vez; otro -> unverified + logError({code,status,step:"get-user"})
  ausentes no verificables -> {unverified, null, null}, sin getUser   // sin reintento; resultado tardío descartado
} finally { clearTimeout(timer) }   // único clearTimeout, tras lote y todos los getUser: sin timers pendientes
```

## Contratos y datos

```ts
// modules/users/types/users.types.ts
export type IdentityState = "verified" | "not_found" | "unverified" | "unlinked";
// Keyed by the app_users row id. Only linked rows have an entry; `unlinked` is derived from row.linked.
export type ClerkActivity = Record<
  string,
  { lastSignInAt: number | null; imageUrl: string | null; identity: Exclude<IdentityState, "unlinked"> }
>;

// modules/users/utils/identityStatus.ts
export function identityOf(row: Pick<UserRow, "linked">, entry: ClerkActivity[string] | undefined): IdentityState;
export function canSeeIdentity(actorRole: Role, rowRole: Role): boolean; // = canManageRole(actorRole, rowRole) (RN-08)
// !linked -> "unlinked"; linked && entry -> entry.identity ?? "unverified" (el `??` rige mientras `identity?` sea opcional en T1; T2 lo vuelve obligatorio); linked && !entry -> "unverified"
export const IDENTITY_LABELS: Record<IdentityState, string>;
// verified "Verificada", not_found "No encontrada", unverified "Sin verificar", unlinked "Sin vincular"

// modules/users/services/users.service.ts
export const CLERK_IDENTITY_BUDGET_MS = 5000; // constante, no configurable (RN-10)
export type UsersListing = { page: UsersPage; clerkUserIds: Record<string, string>; identityRowIds: string[] }; // ambos solo servidor
// getClerkActivity(clerkUserIds: Record<string, string>, identityRowIds: string[] = []): Promise<ClerkActivity>  -- nunca lanza
// 2º parámetro OPCIONAL (default []): las llamadas existentes de un argumento siguen tipando (`npm run build` tipa los tests); sin él, toda fila queda `unverified` sin `getUser`.
```

Resultado de Clerk -> estado:

| Respuesta Clerk | Estado | Log |
|---|---|---|
| lote 200 con el id | verified | no |
| lote 200 sin el id y `getUser` 200 | verified | no |
| `getUser` 404 `resource_not_found` (`isClerkAPIResponseError`) | not_found | no (resultado esperado) |
| `getUser` 404 con otro código o sin `isClerkAPIResponseError` | unverified | code/status/step |
| `getUser` 401/403/429/5xx/red | unverified | code/status/step |
| lote falla (cualquier causa) | todos unverified, sin `getUser` | code/status/step |
| lote no responde en 5 s | todos unverified, sin `getUser` | `{code:"timeout", step:"get-user-list"}` |
| `getUser` no responde antes del deadline | esa fila unverified; las demás conservan estado | `{code:"timeout", step:"get-user"}` (una vez) |
| fila no gestionable por el actor (ausente o presente en el lote) | `unverified`, `lastSignInAt`/`imageUrl` = null, sin `getUser` | no |

Datos: sin tablas, columnas, índices ni migraciones. Sin escritura en Neon.

## No funcionales

- Peticiones HTTP por carga de página: 2 en el caso normal (`getUserList` = lista + `getCount` interno en `Promise.all`); máximo 2 + 8 = 10 en el peor caso (`getUser` por ids ausentes de filas gestionables por el actor). Si `getCount` falla o cuelga, todo el lote queda `unverified`. Sin reintentos, sin bucles, sin barrido fuera de la página. La página es dinámica: cada visita repite las llamadas.
- Latencia: los `getUser` van en paralelo (una ronda extra solo si hay ausentes). Presupuesto total de 5 s (RN-10) para toda la verificación: la página tarda a lo sumo 5 s extra ante un Clerk lento o caído y degrada a `unverified`. Sin cancelación nativa en el SDK: la llamada subyacente puede seguir pendiente tras el vencimiento y consumir rate limit (aceptado).
- Rate limit: Clerk limita por instancia (la cuota de desarrollo es más baja que producción). El peor caso de 10 peticiones HTTP por visita (2 + 8) es acotado; ante 429 el resultado es `unverified` y no se reintenta. El fallo del lote evita la cascada de `getUser`.
- Privacidad/auditoría: sin PII ni ids en logs; sin tabla de auditoría.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Falso positivo (id ausente del lote pero vivo) | `getUser` individual | `verified` | n/a |
| Falso positivo por 429/5xx/red/401/403 | no es 404 `resource_not_found` | `unverified`, sin advertencia, log sin PII | Recargar la página |
| 404 de otro origen (proxy, ruta) sin `resource_not_found` o no `isClerkAPIResponseError` | `isClerkNotFound` estricto | `unverified` | Recargar |
| Lote falla | catch | todos `unverified`, sin `getUser` extra, página sigue funcionando | Recargar |
| Rate limit (429) por muchas visitas | status 429 | `unverified`; sin reintentos | Esperar; no hay mutación pendiente |
| Latencia o cuelgue de Clerk | deadline único de 5 s (`Promise.race`) | `unverified` para lo pendiente; confirmadas conservan estado; nunca `not_found`; la página no lanza | Recargar |
| Respuesta tardía tras el deadline | resultado solo del `race` | descartada: sin cambio de estado, sin escritura, sin unhandled rejection (`.catch` noop) | n/a |
| Estado de identidad filtrado a quien no puede gestionar la fila | `identityRowIds` en servidor + `canSeeIdentity` en UI | filas no gestionables salen `unverified` con avatar/último acceso `null`, sin `getUser`, ocultas en UI | n/a |
| Instancia equivocada de Clerk con credenciales válidas (p. ej. Neon con clave de otra instancia) | n/a en código (por diseño no hay mitigación automática) | todos los `getUser` darían 404 `resource_not_found`: falso positivo masivo de «Identidad no encontrada» | Requisito de despliegue: verificar correspondencia Clerk-Neon antes de producción (ver Plan UAT) |
| Fuga de ids Clerk al cliente | revisión + prueba: `ClerkActivity` no tiene ids; `UsersListing.clerkUserIds` no cambia | n/a | n/a |
| Fuga de PII/secretos/`DATABASE_URL` en logs | prueba: espía `console.error` | solo `code`/`status`/`step` | n/a |
| Estado obsoleto (la cuenta se borró o recreó tras cargar) | n/a | La advertencia es informativa; `recoverUserAccess` reconfirma con `getUser` | Recargar |
| Escalada: admin intenta recuperar fila admin/superadmin | `rowActions` + servidor | Ni advertencia ni acción visibles (RN-08); el servidor sigue negando | Pedir a superadmin |
| Cuenta recreada con el mismo email (id nuevo) | `not_found` sobre id viejo | Igual que SYNC-1 RN-12: la recuperación falla controlada si existe invitación/cuenta | Resolver en Clerk |

Plan de recuperación/rollback: sin migración ni efectos persistentes; revertir el código elimina la señal sin dejar estado. No se ejecuta nada contra Clerk ni Neon reales durante el desarrollo.

## Brechas y riesgos

- Brecha cubierta: SYNC-1 solo recupera a demanda sin señal; SYNC-2 aporta la señal para las 8 filas visibles.
- Brecha no cubierta (aceptada): filas fuera de la página actual y filas `revoked` borradas en Clerk no se advierten en la tabla (el estado sí aparece en su detalle si se abre).
- Riesgo de permisos: resuelto por Q1; la advertencia solo es visible donde el actor ya gestiona la fila. Consecuencia aceptada: un admin no ve identidad rota en filas `admin`/`superadmin` y un superadmin no la ve en filas `superadmin`; deben comprobarlo en Clerk o por otro superadmin.
- Riesgo de latencia: acotado a 5 s por carga (RN-10); a cambio, ante lentitud sostenida de Clerk las filas salen `unverified` (sin advertencia, sin falso positivo).
- Límites de la validación del SDK (no se pudo ejecutar Clerk): la ausencia de `signal`/`timeout`/`fetch` se verificó leyendo `.d.ts` y el bundle de `@clerk/backend` 3.27.0, no ejecutando; no se comprobó el comportamiento real de `fetch` pendiente ni cuánto tarda Node en abortar la conexión huérfana, ni el consumo real de rate limit por llamadas abandonadas. Queda para UAT (U-8); `Promise.race` no cancela el HTTP subyacente; la prueba con fake timers solo cubre el comportamiento del servicio con mocks.
- Cambio de comportamiento visible (aceptado): `lastSignInAt`/`imageUrl` son `null` para filas `not_found`/`unverified` y para TODA fila no gestionable por el actor (RN-08), aunque el lote las traiga; un admin deja de ver avatar y último acceso de filas `admin`/`superadmin`, igual que hoy ante un fallo del lote.
- Riesgo aceptado de privacidad residual: el listado ya muestra al admin las filas admin/superadmin (`users.service.ts:139-161`); cualquier inferencia previa existía antes de SYNC-2 y no se niega. SYNC-2 no añade datos de Clerk a esas filas (regresión AC-28).
- Riesgo de instancia equivocada de Clerk: con credenciales válidas de otra instancia (p. ej. Neon con clave de otra instancia) todos los `getUser` devuelven 404 `resource_not_found` y se marcaría «Identidad no encontrada» en masa (falso positivo). Sin sincronizaciones automáticas ni código de mitigación. Requisito de despliegue (checklist, fuera de código): verificación obligatoria de correspondencia Clerk-Neon antes de producción. Aviso al operador: una página con TODAS las filas gestionables en `not_found` es sospechosa de instancia equivocada (solo documentación/UAT, sin lógica).
- Riesgo de peticiones: `getUserList` hace lista + `getCount` internos; máximo real 2 + 8 = 10 peticiones HTTP; si `getCount` falla o cuelga todo el lote queda `unverified`.
- Riesgo en el supuesto de la API: se asume que `getUserList` con `userId` solo devuelve usuarios existentes y no falla por ids inexistentes (comportamiento visto en SYNC-1 UAT). Se verifica explícitamente en UAT (U-2).

## Criterios de aceptación

- [ ] AC-01 (RN-02, RN-03) Dado un lote donde todos los ids vinculados aparecen en `getUserList`, cuando se llama `getClerkActivity`, entonces cada fila queda `verified` con `lastSignInAt`/`imageUrl`, `getUser` no se llama y hubo exactamente 1 llamada SDK a `getUserList` (2 peticiones HTTP internas; el mock cuenta 1 llamada).
- [ ] AC-02 (RN-02, RN-03) Dado un id ausente del lote, cuando `getUser` responde 200, entonces `verified` (sin falso positivo por ausencia en el lote).
- [ ] AC-03 (RN-02) Dado un id ausente del lote, cuando `getUser` responde 404 con `code: "resource_not_found"` y es `isClerkAPIResponseError`, entonces `not_found`.
- [ ] AC-04 (RN-02, negativo) Dado un id ausente del lote, cuando `getUser` falla con cada una de: 404 sin cuerpo JSON (`errors: []`), 404 con código distinto de `resource_not_found`, o 404 que no es `isClerkAPIResponseError`, entonces `unverified` (una prueba explícita por caso). El 404 `resource_not_found` válido (AC-03) es el único que da `not_found`.
- [ ] AC-05 (RN-02, negativo) Dado un id ausente del lote, cuando `getUser` falla con 401, 403, 429, 5xx, fallo de API o error de red, entonces `unverified` y no `not_found` (una prueba por causa). Los errores se construyen con la estructura real de Clerk, siguiendo el helper existente `clerkError(status, code?)` de `users.service.test.ts` (línea 77): `new ClerkAPIResponseError("clerk", { data: code ? [{ code, message, long_message }] : [], status })` (importado de `@clerk/nextjs/errors`). Red = `ClerkAPIResponseError` con `data: [{ code: "unexpected_error", ... }]` y `status` `undefined`. Como `clerkError(status: number)` y `ClerkAPIResponseOptions.status: number` no admiten `undefined`, este caso se construye en la prueba con un cast explícito y controlado (`status: undefined as unknown as number`, sin `any`, compatible con la lint `no any`), replicando la estructura real de Clerk (`@clerk/backend` `chunk-CSXNUYCW.mjs:6135-6146`, `6189-6195`); 404 sin cuerpo JSON = `data: []` (`errors: []`); 404 `resource_not_found` válido = `data: [{ code: "resource_not_found", ... }]`; 404 con otro código, 429, 401/403, 5xx y fallo de API con su `status`/`code`. Todo distinto de 404 + `resource_not_found` ⇒ `unverified`.
- [ ] AC-06 (RN-03, negativo) Dado que `getUserList` falla (429, 5xx o red), cuando se llama `getClerkActivity`, entonces todos los ids quedan `unverified`, NO se llama `getUser`, la función no lanza y no escribe en la base.
- [ ] AC-07 (RN-03) Dado un lote de 8 ids con k ausentes, cuando se llama, entonces hay exactamente 1 llamada SDK a `getUserList` (2 peticiones HTTP internas: lista + `getCount`) y k a `getUser` (≤ 8), es decir, como máximo 2 + 8 = 10 peticiones HTTP, cada una sin reintento aunque falle. Si `getUserList` falla (incluido su `getCount` interno) todo el lote queda `unverified` (AC-06).
- [ ] AC-08 (RN-02) Dado un resultado mixto (verified, not_found, unverified en la misma página), cuando se llama, entonces cada fila recibe su estado independiente y un fallo individual no altera a las demás.
- [ ] AC-09 (RN-02) Dado `identityOf`, cuando la fila no está vinculada, entonces `unlinked` sin importar `activity`; vinculada sin entrada, `unverified`; con entrada, su `identity`.
- [ ] AC-10 (RN-06, negativo) Dado cualquier fallo de Clerk, cuando se registra, entonces el log contiene solo `code`, `status` y `step`; ningún email, nombre, id de Clerk, mensaje de Clerk ni `DATABASE_URL`. Se prueba con un error (de lote y de `getUser`) cuyo `message` contiene un id de Clerk y un email: ninguno aparece en lo registrado.
- [ ] AC-11 (RN-06, negativo) Dado el resultado de `getClerkActivity` y las props de `UsersView`, cuando se inspeccionan, entonces ninguna contiene un `clerk_user_id`; `UsersListing.clerkUserIds` no cambia y sigue sin pasar al cliente.
- [ ] AC-12 (RN-01, RN-05) Dado cualquier combinación de resultados, cuando se ejecuta `getClerkActivity`, entonces no se llama a `getDb`/SQL, ni a `createInvitation`, `revokeInvitation`, `deleteUser` ni `updateUser`.
- [ ] AC-13 (RN-07) Dado una fila `active` con `not_found`, cuando se renderiza `UsersView`, entonces muestra el texto «Identidad no encontrada» (con texto, no solo color) en su fila.
- [ ] AC-14 (RN-07, negativo) Dado filas `active` con `verified`, `unverified` o `unlinked`, o filas `revoked`/`invited` con `not_found`, cuando se renderiza, entonces no aparece «Identidad no encontrada» en la tabla.
- [ ] AC-15 (RN-08) Dado una fila `user` `active` `not_found` y un actor admin o superadmin, o una fila `admin` `active` `not_found` y un actor superadmin, cuando se renderiza `UsersView`, entonces la advertencia es visible y el menú de la fila incluye «Recuperar acceso» (abre el `RecoverUserDialog` existente; sin cambios, atestación en filas admin).
- [ ] AC-16 (RN-08, negativo) Dado una fila `admin` o `superadmin` con identidad `not_found` y un actor admin, o una fila `superadmin` (incluida la propia) y un actor superadmin, o la fila propia de un admin, cuando se renderiza lista y detalle, entonces NO aparece la advertencia ni la fila «Identidad», aunque `activity` traiga `not_found` (segunda barrera de UI), y el menú no incluye «Recuperar acceso».
- [ ] AC-21 (RN-08) Dado `canSeeIdentity`, cuando se evalúa para todos los pares de `ROLES`, entonces es verdadero exactamente cuando `canManageRole` es verdadero (admin->user, superadmin->user, superadmin->admin) y falso en los demás.
- [ ] AC-22 (RN-08, RN-03, negativo) Dado un lote con ids ausentes de filas no gestionables por el actor (p. ej. actor admin y filas `admin`), cuando se llama `getClerkActivity(ids, identityRowIds)`, entonces `getUser` no se llama por ellas, su `identity` es `unverified` (nunca `verified`/`not_found`) y `lastSignInAt`/`imageUrl` son `null` aunque el lote los traiga (regla única de privacidad; el servidor no conserva avatar ni último acceso de esas filas); `listUsers` calcula `identityRowIds` solo con filas vinculadas cuyo rol el actor gestiona (prueba por actor admin y superadmin), y excluye las filas sin `clerk_user_id` aunque su rol sea gestionable (p. ej. fila `user` invitada sin vínculo no aparece en `identityRowIds`).
- [ ] AC-28 (RN-08, RN-06, negativo) Dado un actor admin y filas `admin`/`superadmin` presentes en el lote con avatar y último acceso, cuando se llama `getClerkActivity` con su `identityRowIds` (regresión de contrato del servicio) y se renderiza `UsersView` con ese resultado (regresión de UI), entonces esas filas no exponen avatar, último acceso ni estado de identidad (`unverified`/`null`/`null` en el servicio; sin imagen, sin fecha de último acceso, sin advertencia ni «Identidad» en la UI); el mismo caso con superadmin sobre filas `superadmin`.
- [ ] AC-23 (RN-10) Dado `getUserList` (o `clerkClient()`, cuya promesa nunca resuelve; todo dentro del `race`) que no responde, cuando avanzan 5000 ms con fake timers de Vitest, entonces `getClerkActivity` resuelve sin lanzar con todas las filas vinculadas `unverified`, sin llamar a `getUser` y con `identity` nunca `not_found`.
- [ ] AC-24 (RN-10) Dado un lote correcto y un `getUser` que cuelga, cuando avanzan 5000 ms, entonces esa fila queda `unverified` y las demás conservan su estado (`verified`, o `not_found` ya confirmado antes del deadline).
- [ ] AC-25 (RN-10) Dado que vence el presupuesto y luego llega una respuesta tardía (lote o `getUser`, resolve o reject), cuando se avanza el tiempo, entonces el resultado ya devuelto no cambia, no se lanza ni hay unhandled rejection, no se escribe nada y no se hace ninguna llamada adicional (sin reintentos).
- [ ] AC-26 (RN-10) Dado el presupuesto, cuando se inspecciona, entonces es la constante `CLERK_IDENTITY_BUDGET_MS = 5000` compartida por lote y `getUser` con un único deadline: con lote que tarda 3000 ms y `getUser` que cuelga, la función resuelve a los 5000 ms totales (no a 8000), y un único `clearTimeout` en el `finally` que envuelve lote y todos los `getUser` deja el temporizador limpio (`vi.getTimerCount() === 0` tras resolver, también en los caminos de lote caído y de timeout).
- [ ] AC-27 (RN-10, RN-06) Dado un timeout, cuando se registra, entonces el log contiene solo `{ code: "timeout", step }` (`get-user-list` o `get-user`, una vez por paso), sin id de Clerk, email ni mensaje.
- [ ] AC-17 (RN-07) Dado el detalle de un usuario, cuando se abre una fila donde `canSeeIdentity(actor.role, row.role)` es verdadero (RN-08), entonces muestra «Identidad» con «Verificada», «No encontrada», «Sin verificar» o «Sin vincular» según el estado, para cualquiera de los cuatro; estas etiquetas se muestran únicamente para esas filas (para las demás no se muestra «Identidad», AC-16/AC-28).
- [ ] AC-18 (RN-04, RN-09) Dado `recoverUserAccess` tras el refactor del helper, cuando corren las pruebas SYNC-1 existentes de `recoverUserAccess`/`clerkUserIsGone` sin modificarlas, entonces siguen en verde (404 válido procede; 404 con otro código, 401/403/429/5xx y no-Clerk bloquean) y `recoverUserAccess` sigue llamando a `getUser`. Únicas modificaciones permitidas en pruebas existentes de `modules/users/services/users.service.test.ts`, todas manteniendo `toEqual` estricto sin debilitarlo:
  - `listUsers` «maps the single empty row of a zero total…» (líneas 179-182, compara el objeto entero con `toEqual({ page, clerkUserIds: {} })`): se añade `identityRowIds: []`.
  - `getClerkActivity` «makes one getUserList call…» (líneas 239-242): `toEqual` pasa a `{ lastSignInAt, imageUrl, identity: "verified" }` por fila y la llamada (línea 235) pasa `identityRowIds` explícito `["row-a", "row-b"]`.
  - `getClerkActivity` «returns {} without throwing when Clerk fails» (línea 246-248): se renombra (p. ej. «marks linked rows unverified without throwing when Clerk fails», porque ya no devuelve `{}`) y pasa a esperar `{ "row-a": { lastSignInAt: null, imageUrl: null, identity: "unverified" } }`.
  - Mock `vi.mock("@clerk/nextjs/server", ...)` (línea 18, hoy `clerkClient: async () => clerk`, no es `vi.fn`): se permite ajustarlo (p. ej. `clerkClient: vi.fn(async () => clerk)`) para poder hacer que `clerkClient()` cuelgue en AC-23.
  - Sin cambio (verificado en el test real): línea 222 (`getClerkActivity({})` → `{}`; sigue válida con 1 argumento por el default) y línea 215 (`expect(listing.clerkUserIds).toEqual(...)`, compara solo `clerkUserIds`, no el objeto entero). En esta última se permite añadir una aserción nueva `expect(listing.identityRowIds).toEqual(["row-17"])` (actor SUPER, fila `user` vinculada).
  - Sin `identityRowIds`, `getClerkActivity` deja todas las filas `unverified` sin llamar a `getUser` (RN-08); por eso las pruebas modificadas pasan `identityRowIds` explícito donde esperan verificación.
- [ ] AC-19 (RN-01) Dado el diff de la fase, cuando se revisa, entonces no hay migraciones, `db/`, dependencias nuevas, `app/api`, webhooks, archivos de gobierno ni rutas sensibles, `rowActions`/`userPermissions.ts` no cambian, el único cambio de `page.tsx` es pasar `listing.identityRowIds`, y no hay reintentos ni bucles hacia Clerk.
- [ ] AC-20 (RN-01, negativo) Dado un actor sin `users:manage` o sin sesión, cuando visita `/dashboard/users`, entonces la página no invoca `listUsers` ni `getClerkActivity` (comportamiento existente; se conserva). Se verifica por revisión del diff (el guard de `page.tsx` no cambia) y por las pruebas existentes; no se añade prueba nueva para el usuario sin acceso.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | Matriz, tabla de resultados | AC-12, AC-19, AC-20 | `modules/users/services/users.service.test.ts`; revisión del diff |
| RN-02 | Tabla Clerk -> estado | AC-01 a AC-05, AC-08, AC-09 | `users.service.test.ts`, `modules/users/utils/identityStatus.test.ts` |
| RN-03 | Pseudocódigo | AC-01, AC-02, AC-06, AC-07, AC-22 | `users.service.test.ts` |
| RN-04 | `isClerkNotFound` | AC-18 | `users.service.test.ts` (pruebas SYNC-1 sin modificar; solo los cambios listados en AC-18: aserciones de `listUsers`/`getClerkActivity`, renombre de un test y ajuste del mock `clerkClient`) |
| RN-05 | `ClerkActivity` | AC-12 | `users.service.test.ts` |
| RN-06 | Tipos, logs | AC-10, AC-11, AC-27, AC-28 | `users.service.test.ts` (espía `console.error`); `UsersView.test.tsx` |
| RN-07 | `IdentityBadge`, detalle | AC-13, AC-14, AC-17 | `IdentityBadge.test.tsx`, `UsersView.test.tsx` |
| RN-08 | `canSeeIdentity`, `identityRowIds`, `rowActions` | AC-15, AC-16, AC-21, AC-22, AC-28 | `UsersView.test.tsx`, `identityStatus.test.ts`, `users.service.test.ts` |
| RN-09 | Recuperación SYNC-1 | AC-18 | `users.service.test.ts` |
| RN-10 | `CLERK_IDENTITY_BUDGET_MS`, pseudocódigo | AC-23 a AC-27 | `users.service.test.ts` (fake timers) |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Detección de identidad (servicio) | `getClerkActivity` con `clerkClient` mockeado: 200 lote; ausente+200; 404 `resource_not_found`; 404 `errors: []` sin cuerpo JSON; 404 otro código; 404 no-Clerk; 401; 403; 429; 5xx; fallo de API; red (`ClerkAPIResponseError` `unexpected_error`, `status` undefined vía cast `as unknown as number`), todos con `clerkError(status, code?)` salvo el de red; lote caído (incl. `getCount`); `clerkClient()` colgado; mixto; cota 8; sin reintentos; sin SQL ni mutaciones; logs sin PII; filas no gestionables sin `getUser` y con avatar/último acceso `null` (regresión de contrato, AC-28); sin `identityRowIds` (default `[]`) todo `unverified`; `identityRowIds` por actor y sin filas no vinculadas; aserciones existentes de `listUsers`/`getClerkActivity` actualizadas (AC-18); presupuesto con fake timers (lote colgado, `getUser` colgado, parcial, respuesta tardía, un solo deadline, timers limpios, log de timeout) | NO EJECUTADO: sin Clerk/Neon reales (motivo: mocks; servicios reales no autorizados en desarrollo) | UAT con Clerk DEV y Neon DEV (plan abajo) | Obligatoria: sin ids al cliente, sin PII en logs, sin escritura, permisos de admin vs superadmin | No aplica: sin migraciones; rollback = revertir código |
| Presentación | `identityOf`, `IdentityBadge`, `UsersView` (advertencia, no-advertencia, menú), detalle. `canSeeIdentity` por rol; ocultar advertencia y «Identidad» para filas no gestionables; regresión de UI: filas no gestionables con payload de servidor (`null`/`unverified`) no muestran avatar, último acceso ni estado (AC-28). `page.tsx` (un argumento) y el usuario sin acceso (AC-20): revisión del diff y pruebas existentes | No | Smoke visual en UAT | Menú por permisos (`rowActions`) | No |

## Archivos afectados (Fase 1)

| Archivo | Clasificación |
|---|---|
| `modules/users/types/users.types.ts` | modificado |
| `modules/users/utils/identityStatus.ts` | nuevo |
| `modules/users/utils/identityStatus.test.ts` | nuevo |
| `modules/users/services/users.service.ts` | modificado |
| `modules/users/services/users.service.test.ts` | modificado |
| `modules/users/components/IdentityBadge.tsx` | nuevo |
| `modules/users/components/IdentityBadge.test.tsx` | nuevo |
| `modules/users/components/UsersView.tsx` | modificado |
| `modules/users/components/UserDetailSheet.tsx` | modificado |
| `modules/users/components/UsersView.test.tsx` | nuevo |
| `app/dashboard/users/page.tsx` | modificado (una línea) |

11 archivos. Ninguno coincide con las rutas sensibles ni de gobierno de `docs/SETUP.md` §3 (sin `auth` en nombre, sin `lib/`, `db/`, `proxy.*`, `.claude/`), por eso no hay secciones `## Archivos sensibles` ni `## Cambios de gobierno`. `server.ts`, `index.ts`, `RecoverUserDialog.tsx`, `userPermissions.ts` y `users.actions.ts` no cambian.

## Plan UAT (preparación; nada se ejecuta aquí)

Formato `docs/forms/uat.md` (ficha de 10 campos por prueba; gate de inicio con PR y commit exacto, verificaciones técnicas del reviewer previas, entorno aislado). Entorno: Clerk DEV (`sk_test_`) y Neon DEV, solo cuentas descartables; el propietario confirma que son DEV y que no hay datos reales. Registro posterior en `docs/evidence/sync-2-detection-uat.md` por un `developer` en `Modo: build`. Aceptación UAT no equivale a `apruebo`.

| ID | Pantalla y ruta | Rol | Pasos | Esperado | Recuperación | Depende de |
|---|---|---|---|---|---|---|
| U-1 | `/dashboard/users` | superadmin | Con 1 user activo descartable vivo en Clerk, abrir la lista | Sin advertencia; detalle muestra «Verificada»; fila invitada muestra «Sin vincular» | n/a | — |
| U-2 | `/dashboard/users` | superadmin | Eliminar la cuenta descartable en el dashboard de Clerk DEV; recargar | Fila `active` con «Identidad no encontrada»; Neon sin cambios (estado sigue Activo); detalle «No encontrada». Verifica el supuesto «`getUserList` omite ids inexistentes sin fallar el lote»: las demás filas siguen verificadas | n/a | U-1 |
| U-3 | `/dashboard/users` | superadmin | Con la fila de U-2, abrir el menú «Más acciones» | «Recuperar acceso» presente; no se ejecutó ninguna invitación ni cambio en Neon por solo cargar la página | n/a | U-2 |
| U-4 | `/dashboard/users` | admin | Mismo estado; entrar como admin y ver fila `user` afectada. Si hay una fila `admin`/`superadmin` descartable borrada en Clerk, abrirla también | Fila `user`: advertencia visible, «Recuperar acceso» disponible, detalle «No encontrada». Filas `admin`/`superadmin` (y la propia): sin advertencia, sin fila «Identidad» en el detalle, sin acción | n/a | U-2 |
| U-5 | `/dashboard/users` | superadmin | Pulsar «Recuperar acceso» (flujo SYNC-1 existente) en la fila `user`; si hay una fila `admin` descartable borrada en Clerk, comprobar que el superadmin sí ve su advertencia y que una fila `superadmin` nunca la muestra | Igual que SYNC-1 UAT-3; fila pasa a Invitado y la advertencia desaparece; visibilidad según RN-08 | Reinvitar/revocar fila descartable | U-3 |
| U-6 | Servidor (observación) | propietario | Revisar el log del servidor tras cargar la página | Sin emails, ids de Clerk ni `DATABASE_URL` en las líneas `users.service` | n/a | U-2 |
| U-7 | Automatizada (Vitest), sin UI | desarrollador | `npx vitest run modules/users/services/users.service.test.ts`: casos AC-05/AC-06 (429, 5xx, red, fallo de lote) ya los cubren; no se manipulan ni invalidan claves ni se reinicia el servidor (`proxy.ts` usa `auth.protect()` con `CLERK_SECRET_KEY`, única credencial; invalidarla rompería el acceso a la propia página) | Prueba verde: lote caído y `getUser` en error dan `unverified`, nunca `not_found`; en UI «Sin verificar» (cubierto en `UsersView.test.tsx`) | n/a | — |
| U-8 | `/dashboard/users` | superadmin (prueba manual del propietario, solo DEV; no se toca producción) | `getClerkActivity` corre en el servidor (RSC/Node), por lo que la prueba se hace desviando la resolución de `api.clerk.com` a nivel de sistema. Antes: respaldar `hosts` (`C:\Windows\System32\drivers\etc\hosts`, p. ej. copiarlo a `hosts.bak`) y levantar un listener TCP local en el puerto 443 que acepte conexiones y no responda (p. ej. un script de Node con `net.createServer(() => {})`); escuchar en el 443 no requiere administrador si el puerto está libre, pero editar `hosts` en Windows sí. Orden: (a) reiniciar el servidor DEV: el reinicio borra la caché JWKS en memoria, y va antes de cargar porque con `hosts` ya desviado `auth.protect()` fallaría antes de medir el presupuesto; (b) cargar `/dashboard/users` correctamente (repuebla JWKS/sesión); (c) esperar ~10 s sin tráfico para que se cierre la conexión keep-alive de undici (~4 s), que de otro modo se saltaría el desvío; (d) editar `hosts` añadiendo `127.0.0.1 api.clerk.com` (opcional, por si el sistema resuelve por IPv6: `::1 api.clerk.com`) y ejecutar `ipconfig /flushdns`; (e) recargar `/dashboard/users`, medir el deadline de 5 s y revisar el log. El presupuesto de 5 s vence antes que el connect timeout de undici (~10 s); un handshake TLS sin respuesta cuelga, que es justo lo que se quiere simular. Restauración (también si la prueba falla): restaurar `hosts` desde la copia o quitar las líneas añadidas, ejecutar `ipconfig /flushdns`, cerrar el listener y verificar la restauración: (i) el archivo `hosts` volvió a su contenido original (comparar con el respaldo `hosts.bak`); (ii) ejecutar `ipconfig /flushdns`; (iii) `Resolve-DnsName api.clerk.com` SIN `-NoHostsFile` ya no devuelve `127.0.0.1`/`::1`. Si la autenticación de Clerk (`auth.protect()` en `proxy.ts`) falla antes de llegar a la consulta de identidad, U-8 se registra BLOQUEADA, nunca PASS del timeout | La carga tarda ≈5 s (no minutos); ninguna fila con advertencia ni texto «Identidad no encontrada»; todas las filas vinculadas gestionables `unverified` («Sin verificar» en el detalle); log solo con `code: timeout` y `step`. Verifica el límite de validación del SDK (llamada subyacente sin cancelación) | Revertir `hosts` y detener el listener | U-1 |

Requisito de despliegue (checklist, fuera de código; no es una prueba UAT ni lógica): antes de producción, verificación obligatoria de correspondencia Clerk-Neon (las `clerk_user_id` de Neon pertenecen a la instancia Clerk cuyas credenciales usa el despliegue), porque con una instancia equivocada todos los `getUser` darían 404 `resource_not_found`. Aviso para el operador: una página con TODAS las filas gestionables en `not_found` es sospechosa de instancia equivocada; comprobar la instancia antes de recuperar a nadie. Solo documentación, sin lógica ni sincronización automática.

Reservas previstas (no son PASS): 429 real y 5xx real de Clerk solo cubiertos por pruebas automatizadas; comportamiento de llamadas abandonadas tras el timeout (conexión pendiente, rate limit consumido) no medible en UAT; carga con más de 8 filas ausentes no aplicable (cota 8).

## Plan de tareas

### Fase 1
- [ ] T1 — Tipos `IdentityState`/`ClerkActivity` (en `users.types.ts`) ampliados y `identityOf`, `canSeeIdentity` + etiquetas con pruebas. Decisión: en T1 `identity` es opcional en `ClerkActivity` (`identity?:`) para que `npm run build` no falle mientras el service aún no lo devuelve, e `identityOf` usa `entry.identity ?? "unverified"`; T2 lo vuelve obligatorio. `UsersListing.identityRowIds` NO va en T1: vive en `users.service.ts` (T2). Verificar con `npx tsc --noEmit` al cerrar T1, T2, T3 y T4 (T2 vuelve `identity` obligatorio) · archivos: `modules/users/types/users.types.ts`, `modules/users/utils/identityStatus.ts`, `modules/users/utils/identityStatus.test.ts` · depende de: — · secuencial (base; los tipos los consumen T2, T3 y T4)
- [ ] T2 — Service y página: `isClerkNotFound`, `CLERK_IDENTITY_BUDGET_MS` y deadline único (`Promise.race`), `getClerkActivity(ids, identityRowIds = [])` (2º parámetro opcional) con verificación individual acotada a filas gestionables, `UsersListing.identityRowIds` (tipo en `users.service.ts`) y `listUsers` lo calcula (usa `canSeeIdentity`), `page.tsx` lo pasa, regla única de privacidad (filas no gestionables: `unverified`, `null`, `null`), `clerkClient()` dentro del `race`, ajuste del mock `clerkClient` y renombre del test «returns {}…» (AC-18), regresión AC-28 de contrato, logs `{code,status,step}` explícitos sin PII, pruebas de estados/errores/cota/permisos/fake timers; vuelve `identity` obligatorio en el tipo y actualiza las pruebas existentes listadas en AC-18 (`listUsers` líneas 179-182, dos de `getClerkActivity` pasando `identityRowIds` explícito donde esperan verificación) · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`, `modules/users/types/users.types.ts` (solo quitar `?` de `identity`), `app/dashboard/users/page.tsx` · depende de: T1 · paralelo (con T3; archivos disjuntos)
- [ ] T3 — `IdentityBadge` y su prueba · archivos: `modules/users/components/IdentityBadge.tsx`, `modules/users/components/IdentityBadge.test.tsx` · depende de: T1 · paralelo (con T2)
- [ ] T4 — Integración visual: advertencia en `UsersView` y fila «Identidad» en `UserDetailSheet` solo si `canSeeIdentity(actor.role, row.role)`, prueba de `UsersView` (advertencia, no-advertencia, filas no gestionables sin avatar/último acceso/estado (AC-28), menú por permisos). Mocks previstos en `UsersView.test.tsx` (como `RecoverUserDialog.test.tsx`): `next/navigation` (router), los diálogos hijos (`RecoverUserDialog` y demás) y el menú base-ui. Si la prueba del componente grande no es viable, se permite extraer la celda de estado a un componente pequeño dentro de `modules/users/components/` y probarlo aparte (se ajusta la lista de archivos sin superar el tope de la fase) · archivos: `modules/users/components/UsersView.tsx`, `modules/users/components/UserDetailSheet.tsx`, `modules/users/components/UsersView.test.tsx` · depende de: T1, T3 · secuencial (tras T3; no toca archivos de T2, puede correr junto a T2)

`npx tsc --noEmit` es criterio de cierre de cada tarea (T1 a T4). Total: 4 tareas, 11 archivos distintos (`users.types.ts` se toca en T1 y T2, secuenciales), una sola fase, sin archivos compartidos fuera del módulo ni rutas sensibles.

## Preguntas abiertas

Ninguna bloquea. Resueltas por el propietario:
- Q1 (resuelta): la advertencia y el estado «Identidad» solo se muestran en filas que el actor ya puede gestionar (`canManageRole`); sin permisos nuevos (RN-08). Si se quisiera que un admin vea identidad en filas admin, requeriría una decisión de permisos aparte.
- Q2 (resuelta): presupuesto total constante de 5 s para toda la verificación de identidades, con degradación a `unverified` (RN-10). Sin configuración (YAGNI). Límites de validación del SDK registrados en Brechas y riesgos; U-8 los comprueba.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz figura como NO EJECUTADO con su motivo.
