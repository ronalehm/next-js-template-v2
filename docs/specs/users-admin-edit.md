# Edición administrativa de nombre y apellido (USERS-1)

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-admin-edit
- Riesgo: alto (escribe identidad ajena en Clerk y datos personales en Neon; autorización por rol)
- Ruta: SDD-ADVANCED (disparadores: autorización, roles y permisos; datos personales; integración externa con Clerk)
- Fase actual: Fase 1

## Objetivo

Que un superadmin o un admin corrija el nombre y el apellido de usuarios existentes desde `/dashboard/users`, sin pedirle a la persona que entre a su perfil. Reutiliza la arquitectura de AUTH-3 (`modules/users`). Sustituye parcialmente D24 y D34 de `docs/specs/auth-clerk-neon.md` (ver Decisiones).

## Alcance y reglas

- Incluye: acción de fila «Editar» y botón «Editar» en el detalle; diálogo de edición de Nombre y Apellido; acción de servidor, servicio, schema y regla `editName` en `rowActions`; sustitución de la nota de solo lectura del detalle.
- No incluye: edición de correo, contraseña, foto o rol (ChangeRoleDialog sigue independiente y solo superadmin); filas `invited` o `revoked`; filas sin `clerk_user_id`; edición de superadmins o de la propia cuenta; borrado; avisos por correo; auditoría nueva; lectura de `user_profiles`; migraciones; webhooks; dependencias nuevas.
- Referencia visual: pantalla 05 («Editar usuario») de `docs/specs/users-management-design.md`, adaptada: sin campo Rol, sin «Activo · Último acceso» bajo el nombre, y «Cerrar · Editar · Cambiar rol» en el detalle (pantalla 12 más D-U1-6). Limitación: Figma en vivo no se verifica; esa spec es la referencia visual versionada.
- RN-01: Edita nombre y apellido quien tiene `users:manage` y gestiona el rol de la fila (`canManageRole`): superadmin sobre `user` y `admin`; admin solo sobre `user`.
- RN-02: Nadie edita por este flujo a un superadmin ni a su propia cuenta.
- RN-03: Solo se edita una fila `active` con `clerk_user_id` no nulo. El id de Clerk se lee en el servidor desde `app_users` (D38); el cliente nunca lo envía.
- RN-04: El cliente solo envía `id` de fila, nombre, apellido y los valores previos esperados. Nunca rol, correo ni id de Clerk.
- RN-05: `firstName` y `lastName` son obligatorios: sin caracteres de control, espacios normalizados y recortados, 1 a 50 caracteres cada uno. Superar 50 se rechaza con error visible; nunca se trunca en silencio (D-U1-6).
- RN-06: Orden de escritura: Clerk primero, luego `update` condicional en Neon. Hay dos resultados distintos: (1) nada se escribió (comprobación previa fallida o fallo de Clerk) y (2) Clerk ya se actualizó pero Neon falló, lanzó excepción o devolvió 0 filas (incluida la concurrencia en el `where`): la acción responde siempre `{ ok: false }` con el mensaje de estado parcial, nunca éxito ni `CHANGED`. NO hay rollback automático ni reintentos automáticos (ni ilimitados ni limitados): solo reintenta la persona, manualmente. La inconsistencia temporal (Clerk con el valor nuevo y Neon con el anterior hasta el reintento) es una ventana aceptada que se reconcilia con D32 (al abrir el titular su perfil) o con el reintento idempotente.
- RN-07: Si la fila cambió desde que la UI la leyó (nombre previo distinto, estado, rol o vínculo) y la comprobación previa lo detecta, no se escribe nada en Clerk ni en Neon y se responde `El usuario cambió mientras tanto. Recarga la página.` Esto no aplica a cambios detectados después de escribir Clerk (RN-06, resultado 2).
- RN-08: La UI solo oculta; servicio y SQL repiten la regla (R47, D37).
- RN-09: Los logs llevan solo `code` y `message` (y, en el fallo posterior a Clerk, una etiqueta fija de paso `step: "neon-after-clerk"`), nunca nombres, correos ni ids de Clerk (D42).

## Decisiones (sustituyen a las anteriores solo en lo indicado; no se editan las specs históricas)

