# Redirección de la página de inicio para usuarios activos

- Módulo: auth
- Estado: aprobado
- ID: SPEC-auth-home-redirect
- Riesgo: medio (decide el destino de un usuario autenticado; no cambia sesión, roles, permisos ni datos)
- Ruta: SDD-ADVANCED (disparador: autenticación y autorización)
- Fase actual: HOME-1
- Base: `main` en `f9b5398`. Worktree `C:/Users/ronal/template-v2-login-test`, rama `test/login-validation`.

## Objetivo

Tras iniciar sesión, Clerk devuelve al usuario a `/`, y `app/page.tsx` solo muestra el rol, sin enlace ni redirección. Prueba manual en DEV: un Superadmin activo se queda en `/`, aunque `/dashboard` funciona si se abre directamente. Un usuario activo que entra en `/` debe ir a `/dashboard`.

## Alcance y reglas

- Incluye: la decisión de destino en `app/page.tsx` y su test.
- No incluye: Clerk (configuración, `redirect_url`, componentes), Neon, `lib/auth.ts`, `lib/roles.ts`, `proxy.ts`, `app/dashboard/`, permisos, hooks ni gobierno.
- RN-01: un usuario autenticado con fila activa en `app_users` y permiso `dashboard:view` que entra en `/` es redirigido a `/dashboard`.
- RN-02: sin sesión, `/` muestra la bienvenida con el botón "Iniciar sesión". No hay redirección.
- RN-03: con sesión pero sin acceso (sin fila, `invited` sin vincular, `revoked` o rol inválido: `getActor()` devuelve `null`), `/` se mantiene y muestra el aviso "Tu cuenta no tiene acceso". No hay redirección.
- RN-04: solo se redirige si el rol tiene `dashboard:view`, según `can()`. Así no puede haber un bucle con `requirePermission("dashboard:view")`, que devuelve a `/` a quien no tiene ese permiso.
- RN-05: la redirección no concede acceso. `/dashboard` sigue protegido por `proxy.ts` y por `requirePermission("dashboard:view")` en `app/dashboard/layout.tsx`, sin cambios.

## Actores y matriz de acceso

| Actor | Entra en `/` | Resultado |
|---|---|---|
| Sin sesión | Sí | Bienvenida con "Iniciar sesión" |
| Sesión y `getActor()` = `null` (sin fila, no vinculado, `revoked`) | Sí | Se queda en `/` con el aviso de sin acceso |
| Activo con `dashboard:view` (hoy: `user`, `admin`, `superadmin`) | Sí | Redirección a `/dashboard` |
| Activo sin `dashboard:view` (hoy no existe) | Sí | Se queda en `/` con su rol |

## Diseño y dependencias

- `app/page.tsx` (existente): tras calcular `actor`, `if (actor && can(actor.role, "dashboard:view")) redirect("/dashboard");`. `redirect` viene de `next/navigation` y `can` de `@/lib/roles` (existente), y la llamada va fuera de cualquier `try`. El resto del componente no cambia.
- `app/page.test.tsx` (nuevo): llama a `Home()`, que es `async`, con mocks de `@clerk/nextjs`, `@clerk/nextjs/server`, `@/lib/auth` y `next/navigation`, y renderiza el resultado con Testing Library. Sigue el patrón de mocks de `lib/auth.test.ts`.
- Sin dependencias nuevas.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Bucle `/` ↔ `/dashboard` | AC-05 | Solo se redirige con `dashboard:view` (RN-04) | Revertir `app/page.tsx` |
| Un usuario revocado llega al dashboard | AC-04 y la prueba manual M3 | No hay redirección sin actor activo; el layout sigue exigiendo el permiso | Sin cambios en la protección existente |
| Escalada vertical u horizontal | AC-06 | La redirección no cambia rol ni permisos; `/dashboard/users` sigue exigiendo `users:manage` | — |
| `getActor()` falla (Neon caído) | Error de servidor existente (`app/error.tsx`) | Mismo comportamiento que hoy | — |

## Criterios de aceptación

- [ ] AC-01 (RN-01) Dado un Superadmin activo con sesión, cuando entra en `/`, entonces se llama a `redirect("/dashboard")`.
- [ ] AC-02 (RN-01) Dado un usuario activo con cualquier rol de `ROLES`, cuando entra en `/`, entonces se redirige a `/dashboard`.
- [ ] AC-03 (RN-02, negativo) Dado un visitante sin sesión, cuando entra en `/`, entonces no hay redirección, no se llama a `getActor()` y se muestra "Iniciar sesión".
- [ ] AC-04 (RN-03, negativo) Dada una sesión con `getActor()` = `null` (revocado, sin fila o no vinculado), cuando entra en `/`, entonces no hay redirección y se muestra "Tu cuenta no tiene acceso".
- [ ] AC-05 (RN-04, negativo) Dado un actor activo cuyo rol no tiene `dashboard:view` (con `can` simulado como `false`), cuando entra en `/`, entonces no hay redirección.
- [ ] AC-06 (RN-05) Dado el diff, entonces `proxy.ts`, `lib/auth.ts`, `lib/roles.ts` y `app/dashboard/` no cambian, y `lib/auth.test.ts` y `lib/roles.test.ts` pasan sin cambios.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | `getActor()` y `can(role, "dashboard:view")` | AC-01, AC-02 | `app/page.test.tsx`; manual M1 |
| RN-02 | `auth()`, sin `userId` | AC-03 | `app/page.test.tsx`; manual M2 |
| RN-03 | `getActor()` = `null` | AC-04 | `app/page.test.tsx`; manual M3 |
| RN-04 | `PERMISSIONS["dashboard:view"]` | AC-05 | `app/page.test.tsx` |
| RN-05 | `proxy.ts`, `requirePermission` | AC-06 | `git diff`; suite completa; manual M4 |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Auth: destino de `/` | `app/page.test.tsx` (AC-01 a AC-05) | No aplica: no cambian sesión, BD ni webhooks; `lib/auth.test.ts` sin cambios | M1 a M4 en DEV, ejecutadas por el usuario | Usuario revocado sin redirección (AC-04, M3); sin escalada (AC-06); sin bucle (AC-05) | Sin cambios de BD; reversión: revertir los 2 archivos |

Pruebas manuales en DEV, contra Clerk de desarrollo y Neon DEV. Las ejecuta el usuario; ningún agente se conecta a Neon.

- M1: Superadmin inicia sesión, llega a `/dashboard` y abrir `/` vuelve a llevarle a `/dashboard`.
- M2: tras cerrar sesión, `/` muestra la bienvenida con "Iniciar sesión".
- M3: una cuenta autenticada sin fila o revocada se queda en `/` con el aviso.
- M4: abrir `/dashboard` directamente funciona igual que antes, y sin sesión sigue pidiendo iniciar sesión.

## Archivos sensibles

Ninguno.

## Cambios de gobierno

Ninguno.

## Plan de tareas

### Fase HOME-1

- [x] T1 — Redirección de usuarios activos en `/` y su test (RN-01 a RN-05) · archivos: `app/page.tsx`, `app/page.test.tsx` · depende de: — · secuencial (base)

Después: un reviewer con la verificación de la fila "Código" (`npx vitest run`, `npm run lint`, `npm run build`), máximo 3 ciclos de corrección. Sin commit, push ni PR hasta superar la revisión.

## Definition of Done

AC-01 a AC-06 en PASS en el veredicto del reviewer. M1 a M4 reportadas por el usuario o registradas como NO EJECUTADO. Solo cambian `app/page.tsx` y `app/page.test.tsx`. Clerk, Neon, permisos, hooks y gobierno intactos.
