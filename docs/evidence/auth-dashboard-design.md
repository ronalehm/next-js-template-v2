# Evidencia: AUTH-2.1 (diseño visual, shell y cuenta)

**Estado: AUTH-2.1 COMPLETADA — VALIDACIÓN LOCAL (2026-11-08).** Todos los criterios de AUTH-2.1 están en PASS y sin bloqueantes. Sin commit, push ni merge.

- Spec: `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-2.1`, aprobada el 2026-11-08T15:05:46Z.
  - Hash de la declaración: `f28d7605a480d1601dae2b47be2dd2f9b8bff5ab397a8bcf16a967070a756ae2`.
  - Firma SSH: `docs/specs/auth-clerk-neon.md.sig`.
- Spec visual: `docs/specs/users-management-design.md` (PR #6). Jerarquía D17: SDD > spec visual > Figma.
- Rama `feat/auth-dashboard-design`, worktree `C:/Users/ronal/template-v2-design`, base `main` en `a8494b6`.

Origen de cada resultado:
- **Verificado:** lo ejecutó un agente y su salida estaba a la vista.
- **Informado:** lo ejecutó el propietario y lo comunicó en el chat.

## 1. Aprobación y gate (verificado)

- `ssh-keygen -Y verify` sobre la declaración del hook: `Good "spec-approval" signature for approver`.
- `gate`:
  - `developer` con `Fase: AUTH-2.1`: exit 0.
  - Con `Fase: AUTH-2`: exit 2.

## 2. Automáticas (verificado; dictamen del Reviewer: APROBADO en el ciclo 2, sin bloqueantes)

| Criterio | Resultado |
|---|---|
| CA-25 | PASS. Las variables de `:root` (35) y `.dark` (34) coinciden con la spec visual. `@theme inline` expone los 8 tokens nuevos y `--font-sans` según D20b. `app/layout.tsx` solo cambia Geist por Inter (`--font-inter`), añade el script de tema y `suppressHydrationWarning`. |
| CA-26 | PASS. `modules/account/utils/uiPreferences.test.ts`: 11 tests. El script en línea aplica la misma regla: solo `light`, `dark` o `system`, y por defecto `system`. Sin interpolar datos. |
| CA-27 | PASS. Sin colores sueltos fuera de `app/globals.css` y de los componentes generados. |
| CA-28 | PASS. Sin `"use server"`, `sql` ni escrituras en Clerk. El layout y las 4 páginas llaman a `requirePermission("dashboard:view")`. |
| CA-29 | PASS. Todos los cambios respecto a `a8494b6` están en las 30 rutas permitidas. Los 7 `components/ui/*` coinciden con el registro (`shadcn add --dry-run --diff`: "No changes"). |
| CA-9 | PASS. Sin coincidencias. |
| CA-10 | PASS. `npm run lint` exit 0; `npx vitest run` 111/111; `npx vitest run .claude/hooks` 47/47; `npm run build` exit 0, con `/dashboard`, `/dashboard/profile`, `/dashboard/settings` y `/dashboard/sign-out`. |

Ciclo 1 del Reviewer, corregido en el ciclo 2:
- Los imports internos del módulo pasan por `@/modules/account`.
- `antialiased` pasa de `<html>` a `globals.css`.
- El tema ya no se reaplica al hidratar.
- `try/catch` en `localStorage` y en `signOut`.
- `SidebarTrigger` en el botón de contraer.
- Anillo de foco en las filas del perfil.

## 3. Manuales (informado por el propietario, 2026-11-08, `localhost:3001`, claves de desarrollo)

Ningún agente repitió ni observó estas pruebas con sesión iniciada.

| Criterio | Resultado informado |
|---|---|
| CA-30 | PASS. Shell expandido y contraído, menú del usuario y sidebar en móvil. |
| CA-31 | PASS. Inicio y perfil en solo lectura; la identidad se edita en el modal de Clerk. |
| CA-32 | PASS. Temas Claro, Oscuro y Sistema, preferencias del dispositivo, idioma y región en solo lectura, fuente y contraste. |
| CA-33 | PASS. Cerrar sesión, regresión de CA-11, CA-23 y CA-24, y fidelidad con la spec visual en las pantallas 02, 08, 09, 10, 13 y 17. |

Verificado por un agente sin sesión iniciada:
- `/dashboard` y sus rutas nuevas redirigen a `/sign-in`.
- Con la preferencia `dark` guardada, la página carga con la clase `dark` y `color-scheme: dark` antes de pintar, y la tarjeta de Clerk se ve en oscuro.

## 4. Límites y notas

- Ningún agente leyó `.env*` ni se conectó a Neon. AUTH-2.1 no escribe en Neon ni en Clerk.
- R26: `data-density` y `data-reduce-motion` van en `<html>` mientras el panel está abierto, no en el contenedor del panel, para que los menús y tooltips en portales también los reciban. Hay que anotarlo en la spec en su próxima edición.
- Mejoras aceptadas, no exigidas por los criterios:
  - El selector de tema no se navega con flechas.
  - El fundido de 200 ms solo afecta a `body`.
  - Fuera de `/dashboard`, Sistema sigue al sistema operativo solo al recargar.
- Los hooks de v2 se ejecutaron a mano (`gate` y `guard`), porque la sesión del agente tenía la raíz en otro repositorio.

## 5. Cierre

T9, T10, T11 y T12 quedan marcadas. Con el plan de AUTH-2.1 completo, la spec deja de autorizar cambios. AUTH-3 exige editar la spec, resolver P-POST-2 y una aprobación firmada nueva.