- D-U1-1: Nombre y apellido de otros pueden editarlos admin y superadmin según RN-01 a RN-03. Sustituye D24 ("nombre y apellido se editan solo en el modal de Clerk") y la última frase de D34 pantalla 05 en lo que impide a un administrador editarlos. D24 sigue vigente para foto, correo, contraseña y sesiones: solo su titular.
- D-U1-2: La pantalla 05 de AUTH-3 solo cambiaba el rol (D34). USERS-1 añade un diálogo propio sin Rol; la fila «Editar nombre y apellido» de la matriz visual pasa a implementarse con la matriz de abajo. Sustituye esa parte de D34.
- D-U1-3: El módulo escribe en Clerk datos de identidad de otra persona, solo `firstName` y `lastName` con `users.updateUser`. Hasta ahora solo escribía invitaciones (D40) y leía actividad (D38). Enmienda D23 y D28 ("sigue sin escribir en Clerk"); D38 no cambia.
- D-U1-4: Clerk es la fuente de identidad (D11, D23): se escribe primero ahí. Enmienda el «límite aceptado» de D32 y D35: un cambio hecho por un administrador llega a Neon en la misma operación; uno hecho por el titular en Clerk sigue llegando al abrir su perfil.
- D-U1-5: Se extiende la matriz D37 con la fila «Editar nombre y apellido» (abajo). No cambia `lib/roles.ts`.
- D-U1-6 (decisiones del propietario): (1) `lastName` es obligatorio en el formulario administrativo. (2) Máximo 50 caracteres para nombre y apellido sin truncamiento silencioso: el schema rechaza con error visible y la UI no usa un atributo que recorte (`maxLength` en el `Input` recortaría un pegado en silencio); el campo muestra el error al superar 50. (3) El detalle mantiene «Cerrar · Editar · Cambiar rol» respetando permisos: `Editar` solo si `rowActions.editName`; `Cambiar rol` solo si `rowActions.changeRole`, y sigue siendo solo de superadmin.

## Actores y matriz de acceso

| Actor | Acción: editar nombre y apellido de... | Permitido | Condición |
|---|---|---|---|
| user | cualquiera | No | Sin `users:manage` |
| admin | fila `user` activa y vinculada | Sí | RN-03 |
| admin | fila `admin` o `superadmin` | No | `canManageRole` falso |
| superadmin | fila `user` o `admin` activa y vinculada | Sí | RN-03 |
| superadmin | fila `superadmin` | No | `canManageRole` falso |
| cualquiera | su propia fila | No | `actor.id === row.id` |
| cualquiera | fila `invited`, `revoked` o sin `clerk_user_id` | No | RN-03 |

## Diseño y dependencias

Sin rutas nuevas: `app/dashboard/users/page.tsx` no cambia.

| Capa | Archivo | Origen |
|---|---|---|
| Schema | `modules/users/schemas/users.schema.ts` (añade `nameInputSchema`) | existente |
| Tipos | `modules/users/types/users.types.ts` (añade `NameInput`) | existente; `UserRow` y `ActionResult` se reutilizan sin cambios |
| Permisos | `modules/users/utils/userPermissions.ts` (añade `editName` a `rowActions`) | existente |
| Servicio | `modules/users/services/users.service.ts` (añade `updateUserName`) | existente; reutiliza `assertManager`, `UsersError`, `logError`, `CHANGED`, `FORBIDDEN`, `assignableRoles` |
| Acción | `modules/users/actions/users.actions.ts` (añade `updateUserNameAction` con `mutate`) | existente |
| Diálogo | `modules/users/components/EditUserDialog.tsx` | nuevo: no existe un diálogo de campos de texto; ChangeRoleDialog solo tiene un selector de rol y se copia su patrón (`useTransition`, error bajo el campo, `finalFocus`). No se abstrae un contenedor común con una sola repetición |
| Vista | `modules/users/components/UsersView.tsx` (ítem «Editar», estado del diálogo, aviso «Usuario actualizado.») | existente |
| Detalle | `modules/users/components/UserDetailSheet.tsx` (props `canEdit`/`onEdit`, botón «Editar», nota nueva) | existente |
| UI | Dialog, Input, Label, Button, DropdownMenu, `UserAvatar` | shadcn (instalado) / existente (`components/shared/UserAvatar`) |

