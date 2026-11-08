# Autenticación: Clerk, Neon, usuarios, roles y navegación

- Módulo: auth
- Estado: aprobado
- ID: SPEC-auth-clerk-neon
- Riesgo: alto (autenticación, sesión, roles y permisos, esquema y migraciones, borrado de registros, dependencias críticas, integraciones externas)
- Ruta: SDD-ADVANCED
- Fase actual: AUTH-1
- Fases: AUTH-1, AUTH-2, AUTH-3. La aprobación autoriza solo la fase actual; pasar de fase exige editar esta spec y aprobarla de nuevo.
- Base: `main` en `18e3dc6`. Rama `feat/auth-clerk-neon`, worktree `C:/Users/ronal/template-v2-auth`. La aprobación se firma en este worktree (la firma incluye la raíz).
- Fuente: `origin/backup/template-v2-wip-2026-11-06` (`b21d514`), portada archivo por archivo con `git show`. Nunca merge, cherry-pick ni checkout de la rama.
- Antecedente: `docs/specs/template-v2-professional-workflow.md`, "Después de validar Fase B", punto 1. Decisiones heredadas: portar desde la rama de respaldo y rol en `app_users`.

## Objetivo

Dar a la plantilla autenticación con Clerk, persistencia en PostgreSQL (Neon), una tabla `app_users` como fuente de verdad del rol, permisos por rol, un panel de usuarios y una navegación reutilizable filtrada por permisos. Todo genérico: sin marca ni lógica de MADRE.

## Alcance

Incluye:
- AUTH-1: dependencias, variables de entorno, `proxy.ts`, `ClerkProvider`, páginas de sign-in y sign-up, cliente Neon, migración `app_users` con runner versionado, script de alta del primer superadmin, roles, permisos y resolución del usuario actual.
- AUTH-2: shell del panel (`/dashboard`) con sidebar reutilizable cuyos ítems declaran el permiso que requieren.
- AUTH-3: módulo `users`: listar, invitar, cambiar rol, revocar acceso (baja lógica) y reenviar invitaciones.

No incluye:
- Cambios en gobierno (`.claude/`, `CLAUDE.md`, `AGENTS.md`, `docs/SETUP.md`), en la spec de Fase B ni en Fase C.
- Webhooks de Clerk, organizaciones, multi-tenant, SSO, billing.
- Edición de nombre o perfil desde el panel (lo hace el usuario con `UserButton`).
- Alta directa de usuarios sin invitación y registro abierto.
- Borrado físico de filas de `app_users` desde la aplicación.
- Reactivar un usuario revocado (se decide al reaprobar AUTH-3).
- Página `/admin` del respaldo (demo sin función).
- Credenciales reales, instancia de Clerk de producción, rama principal de Neon, despliegue.
- Commit, push, merge o PR sin orden expresa del usuario.

## Decisiones

- **D1. Rol en `app_users`.** La base es la fuente de verdad del rol. Clerk solo autentica. No se usa `publicMetadata`.
- **D2. Vinculación sin webhooks.** El primer acceso autenticado vincula la fila `app_users` con el `clerk_user_id` por email primario verificado. Sin fila vinculable, el usuario autenticado no tiene acceso (denegar por defecto).
- **D3. Solo invitaciones.** El panel crea usuarios únicamente por invitación de Clerk. Se descarta el alta directa del respaldo (`skipPasswordRequirement`).
- **D4. Superadmin fuera del panel.** Nadie asigna, cambia ni revoca el rol `superadmin` desde el panel. Se concede solo con `scripts/db-grant-superadmin.mjs`, ejecutado por el usuario. Además, R12 protege al último superadmin activo.
- **D5. Dependencias mínimas.** Solo `@clerk/nextjs` y `@neondatabase/serverless`. Sin `@clerk/ui`. Sin bajar versiones de `next`, `eslint-config-next` ni `zod` respecto a `main`.
- **D6. Componentes shadcn regenerados.** Los de `components/ui/` se instalan con `npx shadcn@latest add`, no se copian del respaldo.
- **D7. Migraciones versionadas.** Tabla `schema_migrations`; cada archivo se aplica una sola vez, completo, en una transacción.

Decisiones del usuario (2026-11-07):

