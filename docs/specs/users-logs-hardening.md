# Users logs hardening

- Módulo: users
- Estado: aprobado
- ID: SPEC-users-logs-hardening
- Riesgo: medio (datos personales en logs; sin cambio de contrato ni de comportamiento visible)
- Ruta: SDD-ADVANCED (disparador: datos personales; además sustituye decisiones firmadas)
- Fase actual: Fase 1

## Objetivo
Gestión de Usuarios registra hoy el `message` de errores arbitrarios (Clerk, Neon u otros) en el servidor. Ese texto puede llevar correos, nombres o ids. Esta spec elimina ese registro y deja solo información controlada: un `code` validado, el `step` y el `status` cuando corresponda. Beneficia a quien opera los logs del servidor y reduce la exposición de datos personales.

## Alcance y reglas
- Incluye (Fase 1, 4 archivos, todos del módulo `users`):
  - `logError` y `clerkFailure` en `modules/users/services/users.service.ts`.
  - `fail` en `modules/users/actions/users.actions.ts`.
  - Ajuste de las pruebas afectadas y pruebas negativas nuevas en los dos `.test.ts` hermanos.
- No incluye:
  - Cambios en `UsersError`, `GENERIC_ERROR`, el resto de mensajes mostrados al usuario ni en cualquier contrato funcional (firmas, resultados, `ActionResult`).
  - `logIdentityFailure`, `logIdentityTimeout` y `clerkUserIsGone` (ya cumplen; su comportamiento no cambia).
  - `lib/auth.ts`, `modules/account/**`, `app/error.tsx` y otros módulos: fuera de alcance, no se revisan.
  - Editar las specs firmadas citadas en «Decisiones sustituidas».
  - Hallazgo F2: cerrado como fuera de alcance. RN-11 de `users-hard-delete.md` se mantiene (404 por estado).
  - Trazas de pila, `detail` ni ningún otro campo del error: tampoco se registran.
- RN-01: Ningún punto de registro de `users.service.ts` ni de `users.actions.ts` incluye el `message` del error ni otro campo arbitrario del error.
- RN-02: El `code` registrado solo se emite si es una cadena que cumple `SAFE_CLERK_CODE` (`/^[a-z0-9_]{1,64}$/`); si no, se registra `undefined` (vacío). Se reutiliza esa misma validación, sin una segunda. Decisión del propietario (aceptada): se mantiene `SAFE_CLERK_CODE` sin cambios; los SQLSTATE de Postgres con letras mayúsculas (p. ej. `XX000`) se registran como `undefined` y esa pérdida de diagnóstico queda aceptada; los solo numéricos (p. ej. `23505`) pasan la regex y se conservan. `logIdentityFailure` no cambia.
- RN-03: El log lleva únicamente `code`, y `step` y `status` cuando el llamador ya los aporta. En `clerkFailure` el paso (`clerk-delete-user` o `clerk-revoke-invitation`) se conserva; no se añade `status` nuevo.
- RN-04: Los mensajes que ve el usuario (`UsersError.message`, `GENERIC_ERROR`) y el flujo de errores (qué se lanza, qué se relanza) no cambian.
- RN-05: Nota de riesgo, no verificada: no se ha leído el SDK de Clerk y no se afirma qué contiene su `message`. SYNC-2 RN-06 ya advierte que puede llevar identificadores. La corrección no depende de ello: ningún `message` se registra, sea cual sea su contenido.

## Actores y matriz de acceso
No aplica: no cambia ningún permiso ni acceso; las comprobaciones `users:manage` y D37 quedan intactas.

## Diseño y dependencias
- Rutas (app/): ninguna.
- `modules/users/services/users.service.ts` (existente):
  - Se mueve `SAFE_CLERK_CODE` por encima de `logError` (misma expresión) y se añade un helper mínimo exportado `safeLogCode(code: unknown): string | undefined` (`typeof code === "string" && SAFE_CLERK_CODE.test(code) ? code : undefined`). No se exporta desde `modules/users/index.ts`.
  - `logError(step, error, context)`: lee solo `code` del error, lo pasa por `safeLogCode` y registra `{ code, ...context }`. Se elimina la lectura de `message`.
  - `clerkFailure(step, error)`: conserva la extracción actual del código (`isClerkAPIResponseError(error)` → `errors[0].code`, con fallback a `error.code`), lo valida con `safeLogCode` y llama a `logError` con un objeto que lleva solo ese `code` (sin `message`) más `{ step }`. No se pasa el error original a `logError`, para no perder el código de Clerk.
  - `logIdentityFailure` sigue igual (conserva su valor fijo `unexpected_error`); no se refactoriza (YAGNI).