`modules/users/index.ts` y `server.ts` no cambian (los componentes importan la acción directamente, como los demás).

Integración externa: Clerk Backend API `(await clerkClient()).users.updateUser(clerkUserId, { firstName, lastName })`, `isClerkAPIResponseError` ya usado en el servicio. Sin `getUser`.

Comportamiento de Clerk NO verificado (esta spec no llama a Clerk):
- Si acepta `lastName` vacío o nulo: se evita haciendo ambos campos obligatorios (RN-05).
- Longitud máxima de nombres y código exacto de error de formato: se usa 50 (conservador) y un 422 se traduce al mensaje «No se pudo guardar: revisa el nombre y el apellido.»; cualquier otro error de Clerk sale como mensaje genérico (D42). Se comprueba en la ronda manual en DEV.

## Contratos y datos

```ts
// users.schema.ts
const nameField = z
  .string()
  .refine((v) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(v), "Quita los caracteres no válidos.")
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Este campo es obligatorio.").max(50, "Máximo 50 caracteres."));

export const nameInputSchema = z.strictObject({
  id: z.uuid(),
  firstName: nameField,
  lastName: nameField,
  expectedFirstName: z.string().max(256).nullable(), // valor de la fila que vio la UI
  expectedLastName: z.string().max(256).nullable(),
});
export type NameInput = z.output<typeof nameInputSchema>;
```

- Acción: `updateUserNameAction(input: unknown): Promise<ActionResult>` con `mutate("updateUserNameAction", nameInputSchema, input, updateUserName)`. `authorize()` ya exige sesión, fila activa y `users:manage`; revalida `/dashboard/users`.
- `ActionResult = { ok: true } | { ok: false; error: string }` (sin cambios). Errores en español: `No tienes permiso para esta acción.`, `El usuario cambió mientras tanto. Recarga la página.`, `No se pudo guardar: revisa el nombre y el apellido.` (422 de Clerk), `El cambio se guardó solo en parte: se actualizó en la cuenta, pero no en el panel. Vuelve a intentarlo.` (estado parcial, RN-06 resultado 2; distinto de `CHANGED`), y el genérico de D42.
- Servicio `updateUserName(actor, input)`:
  1. `assertManager(actor)`.
  2. Lee `role, status, clerk_user_id, first_name, last_name` por `id`; sin fila: `CHANGED`.
  3. `input.id === actor.id` o `!assignableRoles(actor.role).includes(row.role)`: `FORBIDDEN` (sin Clerk ni escritura).
  4. `status !== 'active'`, sin `clerk_user_id`, o nombres de la fila distintos de los esperados: `CHANGED`.
  5. `clerk.users.updateUser(row.clerk_user_id, { firstName, lastName })`, invocado una sola vez (sin reintentos). Fallo: se propaga (422 se convierte en `UsersError`); no se escribe en Neon (resultado 1).
  6. `update app_users set first_name, last_name, updated_at = now() where id = $ and id <> actor.id and role = any(assignable) and status = 'active' and clerk_user_id = $leído and first_name is not distinct from $esperado and last_name is not distinct from $esperado returning id`. Si lanza excepción o devuelve 0 filas (Clerk ya se actualizó; resultado 2): `logError` con `code`, `message` y `step: "neon-after-clerk"` (sin nombres, correos ni ids de Clerk) y `UsersError` con el mensaje de estado parcial (nunca `CHANGED`, nunca éxito). Sin rollback ni reintento automático.
- Datos: `app_users.first_name`, `last_name`, `updated_at` ya existen. Sin migraciones, índices ni cambios de `db/`.

## No funcionales