- **D8. Registro cerrado.** Solo por invitaciones de Clerk y vinculación a `app_users` por email verificado. Una cuenta de Clerk sin fila autorizada en Neon no obtiene acceso. La instancia de Clerk se configura en modo "Restricted". `/sign-up` existe solo para aceptar invitaciones y la home no muestra botón de registro.
- **D9. `user` accede a `/dashboard`** con permisos básicos (`dashboard:view`), sin administración de usuarios ni módulos no autorizados. AUTH-1 define el permiso y protege la ruta; el dashboard se construye en AUTH-2, no en AUTH-1.
- **D10. Baja lógica.** Revocar pone `status = 'revoked'`; no se borran filas y se conserva el historial. El acceso se deniega en la siguiente petición (D11). `revoked` es el único estado de baja, también para invitaciones revocadas; no existe `disabled`. Ninguna operación reactiva automáticamente una fila `revoked`: ni el sign-in, ni una invitación nueva, ni `db-grant-superadmin`.
- **D11. Fuentes únicas.** Clerk es el proveedor de identidad. Neon (`app_users`) es la única fuente de roles, permisos y estado. Cada comprobación de autorización consulta rol y estado en `app_users` en esa petición, en el servidor. `publicMetadata.role` ni ningún claim o cookie se usan para autorizar.

## Inventario de la rama de respaldo

| Archivo del respaldo | Decisión | Motivo |
|---|---|---|
| `lib/roles.ts`, `lib/roles.test.ts` | Portar y adaptar | Añadir permisos; quitar `getUserRole(publicMetadata)` (D1) |
| `lib/db.ts` | Portar tal cual | Validación zod de `DATABASE_URL`, cliente perezoso |
| `lib/auth.ts` | Reescribir | Rol desde `app_users` y vinculación (D1, D2) |
| `proxy.ts` | Portar y adaptar | Añadir protección de `/dashboard(.*)` |
| `db/migrations/0001_app_users.sql` | Portar y adaptar | Email en minúsculas por constraint |
| `scripts/db-migrate.mjs` | Reescribir | E9 |
| `scripts/check-db.mjs` | Descartar | El runner ya falla si no conecta (YAGNI) |
| `app/sign-in/...`, `app/sign-up/...` | Portar tal cual | Genéricos |
| `app/layout.tsx` | Portar parcial | Solo `ClerkProvider`; sin textos de MADRE ni tema `@clerk/ui` |
| `app/page.tsx` | Reescribir | Contenido de MADRE (E10) |
| `app/(dashboard)/layout.tsx` | Portar y adaptar (AUTH-2) | Ruta `/dashboard`, sin marca, permiso `dashboard:view` |
| `components/shared/AppSidebar.tsx` | Portar y adaptar (AUTH-2) | Ítems y marca por props/config, filtro por permiso |
| `modules/users/*` | Portar y adaptar (AUTH-3) | E3 a E8, D3, D4 |
| `app/(dashboard)/users/page.tsx` | Portar y adaptar (AUTH-3) | Ruta `/dashboard/users` |
| `components/ui/*`, `hooks/use-mobile.ts` | Regenerar (D6) | Evitar divergencias con el registro shadcn |
| `app/admin/page.tsx` | Descartar | Fuera de alcance |
| `package.json`, `package-lock.json` | No portar | E1, E2; instalar de nuevo sobre `main` |
| `next.config.ts` | No portar | E11 |
| `docs/SETUP.md`, `README.md`, `CLAUDE_CODE_TEMPLATE_V2_PRO_*.md` | No portar | Gobierno o documentación anterior a Fase B |
| Borrados de `docs/evidence/`, `docs/patches/`, `docs/specs/` | Ignorar | El respaldo parte de `0a549c4`, anterior a Fase B: su diff contra `main` "borra" Fase B |

## Errores conocidos del respaldo

