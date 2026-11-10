# Señal persistente de identidades Clerk eliminadas por webhook (SYNC-3)

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-sync-3-webhooks
- Riesgo: alto (endpoint público, secreto de firma, esquema de BD, identidad y estado de acceso, integración externa Clerk)
- Ruta: SDD-ADVANCED (disparador: webhooks, credenciales/secretos, esquema de base de datos y migraciones, autenticación/roles, integración externa Clerk)
- Fase actual: Fase 1

## Objetivo

SYNC-2 detecta en vivo, al consultar `/dashboard/users`, las filas `active` cuya identidad Clerk ya no existe, pero solo para la página actual, y degrada a `unverified` si Clerk responde lento, con 429/5xx o no se alcanza dentro del presupuesto de 5 s. SYNC-3 añade una señal persistente: cuando Clerk emite `user.deleted`, un endpoint autenticado por firma criptográfica registra en Neon que ese `clerk_user_id` fue eliminado. La señal es informativa: complementa a SYNC-2 cuando la lectura en vivo no concluye, no sustituye a SYNC-1 ni a SYNC-2, y nunca cambia rol, permisos, estado, invitaciones ni vínculo. La recuperación sigue siendo la acción administrativa explícita de SYNC-1, que reconfirma con `getUser`.

Beneficio frente a SYNC-2: (1) la advertencia sobrevive a un Clerk lento o caído (hoy sale «Sin verificar»); (2) el registro existe aunque nadie abra la página ni la fila esté en la página consultada, base para futuros filtros o conteos (fuera de alcance); (3) cuando el webhook falta o se pierde, todo sigue como en SYNC-2.

## Diagnóstico de la arquitectura existente (verificado en el código)

- Neon es autoridad de rol/estado; `lib/auth.ts` `findActor` lee `app_users` por `clerk_user_id` y exige `status = 'active'`; no consulta ninguna señal. Clerk solo prueba identidad.
- `proxy.ts` (`clerkMiddleware`) solo llama `auth.protect()` en `/dashboard(.*)`; su `matcher` ya incluye `/(api|trpc)(.*)`, así que una ruta `/api/webhooks/clerk` pasa por el middleware sin protección: pública a nivel de sesión. No hace falta editarlo para exponerla (RN-13); si el UAT demuestra interferencia, se corrige en otra spec de gobierno.
- `app_users` (`0001_app_users.sql`): `clerk_user_id text unique` nullable, `status in ('invited','active','revoked')`, `invitation_id unique`. Migraciones `0001`–`0004` en `db/migrations/`, aplicadas con `npm run db:migrate` (`scripts/db-migrate.mjs`). No hay `app/api/` ni dependencia de webhooks.
- `listUsers` usa columnas explícitas (sin `select *`/`returning *`) y ya calcula `clerkUserIds` e `identityRowIds` (solo filas vinculadas que el actor gestiona) solo en servidor; `getClerkActivity(clerkUserIds, identityRowIds = [])` devuelve `identity: verified | not_found | unverified` por fila con deadline único de 5 s; `page.tsx` pasa `identityRowIds`.
- `recoverUserAccess` (SYNC-1) lee la fila, confirma con `getUser` 404 `resource_not_found`, crea invitación y hace un `update` condicional que pone `clerk_user_id = null`, `status = 'invited'`.
- Compatibilidad `verifyWebhook`: `@clerk/nextjs` 7.9.25 re-exporta `verifyWebhook(request, { signingSecret? })` desde `@clerk/nextjs/webhooks` (delega en `@clerk/backend` 3.27.0 según `package-lock.json`). Usa `standardwebhooks ^1.0.0` (dependencia de `@clerk/backend`, no se instala nada ni hace falta `svix`), lee el secreto de `CLERK_WEBHOOK_SIGNING_SECRET`, exige cabeceras `svix-id`, `svix-timestamp`, `svix-signature`, lee el cuerpo crudo con `request.text()` y verifica HMAC con la tolerancia de timestamp de la librería, verificada en 300 s (`standardwebhooks` 1.1.1). Todo fallo (secreto ausente, cabeceras ausentes, firma inválida, timestamp fuera de ventana) lanza un `Error` genérico sin tipo distinguible: el handler debe comprobar el secreto antes de llamar. Verificado leyendo `.d.ts` y `dist/webhooks.js` en `template-v2-sync-detect` (mismo lockfile); no se ejecutó. Límite: la ventana de 300 s y el comportamiento con firmas múltiples (`v1,<mala> v1,<buena>`) se confirman con pruebas de firma real (AC-03, AC-04).

## Alcance y reglas

- Incluye (Fase 1):
  - Migración aditiva: columna `app_users.clerk_deleted_user_id text` (nullable, sin default). Solo se crea el archivo; no se aplica.
  - Ruta `POST /api/webhooks/clerk` que verifica con `verifyWebhook`, acepta solo `user.deleted` y registra la señal.
  - Servicio `identitySignals.service.ts` con la escritura condicional; esquema zod del payload en `schemas/users.schema.ts`; ambos re-exportados por `modules/users/server.ts`.
  - Integración en SYNC-2: `listUsers` calcula `deletedSignalRowIds` (solo servidor, subconjunto de `identityRowIds`) y `getClerkActivity` lo usa como tercer parámetro opcional.
  - Placeholder `CLERK_WEBHOOK_SIGNING_SECRET=whsec_REPLACE_ME` en `.env.example`.