- Privacidad: nombre y correo no se registran; no se lee `user_profiles` (D31); el id de Clerk no sale del servidor (D38).
- Una llamada a Clerk y dos sentencias SQL por edición. Sin auditoría nueva (fuera de alcance).
- Accesibilidad: etiquetas asociadas, error con `aria-describedby`, foco devuelto con `finalFocus`.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Escalada (admin sobre admin/superadmin, propia cuenta, rol enviado por el cliente) | `assertManager`, `assignableRoles`, `id <> actor.id`, `strictObject` | `FORBIDDEN` o acción genérica; sin Clerk ni SQL | — |
| IDOR / id de Clerk enviado por el cliente | `strictObject` rechaza claves extra; el id de Clerk sale de `app_users` | Rechazo genérico | — |
| Fila obsoleta detectada ANTES de escribir (cambió nombre, rol, estado o vínculo) | Comparación previa con lo esperado (paso 4) | `CHANGED`; nada se escribió (resultado 1) | El usuario recarga |
| Clerk falla (red, 422, 5xx) | Excepción de `updateUser` | Genérico (422: mensaje de nombre); nada se escribió (resultado 1) | Reintentar; nada que revertir |
| Neon falla, lanza excepción o devuelve 0 filas tras escribir Clerk (resultado 2) | Excepción o `returning` vacío (paso 6) | `{ ok: false }` con el mensaje de estado parcial, distinto de `CHANGED`; log `code`+`message`+`step: "neon-after-clerk"` | Sin rollback ni reintentos automáticos: solo reintenta la persona, a mano; el reintento es idempotente (repite el valor en Clerk y escribe Neon). Ventana aceptada: Clerk con el valor nuevo y Neon con el anterior hasta el reintento; si no se reintenta, D32 iguala Neon con Clerk cuando el titular abre su perfil |
| Dos administradores editan a la vez | Comparación previa; `where` con valores esperados | Si el segundo se adelanta a la escritura del primero en Neon, la comprobación previa devuelve `CHANGED` (resultado 1). Si la concurrencia se detecta en el `where` tras escribir Clerk, recibe el mensaje de estado parcial (resultado 2); Clerk pudo recibir su valor | Recargar y reintentar a mano; D32 |
| El titular cambió su nombre en Clerk sin pasar por su perfil | No se detecta (sin webhooks) | El administrador sobrescribe en Clerk según lo que ve | Aceptado (D32); el titular puede volver a editar |
| Datos personales en logs | Test de logs | Solo `code` y `message` (D42) | — |

Alternativa descartada: leer `getUser` antes y revertir en Clerk si Neon falla. Añade una llamada y otro modo de fallo (la reversión puede pisar un cambio simultáneo del titular) para una ventana mínima que el reintento manual y D32 ya cubren.

## Criterios de aceptación