- `modules/users/actions/users.actions.ts` (existente): `fail` usa `safeLogCode` importado del service y registra `{ code }`. Origen: `existente (modules/users/services/users.service.ts)`.
- Decisión de helper compartido: `fail` y `logError` necesitan la misma validación y viven en archivos distintos; una función exportada de una línea evita duplicar la regex (DRY, tercera repetición real junto a `logIdentityFailure`). Mínimo posible: sin archivo nuevo ni carpeta `utils`.
- Dependencias externas: ninguna nueva.

## Contratos y datos
- Sin cambios de API, schemas, tablas ni migraciones.
- Forma del log tras el cambio: `console.error("<prefijo> failed", { code?: string; step?: string; status?: number })`. Sin clave `message`.

## No funcionales
- Privacidad: ni correos, nombres, ids personales ni secretos en logs.
- Observabilidad: se conserva el prefijo `users.service: <step> failed` / `<action> failed`, `step` y `status`.

## Fallos, seguridad y recuperación
| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| `message`, `detail` o `code` hostil con correo, nombre o id de Clerk | Pruebas negativas (AC-01 a AC-04) | No se registran; `code` inválido pasa a vacío | Revertir el commit; no hay datos ni migración |
| Pérdida de diagnóstico por quitar `message` | `code`, `step` y `status` siguen en el log | Aceptado por el propietario: el diagnóstico fino se hace con el `step` y la consola del proveedor; los SQLSTATE con letras mayúsculas (p. ej. `XX000`) se registran como `undefined`; los solo numéricos (p. ej. `23505`) se conservan | Ninguna; revertir el commit si se revisa la decisión |

## Criterios de aceptación
- [x] AC-01 (RN-01, negativo) Dado un error con `message`, `detail` y `code` que contienen un correo, un nombre y un id de Clerk, cuando `logError` lo registra (p. ej. fallo de Neon tras Clerk en `updateUserName`), entonces el payload no tiene clave `message` y el log serializado no contiene el correo, el nombre ni el id.
- [x] AC-02 (RN-01, negativo) Dado un error de Clerk (`ClerkAPIResponseError`) y un error genérico cuyo `message` contiene correo, nombre e id de Clerk, cuando falla `deleteUser` en `clerk-delete-user` y en `clerk-revoke-invitation`, entonces `clerkFailure` registra solo `code` y `step`; el log no contiene correo, nombre ni id. Además, un `ClerkAPIResponseError` con `errors[0].code` válido (p. ej. `form_param_invalid`) conserva ese código en el log aunque su `message` lleve un correo, que no aparece.
- [x] AC-03 (RN-01, negativo) Dado un error de un service con `message`, `detail` y `stack` con datos personales, cuando una acción lo captura en `fail`, entonces `console.error` recibe solo `{ code }` y el log serializado no contiene correo, nombre ni id.
- [x] AC-04 (RN-02, negativo) Dado un error cuyo `code` no cumple `SAFE_CLERK_CODE` (p. ej. un correo, mayúsculas como `XX000` o `X1`, vacío, más de 64 caracteres, no cadena), cuando se registra en `logError` o `fail`, entonces `code` es `undefined`.
- [x] AC-05 (RN-02, RN-03) Dado un error con `code` válido (p. ej. `form_param_invalid` o el SQLSTATE solo numérico `23505`) y `step`/`status` aportados, cuando se registra, entonces el log conserva exactamente `code`, `step` y, si se aportó, `status`.
- [x] AC-06 (RN-04) Dado cualquier fallo de las pruebas existentes de acciones y service, cuando se ejecuta, entonces el resultado devuelto, la excepción relanzada y los mensajes de `UsersError` y `GENERIC_ERROR` son idénticos a los de antes.
- [x] AC-07 (RN-03) Dado el precedente de identidad, cuando se ejecutan sus pruebas existentes (`logIdentityFailure`, `logIdentityTimeout`, `clerkUserIsGone`), entonces pasan sin modificación.
- [x] AC-08 (alcance) Dado el diff de la fase, cuando se revisa, entonces toca solo los 4 archivos del plan.

## Trazabilidad
| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | `logError`, `clerkFailure`, `fail` | AC-01, AC-02, AC-03 | `users.service.test.ts`, `users.actions.test.ts` |
| RN-02 | `safeLogCode` / `SAFE_CLERK_CODE` | AC-04, AC-05 | `users.service.test.ts`, `users.actions.test.ts` |
| RN-03 | forma del log | AC-05, AC-07 | `users.service.test.ts` |
| RN-04 | `UsersError`, `GENERIC_ERROR` | AC-06 | `users.service.test.ts`, `users.actions.test.ts` |
| RN-05 | — (riesgo declarado) | AC-01, AC-02, AC-03 | `users.service.test.ts`, `users.actions.test.ts` |