- No incluye:
  - Otros eventos Clerk (`user.created`, `user.updated`, sesiones, organizaciones), sincronización de nombre/email, jobs, cron, colas, reconciliación o barrido.
  - Cambiar rol, permisos, `status`, `invitation_id`, `clerk_user_id`, `updated_at`; borrar filas o datos relacionados; crear o revocar invitaciones; revinculación automática; activar, revocar o degradar.
  - Cambios en `proxy.ts`, `lib/auth.ts`, `lib/db.ts`, `lib/roles*`, `recoverUserAccess`, `rowActions`, `RecoverUserDialog`, `UsersView`, `UserDetailSheet`, `IdentityBadge`.
  - Dependencias nuevas, tabla de eventos/auditoría, limpieza (`clear`) de la señal, UI nueva, endpoint de reintento.
  - Aplicar la migración, configurar el endpoint o el secreto reales en Clerk (DEV o producción), commit, push, merge.
- RN-01 Solo `user.deleted`: el handler procesa únicamente eventos verificados con `type === "user.deleted"`. Cualquier otro tipo verificado se ignora con 200.
- RN-02 Autenticidad y configuración: (1) si `CLERK_WEBHOOK_SIGNING_SECRET` está ausente o vacío, responde 500 sin llamar a `verifyWebhook` ni a Neon (error de despliegue, no del emisor; Clerk reintenta); (2) cabeceras ausentes, firma inválida, timestamp fuera de ventana o cuerpo alterado ⇒ `verifyWebhook` lanza ⇒ 400; (3) el cuerpo se lee solo una vez, crudo, por `verifyWebhook`; nada se procesa ni se loguea antes de verificar. Sin verificación exitosa no hay acceso a Neon.
- RN-03 Datos mínimos: tras verificar, el payload se valida con zod (`type: "user.deleted"`, `data.id` string con patrón `^user_[A-Za-z0-9]{1,64}$`, `data.deleted === true`). Si no cumple, 200 ignorado con log `{ code: "invalid_payload" }` (reintentar un evento firmado pero inservible no lo arregla). Se ignoran `external_id` y cualquier otro campo; no se persiste ni loguea nada del payload salvo lo de RN-05.
- RN-04 Identificación exacta: la fila se identifica solo por igualdad `clerk_user_id = data.id`. Nunca por email, nombre, `external_id` ni coincidencia parcial. Si ninguna fila coincide (ID inexistente, fila ya recuperada, fila no vinculada), no se escribe nada y se responde 200.
- RN-05 Persistencia mínima: una sola sentencia, atómica e idempotente:
  ```sql
  update app_users
  set clerk_deleted_user_id = ${id}
  where clerk_user_id = ${id}
    and clerk_deleted_user_id is distinct from ${id}
  returning id
  ```
  Solo escribe `clerk_deleted_user_id`. No toca `updated_at` (la señal no es un cambio de datos del usuario y no debe invalidar comparaciones de otras operaciones).
- RN-06 Sin efectos de acceso: el webhook no puede activar, revocar, degradar, escalar ni cambiar el vínculo. Garantías estructurales: (a) la única sentencia SQL del endpoint es la de RN-05; (b) el servicio no importa `clerkClient`, `lib/auth.ts`, `createInvitation` ni ninguna función de `users.service.ts`; (c) `findActor` no lee la columna, por lo que una fila `active` con señal sigue entrando mientras Clerk la autentique, y una `revoked` sigue revocada; (d) prueba que inspecciona el SQL emitido (AC-12).
- RN-07 Duplicados, reintentos y concurrencia: la operación es idempotente por construcción (RN-05: la segunda entrega no cumple `is distinct from` y afecta 0 filas); no se necesita tabla de `svix-id`. Entregas simultáneas del mismo evento: Postgres serializa el `update` sobre la fila; ambas responden 200. Fuera de orden: solo se escucha un tipo de evento, no hay orden relativo que preservar. Reintentos de Svix tras 500 son seguros por la misma idempotencia. Concurrencia con SYNC-1: el `update` de recuperación condiciona `clerk_user_id = ${leído}`; el de la señal también condiciona `clerk_user_id = ${id}`. Si la recuperación gana, la señal afecta 0 filas; si la señal gana, la recuperación procede igual (no depende de la columna) y deja `clerk_user_id = null`, con lo que la señal queda inerte (RN-08). Ninguna carrera pierde ni crea efectos de acceso.
- RN-08 Eventos antiguos tras recuperación: la señal guarda el id muerto y solo es vigente mientras `clerk_user_id is not null` y `clerk_deleted_user_id = clerk_user_id`. `listUsers` no selecciona el id muerto: selecciona solo la expresión booleana `(f.clerk_user_id is not null and f.clerk_deleted_user_id = f.clerk_user_id) as clerk_deleted`, y `deletedSignalRowIds` son las filas con `clerk_deleted` verdadero que están en `identityRowIds`. Recuperación pone `clerk_user_id = null`; un revínculo posterior asigna un id nuevo: en ambos casos la señal vieja deja de coincidir sin que SYNC-1 la limpie (cero cambios en `recoverUserAccess`). Un evento antiguo recibido tras recuperar busca `clerk_user_id = <id viejo>`, no encuentra fila y se ignora (AC-08). Un id de Clerk no se reutiliza, así que no hay colisión con la cuenta nueva.
- RN-09 Respuestas HTTP:

  | Situación | HTTP | Cuerpo | Efecto |
  |---|---|---|---|
  | GET, PUT, PATCH, DELETE (solo se exporta `POST`) | 405 (lo genera Next 16; no se escribe handler) | el de Next | ninguno |
  | OPTIONS | lo gestiona Next 16 automáticamente (cabecera `Allow`) | el de Next | ninguno |
  | Secreto ausente/vacío | 500 | `{"status":"misconfigured"}` | log `missing_secret`; ninguno |
  | Cabeceras ausentes, firma/timestamp inválido, cuerpo alterado | 400 | `{"status":"invalid"}` | log `invalid_signature`; ninguno |
  | Firma válida, tipo ≠ `user.deleted` | 200 | `{"status":"ignored"}` | ninguno |
  | Firma válida, payload no cumple RN-03 | 200 | `{"status":"ignored"}` | log `invalid_payload` |
  | Firma válida, procesado (0 o 1 fila) | 200 | `{"status":"ok"}` | señal registrada o no-op; la respuesta no revela si la fila existe |
  | Firma válida, fallo de Neon | 500 | `{"status":"retry"}` | log `db_error`; Svix reintenta con backoff |

  Los cuerpos nunca incluyen mensajes de error, ids ni datos del evento.
