# Evidencia: AUTH-1 (Clerk, Neon, roles y sesión)

**Estado: AUTH-1 COMPLETADA — VALIDACIÓN LOCAL (2026-11-08).** Todos los criterios de AUTH-1 en PASS; sin bloqueantes. Sin commit, push ni merge.

- Spec: `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-1`.
- Rama: `feat/auth-clerk-neon`, worktree `C:/Users/ronal/template-v2-auth`, base `main` `18e3dc6`.
- Aprobación: línea del 2026-11-08T01:25:08Z en `docs/specs/approvals.jsonl`, hash `3c7064056cb6b15f185ed34247fd42a8a49338ed264c33e9fbc799cd16994d65`, fase `AUTH-1`.

Origen de cada resultado: **verificado** = ejecutado por un agente con su salida a la vista; **reportado** = ejecutado por el usuario y comunicado en el chat.

## 1. Aprobación y gate (verificado)

- `ssh-keygen -Y verify` sobre la declaración del hook (raíz, spec, hash, fase) contra `~/.claude/spec-allowed-signers`: `Good "spec-approval" signature for approver`. Se repitió después de marcar T1–T4: el hash no cambia y la firma sigue siendo válida.
- `gate`: `developer` con `Fase: AUTH-1` pasa (exit 0); sin fase o con `Fase: AUTH-2` se bloquea (exit 2).
- `guard`: permite `lib/auth.ts`, `proxy.ts` y `scripts/db-grant-superadmin.mjs` (listados); bloquea `db/migrations/0002_x.sql`, `.env.local`, `docs/SETUP.md`, `.claude/settings.json` y `docs/specs/approvals.jsonl`.

## 2. Implementación (T1–T4)

Archivos modificados: `.gitignore`, `package.json`, `package-lock.json`, `app/layout.tsx`, `app/page.tsx`.
Archivos nuevos: `.env.example`, `proxy.ts`, `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `lib/auth.ts`, `lib/auth.test.ts`, `db/migrations/0001_app_users.sql`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`.

Sin cambios en `.claude/`, `CLAUDE.md`, `AGENTS.md`, `docs/SETUP.md`, las specs de Fase B o de dependencias, ni en `.env*` salvo `.env.example` (verificado con `git diff` contra `18e3dc6`).

### Corrección autorizada de `scripts/db-grant-superadmin.mjs` (2026-11-08)

Por orden expresa del usuario, el UPDATE + INSERT se sustituyó por un UPSERT atómico sobre la restricción única de `email` (`on conflict (email) do update ... where app_users.status in ('invited','active') returning status`). Las filas `revoked` no se modifican y el script sale con código 1; `invited` y `active` conservan su estado; un superadmin existente no cambia (idempotente). Versión final: SHA-256 `33cc8d67db8021fe…`.

- Verificado: `node --check` y `eslint` sin errores; con un stub de `@neondatabase/serverless` fuera del repo, exit 0 con una fila devuelta, exit 1 sin filas, con error de base, email inválido o sin URL. No se conectó a Neon.
- Revisión focalizada del Reviewer: **APROBADO**, con dos observaciones no bloqueantes (sección 6).

## 3. Verificación automática (verificado, 2026-11-07)

| Criterio | Resultado |
|---|---|
| CA-1 | PASS. Solo se añaden `@clerk/nextjs` 7.9.25 y `@neondatabase/serverless` 1.2.0, y los scripts `db:migrate` y `db:grant-superadmin`; `next` 16.4.5, `eslint-config-next` 16.4.5 y `zod` 4.6.7 iguales a `main`. |
| CA-2 | PASS. `npm audit` idéntico en `main` y en la rama: 0 críticas, 0 altas, 11 moderadas, 2 bajas. |
| CA-3 | PASS. `.env.example` versionable (`!.env.example` en `.gitignore`) y solo con marcadores. |
| CA-4, CA-5 | PASS. `lib/roles.test.ts` 29 tests y `lib/auth.test.ts` 16 tests. |
| CA-9 | PASS. Sin "MADRE" ni "Centro Psicológico" en el código nuevo o modificado. |
| CA-10 | PASS. `npx vitest run` 92/92 (3 archivos, incluidos 47 de `.claude/hooks`), `npm run lint` exit 0, `npm run build` exit 0 (`/`, `/sign-in`, `/sign-up` dinámicas y Proxy activo). |