## Matriz de pruebas
| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Logs sin datos personales (services y actions) | Sí: `npx vitest run modules/users/services/users.service.test.ts modules/users/actions/users.actions.test.ts` | No (CI normal del PR) | UAT-1 manual (gate obligatorio, UAT-LIGHT; ver sección UAT) | Negativas por punto de registro: `logError`, `clerkFailure`, `fail` | No: revertir commit |

Verificación del developer: solo las pruebas dirigidas anteriores y `npx eslint` sobre los 4 archivos. No se exige suite completa ni build. UAT-1 es manual, del propietario (sección «UAT»); no repite UAT de Gestión de Usuarios ni de SYNC.

## Tests
- `modules/users/services/users.service.test.ts`:
  - Ajustar las expectativas que fijan `message` (~l.1434-1438, 1449-1453, 1559-1563, 1670-1671): quitar la clave `message`; el caso `code: "X1"` pasa a esperar `code: undefined` (mayúsculas, no cumple la regex; decisión aceptada del propietario) y se añaden casos con `XX000` → `undefined` y con `23505` y `form_param_invalid` conservados.
  - Ajustar el nombre/aserto de ~l.1290 (`message: undefined` en `recoverUserAccess`) si la clave desaparece del payload.
  - Nuevo en `clerkFailure`: un `ClerkAPIResponseError` con `errors[0].code = "form_param_invalid"` y `message` con correo conserva el código y el correo no aparece; fallback a `error.code` válido en un error no Clerk.
  - Nuevas negativas: `logError` (error de Neon con `message`/`detail`/`code` con correo, nombre e id), `clerkFailure` (Clerk y error genérico, ambos pasos de `deleteUser`), `code` inválido a `undefined`.
- `modules/users/actions/users.actions.test.ts`:
  - Reescribir AC-09 de ~l.208-218: el log ya no contiene `"db down for ana@example.com"`; payload `{ code: "XX000" }` pasa a `{ code: undefined }` (mayúsculas: pérdida aceptada por el propietario); caso con `23505` conservado; y negativa con `detail`/`stack`.
  - El mock de `../services/users.service` (l.21) debe pasar también `safeLogCode` desde `importOriginal`.
- Verificado con Grep: el resto de aserciones de logs usan `expect.objectContaining({ step })`, `expect.any(Object)` o `not.toContain(...)` y no exigen `message`.

## Decisiones sustituidas
Se sustituye solo lo indicado; las specs firmadas no se editan. Textos verificados con Grep.
- `docs/specs/auth-clerk-neon.md`, D42: «Los errores se registran en el servidor solo con `code` y `message`, sin correos ni datos personales» (l.242). Se sustituye la parte «`code` y `message`»: ahora solo `code` validado, más `step`/`status`. Conservan su efecto el mensaje genérico y «sin correos ni datos personales». Por coherencia quedan en la misma situación las menciones de `code` y `message` de la l.509 y CA-16 (l.876) de esa spec.
- `docs/specs/users-admin-edit.md`, RN-09: «Los logs llevan solo `code` y `message` (y, en el fallo posterior a Clerk, una etiqueta fija de paso `step: "neon-after-clerk"`)…» (l.27; AC-15 l.142). Se sustituye `message`; la etiqueta de paso se mantiene.
- `docs/specs/users-hard-delete.md`, RN-09: «Los logs llevan solo `code`, `message` y `step` (D42); nunca correos ni nombres» (l.36; AC-18 l.151). Se sustituye `message`. RN-11 (l.38) cita `logError (code, message, step…)` solo como descripción del log: su clasificación de errores no cambia y solo ese elemento `message` queda sustituido por esta spec.
- `docs/specs/sync-clerk-neon.md`, RN-09: «Los logs llevan `code`, `message` y `step`; nunca email, nombre ni ids de Clerk (D42)» (l.35; AC-13 l.167). Se sustituye `message`.
- Precedente que se mantiene: SYNC-2 RN-06 (`logIdentityFailure`, `clerkUserIsGone`: solo `code`, `status`, `step`).

## Plan de tareas
### Fase 1
- [x] T1 — Eliminar `message` de `logError`, `clerkFailure` y `fail`; validar `code` con `SAFE_CLERK_CODE` vía `safeLogCode`; ajustar pruebas existentes y añadir negativas · archivos: `modules/users/services/users.service.ts`, `modules/users/actions/users.actions.ts`, `modules/users/services/users.service.test.ts`, `modules/users/actions/users.actions.test.ts` · depende de: — · secuencial (única tarea; el helper del service lo usa la action)