- RN-10 Privacidad, secretos y logs: `CLERK_WEBHOOK_SIGNING_SECRET` solo en servidor (`.env.local`, variables de despliegue), nunca `NEXT_PUBLIC_*`, nunca en logs ni en el repo (`.env.example` solo placeholder). Un secreto distinto por endpoint/instancia Clerk. Los logs llevan únicamente `{ code, step }` (más `status` si aplica): nunca el cuerpo, cabeceras, `svix-id`, `data.id`, email, mensaje de la excepción de `verifyWebhook` ni de Neon, ni `DATABASE_URL`. El id de Clerk no llega al cliente: `deletedSignalRowIds` son ids de fila de `app_users` y `clerk_deleted` es un booleano derivado.
- RN-11 Convivencia con los cuatro estados de SYNC-2: no hay estado nuevo ni UI nueva. En `getClerkActivity`, para filas en `identityRowIds` ∩ `deletedSignalRowIds`: si el resultado en vivo es `unverified` (timeout, 429, 5xx, lote caído, 404 ambiguo) pasa a `not_found` con `lastSignInAt`/`imageUrl` en `null`; si es `verified` (Clerk la encuentra) gana la lectura en vivo y no hay advertencia; si es `not_found` se queda igual. `unlinked` se deriva de `linked` y no cambia. Filas fuera de `identityRowIds` (no gestionables) no reciben señal ni se incluyen en `deletedSignalRowIds`, así que no hay filtración a roles no autorizados ni advertencia contradictoria (la advertencia sigue siendo la misma «Identidad no encontrada», con la regla de visibilidad de SYNC-2 RN-08). Esta regla enmienda `docs/specs/sync-2-detection.md` RN-02 sin editarla, solo para filas con señal firmada vigente (aprobada por el propietario, Q1); su comportamiento sin señal (parámetro por defecto `[]`) es idéntico. Sin cambios de roles, permisos, estado ni recuperación.
- RN-12 Independencia y recuperación: sin webhook (no configurado, entrega perdida, 500 persistente) SYNC-1 y SYNC-2 funcionan exactamente igual. La señal nunca sustituye la confirmación de SYNC-1: `recoverUserAccess` sigue llamando a `getUser` y falla con «STILL_EXISTS» si la cuenta existe. La advertencia no abre ni ejecuta nada.
- RN-13 Mínima superficie: no se modifican `proxy.ts` ni `lib/auth.ts`. La ruta es pública solo en el sentido de no requerir sesión; su única autenticación es la firma. `lib/db.ts` se usa tal cual (`getDb()`).

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| Clerk/Svix (emisor con firma válida) | `POST /api/webhooks/clerk` `user.deleted` | Sí | Firma y timestamp válidos (RN-02) |
| Cualquier otro llamador (sin firma o firma inválida) | `POST /api/webhooks/clerk` | No | 400 (RN-02, RN-09) |
| Webhook verificado | Cambiar rol, `status`, `invitation_id`, `clerk_user_id`, `updated_at`; borrar fila; invitar; revincular | No | Solo existe la sentencia de RN-05 |
| Webhook verificado | Escribir `clerk_deleted_user_id` | Sí | `clerk_user_id` exacto (RN-04) |
| superadmin | Ver advertencia por señal en filas `user` y `admin` | Sí | SYNC-2 RN-08 (`identityRowIds`) |
| admin | Ver advertencia por señal en filas `user` | Sí | SYNC-2 RN-08 |
| admin | Ver advertencia en filas `admin`/`superadmin`; superadmin en filas `superadmin` | No | Fuera de `identityRowIds`: sin señal en el payload |
| user, revocado, sin sesión | Ver la advertencia | No | Sin `users:manage`: `listUsers`/`getClerkActivity` no se invocan |
| admin/superadmin | Recuperar acceso de fila con señal | Sí | Igual que SYNC-1: `rowActions.recover` + `getUser` 404 (la señal no basta) |
| Cualquiera | Obtener `clerk_user_id` o `clerk_deleted_user_id` | No | Solo servidor |
| Fila `revoked` con señal | Reactivarse por el webhook | No | RN-06 |
| Fila admin/superadmin con señal | Perder rol/permisos por el webhook | No | RN-06 |

## Diseño y dependencias

Alternativas de persistencia:

