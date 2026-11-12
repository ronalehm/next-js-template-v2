# Registro UAT: users-logs-hardening (USERS-LOGS-HARDENING, F3)

Formato: `docs/forms/uat.md` (secciones 5 y 6). Checkpoint de cierre de ronda, previo al merge. Iniciativa USERS-LOGS-HARDENING (spec `users-logs-hardening`) · PR #33 (https://github.com/ronalehm/next-js-template-v2/pull/33) · rama `audit/users-management` → `main` · commit probado exacto `c59a0efa410935f935e1eeaeb2e4fe51f4136ba0` · fecha 2026-11-12 · alcance: PR.

El commit probado es de solo documentación sobre el commit de código `3ac960aace5676cbe35b700c95f06e78d8facd5d`. Evaluación de impacto: el código no cambió entre ambos; ajena → revisión técnica y 411 pruebas dirigidas vigentes.

Este registro es un archivo informativo nuevo: no altera la spec firmada ni `approvals.jsonl`, no sustituye la aceptación funcional del propietario, no habilita el merge y no equivale a `apruebo` ni a `autorizo gobierno`. Todo lo marcado «declarado» lo afirma el propietario en el chat, sin capturas ni logs adjuntos; no está verificado por un agente.

## Gate de inicio de ronda

- gate: obligatorio
- Justificación: el PR endurece el registro de errores de las acciones de usuarios (logs sin `message` ni datos personales).
- alcance: PR
- PR: #33 · Rama: `audit/users-management` · Commit exacto: `c59a0efa410935f935e1eeaeb2e4fe51f4136ba0`

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | CUMPLE: PR #33, rama `audit/users-management` → `main`, commit c59a0ef |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | CUMPLE: reviewer técnico APROBADO ciclo 1 sobre `3ac960a` (411 pruebas dirigidas PASS, eslint PASS). CI de GitHub en verde sobre `c59a0ef`: declarado por el propietario |
| 3 | Copia local o entorno de pruebas del commit del PR | CUMPLE (declarado): el propietario confirmó `HEAD` = `c59a0ef`, `git status --short` vacío y la app ejecutada desde el worktree `template-v2-users-audit` |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | CUMPLE (declarado): Clerk `pk_test_`/`sk_test_` y Neon DEV, sin producción; confirmado por el propietario en el chat, sin capturas |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | CUMPLE: alcance y caso UAT-1 firmados en la spec (segunda aprobación tras redefinir UAT-1) |
| 6 | Instrucciones sencillas para el usuario funcional | CUMPLE: pasos breves y secuenciales (ver UAT-1) |

## Registro UAT compacto

Entorno: DEV (Clerk de prueba y Neon DEV), app local desde el worktree `template-v2-users-audit`. alcance: PR.

Verificación de código: endurecimiento de logs de error (`fail`, `logError`, `clerkFailure`) · `/dashboard/users` (invitar usuario) · commit c59a0ef (código en 3ac960a).

### Pruebas

| Prueba | Tipo | Estado de resultado | Commit exacto | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| UAT-1 | manual (parcial, solo `fail`) | PASS PARCIAL **propuesto** (no marcado: lo marca el propietario) | c59a0ef | Declarado: mensaje en pantalla coincide; línea de log exactamente `inviteUserAction failed { code: undefined }`; sin cambios en la fila ni en Clerk/Neon | ajena → PASS vigente solo si se acepta; commit de solo documentación sobre 3ac960a, código sin cambios |
| AC-01, AC-02 y fallback a `error.code` (`logError`, `clerkFailure`) | automatizada | PASS (reviewer, ciclo 1 sobre 3ac960a) | 3ac960a | No aplica: no cuenta como validación manual ni como PASS manual | ajena → vigente (código sin cambios hasta c59a0ef) |

### Ficha UAT-1 (compacta)

Formato: `prueba · esperado · observado · estado · siguiente acción`.

- Prueba: UAT-1. Ruta `/dashboard/users`. Pasos: filtro «Invitados»; «Invitar usuario» con el correo de una fila `invited` existente (cuenta de prueba del propietario; correo tapado: `ron…@gmail.com`); rol Usuario; «Enviar invitación».
- Esperado: mensaje «Ya tiene una invitación pendiente. Usa Reenviar invitación.» y log `inviteUserAction failed { code: undefined }`, sin `message` ni correo.
- Observado (declarado): el mensaje en pantalla coincide; la línea del log fue exactamente `inviteUserAction failed { code: undefined }`; sin cambios en la fila ni en Clerk/Neon.
- Estado: PASS PARCIAL propuesto. Un PASS manual lo marca el propietario, no un agente.
- Siguiente acción: decisión del propietario (ver casillas al final).

### Cobertura

| Elemento | Cobertura |
|---|---|
| `fail` | manual (UAT-1) |
| `logError` | solo pruebas negativas automatizadas aprobadas (AC-01, AC-02, fallback a `error.code`); no es validación manual ni PASS |
| `clerkFailure` | solo pruebas negativas automatizadas aprobadas (ídem); no es validación manual ni PASS |

El criterio original (dato sintético en el `message`) se cubre solo por esas pruebas. No hay disparo manual seguro: verificado por el reviewer, los `UsersError` son textos fijos y el `message` de `ClerkAPIResponseError` es `statusText`; no se pudo provocar sin tocar Clerk/Neon.

### Limitaciones residuales

- No se probó manualmente `logError` ni `clerkFailure`.
- No se verificó de forma independiente que el log no contenga otras líneas.
- Sin capturas ni logs adjuntos; todo lo observado es declarado por el propietario.
- No se verificó si UAT-1-ADJ-01 ocurre en producción.

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-1-ADJ-01 | UAT-1 | Al ejecutar la acción, el servidor de desarrollo de Next imprimió su propio rastro `ƒ inviteUserAction({"email":"<correo completo>","role":"user"})` con los argumentos de la server action, incluido el correo completo (no se reproduce aquí). No es un log de `users.service.ts` ni `users.actions.ts`; fuera del alcance de la spec. No se verificó si ocurre en producción | Privacidad (observación informativa; no bloquea el cierre de F3) | Informativa | Pendiente (propietario): incluir / posponer / rechazar / reformular | — | — | — | — | Propietario | resultado manual confirmado |

## Gobierno

- Spec aprobada y firmada (segunda aprobación tras redefinir UAT-1); `approvals.jsonl` sin editar.
- La aceptación UAT no es autorización ni aprobación (`apruebo` / `autorizo gobierno`).

## Pendientes

- Aceptación funcional del propietario (casillas siguientes).
- Decisión del propietario sobre UAT-1-ADJ-01.
- Commit y push de este registro (lo hace el propietario) y evaluación de CI del commit nuevo (solo documentación).
- Merge solo tras cumplir el gate (`docs/SETUP.md`).
- No se declara PASS ni F3 cerrada.

## Decisión del propietario

- [ ] Acepto UAT-1 como PASS PARCIAL
- [ ] Acepto funcionalmente F3 (USERS-LOGS-HARDENING)