## 4. Pruebas manuales (informadas por el propietario, 2026-11-08)

Ejecutadas por el propietario contra Clerk de desarrollo y Neon DEV. Ningún agente las repitió ni las observó.

| Criterio | Resultado informado |
|---|---|
| CA-6 | PASS. |
| CA-7 | PASS mediante baseline de Neon DEV: `npm run db:migrate` devuelve `SKIP 0001_app_users.sql`. |
| CA-8 | PASS. Autenticación con rol Superadmin. |
| CA-8b | PASS. Cuenta autenticada sin fila en `app_users`: acceso denegado y conteo 0. |
| CA-8c | PASS. El script devuelve exit 1 y Neon conserva la fila con rol `user` y estado `revoked`. |

La corrección UPSERT de la sección 2 fue autorizada por el propietario y aprobada por el Reviewer focalizado.

Las migraciones y operaciones sobre Neon las ejecutó solo el usuario. Ningún agente se conectó a Neon ni leyó `.env.local`.

## 5. Dictamen del Reviewer general (T5)

**APROBADO parcial, sin observaciones bloqueantes.** PASS en CA-1 a CA-5, CA-9, CA-10, R2, R8, R11 y R12. Ese dictamen es anterior a las pruebas manuales: lo único pendiente era CA-6 a CA-8c, ahora en PASS según la sección 4. No hay bloqueantes adicionales.

Observaciones sobre el texto de la spec, no bloqueantes para AUTH-1 (el código cumple). Corregirlas antes de reaprobar la siguiente fase, porque editar la spec exige una nueva aprobación firmada:

1. R12, leído de forma literal ("cada `update` de rol o estado lleva la condición"), bloquearía la transición `invited → active` del primer superadmin y rompería CA-8. Debe aplicarse solo a los `update` que sacan una fila del estado superadmin activo.
2. CA-9 busca "MADRE" en todos los archivos nuevos o modificados y coincide con la propia spec. Debe limitarse al código o excluir `docs/`.

## 6. Observaciones no bloqueantes y riesgos aceptados

1. `server-only` llega como dependencia transitiva de `@clerk/nextjs`, no está declarado en `package.json`.
2. `lib/db.ts` exporta `checkDatabaseConnection`, sin uso (portado del respaldo).
3. Los tests de `lib/auth.ts` comprueban el texto del SQL simulado; el comportamiento real lo cubren CA-8 y CA-8c.
4. Carrera en la primera vinculación: dos peticiones simultáneas pueden mostrar "sin acceso" una vez; no hay escalada de privilegios.
5. `0001_app_users.sql` usa `create table` sin `if not exists`, a propósito: una tabla anterior con otro esquema hace fallar la migración en vez de registrarla.
6. `scripts/db-grant-superadmin.mjs:50`: un error que no sea `Error` se muestra como `undefined`.
7. Con un superadmin existente, el UPSERT escribe una versión nueva de la fila sin cambios visibles.
8. Avisos LF→CRLF de Git en archivos modificados (cosmético).

## 7. Git (verificado)

`HEAD` = `18e3dc6`, sin commits nuevos. `feat/auth-clerk-neon` no existe en `origin`. `origin/main` = `18e3dc6`. El checkout `template-v2-pro` conserva sus tres cambios locales previos.

## 8. Cierre

Verificaciones automáticas (secciones 1 a 3) en PASS, dictamen del Reviewer sin bloqueantes y pruebas manuales informadas en PASS: T5 queda marcada. Con todo el plan marcado, la spec deja de autorizar rutas sensibles. AUTH-2 requiere editar la spec (incluidas las observaciones de la sección 5) y una nueva aprobación firmada.