| Criterio | Columna `app_users.clerk_deleted_user_id` (elegida) | Tabla `clerk_identity_signals` |
|---|---|---|
| Migración | `alter table add column` nullable sin default: solo metadatos, sin reescritura | `create table` + índice/PK; más DDL |
| Idempotencia | `update … is distinct from` natural | `insert … on conflict do nothing` |
| Reversión | `drop column` (la señal es reconstruible: SYNC-2 en vivo la sustituye) | `drop table` |
| Concurrencia | Una sentencia sobre la fila; serializada por Postgres | PK única; sin relación con la fila |
| Evento antiguo tras recuperación | Se ignora por no coincidir con `clerk_user_id`; señal inerte por derivación | La tabla conserva el id viejo; hay que unir y razonar sobre vigencia |
| Mantenimiento | Sin retención ni huérfanos: vive y muere con la fila (borrado en cascada por la propia fila) | Retención, huérfanos al borrar filas, join extra en `listUsers` |
| Compat. SYNC-1/2 | `recoverUserAccess` intacto; `listUsers` gana una expresión | Igual, más un join |
| Evento sin fila (id inexistente) | No-op | Se guardaría un registro inútil o habría que filtrarlo |

Se descarta la tabla: más superficie sin beneficio hoy (YAGNI). Se descarta también una columna booleana/timestamp que exigiría limpiarla en `recoverUserAccess` (cambia SYNC-1 y abre carrera); guardar el id muerto hace la vigencia derivable sin tocar SYNC-1. Se descarta `svix-id` persistido (la idempotencia ya es gratuita) y 4xx para eventos firmados pero inservibles (reintentos inútiles).

| Pieza | Ruta | Origen | Cambio |
|---|---|---|---|
| Migración | `db/migrations/0005_app_users_clerk_deleted_user_id.sql` | nuevo (sensible, `db/`) | `alter table app_users add column clerk_deleted_user_id text;` |
| Ruta | `app/api/webhooks/clerk/route.ts` | nuevo (no existe `app/api`; Route Handler) | `POST`: comprobar secreto, `verifyWebhook`, delegar en el servicio, mapear HTTP; importa solo desde `@/modules/users/server` |
| API de servidor | `modules/users/server.ts` | existente | re-exporta `recordClerkUserDeleted` y `userDeletedSchema`; la ruta importa solo desde `@/modules/users/server` |
| Schema | `modules/users/schemas/users.schema.ts` | existente | añade `userDeletedSchema` (payload `user.deleted`) |
| Servicio | `modules/users/services/identitySignals.service.ts` | nuevo (`recordClerkUserDeleted(clerkUserId)`; no existe escritura de señales) | única escritura (RN-05) |
| Listado e integración | `modules/users/services/users.service.ts` | existente | `listUsers` selecciona solo la expresión booleana `(f.clerk_user_id is not null and f.clerk_deleted_user_id = f.clerk_user_id) as clerk_deleted` (el id muerto nunca sale de SQL) y calcula `deletedSignalRowIds` = filas con `clerk_deleted` verdadero que están en `identityRowIds`; `getClerkActivity(…, identityRowIds = [], deletedSignalRowIds = [])` fusiona (RN-11) |
| Página | `app/dashboard/users/page.tsx` | existente | pasa `listing.deletedSignalRowIds` como tercer argumento |
| Entorno | `.env.example` | existente (excluido de rutas sensibles) | `CLERK_WEBHOOK_SIGNING_SECRET=whsec_REPLACE_ME` con comentario |
| Sin cambio | `proxy.ts`, `lib/auth.ts`, `lib/db.ts`, `recoverUserAccess`, componentes de `modules/users/components/` | existente | no se tocan |

Dependencias: `@clerk/nextjs/webhooks` (instalado), `zod` v4 (instalado), `@neondatabase/serverless` vía `getDb()`. Sin dependencias nuevas. Antes de escribir la ruta (T3), el `developer` lee la guía de Route Handlers de `node_modules/next/dist/docs/` (AGENTS.md: Next 16 con cambios) y fija `runtime = "nodejs"` si procede.

Pseudocódigo del handler (contrato de comportamiento):

```
POST(request):
  secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim()
  if !secret: log {code:"missing_secret"}; return 500 misconfigured
  try { evt = await verifyWebhook(request, { signingSecret: secret }) } catch { log {code:"invalid_signature"}; return 400 invalid }
  parsed = userDeletedSchema.safeParse(evt)        // type, data.id, data.deleted
  if evt.type !== "user.deleted": return 200 ignored
  if !parsed.success: log {code:"invalid_payload"}; return 200 ignored
  try { await recordClerkUserDeleted(parsed.data.data.id) } catch { log {code:"db_error", step:"record"}; return 500 retry }
  return 200 ok
```

## Contratos y datos

```ts
// modules/users/schemas/users.schema.ts
export const userDeletedSchema = z.object({
  type: z.literal("user.deleted"),
  data: z.object({ id: z.string().regex(/^user_[A-Za-z0-9]{1,64}$/), deleted: z.literal(true) }),
});

// modules/users/services/identitySignals.service.ts
export async function recordClerkUserDeleted(clerkUserId: string): Promise<void>; // RN-05; lanza solo ante fallo de Neon

// modules/users/server.ts (existente; añade)
export { recordClerkUserDeleted } from "./services/identitySignals.service";
export { userDeletedSchema } from "./schemas/users.schema";

// modules/users/services/users.service.ts
export type UsersListing = { page: UsersPage; clerkUserIds: Record<string, string>; identityRowIds: string[]; deletedSignalRowIds: string[] }; // solo servidor
// getClerkActivity(clerkUserIds, identityRowIds = [], deletedSignalRowIds = []): Promise<ClerkActivity> // nunca lanza; ClerkActivity no cambia
```

Datos:

```sql
-- up (expand): db/migrations/0005_app_users_clerk_deleted_user_id.sql
alter table app_users add column clerk_deleted_user_id text;
-- down (solo manual, probado en base local/desechable; antes revertir el código que lee la columna):
-- begin;
-- alter table app_users drop column clerk_deleted_user_id;
-- delete from schema_migrations where name = '0005_app_users_clerk_deleted_user_id.sql';
-- commit;
```

Sin índice: la escritura usa el índice único de `clerk_user_id`; la lectura es por filas de la página. Sin constraint que ate la columna a `clerk_user_id` (la recuperación pone `clerk_user_id = null` y debe poder hacerlo sin tocar la señal). `ClerkActivity` y los componentes no cambian: la señal fluye como `identity`.

Plan de migración y rollback (nada se ejecuta aquí): orden expand → deploy → (contract no aplica). (1) Aplicar `0005` en Neon DEV con `npm run db:migrate` solo con orden expresa del propietario; la columna es aditiva y compatible con el código anterior (no la lee). (2) Desplegar el código que la lee. (3) Solo entonces configurar el endpoint y el secreto en Clerk DEV. Nunca desplegar el código de `listUsers` antes de la migración (la consulta fallaría). Rollback: desactivar o borrar el endpoint en Clerk; revertir el código; la columna puede quedar (inocua) o eliminarse con el down manual, que borra la columna y su registro en `schema_migrations` en la misma transacción; sin ese borrado, `npm run db:migrate` imprimiría `SKIP 0005_…` y no recrearía la columna. Perder las señales es seguro: SYNC-2 en vivo las sustituye. Producción: fuera de esta spec; requiere orden expresa.

## No funcionales

- Rendimiento: una sentencia SQL por evento; sin llamadas a Clerk desde el webhook; `listUsers` añade una expresión booleana sobre ≤ 8 filas; `getClerkActivity` no añade llamadas HTTP.
- Límites: el cuerpo del evento `user.deleted` es pequeño; no se añade límite propio (lo impone la plataforma); el handler no registra el cuerpo.
- Auditoría: sin tabla; el log de servidor lleva `code`/`step`; Clerk conserva su registro de entregas.
- Privacidad: RN-10. No se persiste PII nueva (solo el id de Clerk que la fila ya contiene).

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Petición sin firma o forjada | `verifyWebhook` lanza | 400, nada en Neon, log `invalid_signature` | n/a |
| Repetición (replay) de un cuerpo firmado antiguo | timestamp fuera de ventana (librería) o idempotencia | 400, o 200 no-op | n/a |
| Secreto ausente o rotado sin actualizar | RN-02 (1) / firma inválida | 500 `misconfigured` / 400 | Corregir variable; Svix reintenta lo pendiente |
| Evento desconocido | `type` | 200 ignorado | n/a |
| Payload firmado sin `data.id` válido | zod | 200 ignorado, log | n/a |
| ID inexistente en Neon | 0 filas | 200 ok sin cambios | n/a |
| Entrega duplicada | `is distinct from` | 200 ok, 0 filas | n/a |
| Evento antiguo tras recuperar o revincular | `clerk_user_id` distinto | 200 ok, 0 filas; señal inerte (RN-08) | n/a |
| Fila `revoked`, admin o superadmin con señal | RN-06 | La señal se registra; no cambia acceso ni rol | Acción administrativa explícita de SYNC-1 si procede |
| Fallo transitorio de Neon | excepción del `sql` | 500 `retry`, log `db_error` | Svix reintenta; idempotente; si se agota, SYNC-2 en vivo cubre |
| Webhook caído, no configurado o pérdida de entrega | n/a | SYNC-1 y SYNC-2 siguen igual (RN-12) | Reenviar desde el panel de Clerk |
| Señal obsoleta pero Clerk responde que existe | `getUser`/lote 200 | gana la lectura en vivo (RN-11) | n/a |
| Falso positivo masivo por instancia Clerk equivocada | n/a por diseño | solo si un endpoint de otra instancia usa el secreto correcto de esta; el secreto es por endpoint/instancia | Verificar correspondencia Clerk–Neon antes de producción (mismo requisito de SYNC-2) |
| Fuga de secreto, id o PII en logs/respuestas | pruebas de espía de `console.error` y de cuerpos | solo `code`/`step` | n/a |
| Fuga de señal a roles no autorizados | `deletedSignalRowIds ⊆ identityRowIds` | prueba AC-17 | n/a |
| Migración aplicada tras desplegar el código | `listUsers` falla | Orden de despliegue documentado (expand primero) | Aplicar la migración; revertir el código si urge |
| Middleware de Clerk interfiere con el POST | UAT U-1 | n/a | Nueva spec de gobierno para `proxy.ts`; no en esta fase |

## Criterios de aceptación