Confirmado contra la lista de SETUP: ninguno de los 4 archivos es ruta sensible ni de gobierno (ningún `auth` en su ruta ni nombre), por eso no hay `## Archivos sensibles` ni `## Cambios de gobierno`.

## UAT
Gate: **obligatorio** (UAT-LIGHT, `docs/SETUP.md` «Gate de inicio de pruebas»). El propietario corrigió su decisión anterior: ya NO se declara «UAT no aplicable», porque el cambio toca el tratamiento de datos personales. Una sola validación mínima, con datos sintéticos, sin operaciones destructivas y sin ejecutar nada contra Clerk/Neon de producción. No se repite UAT de Gestión de Usuarios ni de SYNC ni suites completas.

### UAT-1 — Los logs de un fallo controlado no contienen datos personales
| # | Campo | Valor |
|---|---|---|
| 1 | ID y objetivo | UAT-1: comprobar en el log del servidor que, ante un fallo controlado con un correo/nombre sintético en el `message` del error, solo aparecen `code`, `step`/`status` |
| 2 | Pantalla y ruta verificadas | Medio: log (consola) del servidor del entorno de pruebas DEV del commit del PR. Disparo del fallo: a definir y confirmar por el propietario antes de iniciar UAT-1, sobre el código implementado |
| 3 | Usuario y rol necesarios | Propietario o usuario funcional con acceso al log del servidor DEV; rol con `users:manage` si el disparo pasa por la UI de usuarios |
| 4 | Estado inicial y datos de prueba | Entorno aislado de producción; correo y nombre sintéticos (p. ej. `uat-logs@example.invalid`, `Nombre Sintetico`); sin usuarios reales |
| 5 | Pasos humanos | 1) Provocar un fallo controlado cuyo error lleve el dato sintético en su `message` (disparo a definir y confirmar por el propietario antes de iniciar UAT-1, sobre el código implementado). 2) Localizar la línea `users.service: ... failed` o `<action> failed` en el log. 3) Revisar su contenido |
| 6 | Resultado esperado | La línea contiene solo `code` (o vacío), `step` y/o `status`; no hay clave `message` y el correo/nombre sintético no aparece. El mensaje mostrado al usuario no cambia |
| 7 | Resultado reportado por el usuario | (pendiente) |
| 8 | Evidencia disponible | Línea del log sin datos sintéticos |
| 9 | Recuperación | No hay cambio persistente; si el disparo creó datos sintéticos, se eliminan por el flujo normal de la app solo en DEV |
| 10 | Depende de | — |

Registro posterior: `docs/evidence/users-logs-hardening-uat.md`, escrito por un `developer` en `Modo: build` en un checkpoint. Es documentación D7 y no forma parte de los 4 archivos de T1. Gate de inicio de ronda según `docs/forms/uat.md` §5 (PR, rama y commit exacto, aprobación del reviewer, DEV aislado).

## Decisiones del propietario resueltas
1. `SAFE_CLERK_CODE` (`/^[a-z0-9_]{1,64}$/`) se mantiene sin cambios (Opción A). Los SQLSTATE con letras mayúsculas (p. ej. `XX000`) se registran como `undefined`: pérdida de diagnóstico aceptada; los solo numéricos (p. ej. `23505`) se conservan. `logIdentityFailure` no cambia.
2. UAT Opción B: el propietario corrige su elección anterior; ya NO se declara «UAT no aplicable». Gate obligatorio con UAT-1 (sección «UAT»).

3. Disparo de UAT-1: el propietario decide aprobar la spec ahora. El disparo NO bloquea la aprobación ni la implementación; se define y confirma antes de iniciar UAT-1, a partir del código ya implementado y revisado (propuesta del developer o del reviewer basada en el código real, confirmada por el propietario). No se inventa ahora. UAT-1 queda condicionada a esa confirmación; sin ella no inicia y no se declara PASS. Condiciones del disparo: solo DEV, datos sintéticos, sin operación destructiva, sin producción. Si ningún disparo manual seguro existe, el propietario decide entonces cómo cerrar el gate (se le vuelve a consultar; no se sustituye por prueba automatizada sin su decisión).

## Preguntas abiertas
Ninguna.

## Definition of Done
AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz (suite completa, build) figura como NO EJECUTADO con su motivo. UAT-1 ejecutada y aceptada funcionalmente por el propietario (gate obligatorio, sección «UAT»), registrada en `docs/evidence/users-logs-hardening-uat.md`; es requisito del merge y el APROBADO del reviewer no la sustituye.