- [ ] AC-01 (RN-01, RN-06) Dado un superadmin y una fila `user` o `admin` activa y vinculada, cuando guarda nombre y apellido válidos, entonces se llama a `updateUser` con el id de Clerk de esa fila, después se hace el `update` en Neon y se revalida `/dashboard/users`.
- [ ] AC-02 (RN-01) Dado un admin y una fila `user` activa y vinculada, cuando guarda, entonces se actualiza igual.
- [ ] AC-03 (RN-01, negativo) Dado un admin y una fila `admin`, cuando intenta editarla, entonces el servicio responde `No tienes permiso para esta acción.` sin llamar a Clerk ni escribir en Neon.
- [ ] AC-04 (RN-02, negativo) Dado un actor y su propia fila, cuando intenta editarla, entonces se rechaza sin Clerk ni escritura.
- [ ] AC-05 (RN-02, negativo) Dado un superadmin o un admin y una fila `superadmin`, cuando intenta editarla, entonces se rechaza sin Clerk ni escritura.
- [ ] AC-06 (RN-01, negativo) Dado un actor con rol `user`, cuando invoca la acción o el servicio, entonces se rechaza antes de tocar Clerk o la base.
- [ ] AC-07 (RN-04, negativo) Dado un payload con `clerkUserId`, `role`, `email` u otra clave extra, cuando se valida, entonces el schema lo rechaza y la acción devuelve el error genérico sin llamar al servicio.
- [ ] AC-08 (RN-03, negativo) Dado una fila `invited` o `revoked`, cuando se intenta editar, entonces `CHANGED` sin Clerk ni escritura; `rowActions.editName` es falso.
- [ ] AC-09 (RN-03, negativo) Dado una fila sin `clerk_user_id`, cuando se intenta editar, entonces `CHANGED` sin Clerk ni escritura; `rowActions.editName` es falso.
- [ ] AC-10 (RN-07, negativo) Dado que, en la comprobación previa (antes de llamar a Clerk), los nombres de Neon difieren de los esperados o el estado, rol o vínculo de la fila cambiaron, cuando se guarda, entonces se responde `El usuario cambió mientras tanto. Recarga la página.` sin llamar a Clerk ni escribir en Neon. Prueba: `users.service.test.ts` (esperados distintos y estado/rol/vínculo cambiados).
- [ ] AC-11 (RN-06) Dado que Clerk falla, cuando se guarda, entonces no hay escritura en Neon y el usuario ve el mensaje genérico (o el de nombre si fue 422). Prueba: `users.service.test.ts` (fallo de Clerk sin SQL de escritura; 422).
- [ ] AC-12 (RN-06) Dado que Clerk ya se actualizó y el `update` de Neon lanza excepción o devuelve 0 filas (incluida la concurrencia en el `where`), cuando termina, entonces la acción devuelve `{ ok: false }` con `El cambio se guardó solo en parte: se actualizó en la cuenta, pero no en el panel. Vuelve a intentarlo.` (distinto de `CHANGED`, nunca éxito), `updateUser` se invocó una sola vez (sin reintentos automáticos), el log tiene solo `code`, `message` y `step: "neon-after-clerk"`, y repetir la petición con los valores recargados completa la edición. Pruebas: `users.service.test.ts` (excepción de Neon; 0 filas devuelve el mensaje parcial y no `CHANGED`; una sola llamada a `updateUser`; log con etiqueta y sin datos personales).
- [ ] AC-13 (RN-05, negativo; D-U1-6) Dado un nombre o apellido vacío o de solo espacios, de más de 50 caracteres o con caracteres de control, cuando se valida, entonces el schema lo rechaza (sin truncar); `"  Ana   María "` se normaliza a `"Ana María"`. En la UI el `Input` no usa `maxLength` y el campo muestra `Máximo 50 caracteres.` al superar 50 (un pegado largo no se recorta). `lastName` es obligatorio.
- [ ] AC-14 (RN-08; D-U1-6) Dado cualquier actor, cuando ve la lista o el detalle, entonces «Editar» aparece (menú y detalle) solo si `rowActions.editName` es verdadero. El detalle muestra los botones en el orden «Cerrar · Editar · Cambiar rol»: «Editar» solo si `rowActions.editName`; «Cambiar rol» solo si `rowActions.changeRole` (y sigue siendo solo de superadmin). El diálogo no tiene campo Rol, muestra el Correo deshabilitado con «El correo lo cambia la propia persona desde su perfil.», y «Guardar cambios» está deshabilitado sin cambios o durante el envío.
- [ ] AC-15 (RN-09) Dado un fallo de Clerk o de Neon, cuando se registra, entonces el log solo incluye `code` y `message` (más `step: "neon-after-clerk"` si el fallo es posterior a Clerk), sin nombres, correos ni ids de Clerk. Prueba: `users.service.test.ts`.
- [ ] AC-16 (D-U1-1) Dado el detalle de usuario, cuando se abre, entonces la nota dice que solo la persona puede cambiar su correo o su contraseña, y no se consulta `user_profiles`.
- [ ] AC-17 (regresión) Dado Cambiar rol, Inactivar, Activar y Reenviar, cuando se usan, entonces se comportan como antes (sus tests existentes siguen pasando; Cambiar rol sigue siendo solo de superadmin).
- [ ] AC-18 (manual, una ronda en DEV) Con cuentas de prueba: superadmin edita un `user` y un `admin`; admin edita un `user`; no aparece «Editar» en admin sobre admin, propia fila, superadmin, invitados ni inactivos; el nombre cambia en la lista y en Clerk.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01, RN-02 | Matriz; `rowActions.editName`; pasos 1 a 3 del servicio | AC-01 a AC-06 | `utils/userPermissions.test.ts`, `services/users.service.test.ts` |
| RN-03 | Paso 4 y `where` | AC-08, AC-09 | ambos |
| RN-04 | `nameInputSchema` estricto | AC-07 | `schemas/users.schema.test.ts` |
| RN-05, D-U1-6 | `nameField`; UI sin `maxLength` | AC-13 | `schemas/users.schema.test.ts`; UI en revisión del reviewer y AC-18 |
| RN-06 | Pasos 5 y 6; tabla de fallos | AC-01, AC-11, AC-12 | `services/users.service.test.ts` |
| RN-07 | Paso 4 (solo comprobación previa) | AC-10 | `services/users.service.test.ts` |
| RN-08, D-U1-6 | UI + servicio + SQL | AC-14, AC-16, AC-18 | manual; `userPermissions.test.ts` |
| RN-09 | `logError` | AC-15 | `services/users.service.test.ts` |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Auth, sesión, RBAC (edición administrativa) | Policies, schema y servicio con Clerk y SQL simulados | No (sin pruebas contra base) | Una ronda breve en DEV (AC-18); no se ejecutan mutaciones en DEV hasta la aprobación e implementación | Escalada horizontal y vertical, IDOR, fila obsoleta (AC-03 a AC-10) | No aplica: sin cambios de esquema |