- [x] AC-01 (RN-01, RN-02, RN-05) Dado un POST `user.deleted` firmado con el secreto correcto (firma generada con `node:crypto`, sin mockear `verifyWebhook`) para un id vinculado a una fila, cuando se procesa, entonces responde 200 `{"status":"ok"}` y la fila queda con `clerk_deleted_user_id` igual al id.
- [x] AC-02 (RN-02, negativo) Dado `CLERK_WEBHOOK_SIGNING_SECRET` ausente o vacío, cuando llega cualquier POST, entonces 500 `misconfigured`, no se llama a `verifyWebhook` ni a Neon y el log solo lleva `missing_secret`.
- [x] AC-03 (RN-02, negativo) Dado firma inválida, firma de otro secreto o cuerpo modificado tras firmar, cuando llega el POST, entonces 400, ninguna escritura y el log no contiene cuerpo, cabeceras ni `data.id` (una prueba por causa, con criptografía real). Firmas múltiples: `svix-signature: v1,<mala> v1,<buena>` ⇒ 200; solo firmas malas ⇒ 400.
- [x] AC-04 (RN-02, negativo) Dado cabeceras `svix-*` ausentes, o timestamp fuera de la ventana de 300 s de la librería (más antiguo o más futuro), cuando llega el POST, entonces 400 y ninguna escritura.
- [x] AC-05 (RN-01, RN-03, negativo) Dado un evento firmado de otro tipo (p. ej. `user.created`) o un `user.deleted` firmado sin `data.id`, con id fuera de patrón o con `deleted !== true`, cuando llega, entonces 200 `ignored` y ninguna escritura; todo `user.deleted` firmado con payload inválido registra `invalid_payload`; un evento de otro tipo no registra nada.
- [x] AC-06 (RN-04, RN-09) Dado un `user.deleted` firmado cuyo id no existe en Neon, cuando llega, entonces 200 `ok`, 0 filas afectadas y la respuesta es indistinguible de AC-01 (sin oráculo de existencia).
- [x] AC-07 (RN-07) Dado el mismo evento entregado dos veces, o dos entregas simultáneas, cuando se procesan, entonces ambas 200, la fila queda igual tras la primera y la segunda afecta 0 filas.
- [x] AC-08 (RN-08, negativo) Dada una fila recuperada (`clerk_user_id = null`, `status = 'invited'`) o revinculada con otro id, cuando llega un `user.deleted` antiguo con el id viejo, entonces 200, 0 filas, la fila no cambia y la expresión `clerk_deleted` que selecciona `listUsers` es falsa (la fila no entra en `deletedSignalRowIds`).
- [x] AC-09 (RN-06, negativo) Dada una fila `revoked`, y otra `admin` y otra `superadmin` `active`, cuando llega su `user.deleted`, entonces solo cambia `clerk_deleted_user_id`: `role`, `status`, `invitation_id`, `clerk_user_id` y `updated_at` quedan idénticos.
- [x] AC-10 (RN-09) Dado un fallo transitorio de Neon (la sentencia lanza), cuando llega un evento válido, entonces 500 `retry` con log `db_error` sin datos sensibles; al reintentar con Neon sano, 200 y señal registrada (idempotente).
- [x] AC-11 (RN-10, negativo) Dado cualquier camino de error, cuando se inspeccionan `console.error` y los cuerpos de respuesta, entonces solo hay `code`/`step`/`status`: sin secreto, cuerpo, cabeceras, `svix-id`, id de Clerk, email, mensajes de excepción ni `DATABASE_URL`; los errores de prueba contienen un id y un email y no aparecen.
- [x] AC-12 (RN-06, RN-13, negativo) Dado el servicio y la ruta, cuando se inspeccionan las sentencias SQL emitidas y los imports, entonces la única sentencia es la de RN-05, no hay `insert`/`delete`/otros `update`, y no se importan `clerkClient`, `lib/auth.ts` ni funciones de invitación.
- [x] AC-13 (RN-09) Dado que `route.ts` solo exporta `POST`, cuando se invoca la ruta con GET, PUT, PATCH o DELETE, entonces Next 16 responde 405 sin tocar Neon, y OPTIONS lo gestiona Next automáticamente (cabecera `Allow`); no se escribe handler de 405. Se verifica por los exports del módulo (prueba) y por `curl` en UAT.
- [x] AC-14 (RN-11) Dada una fila `active` gestionable con `clerk_deleted` verdadero y lectura en vivo `unverified` (timeout, 429, 5xx, lote caído, 404 ambiguo), cuando se llama `getClerkActivity` con `deletedSignalRowIds`, entonces su `identity` es `not_found` con `lastSignInAt`/`imageUrl` `null`; con lectura `not_found` se mantiene. La fusión se aplica en todas las salidas de `getClerkActivity`, incluidos los `return activity` anticipados por timeout o fallo del lote (`users.service.ts` ~l.255-266).
- [x] AC-15 (RN-11, negativo) Dada una fila con señal que Clerk sí encuentra (lote o `getUser` 200), cuando se llama, entonces `verified` (gana la lectura en vivo) y no hay advertencia.
- [x] AC-16 (RN-12) Dado `getClerkActivity` sin tercer argumento o con `[]`, cuando se ejecuta, entonces el resultado es idéntico al de SYNC-2: las pruebas SYNC-1 y SYNC-2 existentes pasan sin modificar (salvo lo permitido en AC-18 de esta spec).
- [x] AC-17 (RN-11, RN-10, negativo) Dado un actor admin y filas `admin`/`superadmin` con señal, o un superadmin y filas `superadmin`, cuando `listUsers` calcula `deletedSignalRowIds`, entonces esas filas no están (subconjunto de `identityRowIds`), y `getClerkActivity` no les asigna `not_found`; `UsersListing`/props no exponen `clerk_user_id` ni `clerk_deleted_user_id` (la consulta solo selecciona la expresión booleana `clerk_deleted`); filas con `clerk_deleted` falso (sin `clerk_user_id` o con señal obsoleta `clerk_deleted_user_id ≠ clerk_user_id`) no entran.
- [x] AC-18 (RN-12) Dado `listUsers`, cuando se ejecutan las pruebas existentes de `users.service.test.ts`, entonces las únicas modificaciones son: el mock de filas gana `clerk_deleted` y los `toEqual` del objeto de `UsersListing` ganan `deletedSignalRowIds: []`; ninguna aserción se debilita.
- [x] AC-19 (RN-12, negativo) Dada una fila con señal, cuando `recoverUserAccess` se ejecuta, entonces sigue llamando a `getUser`; si Clerk responde 200 falla con `STILL_EXISTS`; la señal no sustituye la confirmación; `recoverUserAccess` no cambia en el diff.
- [x] AC-20 (RN-13) Dado el diff de la fase, cuando se revisa, entonces no cambian `proxy.ts`, `lib/auth.ts`, `lib/db.ts`, `package.json`, `package-lock.json`, componentes de `modules/users/components/` ni archivos de gobierno; el único cambio de `page.tsx` es pasar `listing.deletedSignalRowIds`; la migración es solo el `alter table … add column` y no está aplicada.
- [ ] AC-21 (RN-05, RN-07) Dada la migración `0005`, cuando se prueba en una base local o desechable (no Neon compartida), entonces `npm run db:migrate` la aplica (`OK 0005_…`) añadiendo la columna nullable sin afectar filas ni constraints; una segunda ejecución imprime `SKIP 0005_…`; el down manual (drop column + delete en `schema_migrations`, en una transacción) restaura esquema y registro, y un nuevo `db:migrate` la vuelve a aplicar; `NO EJECUTADO` si no hay base desechable, con motivo.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | Handler | AC-01, AC-05 | `app/api/webhooks/clerk/route.test.ts` |
| RN-02 | Handler, tabla HTTP | AC-01 a AC-04 | `route.test.ts` (HMAC real con `node:crypto`) |
| RN-03 | `userDeletedSchema` | AC-05 | `users.schema.test.ts`, `route.test.ts` |
| RN-04 | SQL RN-05 | AC-06 | `identitySignals.service.test.ts` |
| RN-05 | Migración, SQL | AC-01, AC-12, AC-21 | `identitySignals.service.test.ts`; revisión de migración |
| RN-06 | Matriz de acceso | AC-09, AC-12 | `identitySignals.service.test.ts` (SQL emitido), `route.test.ts` |
| RN-07 | Idempotencia | AC-07, AC-10, AC-21 | `identitySignals.service.test.ts`, `route.test.ts` |
| RN-08 | Expresión `clerk_deleted` en `listUsers` | AC-08, AC-17 | `identitySignals.service.test.ts`, `users.service.test.ts` |
| RN-09 | Tabla HTTP | AC-06, AC-10, AC-13 | `route.test.ts` |
| RN-10 | Logs/respuestas | AC-03, AC-11, AC-17 | `route.test.ts`, `users.service.test.ts` |
| RN-11 | `getClerkActivity` | AC-14, AC-15, AC-17 | `users.service.test.ts` |
| RN-12 | SYNC-1/2 | AC-16, AC-18, AC-19 | `users.service.test.ts` (pruebas existentes) |
| RN-13 | Diseño | AC-12, AC-20 | revisión del diff |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Endpoint y servicio | Todos los casos de AC-01 a AC-13 con `getDb` mockeado; firma generada con `node:crypto` (HMAC-SHA256, secreto `whsec_<base64>`, cabeceras `svix-*`) y `verifyWebhook` real; espía de `console.error` | NO EJECUTADO: sin Neon real en pruebas (motivo: servicios reales no autorizados en desarrollo); cubierto en UAT | UAT en Clerk DEV y Neon DEV (plan abajo) | Obligatoria: firma, replay, secreto ausente, privacidad de logs, sin efectos de acceso (SQL inspeccionado), sin oráculo de existencia | Ver fila siguiente |
| Esquema `app_users` | Validación del SQL de la migración | Solo en base local/desechable (AC-21) | Aplicación en Neon DEV solo con orden expresa | n/a | Obligatorio: expand → deploy; rollback con el down manual (drop column + registro en `schema_migrations`); sin ejecutar nada compartido |
| Integración SYNC-2 | `getClerkActivity` con señal: unverified→not_found, verified gana, not_found igual, no gestionables sin señal, default `[]` idéntico; `listUsers` calcula `deletedSignalRowIds` por actor | NO EJECUTADO: mocks, igual que SYNC-2 | UAT U-3, U-9 | Permisos admin vs superadmin; sin ids al cliente | n/a |
| Regresión SYNC-1/SYNC-2 | `npx vitest run modules/users` y suite completa sin modificar pruebas salvo AC-18 | n/a | UAT U-9 | n/a | n/a |