- **E1.** Baja `next` y `eslint-config-next` de 16.4.5 a 16.3.8 y `zod` de 4.6.7 a 4.6.5: revierte la corrección de seguridad de dependencias ya integrada en `main`.
- **E2.** Mueve `shadcn` de `devDependencies` a `dependencies`.
- **E3.** El rol vive en `publicMetadata` de Clerk y `app_users` es un espejo, contra la decisión "rol en `app_users`".
- **E4.** `listUsers()` sincroniza todo Clerk en cada carga de página: N llamadas a la API, N inserts y `delete from app_users where status = 'invited'` sin transacción (ventana de pérdida y carreras, límite de tasa de Clerk).
- **E5.** `countSuperadmins()` lee el espejo y nunca se alcanza: `canManageRole("superadmin", "superadmin")` es `false`. Además cuenta antes de actualizar, con carrera entre ambas consultas (resuelto por D4 y R12).
- **E6.** `updateUser`: un admin no puede editarse a sí mismo porque `canManageRole("admin", "admin")` es `false` (resuelto al quitar la edición de nombre).
- **E7b.** `deleteUser` borra al usuario en Clerk y su fila en la base (borrado físico), contra D10.
- **E7.** `revokeInvitation` y `resendInvitation` silencian cualquier error de Clerk, no solo "no encontrada" o "ya revocada".
- **E8.** `fail()` devuelve `error.message` de cualquier error al cliente: filtra mensajes internos de Clerk o de la base.
- **E9.** `db-migrate.mjs` no registra migraciones aplicadas, las reejecuta todas y parte el SQL por `;` (rompe funciones y literales), sin transacción.
- **E10.** Textos y marca de MADRE en `app/layout.tsx`, `app/page.tsx`, layout del panel y sidebar.
- **E11.** `next.config.ts` fija `turbopack.root = process.cwd()`: arreglo local del equipo, no de la plantilla.
- **E12.** `.gitignore` de `main` ignora `.env*`, incluido `.env.example`.

## Requisitos

1. R1 — Rutas públicas: `/`, `/sign-in`, `/sign-up`. `/dashboard` y todo lo que cuelga de ella exige sesión en `proxy.ts` y permiso en el servidor (layout, página y service). El proxy no es el único control.
2. R2 — `getActor()` resuelve el usuario actual según D2: busca por `clerk_user_id`; si esa fila existe, devuelve actor solo si `status = 'active'`, y `null` si está `invited` o `revoked`. Si no hay fila, vincula en una sola sentencia `update ... where email = $email and status = 'invited' and clerk_user_id is null returning ...` usando el email primario **verificado**, y la fila pasa a `active`. Si no, devuelve `null`. Una fila `revoked` o ya vinculada a otro `clerk_user_id` nunca se vincula.
3. R3 — Roles `user`, `admin`, `superadmin`. Permisos: `dashboard:view` (los tres) y `users:manage` (`admin`, `superadmin`). `canManageRole(actor, target)` exige rango estrictamente mayor.
4. R4 — Un admin solo invita, cambia de rol o revoca usuarios `user`. Un superadmin, `user` y `admin`. Nadie actúa sobre sí mismo ni asigna `superadmin` (D4).
5. R5 — Toda server action valida su entrada con zod, comprueba permisos en el service y devuelve solo mensajes de `UsersError` o uno genérico; el error real se registra en el servidor (E8).
6. R6 — Revocar (baja lógica, D10): invitación pendiente → revocar la invitación en Clerk y después `status = 'revoked'`; un 404 o "ya revocada" de Clerk cuenta como hecho; otros errores abortan sin tocar la base (E7). Usuario activo → `status = 'revoked'`; la cuenta de Clerk no se borra. Ninguna fila se borra.
7. R7 — El listado lee solo `app_users`; no sincroniza Clerk en cada carga (E4).
8. R8 — `db:migrate` usa `DATABASE_URL_UNPOOLED` (o `DATABASE_URL` si falta), aplica en orden los `.sql` no registrados en `schema_migrations`, cada uno en una transacción, y se detiene en el primer fallo.
9. R9 — Sin marca de MADRE ni de otro cliente en el código. El nombre visible del panel es una constante de la plantilla.
10. R10 — Ninguna clave real en el repositorio; `.env.example` solo con marcadores.
11. R11 — Sin reactivación automática (D10). Invitar un email cuya fila está `revoked` falla con un mensaje claro. `db-grant-superadmin` sobre una fila `revoked` falla con código 1 sin modificarla.
12. R12 — Último superadmin: ninguna sentencia que cambie rol o estado puede dejar cero filas `superadmin` con `status = 'active'`. Además de D4, cada `update` de rol o estado lleva la condición en la misma sentencia (`... and not (role = 'superadmin' and (select count(*) from app_users where role = 'superadmin' and status = 'active') <= 1)`); cero filas afectadas se informa como error. En AUTH-1 ningún código revoca ni degrada: solo `invited → active` y la promoción del script.