## Tests

Unitarios, junto a cada archivo, sin tests de componentes (no hay lógica nueva más allá de la ya cubierta; la UI solo compone):

- `modules/users/utils/userPermissions.test.ts`: la constante `NONE` y las igualdades existentes incorporan `editName`. Casos nuevos: superadmin sobre `user`/`admin` activos vinculados verdadero; admin sobre `user` verdadero; admin sobre `admin`/`superadmin`, superadmin sobre superadmin, `user` y propia fila falso; falso para `invited`, `revoked` y sin vínculo.
- `modules/users/schemas/users.schema.test.ts`: `nameInputSchema` acepta un payload válido; normaliza espacios; rechaza vacío, solo espacios, 51 caracteres, control (`\n`, `\t`, `\u0000`), id no uuid, claves extra (`clerkUserId`, `role`, `email`) y esperados no string/null.
- `modules/users/services/users.service.test.ts` (se añade `users.updateUser` al mock de Clerk): rechazo de `user` sin tocar nada (entra en la tabla de permisos existente); éxito superadmin sobre `user` y `admin` y admin sobre `user` con orden Clerk→SQL y id de Clerk leído de la fila; admin sobre `admin`; superadmin y admin sobre `superadmin`; propia cuenta; `invited`, `revoked`, sin vínculo y fila inexistente (sin Clerk ni escritura); esperados distintos y estado/rol/vínculo cambiados en la comprobación previa (`CHANGED`, sin Clerk); fallo de Clerk (sin SQL de escritura; 422 con mensaje de nombre); excepción de Neon tras Clerk (mensaje de estado parcial); 0 filas en el `update` tras escribir Clerk devuelve el mensaje de estado parcial (no `CHANGED`); `updateUser` se invoca una sola vez (sin reintentos automáticos); el log del fallo posterior a Clerk incluye `step: "neon-after-clerk"` y solo `code` y `message` más esa etiqueta, sin datos personales; el SQL contiene `id <> actor`, `status = 'active'`, `clerk_user_id` y `is not distinct from`.
- Verificación del reviewer: fila de código y estilos de `docs/SETUP.md` (SOLID, DRY, KISS, YAGNI, `"use client"`, lint y build); no hay rutas sensibles que revisar.

## Plan de tareas

### Fase 1
- [x] T1 — Schema, tipo y regla `editName` con sus tests · archivos: `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts`, `modules/users/types/users.types.ts`, `modules/users/utils/userPermissions.ts`, `modules/users/utils/userPermissions.test.ts` · depende de: — · secuencial (base)
- [x] T2 — `updateUserName` y `updateUserNameAction` con tests · archivos: `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`, `modules/users/actions/users.actions.ts` · depende de: T1 · secuencial (la UI importa la acción)
- [x] T3 — UI: diálogo, ítem de menú y botón del detalle · archivos: `modules/users/components/EditUserDialog.tsx`, `modules/users/components/UsersView.tsx`, `modules/users/components/UserDetailSheet.tsx` · depende de: T1, T2 · secuencial

Total: 11 archivos (5 + 3 + 3; uno nuevo: `EditUserDialog.tsx`), 3 tareas, una fase. No hay tareas paralelizables: T3 importa lo de T2, que usa lo de T1.

## Preguntas abiertas

Ninguna.