## Archivos sensibles
- `db/migrations/0005_app_users_clerk_deleted_user_id.sql`

## Plan de tareas
### Fase 1
- [x] T1 — Migración aditiva `0005` (solo archivo, sin aplicar) y placeholder del secreto en `.env.example`; validar el SQL en base local/desechable si existe (AC-21) · archivos: `db/migrations/0005_app_users_clerk_deleted_user_id.sql`, `.env.example` · depende de: — · secuencial (base)
- [x] T2 — Servicio `recordClerkUserDeleted` y `userDeletedSchema` (en `schemas/`) con pruebas (SQL único, idempotencia, id inexistente, fila revocada/admin/superadmin, recuperada, fallo de Neon, SQL inspeccionado; casos del schema en `users.schema.test.ts`), re-exportados en `server.ts` · archivos: `modules/users/services/identitySignals.service.ts`, `modules/users/services/identitySignals.service.test.ts`, `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts`, `modules/users/server.ts` · depende de: T1 · paralelo (con T4; archivos disjuntos)
- [x] T3 — Ruta `POST /api/webhooks/clerk` con comprobación de secreto, `verifyWebhook`, mapeo HTTP de RN-09 y logs sin PII, con pruebas de firma real; importa solo desde `@/modules/users/server` (leer antes la guía de Route Handlers de Next en `node_modules/next/dist/docs/`) · archivos: `app/api/webhooks/clerk/route.ts`, `app/api/webhooks/clerk/route.test.ts` · depende de: T2 · secuencial (tras T2)
- [x] T4 — Integración SYNC-2: `listUsers` (expresión `clerk_deleted`, `deletedSignalRowIds`), `getClerkActivity` con tercer parámetro, `page.tsx` pasa el valor, pruebas de fusión/permiso/regresión y actualización mínima de AC-18 · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`, `app/dashboard/users/page.tsx` · depende de: T1 · paralelo (con T2)
- [x] T5 — Verificación de cierre: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`; comprobar AC-20 en el diff real (sin cambios en `proxy.ts`, `lib/auth.ts`, `package*.json`, gobierno) · archivos: ninguno · depende de: T3, T4 · secuencial (cierre)

