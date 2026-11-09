# Evidencia: AUTH-2 (shell del panel `/dashboard`)

**Estado: AUTH-2 COMPLETADA — VALIDACIÓN LOCAL (2026-11-08).** Todos los criterios de AUTH-2 en PASS y sin bloqueantes. No hay commit, push ni merge.

- Spec: `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-2`, aprobada con el hash de declaración `51681ff2c4b8ae3d9a28b5d09bd897a5d2ece308c684699f97504e23a713cdb4` y firma SSH en `docs/specs/auth-clerk-neon.md.sig`.
- Rama `feat/auth-dashboard`, worktree `C:/Users/ronal/template-v2-dashboard`, base `main` en `0cfcd4a`.

Origen de cada resultado: **verificado** = lo ejecutó un agente y se vio su salida; **informado** = lo ejecutó el propietario y lo comunicó en el chat.

## 1. Automáticas (verificado; dictamen del Reviewer: APROBADO, sin bloqueantes)

| Criterio | Resultado |
|---|---|
| CA-9 | PASS. El comando de la spec con base `0cfcd4a` no produce salida. |
| CA-10 | PASS. `npm run lint` exit 0. `npx vitest run`: 100/100 en 4 archivos. `npx vitest run .claude/hooks`: 47/47. `npm run build` exit 0 (`/`, `/dashboard`, `/sign-in` y `/sign-up` dinámicas, Proxy activo). |
| CA-12 | PASS. `lib/navigation.test.ts` cubre la visibilidad por rol y el orden. `NAV_ITEMS` solo tiene "Inicio" y no incluye `/dashboard/users`. |
| CA-20 | PASS. `app/dashboard/layout.tsx` y `app/dashboard/page.tsx` llaman a `requirePermission("dashboard:view")`. `AppSidebar` solo filtra (D14). No hay ítem "Usuarios" (D12). |
| CA-21 | PASS. `loading.tsx` tiene `role="status"`. `app/error.tsx` es Client Component, usa `retry()` y no muestra `error.message`. |
| CA-22 | PASS. Los 18 cambios respecto a `0cfcd4a` (más esta evidencia) están dentro de las 19 rutas permitidas. Sin cambios en `button.tsx`, en la configuración ni en archivos de AUTH-1. |
| R18 | PASS. Los componentes generados coinciden con el registro shadcn `base-nova` (salvo transformaciones del CLI). Sin dependencias npm nuevas. |
| D16 | PASS. `hooks/use-mobile.ts` usa `useSyncExternalStore` sobre `matchMedia("(max-width: 767px)")`, con snapshot de servidor `false`. Mantiene la firma `useIsMobile(): boolean` y no tiene `eslint-disable`. |

## 2. Manuales (informado por el propietario el 2026-11-08, con claves de desarrollo)

Ningún agente repitió ni observó estas pruebas.

| Criterio | Resultado informado |
|---|---|
| CA-11 | PASS. Shell con rol `user` y con rol de administración, sin ítem "Usuarios". |
| CA-23 | PASS. Sin sesión, `/dashboard` lleva a `/sign-in`. |
| CA-24 | PASS. Una cuenta sin fila `active` acaba en `/` con el aviso de que no tiene acceso. |

## 3. Límites

- Ningún agente leyó `.env*` ni se conectó a Neon o a Clerk. AUTH-2 no escribe en la base.
- `hooks/use-mobile.ts` es el único archivo generado que se editó a mano, según D16.
- Los hooks de v2 se aplicaron ejecutando `gate` y `guard` del worktree a mano antes de editar, porque la sesión del agente tenía la raíz en otro repositorio.

## 4. Cierre

T6, T7 y T8 marcadas. Con el plan de AUTH-2 completo, la spec deja de autorizar cambios. AUTH-2.1 exige editar la spec y una aprobación firmada nueva.