## Contratos

Variables de entorno (`.env.example`, valores en `.env.local` del usuario):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — instancia de desarrollo de Clerk.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.
- `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migraciones) — rama de desarrollo de Neon.

Tabla `app_users` (`db/migrations/0001_app_users.sql`):
- `id uuid pk default gen_random_uuid()`, `clerk_user_id text unique null`, `email text not null unique check (email = lower(email))`, `first_name text`, `last_name text`, `role text not null default 'user' check (role in ('user','admin','superadmin'))`, `status text not null default 'invited' check (status in ('invited','active','revoked'))`, `invitation_id text unique null`, `created_at`, `updated_at timestamptz not null default now()`.
- `schema_migrations(name text primary key, applied_at timestamptz not null default now())`, creada por el runner.

`lib/roles.ts`:
- `ROLES`, `Role`, `ROLE_LABELS`, `PERMISSIONS: Record<Permission, readonly Role[]>`, `Permission = "dashboard:view" | "users:manage"`.
- `parseRole(value: unknown): Role | null`, `can(role: Role | null, permission: Permission): boolean`, `canManageRole(actor: Role, target: Role): boolean`.

`lib/auth.ts` (`server-only`):
- `type Actor = { id: string; clerkUserId: string; email: string; role: Role }`.
- `getActor(): Promise<Actor | null>` (R2).
- `requirePermission(permission): Promise<Actor>` — sin sesión: `redirect("/sign-in")`; sin permiso o sin fila: `redirect("/")`.

Server actions (AUTH-3, `modules/users/actions/users.actions.ts`), todas `(input: unknown) => Promise<ActionResult>` con `ActionResult = { ok: true } | { ok: false; error: string }`:
- `inviteUserAction({ email, role })`, `updateUserRoleAction({ id, role })`, `revokeUserAction({ id })`, `resendInvitationAction({ id })`.

Scripts:
- `npm run db:migrate` → `node --env-file-if-exists=.env.local scripts/db-migrate.mjs`. Salida `OK <archivo>` / `SKIP <archivo>` / `FAIL <archivo>: <mensaje>`; código 1 si falla.
- `npm run db:grant-superadmin -- <email>` → para ese email en minúsculas: sin fila, inserta `role = 'superadmin'`, `status = 'invited'`; fila `invited` o `active`, pone `role = 'superadmin'` sin cambiar el estado; fila `revoked`, falla (R11). El acceso llega al vincularse por sign-in (R2). En Clerk, el usuario recibe la invitación desde su dashboard (modo Restricted).

## Seguridad

- Denegar por defecto: sesión de Clerk sin fila `app_users` `active` no ve nada del panel.
- Vincular solo por email verificado y solo filas `invited`; nunca por email no verificado, nunca filas `revoked`, nunca sobrescribiendo otro `clerk_user_id`.
- Rol y estado se leen de `app_users` en cada petición (D11); revocar surte efecto en la siguiente petición sin esperar a que caduque la sesión de Clerk.
- Permisos comprobados en el servidor (layout, página y service), no solo en la UI ni en el proxy.
- Consultas SQL siempre parametrizadas.
- Configuración de Clerk a cargo del usuario (no código): modo de registro "Restricted".
- El agente no lee, imprime ni edita `.env*` salvo `.env.example`, y no ejecuta `db:migrate` ni `db:grant-superadmin` sin orden expresa del usuario en el chat. Ninguna aprobación de esta spec autoriza migrar producción.

## Recuperación

- Código: todo vive en `feat/auth-clerk-neon` sin commits del agente. Descartar = borrar la rama y el worktree; `main` y `C:/Users/ronal/template-v2-pro` (con sus cambios locales) no se tocan.
- Base de datos (solo rama de desarrollo de Neon, con orden expresa): `drop table app_users; delete from schema_migrations where name = '0001_app_users.sql';`. Alternativa sin pérdida: restaurar la rama de Neon a un punto anterior.
- Clerk: instancia de desarrollo; los usuarios de prueba se borran desde su dashboard.

## Criterios de aceptación

### AUTH-1

- [ ] CA-1 — `package.json` añade solo `@clerk/nextjs` y `@neondatabase/serverless` y los scripts `db:migrate` y `db:grant-superadmin`; `next`, `eslint-config-next` y `zod` siguen en las versiones de `main`. Verificación: diff de `package.json`.
- [ ] CA-2 — `npm audit` no añade vulnerabilidades altas ni críticas respecto a `main`. Verificación: salida de `npm audit` antes y después.
- [ ] CA-3 — `.env.example` existe, está versionable (`git check-ignore` no lo ignora) y no contiene valores reales.
- [ ] CA-4 — Tests de `lib/roles.ts`: `parseRole`, `can` para cada rol y permiso, `canManageRole` para todas las parejas.
- [ ] CA-5 — Tests de `lib/auth.ts` con Clerk y base simulados: sin sesión → `null`; fila vinculada `active` → actor; fila vinculada `revoked` o `invited` → `null`; fila `invited` sin vincular y email verificado → vincula, pasa a `active` y devuelve actor; fila `revoked` sin vincular con el mismo email → `null` y la fila no cambia; email no verificado → `null` sin `update`; sin fila → `null`; `requirePermission` redirige a `/sign-in` sin sesión y a `/` sin fila activa o sin permiso; el rol se lee de la base aunque `publicMetadata.role` diga otra cosa.
- [ ] CA-6 — Dado un usuario sin sesión, cuando visita `/dashboard`, entonces Clerk lo envía a `/sign-in` (comprobado por el usuario con claves de desarrollo).
- [ ] CA-7 — Dada una base de desarrollo vacía, cuando el usuario ejecuta `npm run db:migrate` dos veces, entonces la primera imprime `OK 0001_app_users.sql` y la segunda `SKIP 0001_app_users.sql`.
- [ ] CA-8 — Dado `npm run db:grant-superadmin -- <email>`, una invitación de Clerk a ese email y su sign-in con email verificado, cuando carga `/`, entonces la fila queda `active` con su `clerk_user_id` y la página muestra el rol "Superadmin".
- [ ] CA-8b — Dada una cuenta de Clerk sin fila en `app_users`, cuando carga `/`, entonces la página indica que no tiene acceso (comprobado por el usuario). Con la instancia en modo Restricted, `/sign-up` sin invitación no permite registrarse.
- [ ] CA-8c — Dada una fila `revoked`, cuando se ejecuta `db:grant-superadmin` con su email, entonces sale con código 1 y la fila no cambia (comprobado por el usuario en la base de desarrollo).
- [ ] CA-9 — Ninguna cadena "MADRE" ni "Centro Psicológico" en archivos nuevos o modificados (`git grep`).
- [ ] CA-10 — `npx vitest run`, `npm run lint` y `npm run build` sin errores; `npx vitest run .claude/hooks` sigue pasando.

### AUTH-2 (detalle al reaprobar)

- [ ] CA-11 — Un usuario con rol `user` entra a `/dashboard` y no ve el ítem "Usuarios"; un `admin` lo ve.
- [ ] CA-12 — `AppSidebar` recibe ítems con `permission` opcional; la función de filtrado tiene tests.

### AUTH-3 (detalle al reaprobar)

- [ ] CA-13 — Un admin invita a un `user`; no puede invitar `admin` ni `superadmin` (UI y service).
- [ ] CA-14 — Un superadmin cambia `user` ↔ `admin`; nadie cambia su propio rol ni asigna `superadmin`.
- [ ] CA-15 — Revocar cumple R6: la fila queda `revoked`, no se borra, y el usuario pierde acceso en su siguiente petición; un error de Clerk distinto de 404 o "ya revocada" no cambia la fila.
- [ ] CA-16 — Un error interno no llega al cliente: la acción devuelve el mensaje genérico.
- [ ] CA-17 — Al aceptar la invitación y entrar, la fila pasa a `active` (R2).
- [ ] CA-18 — Invitar un email `revoked` falla y la fila sigue `revoked` (R11).
- [ ] CA-19 — Ninguna acción deja cero superadmins activos (R12), probado en el service con la base simulada.

## Diseño técnico

- Rutas (`app/`): AUTH-1 `app/page.tsx` (pública: botón de sign-in, `UserButton` y rol del actor o aviso "sin acceso"; sin botón de registro), `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`. AUTH-2 `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`. AUTH-3 `app/dashboard/users/page.tsx`.
- `proxy.ts`: `clerkMiddleware` con `createRouteMatcher(["/dashboard(.*)"])` y `auth.protect()`; matcher del respaldo.
- `app/layout.tsx`: envolver `body` con `ClerkProvider`; `lang="es"`; metadata genérica.
- AUTH-2: `components/shared/AppSidebar.tsx` (cliente) con `NavItem = { title; href; icon; permission? }`; `lib/navigation.ts` con `APP_NAME`, `NAV_ITEMS` y `visibleNavItems(role)`.
- AUTH-3: `modules/users/` con `types/`, `schemas/`, `services/users.service.ts` (`server-only`), `actions/users.actions.ts`, `components/UsersTable.tsx`, `components/InviteUserDialog.tsx`, `index.ts`. Tabla shadcn simple con filtro local; sin TanStack Table (YAGNI).
- Antes de escribir código, el developer lee la guía de `proxy` en `node_modules/next/dist/docs/` y la de Clerk para Next.js.

## Reutilización

- Del respaldo: `lib/db.ts`, `lib/roles.test.ts` como base, `proxy.ts`, páginas de sign-in/sign-up, estructura de `modules/users`, `AppSidebar`, `UsersTable` y `UserDialog` como referencia de UI.
- Del proyecto: `cn()` de `@/lib/utils`, `components/ui/button.tsx`, zod v4.
- De shadcn (AUTH-2/3): `sidebar`, `badge`, `table`, `dialog`, `alert-dialog`, `dropdown-menu`, `select`, `input`, `label`.

## Archivos sensibles

Fase AUTH-1:

- `proxy.ts`
- `lib/auth.ts`
- `lib/auth.test.ts`
- `lib/db.ts`
- `lib/roles.ts`
- `lib/roles.test.ts`
- `db/migrations/0001_app_users.sql`
- `scripts/db-migrate.mjs`
- `scripts/db-grant-superadmin.mjs`

## Cambios de gobierno

Ninguno.

## Tests

- `lib/roles.test.ts`: CA-4.
- `lib/auth.test.ts`: CA-5, con `@clerk/nextjs/server`, `next/navigation` y `@/lib/db` simulados con `vi.mock`.
- AUTH-2: `lib/navigation.test.ts` (filtro por permiso).
- AUTH-3: `modules/users/services/users.service.test.ts` (R4, R5, R6 con Clerk y base simulados); `users.schema` solo si tiene transformaciones (email en minúsculas).
- Sin tests de páginas, layouts ni componentes `components/ui/`.

## Plan de tareas

### Fase AUTH-1

- [x] T1 — Dependencias y entorno: `npm install @clerk/nextjs @neondatabase/serverless`, scripts en `package.json`, `.env.example`, `!.env.example` en `.gitignore`; `npm audit` antes y después · archivos: `package.json`, `package-lock.json`, `.gitignore`, `.env.example` · depende de: — · secuencial (base)
- [x] T2 — Datos y roles: `lib/db.ts`, `lib/roles.ts` y su test, migración `0001`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs` · archivos: `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `db/migrations/0001_app_users.sql`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs` · depende de: T1 · secuencial
- [x] T3 — Sesión: `lib/auth.ts` y su test, `proxy.ts` · archivos: `lib/auth.ts`, `lib/auth.test.ts`, `proxy.ts` · depende de: T2 · secuencial
- [x] T4 — UI mínima: `ClerkProvider` en layout, páginas de sign-in/sign-up, home pública con rol · archivos: `app/layout.tsx`, `app/page.tsx`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` · depende de: T3 · secuencial
- [x] T5 — Verificación: reviewer con CA-1 a CA-5, CA-9 y CA-10; el usuario ejecuta CA-6, CA-7, CA-8, CA-8b y CA-8c con claves de desarrollo, Clerk en modo Restricted y orden expresa para migrar · archivos: ninguno · depende de: T4 · secuencial

### Fases siguientes (sin casillas hasta reaprobar)

- AUTH-2: `npx shadcn add sidebar badge`; `lib/navigation.ts` y test; `components/shared/AppSidebar.tsx`; `app/dashboard/layout.tsx` y `page.tsx`. Archivos sensibles: ninguno nuevo.
- AUTH-3: `npx shadcn add table dialog alert-dialog dropdown-menu select input label`; `modules/users/*` con test del service; `app/dashboard/users/page.tsx`.

## Preguntas abiertas

Ninguna. Cerradas por el usuario el 2026-11-07 (D8 a D11).