Total: 5 tareas, 12 archivos distintos, una sola fase, un archivo sensible, sin gobierno.

## Plan UAT (preparación; nada se ejecuta aquí)

Formato `docs/forms/uat.md`. Solo Clerk DEV (`sk_test_`) y Neon DEV, cuentas descartables; el propietario confirma que son DEV y sin datos reales. Requiere orden expresa del propietario para: aplicar `0005` en Neon DEV, crear el endpoint y el secreto en Clerk DEV y exponer el servidor local (túnel). Registro posterior en `docs/evidence/sync-3-webhooks-uat.md` (`developer`, `Modo: build`). Aceptación UAT no equivale a `apruebo`.

| ID | Pantalla / medio | Rol | Pasos | Esperado | Depende de |
|---|---|---|---|---|---|
| U-1 | Panel Clerk DEV (evento de prueba) y `curl` | propietario | Enviar el evento de ejemplo `user.deleted` desde el panel de Clerk al endpoint con el secreto real; luego `curl` sin firma | 200 `ignored`/`ok` sin cambios (id de ejemplo inexistente) y 400 sin firma; el endpoint responde sin sesión (confirma que `proxy.ts` no interfiere, RN-13) | — |
| U-2 | Clerk DEV + `/dashboard/users` | superadmin | Con un usuario `active` descartable, borrarlo en el panel de Clerk DEV; esperar la entrega; consultar Neon (solo lectura) | `clerk_deleted_user_id` = id muerto; `role`, `status`, `updated_at` iguales; sin invitación | U-1 |
| U-3 | `/dashboard/users` | superadmin | Con Clerk sano, cargar la lista | Advertencia «Identidad no encontrada» y «Recuperar acceso» presentes (las da ya el 404 en vivo de SYNC-2); sin cambios en Neon. La fusión señal→`not_found` con Clerk caído se cubre solo por prueba automatizada (AC-14), sin PASS manual | U-2 |
| U-4 | Panel Clerk (reenvío) | propietario | Reenviar el mismo mensaje desde el registro de entregas | 200; sin cambio de fila | U-2 |
| U-5 | `/dashboard/users` | superadmin | Recuperar acceso (SYNC-1) a la fila; después reenviar el evento antiguo | La fila queda `invited` sin `clerk_user_id`; el reenvío da 200 sin cambios; sin advertencia | U-4 |
| U-6 | `curl` | propietario | POST con firma inválida y otro con cabeceras faltantes | 400 en ambos; Neon sin cambios | U-1 |
| U-7 | Servidor local DEV | propietario | Con `.env.local` temporal sin `CLERK_WEBHOOK_SIGNING_SECRET` (restaurar después), enviar un evento | 500 `misconfigured` | U-1 |
| U-8 | Log del servidor | propietario | Revisar logs de U-1 a U-7 | Solo `code`/`step`; sin ids, emails, cuerpo ni secretos | U-2 |
| U-9 | `/dashboard/users` | admin y superadmin | Regresión SYNC-1/SYNC-2: advertencia por rol (admin solo ve filas `user`), recuperación, filas verificadas | Igual que sus UAT; sin filtración a roles sin permiso | U-2 |
| U-10 | Neon DEV | propietario | Con `DATABASE_URL` inválida solo en local (restaurar), entregar un evento y luego restaurar y reenviar | 500 y después 200 idempotente | U-2 |

Reservas previstas (no son PASS): el calendario real de reintentos de Svix y el consumo de rate limit de Clerk no se miden; no se prueba producción.

## Riesgos y preguntas

- Q1 — RESUELTA por el propietario: aprobada tal cual RN-11. Una señal firmada convierte `unverified` en `not_found` solo si el id coincide con el `clerk_user_id` actual; `verified` en vivo gana; sin cambios de roles, permisos, estado ni recuperación. Enmienda `docs/specs/sync-2-detection.md` RN-02 sin editarla.
- Riesgo: orden de despliegue (migración antes del código); mitigado por el plan de migración.
- Riesgo: el middleware de Clerk podría interferir con el POST en DEV; se comprueba en U-1; si ocurre, spec separada de gobierno (`proxy.ts`).
- Riesgo: el UAT necesita exponer el servidor local a Clerk (túnel): decisión operativa del propietario, no bloquea la spec.
- Límite de validación: `verifyWebhook` se inspeccionó leyendo código, no ejecutando; AC-03/AC-04 con firma real lo cubren en pruebas.
- Preguntas realmente bloqueantes: ninguna.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz figura como NO EJECUTADO con su motivo.
