# Autenticación: Clerk, Neon, usuarios, roles y navegación

- Módulo: auth
- Estado: aprobado
- ID: SPEC-auth-clerk-neon
- Riesgo: alto (autenticación, sesión, roles y permisos, esquema y migraciones, borrado de registros, dependencias críticas, integraciones externas)
- Ruta: SDD-ADVANCED
- Fase actual: AUTH-3
- Fases: AUTH-1, AUTH-2, AUTH-2.1, AUTH-2.2, AUTH-3. La aprobación autoriza solo la fase actual; pasar de fase exige editar esta spec y aprobarla de nuevo.
- Base AUTH-3: `main` en `6885cc1` (merge del PR #10, CONTACT-1). Rama `feat/auth-users`, worktree `C:/Users/ronal/template-v2-users`. La aprobación de AUTH-3 se firma en este worktree (la firma incluye la raíz); la firma y las líneas del registro de fases anteriores no autorizan AUTH-3.
- Historial:
  - AUTH-1 cerrada: base `18e3dc6`, rama `feat/auth-clerk-neon`, integrada en `main` por `0cfcd4a`. Evidencia: `docs/evidence/auth-clerk-neon.md`.
  - AUTH-2 cerrada: base `0cfcd4a`, rama `feat/auth-dashboard`, aprobada con el hash `51681ff2…cdb4`, integrada en `main` por `fc97323` (PR #5). Evidencia: `docs/evidence/auth-dashboard.md`.
  - AUTH-2.1 cerrada: base `a8494b6`, rama `feat/auth-dashboard-design`, aprobada con el hash `f28d7605…a756ae2`, integrada en `main` por `18a2414` (PR #8). Evidencia: `docs/evidence/auth-dashboard-design.md`.
  - AUTH-2.2 cerrada: base `18a2414`, rama `feat/auth-profile`, aprobada con el hash `0a9ec4e8…3da8c`, integrada en `main` por `ca27a9b` (PR #9). Evidencia: `docs/evidence/auth-profile.md`.
  - CONTACT-1 (spec propia `docs/specs/account-profile-contact.md`, no es fase de esta SDD): enmienda R31, R32 y CA-34 de AUTH-2.2 (teléfono internacional con tipo, sitio web sin esquema, solo correos secundarios verificados) y añade la migración `0003_user_profiles_phone_type.sql`. Integrada en `main` por `6885cc1` (PR #10). AUTH-3 no la toca.
- Referencias visuales: `docs/specs/users-management-design.md` (spec visual) y Figma `ihJfCObzth2fgdsWId9HBK` (19 pantallas), con la jerarquía de D17.
- Fuente: `origin/backup/template-v2-wip-2026-11-06` (`b21d514`), portada archivo por archivo con `git show`. Nunca merge, cherry-pick ni checkout de la rama.
- Antecedente: `docs/specs/template-v2-professional-workflow.md`, "Después de validar Fase B", punto 1. Decisiones heredadas: portar desde la rama de respaldo y rol en `app_users`.

## Objetivo

Dar a la plantilla autenticación con Clerk, persistencia en PostgreSQL (Neon), una tabla `app_users` como fuente de verdad del rol, permisos por rol, un panel de usuarios y una navegación reutilizable filtrada por permisos. Todo genérico: sin marca ni lógica de MADRE.

## Alcance

Incluye:
- AUTH-1: dependencias, variables de entorno, `proxy.ts`, `ClerkProvider`, páginas de sign-in y sign-up, cliente Neon, migración `app_users` con runner versionado, script de alta del primer superadmin, roles, permisos y resolución del usuario actual.
- AUTH-2: shell del panel (`/dashboard`) con sidebar reutilizable cuyos ítems declaran el permiso que requieren, cabecera con `UserButton`, página de inicio del panel y estados de carga, error y acceso denegado (R13 a R18).
- AUTH-2.1: diseño visual de la spec visual. Incluye:
  - Temas claro y oscuro con sus tokens y el selector Claro / Oscuro / Sistema.
  - Tipografía del sistema de Apple: SF Pro, con Inter de respaldo.
  - Sidebar contraíble y menú del usuario en el pie.
  - Inicio del panel, Ver perfil (solo lectura), Configuración (preferencias de interfaz del dispositivo) y Cerrar sesión.
  - Pantallas completas: 02, 10, 13 y 17. Parciales: 08 y 09 (ver "Trazabilidad de pantallas").
  - Sin modelos de datos nuevos, sin escrituras en Neon ni en Clerk y sin server actions (R19 a R29).
- AUTH-2.2: perfil personal completo (pantallas 08 y 19). Incluye:
  - Perfil minimalista en tres grupos: Información personal, Correos y Seguridad (D29).
  - Teléfono y campos opcionales (Cargo, Empresa, Cumpleaños, Sitio web, Nota personal) en la tabla nueva `user_profiles`, privados y editables solo por su dueño (D30, D31).
  - Sincronización de nombre, apellido y correo principal de Clerk a `app_users` sin webhooks (D32). Resuelve P-POST-2 antes de AUTH-3.
  - Migración `0002_user_profiles.sql`, que ejecuta el propietario (R34).
- AUTH-3: gestión de usuarios en `/dashboard/users` (pantallas 01, 03, 04, 05 reducida, 07, 11, 12, 14, 15 y 16), con la matriz de D37. Incluye:
  - Lista desde `app_users` con búsqueda, filtros de estado y rol, orden y paginación de 8 (D35).
  - Detalle en panel lateral, con "Último acceso" y "Sesiones activas" leídos de Clerk solo para mostrarlos (D38).
  - Invitar, cambiar rol entre `user` y `admin` (solo superadmin), inactivar (baja lógica), activar solo a quien ya se vinculó y reenviar invitaciones (D36, D37, D40).
  - Ítem "Usuarios" en el sidebar (D12) y vista "sin acceso" dentro del shell para `user` (D39).
  - Sin migraciones, sin dependencias npm y sin archivos sensibles.

No incluye en AUTH-3:
- Editar nombre, apellido, correo, foto o contraseña de otra persona (D24, D34). La pantalla 05 solo cambia el rol.
- Borrado físico, en Neon o en Clerk, y la acción "Borrar" (pantalla 06) (D10, E7b).
- Asignar, cambiar, inactivar o activar el rol `superadmin` desde el panel (D4), y que un admin cambie roles (D37).
- "Reinvitar" o activar una invitación revocada que nunca se aceptó (D36). R11 no cambia.
- Leer o mostrar `user_profiles` (D31, R36).
- Cerrar sesiones de Clerk al inactivar, webhooks, sincronizar Clerk al cargar la lista (E4) y escribir en Clerk fuera de las invitaciones.
- "Invitado por", acciones masivas, exportar e índices de búsqueda (D35, D41).
- Migraciones, dependencias npm y cambios en `lib/auth.ts`, `lib/roles.ts`, `lib/db.ts`, `proxy.ts`, `db/`, `scripts/`, `app/layout.tsx`, `app/globals.css`, `next.config.ts`, `.env.example`, `.gitignore`, `modules/account/` y los archivos de CONTACT-1.

No incluye en AUTH-2.2:
- Formularios propios de identidad: nombre, apellido, foto, correos, contraseña y sesiones siguen solo en el modal de Clerk (D24).
- Ubicación, "Campo personalizado", zona horaria y formato de fecha editables, y avisos por correo.
- Mostrar `user_profiles` a administradores o en cualquier otra pantalla (D31).
- Webhooks de Clerk, cambios en la configuración de Clerk y llamadas a Clerk fuera de `/dashboard/profile` y de la vinculación de R2.
- Pantallas de AUTH-3, el ítem "Usuarios" y cualquier cambio en `lib/roles.ts`, `lib/navigation.ts`, `proxy.ts`, `lib/db.ts`, `scripts/`, `app/layout.tsx`, `app/globals.css`, `next.config.ts`, `.env.example` y `.gitignore`.
- Dependencias npm nuevas. Ejecutar `db:migrate` desde un agente.

No incluye en AUTH-2.1 (pospuesto e identificado en "Pospuesto" y "Propuestas para AUTH-3"):
- Migraciones nuevas (`0002_user_profiles.sql`), tablas o columnas.
- Campos opcionales persistentes del perfil: Teléfono, Cargo, Empresa, Cumpleaños, Sitio web, Ubicación, Campo personalizado, y la pantalla 19.
- Formularios propios para editar nombre o apellido, sincronización entre Clerk y Neon, y cualquier escritura en `app_users`. El nombre solo se edita en el modal oficial de Clerk (D24).
- Zona horaria y formato de fecha editables, avisos por correo e idiomas distintos del español.
- Las pantallas de gestión de usuarios (01, 03 a 07, 11, 12, 14 a 16) y las propuestas P-AUTH3-1 a P-AUTH3-6: son de AUTH-3.
- `next-themes`, `@clerk/themes`, `@clerk/ui` y cualquier otra dependencia npm.
- Servir SF Pro como webfont: su licencia no lo permite (D20b).
- Cambios en `proxy.ts`, `lib/auth.ts`, `lib/auth.test.ts`, `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `lib/navigation.ts`, `db/`, `scripts/`, `app/page.tsx`, `app/sign-in/`, `app/sign-up/`, `app/error.tsx`, `app/dashboard/loading.tsx`, `next.config.ts`, `.env.example` y `.gitignore`.
- En `app/layout.tsx`, cualquier cambio distinto de la fuente (D20b), el script de tema (D21) y `suppressHydrationWarning`.

No incluye en AUTH-2 (queda para AUTH-3 o fuera de alcance):
- Módulo `modules/users/`, ruta `/dashboard/users`, ítem "Usuarios" del sidebar (D12), server actions, `UsersError` y llamadas a la API de invitaciones de Clerk.
- Componentes shadcn de AUTH-3 (`table`, `dialog`, `alert-dialog`, `dropdown-menu`, `select`, `label`) y cualquier componente fuera de la lista cerrada de CA-22. `input` entra solo porque `sidebar` lo instala como dependencia.
- Código de R12 (cambiar rol o revocar), reactivación de filas `revoked` y cualquier `update` sobre `app_users`.
- Cambios en archivos de AUTH-1: `proxy.ts`, `lib/auth.ts`, `lib/auth.test.ts`, `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `db/`, `scripts/`, `app/layout.tsx`, `app/page.tsx`, `app/sign-in/`, `app/sign-up/`, `.env.example`, `.gitignore`.
- Nuevas migraciones, nuevas dependencias npm, configuración de Clerk, datos de Neon, `next.config.ts`.

No incluye:
- Cambios en gobierno (`.claude/`, `CLAUDE.md`, `AGENTS.md`, `docs/SETUP.md`), en la spec de Fase B ni en Fase C.
- Webhooks de Clerk, organizaciones, multi-tenant, SSO, billing.
- Edición de identidad (nombre, apellido, foto, correos, contraseña) con formularios propios del panel: la hace el usuario en la UI de Clerk (`UserButton` en AUTH-2, modal `openUserProfile()` desde AUTH-2.1, D24). Los datos opcionales de AUTH-2.2 no son identidad (D30).
- Alta directa de usuarios sin invitación y registro abierto.
- Borrado físico de filas de `app_users` desde la aplicación.
- Reactivar automáticamente un usuario revocado. La única reactivación es la manual de AUTH-3, solo para filas ya vinculadas (D36).
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
- **D10. Baja lógica.** Revocar pone `status = 'revoked'`; no se borran filas y se conserva el historial. El acceso se deniega en la siguiente petición (D11). `revoked` es el único estado de baja, también para invitaciones revocadas; no existe `disabled`. Ninguna operación reactiva automáticamente una fila `revoked`: ni el sign-in, ni una invitación nueva, ni `db-grant-superadmin`. Enmendada por D36 (AUTH-3): "Activar" manual desde el panel, solo para filas `revoked` ya vinculadas.
- **D11. Fuentes únicas.** Clerk es el proveedor de identidad. Neon (`app_users`) es la única fuente de roles, permisos y estado. Cada comprobación de autorización consulta rol y estado en `app_users` en esa petición, en el servidor. `publicMetadata.role` ni ningún claim o cookie se usan para autorizar.

Decisiones del usuario para AUTH-2 (adoptadas el 2026-11-07; cierran P1 y P2):

- **D12. "Usuarios" llega con AUTH-3.** El ítem "Usuarios" (`users:manage`) se añade a `NAV_ITEMS` junto con su ruta en AUTH-3; en AUTH-2 no existe `/dashboard/users` y un enlace a ella sería un 404. El filtro por permiso se prueba en AUTH-2 con ítems de prueba (CA-12). Sustituye la redacción anterior de CA-11.
- **D13. Acceso denegado = home.** `requirePermission` ya redirige a `/` y la home ya muestra "Tu cuenta no tiene acceso". AUTH-2 no crea página `/forbidden` ni activa `authInterrupts` (exigiría tocar `next.config.ts`).
- **D14. Filtro de navegación solo en la UI.** El sidebar oculta lo que el rol no puede usar, pero no autoriza: cada layout y página de `/dashboard` llama a `requirePermission` en el servidor (R1). `AppSidebar` recibe el `role` y filtra en el cliente porque los iconos de `lucide-react` no se pueden pasar de un Server Component a un Client Component.
- **D15. Sin cambios en AUTH-1.** AUTH-2 solo añade las rutas permitidas de CA-22; usa `requirePermission`, `Actor`, `ROLE_LABELS`, `can` y `Permission` tal como están.

Decisión del usuario para AUTH-2 (2026-11-07):

- **D16. `hooks/use-mobile.ts` editado a mano.** El archivo que genera shadcn incumple `react-hooks/set-state-in-effect` (`setIsMobile` dentro de `useEffect`) y hace fallar `npm run lint` (CA-10). Es el único archivo generado que se edita a mano: `useIsMobile` se reescribe con `React.useSyncExternalStore` sobre `window.matchMedia("(max-width: 767px)")` (suscripción al evento `change`, snapshot del cliente `matchMedia(...).matches`, snapshot del servidor `false`). Misma firma pública (`useIsMobile(): boolean`) y mismo breakpoint (768). Sin `eslint-disable` y sin tocar `eslint.config.mjs`.

Decisiones del usuario para AUTH-2.1 (2026-11-07 y 2026-11-08):

- **D17. Jerarquía de fuentes.**
  1. Esta SDD define qué se implementa, las reglas, los permisos y los criterios de aceptación.
  2. `docs/specs/users-management-design.md` define cómo se ve y se comporta la interfaz.
  3. Figma es la referencia original: solo resuelve dudas visuales y comprueba fidelidad.

  Si dos fuentes se contradicen, gana la de nivel superior. El desarrollo no depende del acceso a Figma.
- **D18. Spec visual en el repo.** `users-management-design.md` se porta tal cual (versión del 2026-11-07 a las 23:18, 322 líneas) desde el worktree v1 `user-management-view-a1b034` a `docs/specs/`, con `Estado: borrador` y sin plan de tareas propio.
  - P1 queda cerrada: SF Pro, con Inter de respaldo.
  - P2 queda cerrada: tema oscuro con la paleta de la spec.
  - P3 sigue abierta en la spec visual. Para esta SDD queda pospuesta (P-POST-1).

  Se descarta `users-management.md` de v1, porque contradice D1 y D11.
- **D19. Fase AUTH-2.1.** Fase propia entre AUTH-2 y AUTH-3, solo de presentación y navegación. El menú del usuario en el pie sustituye al `UserButton` de la cabecera de R15.
- **D20. Tokens de ambos temas (decisión del 2026-11-08).** En `app/globals.css` cambian `:root`, `.dark` y `@theme inline`, con los valores de las tablas "Tokens de color (modo claro)" y "Tokens de color (modo oscuro)" de la spec visual:
  - Ocho tokens nuevos en los dos bloques, expuestos como `--color-*`: `--placeholder`, `--primary-soft`, `--destructive-soft`, `--success`, `--success-soft`, `--warning`, `--warning-soft` y `--switch-off`.
  - La paleta oscura actual de shadcn se sustituye por la de la spec.
  - `--radius` es de 12 px en los dos temas.
  - `:root { color-scheme: light; }` y `.dark { color-scheme: dark; }`. Así los componentes de Clerk y los controles nativos siguen el tema (B2).
  - Se aplican las "Reglas del tema oscuro" de la spec: segmento activo `#636366`, fundido de 200 ms al cambiar de tema y sidebar sólido `#2C2C2E` con transparencia reducida.
- **D20b. Tipografía (decisión del 2026-11-08).**
  - `--font-sans` en `@theme inline` pasa a ser `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), system-ui, sans-serif`.
  - En `app/layout.tsx`, `Geist` se sustituye por `Inter` de `next/font/google` (`variable: "--font-inter"`, `display: "swap"`), solo como respaldo.
  - SF Pro no se sirve como webfont, porque su licencia no lo permite: en macOS e iOS se ve la del sistema, y en el resto, Inter.
  - Se aplica `font-optical-sizing: auto` y la escala tipográfica de la spec.
  - No añade dependencias npm: `next/font` ya forma parte de `next`.
- **D21. Apariencia (decisión del 2026-11-08).**
  - Claro, Oscuro y Sistema funcionan.
  - El tema pone o quita la clase `dark` en `<html>`. Sistema sigue `prefers-color-scheme` y escucha sus cambios con `matchMedia`.
  - La elección se guarda en `localStorage` (D25).
  - Para evitar un destello del tema equivocado al cargar, `app/layout.tsx` incluye en `<head>` un script en línea mínimo que lee esa preferencia y aplica la clase antes de pintar. `<html>` lleva `suppressHydrationWarning`.
  - Sin `next-themes`.
  - El tema se aplica en toda la app, incluidas `/`, `/sign-in` y `/sign-up`.
  - Componentes de Clerk (B2, resuelto por el propietario el 2026-11-08): siguen el tema con `color-scheme` (D20), porque Clerk Core 3, incluido en `@clerk/nextjs` 7.9.25, se adapta solo. Si en CA-32 algún componente de Clerk no lo sigue, se acepta en claro y se anota en la evidencia, sin dependencias ni `appearance.variables`.
- **D22. Rutas de cuenta.** `/dashboard/profile`, `/dashboard/settings` y `/dashboard/sign-out`. Ya las protege `proxy.ts`, sin cambiarlo. Cada página llama a `requirePermission("dashboard:view")` (R13).
- **D23. Fuentes de los datos mostrados.**
  - Clerk (identidad): nombre, apellido, correo principal y foto, con `useUser()` en componentes cliente, sin llamadas a Clerk desde el servidor.
  - `app_users` (autorización): rol y estado, con el `Actor` de `requirePermission` pasado como prop.
  - AUTH-2.1 no escribe en Clerk ni en Neon.
- **D24. Identidad en el modal oficial de Clerk (B1, opción a, decidida por el propietario el 2026-11-07).**
  - "Cambiar foto", "Añadir correo", Contraseña, Sesiones activas y los datos de identidad se gestionan en `useClerk().openUserProfile()`.
  - Nombre y apellido se editan **solo** dentro de ese modal.
  - La app no tiene formularios propios de identidad ni sincroniza Clerk y Neon en AUTH-2.1.
  - Lo mostrado se lee de Clerk (D23), así que un cambio en el modal se ve sin desfase en AUTH-2.1.
  - Los nombres de `app_users` no se usan en esta fase.
- **D25. Preferencias de interfaz solo en el dispositivo.**
  - Tema (Claro / Oscuro / Sistema), Densidad (Cómoda/Compacta) y Reducir movimiento se guardan en `localStorage`. No son un modelo de datos ni salen del navegador. Valor por defecto del tema: Sistema.
  - Su lectura se valida y, ante cualquier valor desconocido, se usan los valores por defecto.
  - Idioma y región se muestran en solo lectura: Español, la zona horaria del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) y el formato `dd/mm/aaaa`.
- **D26. Avatar.** Foto `imageUrl` de Clerk con el `<img>` de shadcn `avatar`: sin `next/image`, así que `next.config.ts` no cambia. Sin foto: iniciales sobre un degradado elegido de forma estable por el id de Clerk.
- **D27. Movimiento.** Transiciones CSS (`cubic-bezier` sin rebote) en lugar de springs. Con `prefers-reduced-motion: reduce` o con la preferencia "Reducir movimiento", solo fundidos de opacidad de 150 ms. El cambio de tema usa un fundido de 200 ms sobre `background-color` y `color`. Sin librería de animación.

Decisiones del propietario para AUTH-2.2 (2026-11-08, "Perfil minimalista estilo Apple" y respuestas O1–O3):

- **D28. Fase AUTH-2.2.** Fase propia entre AUTH-2.1 y AUTH-3: perfil extendido, su persistencia y la sincronización de identidad. AUTH-3 empieza con P-POST-2 ya resuelta. Enmienda D23 solo en lo que dice D30 a D32: AUTH-2.2 escribe en Neon (la fila propia de `user_profiles` y las columnas de identidad de la fila propia de `app_users`) y lee Clerk en el servidor solo en `/dashboard/profile`. Sigue sin escribir en Clerk.
- **D29. Perfil minimalista (pantallas 08 y 19).** Principio: mostrar lo necesario y revelar lo adicional solo cuando el usuario lo pide.
  - Encabezado sin tarjeta: foto, nombre completo y correo principal de Clerk, y "Cambiar foto". Sin rol ni insignia de estado (O2): el rol ya se ve en Inicio.
  - Tres grupos y ninguna tarjeta más: Información personal, Correos y Seguridad (R30).
  - Sin la nota con candado de AUTH-2.1, sin iconos decorativos y sin textos explicativos. Chevrons solo en filas con acción.
- **D30. Datos opcionales en `user_profiles`.** Teléfono de contacto, Cargo, Empresa, Cumpleaños, Sitio web y Nota personal, en una tabla 1:1 con `app_users` (migración `0002`). No son identidad: no se verifican, no autentican y no se copian a Clerk. Resuelve P-POST-1 salvo la zona horaria y el formato de fecha, que siguen pospuestos. Ubicación y "Campo personalizado" se descartan.
- **D31. Privacidad por defecto.** Solo el dueño lee y escribe su fila de `user_profiles`, siempre identificado por la sesión en el servidor (`getActor()`), nunca por un id enviado por el navegador. Ningún administrador ni ninguna otra pantalla ve estos datos. Mostrar un campo a otros exige una decisión aprobada por campo en una fase posterior.
- **D32. Sincronización de identidad sin webhooks (P-POST-2, A1, O3).**
  - Al vincular (R2), la misma sentencia copia `first_name` y `last_name` de Clerk.
  - Al renderizar `/dashboard/profile`, el servidor relee `currentUser()` y actualiza nombre, apellido y correo principal **verificado** (en minúsculas) de la fila propia de `app_users`, solo si cambiaron.
  - Si otra fila ya usa ese correo (restricción `unique`), el correo no cambia y se conserva el anterior. Nombre y apellido se sincronizan igual, también cuando la colisión ocurre por concurrencia (otra fila toma el correo entre la comprobación y la escritura): el correo y los nombres se escriben en sentencias independientes, así que un fallo del correo no deshace los nombres.
  - Un fallo de la sincronización se registra en el servidor y la página se muestra igual.
  - Ninguna otra petición consulta a Clerk para esto. Límite aceptado: un cambio hecho en Clerk llega a `app_users` cuando su dueño vuelve a abrir el perfil.
- **D33. Tipografía sin cambios (O1).** Se mantiene D20b: fuente del sistema de Apple con Inter de respaldo. Geist no vuelve.

Decisiones del propietario para AUTH-3 (2026-11-08: A1 a A8, "Activar" solo para vinculados y valores por defecto aceptados):

- **D34. Fase AUTH-3 y jerarquía (D17).** Esta SDD manda sobre la spec visual. Diferencias con la spec visual, que se aplican:
  - La pantalla 05 solo cambia el rol: nombre, apellido y correo se ven en solo lectura (A2, D24). La fila "Editar nombre y apellido" de la matriz visual no se implementa.
  - "Borrar" (pantallas 03 y 06, fila "Borrar" de la matriz) no existe (D10).
  - Un admin no cambia roles (A6): la fila "Cambiar rol" de la matriz visual queda solo para superadmin.
  - Sin "Invitado por" en el detalle (A4) ni "Contraseña ••••".
  - La matriz efectiva es la de D37.
- **D35. Lista (A3, P-AUTH3-1).**
  - Lee solo `app_users`, con una sentencia por página.
  - Búsqueda sin distinguir mayúsculas (`ilike`) en nombre, apellido y correo, con `%` y `_` escapados.
  - Filtros de estado (Todos, Activos, Inactivos, Invitados) y de rol (Todos, Usuario, Administrador, Superadmin).
  - Orden: nombre A–Z (por defecto), nombre Z–A, correo A–Z y alta más reciente, siempre con `id` como desempate.
  - 8 filas por página.
  - Todo en parámetros de URL validados con zod; un valor inválido usa su valor por defecto.
  - Una fila sin nombre muestra el correo.
  - Sin índice de búsqueda (A8): se decide con datos reales.
  - Límite aceptado (D32): un nombre cambiado en Clerk llega a la lista cuando su dueño vuelve a abrir el perfil.
- **D36. Estados, Inactivar y Activar (A5, decisión del 2026-11-08).**
  - Activo = `active`, Inactivo = `revoked`, Invitado = `invited`.
  - Inactivar una invitación pendiente: revoca la invitación en Clerk y después pone `revoked` (R6).
  - Inactivar un usuario activo: pone `revoked`. No cierra sus sesiones de Clerk: D11 le niega el acceso en su siguiente petición.
  - Activar: solo filas `revoked` con `clerk_user_id is not null` (ya vinculadas), que vuelven a `active`. La condición va en la misma sentencia SQL, no solo en la UI.
  - Una invitación revocada antes de aceptarse (`clerk_user_id is null`) queda revocada para siempre: sin Activar ni Reinvitar. R11 no cambia.
  - Enmienda D10 solo en esta reactivación manual.
- **D37. Matriz de permisos (A6, P-AUTH3-4).**

  | Acción | user | admin | superadmin |
  |---|---|---|---|
  | Ver "Usuarios", la lista y el detalle | no | sí | sí |
  | Invitar | no | rol `user` | rol `user` o `admin` |
  | Cambiar rol | no | no | `user` ↔ `admin`, sobre filas `user` y `admin` |
  | Inactivar, activar y reenviar invitación | no | filas `user` | filas `user` y `admin` |

  Reglas: nadie actúa sobre su propia fila ni sobre filas `superadmin`, y nadie asigna `superadmin` (D4). La gestión de una fila es `canManageRole(actor.role, fila.role)` (rango estrictamente mayor, ya en `lib/roles.ts`). Los roles asignables son los que el actor gestiona. Cambiar rol es solo de superadmin. La matriz vive en `modules/users/utils/userPermissions.ts`; `lib/roles.ts` no cambia.
- **D38. Último acceso y sesiones (A4, P-AUTH3-2).**
  - "Último acceso": una sola llamada `users.getUserList({ userId, limit })` de Clerk por página, con los `clerk_user_id` de las filas vinculadas de esa página (como mucho 8). Trae `lastSignInAt` y la foto (`imageUrl`). Nunca una llamada por fila.
  - Los `clerk_user_id` solo existen en el servidor. `listUsers` los devuelve aparte de las filas (`UsersListing.clerkUserIds`), la página se los pasa a `getClerkActivity`, y al componente cliente solo llegan las filas sin ids de Clerk y `ClerkActivity`, con clave el id de la fila.
  - "Sesiones activas": solo en el detalle, con `sessions.getSessionList({ userId, status: "active" })` al abrirlo.
  - Son lecturas para mostrar, no sincronizaciones: no escriben en Neon (matiza R7).
  - Sin `clerk_user_id`, o si Clerk falla, se muestra "—" y la página funciona igual.
- **D39. Sin permiso (A7, P-AUTH3-5).** `/dashboard/users` con rol `user` muestra la vista de la pantalla 11 dentro del shell: candado, "No tienes acceso a Usuarios", una explicación y "Volver al inicio". Las demás denegaciones siguen redirigiendo a `/` (D13).
- **D40. Invitaciones de Clerk.**
  - Invitar crea la invitación con `notify: true`, `ignoreExisting: true` y `redirectUrl` = `<origen>/sign-up`. El origen sale de la cabecera `Origin` de la petición de la acción (Next ya la compara con `Host`); sin `Origin` válida `http(s)`, la acción falla con el mensaje genérico. `.env.example` no cambia.
  - `ignoreExisting: true` solo evita que Clerk rechace la invitación si ese correo ya tiene cuenta o invitación en Clerk. No cambia R2: el acceso sigue exigiendo una fila `invited` sin vincular y se concede solo al vincularla por el correo principal **verificado** en el primer acceso. Una cuenta de Clerk ya existente no obtiene acceso por la invitación, sino por esa vinculación.
  - Reenviar es una sustitución controlada, porque Clerk no reenvía: revocar la invitación anterior, crear una nueva y guardar su id (R46).
  - Ningún paso borra filas: si la base rechaza el alta tras crear la invitación, se revoca esa invitación en Clerk.
- **D41. Componentes (A8, P-AUTH3-6).** `npx shadcn@latest add table alert-dialog select` (`dialog` ya está desde AUTH-2.2). Se reutilizan `sheet`, `dropdown-menu`, `toggle-group`, `badge`, `input`, `label`, `button`, `card`, `skeleton` y `UserAvatar`. Sin dependencias npm ni migraciones.
- **D42. Errores (E8).** `UsersError` lleva mensajes en español pensados para el usuario. Cualquier otro error devuelve "No se pudo completar la acción. Inténtalo de nuevo." Los errores se registran en el servidor solo con `code` y `message`, sin correos ni datos personales.

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

## Trazabilidad de pantallas (AUTH-2.1 y AUTH-3)

Se conserva el diseño completo. Lo pospuesto queda señalado.

| # | ID Figma | Pantalla | Fase | Ruta | Estado |
|---|---|---|---|---|---|
| 02 | `3:277` | Menú del avatar | AUTH-2.1 | pie del shell | Completa (R21) |
| 08 | `4:1223` | Ver perfil | AUTH-2.2 | `/dashboard/profile` | Completa en AUTH-2.2 (R30), con la estructura de D29. En AUTH-2.1 fue parcial (R23) |
| 09 | `4:1328` | Configuración | AUTH-2.1 parcial | `/dashboard/settings` | Apariencia Claro / Oscuro / Sistema, Idioma y región en solo lectura, Densidad y Reducir movimiento (R24). **Pospuesto:** zona horaria y formato de fecha editables, y Avisos por correo |
| 10 | `4:1422` | Cerrar sesión | AUTH-2.1 | `/dashboard/sign-out` | Completa (R25) |
| 13 | `8:1848` | Sidebar contraída | AUTH-2.1 | shell | Completa (R20). La lista de fondo es de AUTH-3 |
| 17 | `9:2916` | Inicio (user) | AUTH-2.1 | `/dashboard` | Completa (R22), con preferencias en solo lectura |
| 19 | `10:2848` | Perfil: añadir información | AUTH-2.2 | `/dashboard/profile` | Completa en AUTH-2.2 (R31), sin Ubicación ni "Campo personalizado" (D30) |
| 01 | `3:34` | Lista (superadmin) | AUTH-3 | `/dashboard/users` | Completa (R39, D35, D38) |
| 03 | `3:542` | Acciones de fila (superadmin) | AUTH-3 | `/dashboard/users` | Sin "Editar" de nombres ni "Borrar": Ver detalles, Cambiar rol, Inactivar o Activar, Reenviar invitación (R40, D34) |
| 04 | `3:794` | Invitar | AUTH-3 | diálogo | Completa (R42) |
| 05 | `3:1074` | Editar | AUTH-3 | diálogo | Reducida a cambiar rol, con nombre y correo en solo lectura (R43, D34) |
| 06 | `3:1362` | Confirmar borrar | AUTH-3 | — | No se implementa (D10, D34). Su estilo de alerta se usa para confirmar Inactivar (R44) |
| 07 | `3:1631` | Sin resultados | AUTH-3 | `/dashboard/users` | Completa (R39) |
| 11 | `4:1482` | Sin permiso | AUTH-3 | `/dashboard/users` | Completa (D39) |
| 12 | `7:1432` | Detalle de usuario | AUTH-3 | `sheet` | Sin "Invitado por" ni "Contraseña ••••" (R41, D34) |
| 14 | `8:1980` | Editar: cambiar rol | AUTH-3 | diálogo | Completa, solo para superadmin (R43, D37) |
| 15 | `9:2395` | Lista (admin) | AUTH-3 | `/dashboard/users` | Completa (R39, D37) |
| 16 | `9:2619` | Acciones de fila (admin) | AUTH-3 | `/dashboard/users` | Sin "Borrar" ni cambiar rol (R40, D37) |
| 18 | `9:3006` | Matriz de permisos | AUTH-3 | — | Sustituida por D37; base de CA-48 |

Los ID salen de la spec visual: la API de Figma no estuvo disponible para verificarlos en vivo (D17).

## Pospuesto

Sin implementar. Se decide antes de su fase.

- **P-POST-1. Campos opcionales y preferencias persistentes.** Resuelta en AUTH-2.2 para los campos del perfil (D30). Siguen pospuestos la zona horaria y el formato de fecha editables.
- **P-POST-2. Sincronización del nombre entre Clerk y Neon. Dependencia obligatoria de AUTH-3.** Resuelta en AUTH-2.2 con la primera opción, ampliada al correo principal (D32). Texto original: Ninguna funcionalidad de AUTH-3 que use los nombres guardados en Neon se habilita sin resolverla y aprobarla antes: buscar u ordenar por nombre, mostrar nombres en la lista o el detalle desde `app_users`, o editar nombres desde el panel (pantalla 05). Mientras tanto, la única fuente de nombres es Clerk. Opciones a evaluar:
  - Copiar el nombre al vincular la cuenta (R2, toca `lib/auth.ts`).
  - Escribir en Clerk y Neon en la misma acción.
  - Leer los nombres de Clerk por página.

## Propuestas para AUTH-3

Formalizadas en D34 a D41 (AUTH-3). El texto original se conserva como antecedente. El 2026-11-08 el propietario aceptó como dirección para redactar AUTH-3: P-AUTH3-1 a P-AUTH3-6 tal como están, el panel no edita nombres (pantalla 05 solo cambia el rol) y AUTH-3 no lee `user_profiles` (D31).

- **P-AUTH3-1.** La lista lee `app_users`. Buscar, ordenar o mostrar por nombre, y editar nombres (pantalla 05), quedan bloqueados hasta resolver P-POST-2.
- **P-AUTH3-2.** "Último acceso" con una sola llamada a Clerk por página (`getUserList({ userId })`, `lastSignInAt`), solo para mostrarlo. R7 se matizaría: es una lectura de visualización, no una sincronización. "Sesiones activas" solo en el panel de detalle. Se quita "Invitado por".
- **P-AUTH3-3.** Inactivo = `revoked`. "Activar" = reactivación manual de `revoked` a `active` desde el panel, según la matriz, lo que enmienda D10. "Borrar" se quita de la UI (D10, E7b).
- **P-AUTH3-4.** Un admin no asciende a `admin`; solo un superadmin cambia entre `user` y `admin`.
- **P-AUTH3-5.** `/dashboard/users` con rol `user` muestra la vista "sin acceso" dentro del shell. Las demás denegaciones siguen redirigiendo a `/`.
- **P-AUTH3-6.** Componentes por instalar en AUTH-3: `table`, `dialog`, `alert-dialog`, `select`.

## Requisitos

1. R1 — Rutas públicas: `/`, `/sign-in`, `/sign-up`. `/dashboard` y todo lo que cuelga de ella exige sesión en `proxy.ts` y permiso en el servidor (layout, página y service). El proxy no es el único control.
2. R2 — `getActor()` resuelve el usuario actual según D2: busca por `clerk_user_id`; si esa fila existe, devuelve actor solo si `status = 'active'`, y `null` si está `invited` o `revoked`. Si no hay fila, vincula en una sola sentencia `update ... where email = $email and status = 'invited' and clerk_user_id is null returning ...` usando el email primario **verificado**, y la fila pasa a `active`. Desde AUTH-2.2, esa misma sentencia copia también `first_name` y `last_name` de Clerk (D32). Si no, devuelve `null`. Una fila `revoked` o ya vinculada a otro `clerk_user_id` nunca se vincula.
3. R3 — Roles `user`, `admin`, `superadmin`. Permisos: `dashboard:view` (los tres) y `users:manage` (`admin`, `superadmin`). `canManageRole(actor, target)` exige rango estrictamente mayor.
4. R4 — Un admin solo invita, inactiva, activa o reenvía la invitación de usuarios `user`, y no cambia roles. Un superadmin actúa sobre `user` y `admin`, y solo él cambia entre `user` y `admin`. Nadie actúa sobre sí mismo ni sobre un `superadmin`, ni asigna `superadmin` (D4). Enmendado en AUTH-3 según D37 (antes, el admin también cambiaba roles).
5. R5 — Toda server action valida su entrada con zod, comprueba permisos en el service y devuelve solo mensajes de `UsersError` o uno genérico; el error real se registra en el servidor (E8).
6. R6 — Revocar (baja lógica, D10): invitación pendiente → revocar la invitación en Clerk y después `status = 'revoked'`; un 404 o "ya revocada" de Clerk cuenta como hecho; otros errores abortan sin tocar la base (E7). Usuario activo → `status = 'revoked'`; la cuenta de Clerk no se borra. Ninguna fila se borra.
7. R7 — El listado lee solo `app_users`; no sincroniza Clerk en cada carga (E4). Desde AUTH-3, "Último acceso", la foto y "Sesiones activas" se leen de Clerk solo para mostrarlos, sin escribir en Neon (D38).
8. R8 — `db:migrate` usa `DATABASE_URL_UNPOOLED` (o `DATABASE_URL` si falta), aplica en orden los `.sql` no registrados en `schema_migrations`, cada uno en una transacción, y se detiene en el primer fallo.
9. R9 — Sin marca de MADRE ni de otro cliente en el código. El nombre visible del panel es una constante de la plantilla.
10. R10 — Ninguna clave real en el repositorio; `.env.example` solo con marcadores.
11. R11 — Sin reactivación automática (D10). Invitar un email cuya fila está `revoked` falla con un mensaje claro. `db-grant-superadmin` sobre una fila `revoked` falla con código 1 sin modificarla. "Activar" de AUTH-3 (D36) es manual, solo para filas ya vinculadas, y no cambia esta regla.
12. R12 — Último superadmin: ninguna sentencia que cambie rol o estado puede dejar cero filas `superadmin` con `status = 'active'`. Además de D4, la condición se exige solo en los `update` que pueden sacar una fila del conjunto de superadmins activos (cambiar el rol de una fila `superadmin` o pasar una fila `superadmin` `active` a otro estado), dentro de la misma sentencia (`... and not (role = 'superadmin' and status = 'active' and (select count(*) from app_users where role = 'superadmin' and status = 'active') <= 1)`); cero filas afectadas se informa como error. No se exige en las sentencias que solo añaden superadmins activos o no tocan ese conjunto: la vinculación `invited → active` (R2) y la promoción de `db-grant-superadmin`. AUTH-1 y AUTH-2 no tienen sentencias que revoquen ni degraden; R12 se implementa y prueba en AUTH-3 (CA-19).
13. R13 — `/dashboard` (AUTH-2): `app/dashboard/layout.tsx` y `app/dashboard/page.tsx` llaman cada uno a `requirePermission("dashboard:view")` en el servidor antes de renderizar. Sin sesión → `/sign-in` (proxy y `requirePermission`). Sesión sin fila `active` (sin fila, `invited` no vinculable o `revoked`) → `/`, que muestra el aviso de acceso denegado (D13). No se renderiza nada del shell sin actor.
14. R14 — Navegación: `lib/navigation.ts` define `APP_NAME`, `NAV_ITEMS` y `visibleNavItems(role, items = NAV_ITEMS)`, que devuelve, en el mismo orden, los ítems sin `permission` o con `can(role, permission)`. En AUTH-2, `NAV_ITEMS` contiene solo "Inicio" (`/dashboard`, sin permiso adicional al del layout).
15. R15 — Shell: sidebar con la marca genérica (`APP_NAME`), los ítems visibles, el ítem activo según la ruta y el rol del actor (`ROLE_LABELS`) en el pie; cabecera con `SidebarTrigger`, `APP_NAME` y `UserButton`. En móvil el sidebar se abre como panel lateral (comportamiento de shadcn `sidebar`). La página `/dashboard` saluda y muestra el rol; sin datos de negocio.
16. R16 — Carga: `app/dashboard/loading.tsx` muestra un indicador accesible (`role="status"` con texto) mientras carga la página.
17. R17 — Error: `app/error.tsx` (Client Component) captura los errores de `/dashboard`, incluido su layout (un `error.tsx` no cubre el layout de su mismo segmento), y de `/`. Muestra un mensaje genérico y un botón para reintentar según la guía de `error.js` de Next 16; nunca muestra `error.message` ni la pila. No captura las redirecciones de `requirePermission`.
18. R18 — Sin dependencias npm nuevas ni cambios de configuración: `npx shadcn@latest add sidebar badge`, sin `--overwrite`, solo crea los ocho archivos generados que lista CA-22. Si pide sobrescribir un archivo existente, se responde que no. Si crea, modifica o borra cualquier otra ruta (incluidos `package.json`, `package-lock.json`, `components.json`, `tsconfig.json` y `app/globals.css`), el developer se detiene y lo informa antes de seguir (CA-22).

19. R19 — Tokens y tipografía:
    - Tokens según D20 y fuente según D20b.
    - Los componentes nuevos o modificados usan solo tokens, nunca colores sueltos, y se ven correctamente en los dos temas.
    - Excepción, según la spec: los degradados del logo y del avatar son iguales en ambos temas.
20. R20 — Shell (pantalla 13):
    - `AppSidebar` con `collapsible="icon"`: 260 px expandido y 64 px contraído.
    - Cabecera del sidebar: logo "P" de 28 px, `APP_NAME` y botón contraer/expandir (`panel-left`, con `aria-label`).
    - Contraído: solo iconos, con tooltip.
    - Fondo translúcido (`--sidebar` + `backdrop-blur`), con fondo sólido si `prefers-reduced-transparency: reduce`.
    - Contenido sobre `--muted`, con los paddings de la spec visual.
    - Desaparece la cabecera superior. En móvil (`md:hidden`) queda una barra mínima con `SidebarTrigger`.
    - Los ítems siguen saliendo de `visibleNavItems` (R14), sin cambiar `lib/navigation.ts`.
21. R21 — Menú del usuario (pantalla 02): `components/shared/NavUser.tsx` (cliente) en el pie.
    - Muestra avatar, nombre y correo (D23).
    - Menú anclado encima: cabecera con nombre y correo, Ver perfil, Configuración, separador, Cerrar sesión. Cada opción navega a su ruta (D22).
    - Contraído, solo el avatar.
22. R22 — Inicio `/dashboard` (pantalla 17):
    - "Hola, <nombre>".
    - Tarjeta TU CUENTA: avatar, rol y estado, botón "Ver perfil".
    - Tarjeta PREFERENCIAS: tema elegido, idioma Español, zona horaria del navegador, botón "Configuración".
    - Aviso con candado: el rol lo gestiona un administrador.
23. R23 — Ver perfil `/dashboard/profile` (pantalla 08, parcial):
    - Tarjeta: avatar L, nombre, correo, rol y estado, botón "Cambiar foto" (D24).
    - INFORMACIÓN PERSONAL: Nombre y Apellido de Clerk, en solo lectura en la página. Su fila abre el modal de Clerk, el único sitio donde se editan (D24).
    - CORREOS: correo principal + "Añadir correo" (D24).
    - SEGURIDAD: Contraseña y Sesiones activas (D24).
    - Sin filas de campos opcionales ni "+ Añadir información" (P-POST-1).
24. R24 — Configuración `/dashboard/settings` (pantalla 09, parcial):
    - APARIENCIA: tres vistas previas de 168 × 100 px (Claro, Oscuro, Sistema), con marco de 2.5 px `--primary` en la elegida. Elegir una aplica el tema al momento (D21).
    - IDIOMA Y REGIÓN: en solo lectura (D25).
    - INTERFAZ: Densidad (`toggle-group`) y Reducir movimiento (`switch`), en `localStorage` (D25).
    - Sin avisos por correo.
    - Una nota indica que las preferencias de interfaz se guardan en este dispositivo.
25. R25 — Cerrar sesión `/dashboard/sign-out` (pantalla 10):
    - Tarjeta con la cuenta actual.
    - "Cerrar sesión" ejecuta `useClerk().signOut({ redirectUrl: "/" })`.
    - "Cancelar" vuelve atrás, o a `/dashboard` si no hay historial.
26. R26 — Aplicar preferencias:
    - **Tema:**
      - El script en línea de `app/layout.tsx` (D21) aplica la clase `dark` antes de pintar.
      - Al cambiar de tema en Configuración, `useUiPreferences` actualiza `localStorage` y la clase de `<html>` en el momento.
      - Con Sistema, escucha `matchMedia("(prefers-color-scheme: dark)")`.
    - **Densidad y movimiento:** `components/shared/UiPreferencesRoot.tsx` (cliente, en el layout de `/dashboard`) pone `data-density` y `data-reduce-motion` en `<html>` mientras el panel está abierto, y los quita al salir, para que los menús y tooltips en portales también los reciban (así se implementó en AUTH-2.1; ver su evidencia).
27. R27 — `parseUiPreferences(raw: unknown): UiPreferences` en `modules/account/utils/uiPreferences.ts`:
    - Valida lo leído de `localStorage`.
    - Ante JSON inválido o valores desconocidos, devuelve los valores por defecto: Sistema, Cómoda, sin reducir movimiento.
    - El script en línea aplica la misma regla: solo reconoce `"light"`, `"dark"` y `"system"`, y si no puede leer, usa Sistema.
28. R28 — Autorización intacta:
    - Cada página nueva llama a `requirePermission("dashboard:view")` en el servidor.
    - El menú y el sidebar no autorizan nada (D14).
    - AUTH-2.1 no hace ninguna escritura en Clerk ni en Neon (D23).
29. R29 — Accesibilidad (spec visual):
    - Contraste ≥ 4.5:1 para texto primario y secundario.
    - Foco visible.
    - `aria-label` en los botones de solo icono.
    - Menús por teclado; Escape cierra y el foco vuelve al disparador.
    - Badges con texto.

30. R30 — Perfil `/dashboard/profile` (pantalla 08, completa; sustituye a R23 desde AUTH-2.2):
    - Encabezado sin tarjeta (D29): avatar L, nombre completo y correo principal de Clerk, y "Cambiar foto" (`openUserProfile()`).
    - **Información personal:** Nombre y Apellido de Clerk (la fila abre el modal, D24). Teléfono con su valor, o "Añadir teléfono" en `text-primary` si está vacío. Después, una fila por cada campo opcional completado, en el orden Cargo, Empresa, Cumpleaños, Sitio web, Nota personal. Al final, "+ Añadir información" en `text-primary`, solo si falta algún campo opcional.
    - **Correos:** el correo principal con una etiqueta pequeña "Principal"; los secundarios solo si existen; "Añadir correo". Sin correo principal, solo "Añadir correo". Todas las filas abren el modal de Clerk. Sin formulario propio.
    - **Seguridad:** Contraseña y Sesiones activas, que abren el modal de Clerk sin duplicar su lógica.
    - Los campos vacíos no se muestran ni ocupan espacio.
31. R31 — Añadir, editar y quitar (pantalla 19):
    - "+ Añadir información" abre un menú (`dropdown-menu`) con los campos opcionales que faltan. Elegir uno abre un diálogo (`dialog`) con un único campo, "Cancelar" y "Guardar".
    - La fila de Teléfono ("Añadir teléfono" o su valor) y cada fila opcional abren el mismo diálogo con el valor actual y, si tiene valor, la acción "Quitar".
    - Guardar un valor vacío equivale a quitarlo. Quitar el último dato deja la fila de `user_profiles` con todas sus columnas en `null`.
    - Al guardar, la fila aparece, cambia o desaparece en Información personal sin recargar la página y sin crear secciones nuevas.
    - Si falla, el diálogo sigue abierto con el error en español junto al campo y conserva lo escrito.
32. R32 — Validación (`modules/account/schemas/profile.schema.ts`), la misma en cliente y servidor; el servidor es la autoridad:
    - Entrada `{ field, value }` estricta: claves extra (por ejemplo un id de usuario) se rechazan.
    - Todos los valores se recortan; una cadena vacía es `null`.
    - Teléfono: máximo 30 caracteres; solo dígitos, espacios y `+ ( ) - .`.
    - Cargo y Empresa: máximo 100 caracteres.
    - Cumpleaños: fecha ISO `aaaa-mm-dd` válida, entre `1900-01-01` y hoy. Se edita con `<input type="date">` y se muestra en español largo ("12 de marzo de 1990").
    - Sitio web: URL `http` o `https`, máximo 200 caracteres. Se muestra como enlace con `target="_blank"` y `rel="noopener noreferrer nofollow"`.
    - Nota personal: máximo 500 caracteres, texto plano (se muestra escapado, sin HTML).
33. R33 — Acción de servidor `updateProfileFieldAction` (`modules/account/actions/profile.actions.ts`, `"use server"`):
    - Obtiene el actor con `getActor()`. Sin actor activo o sin `dashboard:view`, devuelve un error sin tocar la base.
    - Valida con R32 y escribe solo la fila de `actor.id` y solo la columna del campo elegido, con un único `insert ... on conflict (user_id) do update` atómico, sin lectura previa (ver `setOwnProfileField` en "Diseño técnico"). Dos guardados de campos distintos, por ejemplo desde dos pestañas, no se pisan.
    - Devuelve el perfil actualizado, un error de validación de R32 o un mensaje genérico. El error real se registra en el servidor y nunca llega al cliente (mismo criterio que E8).
    - No hace `revalidatePath`: el cliente usa el perfil devuelto (evita otra lectura de Clerk por D32).
34. R34 — Persistencia: migración `db/migrations/0002_user_profiles.sql` (contrato en "Contratos"), aplicada con `npm run db:migrate` por el propietario. Ningún agente la ejecuta.
35. R35 — Sincronización (D32): `syncOwnIdentity(actor)` en `lib/auth.ts`, llamada por `app/dashboard/profile/page.tsx` después de `requirePermission`. Dos sentencias `update` independientes, ambas con `where id = actor.id` y sin efecto si su valor no cambió: primero `first_name` y `last_name`, después `email`. Una violación de `unique` (código `23505`) u otro error en la del correo se registra sin deshacer la de los nombres. Nunca lanza: registra el error y devuelve.
36. R36 — Privacidad (D31): solo `modules/account/services/profile.service.ts` consulta `user_profiles`, y siempre filtrado por el id del actor. Ningún otro archivo, ni AUTH-3, lo lee.
37. R37 — Diseño y accesibilidad del perfil:
    - Tokens y estilo de la spec visual (D17, D20, D33): fondo `--muted`, tres grupos con `rounded-xl` y `shadow-card`, separadores `divide-y` con `--border`, filas de 44 px, acciones secundarias en `text-primary`.
    - Filas como `<button>` con nombre accesible y anillo de foco; el diálogo atrapa el foco, Escape lo cierra y el foco vuelve a la fila.
    - El campo del diálogo tiene `<label>` visible y su error está asociado con `aria-describedby`.
    - Sin desbordes desde 375 px de ancho; los valores largos se truncan en la fila y se ven completos en el diálogo.

38. R38 — Ruta y navegación (D12, D39):
    - `app/dashboard/users/page.tsx` (Server Component) llama a `requirePermission("dashboard:view")`. Sin `users:manage`, muestra `UsersNoAccess` (pantalla 11) sin consultar más datos. Con permiso, valida los parámetros de URL (R39), llama a `listUsers(actor, query)` y a `getClerkActivity(listing.clerkUserIds)`, y renderiza `UsersView` solo con `listing.page`, `query` y la actividad, nunca con `clerkUserIds` (D38).
    - `NAV_ITEMS` añade, después de "Inicio", `{ title: "Usuarios", href: "/dashboard/users", icon: Users, permission: "users:manage" }`. El sidebar sigue sin autorizar nada (D14).
39. R39 — Lista (pantallas 01, 07 y 15, D35):
    - Parámetros: `q` (texto recortado, máximo 100 caracteres), `status` (`all`, `active`, `revoked`, `invited`), `role` (`all`, `user`, `admin`, `superadmin`), `sort` (`name`, `-name`, `email`, `-created`) y `page` (entero desde 1). Cada valor inválido o ausente usa su valor por defecto (`""`, `all`, `all`, `name`, `1`). Si `page` pasa de la última página, se muestra la última.
    - `listUsers` ejecuta una sola sentencia parametrizada sobre `app_users` (ver "Diseño técnico"). Esa sentencia calcula el total con `count(*)` sobre el conjunto filtrado, antes de paginar, y recorta la página pedida a la última válida, así que el total no se pierde aunque la página pedida esté fuera de rango. Con total 0 devuelve página 1 sin filas. El `order by` sale de un mapa cerrado `Record<SortKey, …>` de fragmentos SQL escritos a mano; ningún texto de la entrada llega al SQL fuera de los parámetros.
    - Cabecera: título "Usuarios" y, debajo, "<total> usuarios" (superadmin) o "Puedes gestionar a quienes tienen rol Usuario" (admin). Botón "Invitar usuario".
    - Barra: buscador, control segmentado de estado (`toggle-group`), "Rol" (`select`) y "Ordenar" (`select`). Cada cambio actualiza la URL con `router.replace` y vuelve a la página 1.
    - Tabla (`table` en tarjeta): Nombre (avatar, nombre completo o correo, y el correo debajo), Rol, Estado (`badge`: Activo, Inactivo, Invitado) y Último acceso (fecha relativa en español, o "—"). En cada fila, "Ver" (ojo) abre el detalle, y "…" abre las acciones si el actor tiene alguna sobre ella; si no, el hueco se conserva.
    - Sin resultados con búsqueda o filtros: "Sin resultados para “<q>”" (o "Sin resultados" sin búsqueda), una ayuda y "Quitar filtros", que vuelve a `/dashboard/users`.
    - Paginación: "<desde>–<hasta> de <total> usuarios", "Página <p> de <n>", y anterior y siguiente desactivados en los extremos.
40. R40 — Acciones de fila (pantallas 03 y 16, D37), según `rowActions(actor, fila)`:
    - "Ver detalles", siempre.
    - "Cambiar rol": solo superadmin, sobre filas `user` o `admin` que no están `revoked`.
    - "Inactivar": filas `active` o `invited` que el actor gestiona.
    - "Activar": filas `revoked` con `clerk_user_id` que el actor gestiona.
    - "Reenviar invitación": filas `invited` que el actor gestiona.
    - Nunca sobre la propia fila ni sobre filas `superadmin`. El servidor repite todas estas comprobaciones (R47).
41. R41 — Detalle (pantalla 12, `sheet` de 420 px a la derecha):
    - Avatar L, nombre, correo, rol y estado.
    - CUENTA: Nombre, Apellido, Correo y Rol, en solo lectura, con la nota "Por seguridad, solo <nombre> puede cambiar su nombre, su correo o su contraseña desde su perfil."
    - ACTIVIDAD: Alta (`created_at`, fecha larga en español), Último acceso y Sesiones activas. Las sesiones se piden al abrir el detalle con `getUserSessionsAction`; mientras cargan se ve un `skeleton`, y sin dato, "—".
    - Pie: "Cerrar" y, si el actor puede, "Cambiar rol".
    - Nada de `user_profiles` (R36).
42. R42 — Invitar (pantalla 04, `dialog` de 440 px):
    - Correo (enfocado al abrir) y Rol (`select` con los roles asignables del actor; para un admin solo "Usuario"), la nota "Solo un superadmin puede invitar administradores." y "Cancelar" · "Enviar invitación".
    - Validación (cliente y servidor, el servidor manda): correo válido, recortado y en minúsculas, de 254 caracteres como máximo, y rol entre los asignables.
    - Service `inviteUser(actor, input, redirectUrl)`:
      1. Comprueba `users:manage` y que `canManageRole(actor.role, input.role)`.
      2. Busca la fila por correo. Si está `invited`: "Ya tiene una invitación pendiente. Usa Reenviar invitación." Si está `active`: "Esa persona ya tiene acceso." Si está `revoked`: "Ese correo fue inactivado y no puede invitarse de nuevo." (R11). En los tres casos no llama a Clerk.
      3. Crea la invitación en Clerk (D40).
      4. `insert into app_users (email, role, status, invitation_id) values (…, 'invited', …) on conflict (email) do nothing returning id`. Sin fila devuelta (otra petición la creó a la vez): revoca la invitación recién creada, registra el fallo de esa revocación si lo hay, y devuelve "Ese correo ya está registrado."
    - Si Clerk falla en el paso 3, la base no cambia.
43. R43 — Cambiar rol (pantallas 05 y 14, solo superadmin):
    - `dialog` con avatar, nombre y correo en solo lectura, y Rol (`select`): "Usuario · Acceso básico al panel", "Administrador · Gestiona usuarios" y "Superadmin · No se asigna desde el panel" (desactivado). "Cancelar" · "Guardar cambios".
    - Service `changeUserRole(actor, { id, role })`, con `role` en `user` o `admin`: una sentencia `update app_users set role = $role, updated_at = now() where id = $id and id <> $actorId and role in ('user', 'admin') and status <> 'revoked' and role is distinct from $role` con la cláusula de R12. Solo si `actor.role = 'superadmin'`. Cero filas: "No se pudo cambiar el rol. Recarga la página."
44. R44 — Inactivar (confirmación con `alert-dialog` de 340 px, mismo estilo que la pantalla 06):
    - Activo: "¿Inactivar a <nombre>?" y "Perderá el acceso en su próxima acción. Podrás activarlo de nuevo."
    - Invitado: "¿Revocar la invitación de <correo>?" y "La invitación dejará de funcionar y no podrá reactivarse."
    - "Cancelar" · "Inactivar" (destructivo).
    - Service `revokeUser(actor, { id })`:
      1. Lee la fila y guarda su `status` como `$estadoLeído` y su `invitation_id` como `$anterior`.
      2. Si está `invited` con `invitation_id`, revoca la invitación `$anterior` en Clerk. Un 404 o "ya revocada" cuenta como hecho; cualquier otro error aborta sin tocar la base (R6, E7).
      3. Una sentencia `update app_users set status = 'revoked', updated_at = now() where id = $id and status = $estadoLeído and invitation_id is not distinct from $anterior and id <> $actorId and role = any($rolesGestionables)`, con la cláusula de R12. En una fila `active` la condición sobre `invitation_id` no cambia nada, porque solo Reenviar lo modifica, y solo en filas `invited`.
      4. Cero filas, porque otra operación cambió el estado o la invitación mientras tanto (por ejemplo, un Reenviar que ya sustituyó la invitación): no sobrescribe nada y devuelve "El usuario cambió mientras tanto. Recarga la página." La fila queda `invited` con la invitación nueva de Reenviar, que sigue válida, y se puede volver a inactivar.
    - Concurrencia con Reenviar (R46): gana el primer `update` que se confirma. Si gana Inactivar, el `update` de Reenviar no encuentra `status = 'invited'` y revoca su invitación nueva. Si gana Reenviar, el `update` de Inactivar no encuentra el `invitation_id` que leyó. En ningún caso queda una fila `revoked` con una invitación válida en Clerk.
45. R45 — Activar (D36):
    - Sin confirmación: la acción del menú activa y muestra el resultado.
    - Service `activateUser(actor, { id })`: una sola sentencia `update app_users set status = 'active', updated_at = now() where id = $id and status = 'revoked' and clerk_user_id is not null and id <> $actorId and role = any($rolesGestionables) returning id`. No llama a Clerk. Cero filas: "Solo se puede activar a quien ya había entrado al panel."
46. R46 — Reenviar invitación (D40):
    - Service `resendInvitation(actor, { id }, redirectUrl)`, solo para filas `invited` que el actor gestiona:
      1. Lee la fila y guarda su `invitation_id` como `$anterior`.
      2. Revoca la invitación `$anterior` (si la hay); un 404 o "ya revocada" cuenta como hecho, y otro error aborta sin cambios.
      3. Crea una invitación nueva (D40).
      4. `update app_users set invitation_id = $nueva, updated_at = now() where id = $id and status = 'invited' and invitation_id is not distinct from $anterior returning id`.
      5. Sin fila devuelta, porque otra operación cambió el estado o la invitación mientras tanto (por ejemplo, dos reenvíos a la vez o un inactivar): revoca la invitación nueva de esta petición, registra el fallo de esa revocación si lo hay, no hace ninguna otra escritura y devuelve "El usuario cambió mientras tanto. Recarga la página."
    - Si el paso 3 falla, la fila conserva su `invitation_id` ya revocado y reenviar de nuevo funciona: el paso 2 dará 404.
    - Con dos reenvíos a la vez, solo el primero que escribe gana. El otro encuentra un `invitation_id` distinto del que leyó y revoca su propia invitación nueva, así que la fila nunca apunta a una invitación revocada mientras otra válida queda huérfana.
47. R47 — Acciones de servidor (`modules/users/actions/users.actions.ts`, `"use server"`):
    - Cada una obtiene el actor con `getActor()`. Sin actor activo o sin `users:manage`, devuelve el mensaje genérico sin tocar la base ni Clerk.
    - Valida su entrada con un esquema zod estricto: claves extra rechazadas y `id` como UUID.
    - Llama al service, que repite las comprobaciones de permisos y de matriz (R5).
    - Si sale bien, hace `revalidatePath("/dashboard/users")`. Devuelve el mensaje de `UsersError` o el genérico, y registra el error real con `code` y `message` (D42).
48. R48 — Privacidad y escrituras:
    - AUTH-3 no lee `user_profiles` (R36).
    - Las únicas escrituras en `app_users` son las de R42 a R46, y solo sobre `role`, `status`, `invitation_id` y `updated_at`, más el `insert` de una invitación nueva. Nunca `first_name`, `last_name`, `email` ni `clerk_user_id` de otra fila.
    - En Clerk, las únicas escrituras son `invitations.createInvitation` e `invitations.revokeInvitation`, y las únicas lecturas, `users.getUserList` y `sessions.getSessionList` (D38).
    - Ninguna sentencia `delete`.
49. R49 — Diseño y accesibilidad:
    - Tokens y estilo de la spec visual (D17, D20, D33), en los dos temas, sin colores sueltos (mismo criterio que CA-27).
    - Botones de solo icono ("Ver", "Más acciones") con `aria-label`. Badges con texto.
    - Menús y diálogos por teclado: Escape cierra y el foco vuelve al disparador; los diálogos atrapan el foco.
    - Desde 375 px de ancho, la tabla se desplaza en horizontal dentro de su tarjeta, sin desbordar la página.

## Contratos

Variables de entorno (`.env.example`, valores en `.env.local` del usuario):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — instancia de desarrollo de Clerk.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.
- `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migraciones) — rama de desarrollo de Neon.

Tabla `app_users` (`db/migrations/0001_app_users.sql`):
- `id uuid pk default gen_random_uuid()`, `clerk_user_id text unique null`, `email text not null unique check (email = lower(email))`, `first_name text`, `last_name text`, `role text not null default 'user' check (role in ('user','admin','superadmin'))`, `status text not null default 'invited' check (status in ('invited','active','revoked'))`, `invitation_id text unique null`, `created_at`, `updated_at timestamptz not null default now()`.
- `schema_migrations(name text primary key, applied_at timestamptz not null default now())`, creada por el runner.

Tabla `user_profiles` (AUTH-2.2, `db/migrations/0002_user_profiles.sql`):

```sql
create table user_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  phone text check (char_length(phone) <= 30),
  job_title text check (char_length(job_title) <= 100),
  company text check (char_length(company) <= 100),
  birthday date check (birthday >= date '1900-01-01'),
  website text check (char_length(website) <= 200),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
```

`on delete cascade` no se usa en la práctica (D10 no borra filas de `app_users`); solo evita filas huérfanas.

Módulo `modules/account` (AUTH-2.2):
- `schemas/profile.schema.ts`: `PROFILE_FIELD_KEYS` (`phone`, `jobTitle`, `company`, `birthday`, `website`, `note`), `profileSchema` (los seis campos, `string | null`) y `profileFieldInputSchema` (R32).
- `types/profile.types.ts`: `Profile`, `ProfileFieldKey` y `ProfileFieldInput`, con `z.infer`. `ProfileActionResult = { ok: true; profile: Profile } | { ok: false; error: string }`.
- `utils/profileFields.ts`: etiquetas en español, orden de R30 y `formatProfileValue(key, value)` (fecha larga en español para `birthday`).
- `services/profile.service.ts` (`server-only`): `getOwnProfile(userId: string): Promise<Profile>` (todo `null` si no hay fila) y `setOwnProfileField(userId: string, field: ProfileFieldKey, value: string | null): Promise<Profile>`. `setOwnProfileField` elige la sentencia en un mapa cerrado `Record<ProfileFieldKey, …>` con una sentencia SQL escrita a mano por campo; ningún nombre de columna sale de la entrada y una clave fuera del mapa lanza un error sin tocar la base.
- `server.ts` (`server-only`): exporta `getOwnProfile` para las páginas. `index.ts` sigue siendo seguro para el cliente y no lo reexporta.
- `actions/profile.actions.ts` (`"use server"`): `updateProfileFieldAction(input: unknown): Promise<ProfileActionResult>` (R33).
- `components/ProfileView.tsx` (`ProfileView({ profile }: { profile: Profile })`) y `components/ProfileFieldDialog.tsx`.

`lib/auth.ts` (AUTH-2.2): `syncOwnIdentity(actor: Actor): Promise<void>` (R35). `Actor`, `getActor` y `requirePermission` no cambian de firma.

`lib/roles.ts`:
- `ROLES`, `Role`, `ROLE_LABELS`, `PERMISSIONS: Record<Permission, readonly Role[]>`, `Permission = "dashboard:view" | "users:manage"`.
- `parseRole(value: unknown): Role | null`, `can(role: Role | null, permission: Permission): boolean`, `canManageRole(actor: Role, target: Role): boolean`.

`lib/auth.ts` (`server-only`):
- `type Actor = { id: string; clerkUserId: string; email: string; role: Role }`.
- `getActor(): Promise<Actor | null>` (R2).
- `requirePermission(permission): Promise<Actor>` — sin sesión: `redirect("/sign-in")`; sin permiso o sin fila: `redirect("/")`.

`lib/navigation.ts` (AUTH-2, sin `server-only`: lo usa el sidebar en el cliente):
- `APP_NAME: string` — nombre visible genérico del panel (R9).
- `type NavItem = { title: string; href: string; icon: LucideIcon; permission?: Permission }`.
- `NAV_ITEMS: readonly NavItem[]` — en AUTH-2 solo `{ title: "Inicio", href: "/dashboard", icon: LayoutDashboard }`.
- `visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[]` (R14).

`components/shared/AppSidebar.tsx` (AUTH-2, `"use client"`): `AppSidebar({ role }: { role: Role })`.

Módulo `modules/users` (AUTH-3):
- `schemas/users.schema.ts`:
  - `usersQuerySchema`: parámetros de R39 con sus valores por defecto; nunca falla.
  - `inviteInputSchema`, `roleInputSchema` (`role` solo `user` o `admin`) e `idInputSchema` (`id` UUID), todos `z.strictObject`.
- `types/users.types.ts`:
  - `UserStatus`, `SortKey`, `UsersQuery`.
  - `UserRow = { id; email; firstName; lastName; role: Role; status: UserStatus; linked: boolean; createdAt: string }`, sin ningún id de Clerk.
  - `UsersPage = { rows: UserRow[]; total: number; page: number; pageCount: number }`.
  - `ClerkActivity = Record<string, { lastSignInAt: number | null; imageUrl: string | null }>`, con clave el id de la fila.
  - `ActionResult = { ok: true } | { ok: false; error: string }`.
  - `SessionsResult = { ok: true; activeSessions: number | null } | { ok: false; error: string }`.
- `utils/userPermissions.ts` (sin `server-only`, lo usan la UI y el service):
  - `assignableRoles(actorRole: Role): Role[]`.
  - `rowActions(actor: { id: string; role: Role }, row: UserRow): { changeRole: boolean; revoke: boolean; activate: boolean; resend: boolean }`, según R40 y D37.
- `services/users.service.ts` (`server-only`):
  - `UsersError`.
  - `type UsersListing = { page: UsersPage; clerkUserIds: Record<string, string> }`, declarado y usado solo en el servidor. `clerkUserIds` asocia el id de cada fila vinculada de la página con su `clerk_user_id`.
  - `listUsers(actor, query): Promise<UsersListing>`.
  - `getClerkActivity(clerkUserIds: Record<string, string>): Promise<ClerkActivity>`:
    - Sin ids, no llama a Clerk y devuelve `{}`.
    - Con ids, hace una sola llamada `getUserList({ userId: Object.values(clerkUserIds), limit })` y devuelve la actividad con clave el id de la fila.
    - Si falla, devuelve `{}`.
  - `countActiveSessions` lee el `clerk_user_id` de la fila por su `id` en el servidor; el cliente solo envía el `id` de la fila.
  - `inviteUser(actor, input, redirectUrl)`, `changeUserRole(actor, input)`, `revokeUser(actor, input)`, `activateUser(actor, input)` y `resendInvitation(actor, input, redirectUrl)`, todas `Promise<void>`.
  - `countActiveSessions(actor, input): Promise<number | null>`.
  - Cada una comprueba `users:manage` y la matriz.
- `server.ts` (`server-only`): exporta `listUsers` y `getClerkActivity` para la página. `index.ts` es seguro para el cliente: exporta `UsersView` y `UsersNoAccess`.
- `actions/users.actions.ts` (`"use server"`), todas `(input: unknown) => Promise<ActionResult>` salvo la última:
  - `inviteUserAction({ email, role })`, `updateUserRoleAction({ id, role })`, `revokeUserAction({ id })`, `activateUserAction({ id })`, `resendInvitationAction({ id })`.
  - `getUserSessionsAction({ id }): Promise<SessionsResult>`.
- Componentes (cliente):
  - `UsersView({ actor: { id; role }, page: UsersPage, query: UsersQuery, activity: ClerkActivity })`, con la barra, la tabla, la paginación y el menú de fila.
  - `InviteUserDialog`, `ChangeRoleDialog`, `UserDetailSheet` y `UsersNoAccess`.

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
- AUTH-2 no escribe en Neon ni cambia Clerk: su única lectura de datos es la de `requirePermission`. El filtro del sidebar no es un control de acceso (D14).
- `app/error.tsx` no expone mensajes internos (mismo criterio que E8).

- AUTH-2.1 no escribe en Neon ni en Clerk. La autorización sigue siendo `requirePermission` en el servidor contra `app_users` (D11).
- `localStorage` es una entrada no confiable: se valida (R27) y solo controla la presentación.
- El script de tema de `app/layout.tsx` es una cadena estática, sin interpolar datos de usuario ni del servidor. Solo lee una clave de `localStorage` y añade o quita la clase `dark`. Si algún día se activa una CSP, necesitará un nonce o un hash.
- Los datos personales de Clerk (nombre, correo, foto) se muestran solo a su dueño.

- AUTH-2.2 escribe solo la fila propia: `user_profiles` por `actor.id` (R33) y las columnas `first_name`, `last_name`, `email` y `updated_at` de `app_users` por `actor.id` (R35). Nunca cambia `role`, `status`, `clerk_user_id` ni `invitation_id`.
- La acción de servidor es un punto de entrada público: comprueba sesión, fila activa y permiso en cada llamada, valida con zod estricto e ignora cualquier id del cliente (R33).
- `app_users.email` solo toma el correo principal **verificado** de Clerk. Un correo ya usado por otra fila no se sobrescribe (D32), así que nadie puede quedarse con la fila de otra persona cambiando su correo en Clerk.
- Sitio web: solo `http` y `https`, para evitar enlaces `javascript:`; se abre con `noopener noreferrer nofollow`. La nota se muestra como texto.
- Los datos de `user_profiles` son privados del dueño (D31) y no aparecen en registros del servidor: los errores se registran sin los valores.

- AUTH-3: cada acción es un punto de entrada público. Comprueba sesión, fila activa y `users:manage` en cada llamada, valida con zod estricto, y el service repite la matriz de D37 contra el rol leído de `app_users` en esa petición (D11). La UI solo oculta.
- Las condiciones que importan van dentro de la sentencia SQL, no solo en código previo, para que una carrera no las salte: estado esperado, `id <> actor`, roles gestionables, `clerk_user_id is not null` al activar y la cláusula de R12.
- Sin borrado físico en Neon ni en Clerk (D10). En Clerk solo se crean y revocan invitaciones (R48).
- El `redirectUrl` de las invitaciones sale de la cabecera `Origin` validada, que Next compara con `Host` en las acciones; nunca de un campo del formulario (D40).
- "Último acceso", la foto y las sesiones se muestran solo a quien tiene `users:manage`. Los registros del servidor no incluyen correos (D42).

## Recuperación

- AUTH-1: integrada en `main` por el merge `0cfcd4a` (PR #4, commit `13b9cd7` de `feat/auth-clerk-neon`). Deshacerla en `main` exige revertir ese merge (`git revert -m 1 0cfcd4a`) con una orden expresa del usuario. AUTH-2 no la toca.
- Base de datos (solo rama de desarrollo de Neon, con orden expresa): `drop table app_users; delete from schema_migrations where name = '0001_app_users.sql';`. Alternativa sin pérdida: restaurar la rama de Neon a un punto anterior.
- Clerk: instancia de desarrollo; los usuarios de prueba se borran desde su dashboard.
- AUTH-2: integrada en `main` por el merge `fc97323` (PR #5, commit `8a3a8b2`). Deshacerla exige `git revert -m 1 fc97323` con una orden expresa del usuario. No hay cambios en Neon ni en Clerk que deshacer.
- AUTH-2.1: integrada en `main` por el merge `18a2414` (PR #8, commit `131c481`). Deshacerla exige `git revert -m 1 18a2414` con una orden expresa del usuario. Las preferencias en `localStorage` se borran desde el navegador. No hay cambios en Neon ni en Clerk que deshacer.
- AUTH-3: parte de `6885cc1` y vive en `feat/auth-users`. Para descartar el código antes de integrarlo: `git worktree remove C:/Users/ronal/template-v2-users` y `git branch -D feat/auth-users` desde `C:/Users/ronal/template-v2-pro`. No cambia el esquema. Los datos de prueba (filas `invited`, cambios de rol o estado) se corrigen en la rama de desarrollo de Neon con una orden expresa, y las invitaciones de prueba se revocan desde el dashboard de Clerk de desarrollo.
- AUTH-2.2: integrada en `main` por el merge `ca27a9b` (PR #9, commit `2cdf786`). CONTACT-1 (`6885cc1`) depende de ella, así que deshacerla exige revertir antes CONTACT-1, con una orden expresa del usuario. Base de datos (solo rama de desarrollo de Neon, con orden expresa): `drop table user_profiles; delete from schema_migrations where name in ('0002_user_profiles.sql', '0003_user_profiles_phone_type.sql');` (la `0003` es de CONTACT-1), o restaurar la rama de Neon a un punto anterior. Los nombres y correos copiados a `app_users` no necesitan deshacerse: Clerk sigue siendo su fuente (D11) y AUTH-2.1 no los usa.

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
- [ ] CA-9 — Ninguna cadena "MADRE" ni "Centro Psicológico" en el código nuevo o modificado de la fase. Se excluye `docs/`, que cita estas cadenas al describir el respaldo (E10). Verificación, con `<base>` = base de la fase (`18e3dc6` en AUTH-1, `0cfcd4a` en AUTH-2) incluyendo archivos sin seguimiento y sin tocar el índice: `{ git diff --name-only <base> -- . ':(exclude)docs'; git ls-files -o --exclude-standard -- . ':(exclude)docs'; } | sort -u | xargs -r grep -s -n -E "MADRE|Centro Psicológico" --` sin salida. Aplica a cada fase.
- [ ] CA-10 — `npx vitest run`, `npm run lint` y `npm run build` sin errores; `npx vitest run .claude/hooks` sigue pasando.

### AUTH-2

Automáticos (Reviewer):

- [ ] CA-12 — Tests de `lib/navigation.ts` con ítems de prueba: un ítem sin `permission` es visible para los tres roles; uno con `users:manage` se oculta a `user` y se muestra a `admin` y `superadmin`; se conserva el orden; `NAV_ITEMS` no contiene `/dashboard/users` (D12).
- [ ] CA-20 — `app/dashboard/layout.tsx` y `app/dashboard/page.tsx` llaman a `requirePermission("dashboard:view")` antes de renderizar (R13); `AppSidebar` no decide acceso, solo filtra (D14). Verificación: lectura del código.
- [ ] CA-21 — `app/dashboard/loading.tsx` tiene `role="status"` y texto; `app/error.tsx` es Client Component, no renderiza `error.message` ni la pila y ofrece reintentar (R16, R17). Verificación: lectura del código.
- [ ] CA-22 — Alcance cerrado de archivos (D15, R18). Todo cambio respecto a `0cfcd4a` (modificado, añadido, eliminado, renombrado o nuevo sin seguimiento) debe estar en esta lista de rutas permitidas. Cualquier otra ruta es FAIL y detiene la implementación. Esto incluye sobrescribir un archivo existente (por ejemplo `components/ui/button.tsx`) y cualquier cambio en `components.json`, `tsconfig.json`, `package.json`, `package-lock.json`, `app/globals.css`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore`, `.env.example` o los archivos de AUTH-1. Estar dentro de `components/ui/` o `hooks/` no autoriza nada: solo valen las rutas listadas.

  Rutas permitidas en AUTH-2. Ninguna de código existe en `0cfcd4a`, así que todas deben aparecer como nuevas:
  - T6, generadas por `npx shadcn@latest add sidebar badge` sin `--overwrite` y sin ediciones manuales (registro `base-nova`, consultado el 2026-11-07: `sidebar` depende de `button`, `input`, `separator`, `sheet`, `skeleton`, `tooltip` y `use-mobile`; ninguno añade dependencias npm, `cssVars` ni `css`): `components/ui/sidebar.tsx`, `components/ui/badge.tsx`, `components/ui/input.tsx`, `components/ui/separator.tsx`, `components/ui/sheet.tsx`, `components/ui/skeleton.tsx`, `components/ui/tooltip.tsx`.
  - T6, generada por shadcn (mismo comando) y después editada a mano según D16: `hooks/use-mobile.ts`.
  - T6, escritas a mano: `lib/navigation.ts`, `lib/navigation.test.ts`.
  - T7: `components/shared/AppSidebar.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/loading.tsx`, `app/error.tsx`.
  - Flujo SDD, no código: `docs/specs/auth-clerk-neon.md` (esta spec, el `Estado` que cambia el hook y las casillas de T6 a T8), `docs/specs/auth-clerk-neon.md.sig` (firma del usuario), `docs/specs/approvals.jsonl` (línea que añade el hook) y `docs/evidence/auth-dashboard.md` (solo con orden del usuario).

  Verificación en Git Bash, desde la raíz del worktree. PASS = sin salida; cada línea impresa es una ruta fuera de alcance:

  ```sh
  { git diff --name-only --no-renames 0cfcd4a; git ls-files -o --exclude-standard; } | sort -u | grep -v -x -F \
    -e components/ui/sidebar.tsx -e components/ui/badge.tsx -e components/ui/input.tsx -e components/ui/separator.tsx \
    -e components/ui/sheet.tsx -e components/ui/skeleton.tsx -e components/ui/tooltip.tsx -e hooks/use-mobile.ts \
    -e lib/navigation.ts -e lib/navigation.test.ts -e components/shared/AppSidebar.tsx \
    -e app/dashboard/layout.tsx -e app/dashboard/page.tsx -e app/dashboard/loading.tsx -e app/error.tsx \
    -e docs/specs/auth-clerk-neon.md -e docs/specs/auth-clerk-neon.md.sig -e docs/specs/approvals.jsonl \
    -e docs/evidence/auth-dashboard.md
  ```

  `git diff --name-only --no-renames 0cfcd4a` compara el árbol de trabajo (cambios preparados y sin preparar) con la base y lista modificados, añadidos y eliminados, con las dos rutas de cada renombrado. `git ls-files -o --exclude-standard` añade los archivos nuevos sin seguimiento. `node_modules/`, `.next/`, `next-env.d.ts` y `*.tsbuildinfo` quedan fuera porque `.gitignore` los ignora. Se ejecuta al terminar T6, al terminar T7 y en T8. Si el registro de shadcn genera otra ruta, el resultado es FAIL: la lista solo se amplía editando esta spec y aprobándola de nuevo.
- [ ] CA-9 y CA-10 sobre AUTH-2 (base `0cfcd4a`).

Manuales (usuario, claves de desarrollo, sin escribir en Neon ni en Clerk):

- [ ] CA-11 — Dado un actor `user` activo, cuando entra a `/dashboard`, entonces ve el shell: sidebar con "Inicio" activo y su rol "Usuario" en el pie, cabecera con el nombre del panel y `UserButton`, y ningún ítem "Usuarios". Dado un `superadmin` (o `admin`) activo, ve el mismo shell con su rol. En móvil el sidebar se abre con el botón de la cabecera.
- [ ] CA-23 — Dado un usuario sin sesión, cuando visita `/dashboard`, entonces llega a `/sign-in`.
- [ ] CA-24 — Dada una cuenta de Clerk sin fila `active` (la de CA-8b, o la fila `revoked` de CA-8c si tiene cuenta), cuando visita `/dashboard`, entonces llega a `/` con el aviso "Tu cuenta no tiene acceso" y no ve nada del shell.

### AUTH-2.1

Automáticos (Reviewer):
- [ ] CA-25 — Tokens y fuente fieles a la spec:
  - Cada variable de `:root` y de `.dark` en `app/globals.css` tiene el valor de los bloques CSS de la spec visual, incluidos los 8 tokens nuevos.
  - `@theme inline` expone los nuevos como `--color-*` y define `--font-sans` según D20b.
  - `app/layout.tsx` solo cambia `Geist` → `Inter` (`--font-inter`), el script de tema y `suppressHydrationWarning` en `<html>`.
  - Verificación: lectura y diff contra `a8494b6`.
- [ ] CA-26 — Tests de `modules/account/utils/uiPreferences.test.ts`:
  - Un valor válido de tema, densidad y movimiento se conserva.
  - JSON inválido, `null`, tipos erróneos y valores desconocidos devuelven los valores por defecto.
  - Las claves extra se ignoran.
- [ ] CA-27 — Sin colores sueltos (`#…`, `rgb(…)` ni clases de color de Tailwind fuera de los tokens) en los archivos nuevos o modificados, salvo `app/globals.css`.
- [ ] CA-28 — Sin escrituras ni modelos nuevos:
  - No hay `"use server"` ni llamadas a `sql`, `updateUser` o `users.` del backend de Clerk en los archivos del alcance.
  - Cada `page.tsx` nueva llama a `requirePermission("dashboard:view")`.
- [ ] CA-29 — Alcance cerrado de archivos respecto a `a8494b6`, con el mismo método que CA-22 (`git diff --name-only --no-renames a8494b6` + `git ls-files -o --exclude-standard`, y FAIL si aparece alguna ruta no listada). Rutas permitidas:
  - shadcn (`npx shadcn@latest add avatar dropdown-menu switch toggle-group label card`, sin `--overwrite` ni ediciones manuales; registro `base-nova` consultado el 2026-11-07: solo `toggle-group` arrastra `toggle`, ninguno añade dependencias npm ni CSS):
    - `components/ui/avatar.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/switch.tsx`
    - `components/ui/toggle-group.tsx`, `components/ui/toggle.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`
  - Tokens y fuente: `app/globals.css`, `app/layout.tsx` (solo los cambios de CA-25).
  - Shell: `components/shared/AppSidebar.tsx`, `components/shared/NavUser.tsx`, `components/shared/UserAvatar.tsx`, `components/shared/UiPreferencesRoot.tsx`.
  - Módulo:
    - `modules/account/utils/uiPreferences.ts`, `modules/account/utils/uiPreferences.test.ts`
    - `modules/account/hooks/useUiPreferences.ts`
    - `modules/account/components/AccountSummary.tsx`, `modules/account/components/ProfileView.tsx`, `modules/account/components/SettingsView.tsx`, `modules/account/components/SignOutCard.tsx`
    - `modules/account/index.ts`
  - Rutas: `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/profile/page.tsx`, `app/dashboard/settings/page.tsx`, `app/dashboard/sign-out/page.tsx`.
  - Flujo SDD:
    - `docs/specs/auth-clerk-neon.md`, `docs/specs/auth-clerk-neon.md.sig`, `docs/specs/approvals.jsonl`
    - `docs/evidence/auth-dashboard-design.md` (solo con orden del usuario)

  `docs/specs/users-management-design.md` ya está en la base (PR #6, D18) y no se modifica en AUTH-2.1. Verificación en Git Bash desde la raíz del worktree. PASS = sin salida; cada línea impresa es una ruta fuera de alcance:

  ```sh
  { git diff --name-only --no-renames a8494b6; git ls-files -o --exclude-standard; } | sort -u | grep -v -x -F \
    -e components/ui/avatar.tsx -e components/ui/dropdown-menu.tsx -e components/ui/switch.tsx \
    -e components/ui/toggle-group.tsx -e components/ui/toggle.tsx -e components/ui/label.tsx -e components/ui/card.tsx \
    -e app/globals.css -e app/layout.tsx \
    -e components/shared/AppSidebar.tsx -e components/shared/NavUser.tsx -e components/shared/UserAvatar.tsx \
    -e components/shared/UiPreferencesRoot.tsx \
    -e modules/account/utils/uiPreferences.ts -e modules/account/utils/uiPreferences.test.ts \
    -e modules/account/hooks/useUiPreferences.ts -e modules/account/components/AccountSummary.tsx \
    -e modules/account/components/ProfileView.tsx -e modules/account/components/SettingsView.tsx \
    -e modules/account/components/SignOutCard.tsx -e modules/account/index.ts \
    -e app/dashboard/layout.tsx -e app/dashboard/page.tsx -e app/dashboard/profile/page.tsx \
    -e app/dashboard/settings/page.tsx -e app/dashboard/sign-out/page.tsx \
    -e docs/specs/auth-clerk-neon.md -e docs/specs/auth-clerk-neon.md.sig -e docs/specs/approvals.jsonl \
    -e docs/evidence/auth-dashboard-design.md
  ```

  Se ejecuta al terminar T9, T10 y T11, y en T12. Si el registro de shadcn genera otra ruta, el resultado es FAIL: la lista solo se amplía editando esta spec y aprobándola de nuevo.
- [ ] CA-9 y CA-10 sobre AUTH-2.1 (base `a8494b6`).

Manuales (usuario, claves de desarrollo, sin escribir en Neon):
- [ ] CA-30 — Shell y menú:
  - Expandido se ven el logo, "Panel", los ítems y abajo el avatar con nombre y correo.
  - Al contraerlo a 64 px quedan el logo, los iconos con tooltip y el avatar.
  - El menú del usuario abre Ver perfil, Configuración y Cerrar sesión, y cada opción navega a su página.
  - En móvil el sidebar se abre con el botón de la barra.
- [ ] CA-31 — Inicio y perfil:
  - "Hola" con el nombre de Clerk.
  - Rol y estado coinciden con `app_users`.
  - El perfil no tiene formularios propios de edición ni muestra campos opcionales.
  - Cambiar foto, Nombre/Apellido, Correos, Contraseña y Sesiones abren el modal de Clerk.
  - Un nombre cambiado en el modal aparece en el perfil, el inicio y el menú del usuario tras cerrar el modal o recargar.
  - `app_users` no cambia.
- [ ] CA-32 — Configuración y temas:
  - Claro, Oscuro y Sistema se aplican al momento con fundido, persisten tras recargar y no hay destello del tema equivocado al cargar.
  - Con Sistema, cambiar el tema del sistema operativo cambia el panel.
  - El tema elegido también se aplica en `/`, `/sign-in` y `/sign-up`.
  - Densidad y Reducir movimiento se aplican al momento y persisten en el mismo navegador.
  - Idioma y región se muestran en solo lectura.
  - En macOS o iOS el texto usa SF Pro; en Windows, Inter.
  - Contraste ≥ 4.5:1 en los dos temas para texto primario y secundario.
- [ ] CA-33 — Cerrar sesión y regresión:
  - Confirmar lleva a `/` sin sesión. Cancelar vuelve atrás sin cerrarla.
  - CA-11, CA-23 y CA-24 de AUTH-2 siguen cumpliéndose.
  - Fidelidad visual con la spec visual en las pantallas 02, 08 (parcial), 09 (parcial), 10, 13 y 17, en tema claro. El tema oscuro solo se compara con la spec, porque no tiene pantallas en Figma. Figma solo se consulta si hay dudas (D17).

### AUTH-2.2

Automáticos (Reviewer):
- [ ] CA-34 — Tests de `modules/account/schemas/profile.schema.test.ts` (R32): cada campo acepta un valor válido y lo recorta; vacío o solo espacios da `null`; rechaza teléfono con letras o de más de 30, cargo y empresa de más de 100, fecha inválida, futura o anterior a 1900, URL `javascript:`, `ftp:` o sin protocolo, nota de más de 500, un `field` desconocido y cualquier clave extra (por ejemplo `userId`).
- [ ] CA-35 — Tests de `modules/account/utils/profileFields.test.ts`: orden de R30 y `formatProfileValue` (fecha larga en español; el resto sin cambios).
- [ ] CA-36 — Tests de `modules/account/services/profile.service.test.ts` con `@/lib/db` simulado: sin fila, `getOwnProfile` devuelve todo `null`; `setOwnProfileField` ejecuta exactamente una sentencia (sin `select` previo): un upsert sobre el `userId` recibido cuyo texto SQL solo nombra la columna del campo elegido, y devuelve el perfil de su `returning`; `null` vacía la columna; para cada uno de los seis campos se usa su propia sentencia del mapa cerrado; una clave fuera del mapa lanza un error sin llamar a la base; cada consulta lleva el `userId` como parámetro.
- [ ] CA-37 — Tests de `lib/auth.test.ts` (los de CA-5 siguen pasando):
  - La vinculación de R2 copia `first_name` y `last_name`.
  - `syncOwnIdentity` actualiza nombre, apellido y correo cuando cambian, filtrando por `actor.id`.
  - Con correo principal sin verificar o sin correo principal, no cambia el correo.
  - Con el correo ya usado por otra fila, conserva el correo y actualiza el resto.
  - Caso negativo de concurrencia: si la sentencia del correo falla con `23505`, la de nombre y apellido ya se ejecutó con `actor.id`, el correo no cambia y la función no lanza.
  - Nombres y correo van en sentencias separadas: la del correo no escribe `first_name` ni `last_name`, y la de los nombres no escribe `email`.
  - Si Clerk o la base fallan, no lanza.
- [ ] CA-38 — Lectura del código:
  - `updateProfileFieldAction` llama a `getActor()`, comprueba `dashboard:view`, valida con `profileFieldInputSchema` y solo usa `actor.id` (R33).
  - `app/dashboard/profile/page.tsx` llama a `requirePermission("dashboard:view")`, después a `syncOwnIdentity` y a `getOwnProfile(actor.id)`.
  - Toda consulta SQL está parametrizada; ningún nombre de columna sale de la entrada.
- [ ] CA-39 — Privacidad (R36): `git grep -n "user_profiles" -- . ':(exclude)docs'` solo muestra `db/migrations/0002_user_profiles.sql` y `modules/account/services/profile.service.ts` (y su test).
- [ ] CA-40 — Diseño (R30, R37, D29): tres grupos sin tarjetas extra; sin la nota con candado ni iconos decorativos; chevrons solo en filas con acción; sin colores sueltos (mismo criterio que CA-27).
- [ ] CA-41 — Alcance cerrado de archivos respecto a `18a2414`, con el método de CA-22. Rutas permitidas:
  - shadcn (`npx shadcn@latest add dialog`, sin `--overwrite` ni ediciones manuales; registro `base-nova` consultado el 2026-11-08 con `--dry-run`: crea `dialog.tsx`, omite `button.tsx` por idéntico y su única dependencia, `cn`, ya está instalada): `components/ui/dialog.tsx`.
  - Datos y sesión: `db/migrations/0002_user_profiles.sql`, `lib/auth.ts`, `lib/auth.test.ts`.
  - Módulo:
    - `modules/account/schemas/profile.schema.ts`, `modules/account/schemas/profile.schema.test.ts`
    - `modules/account/types/profile.types.ts`
    - `modules/account/utils/profileFields.ts`, `modules/account/utils/profileFields.test.ts`
    - `modules/account/services/profile.service.ts`, `modules/account/services/profile.service.test.ts`
    - `modules/account/server.ts`, `modules/account/actions/profile.actions.ts`
    - `modules/account/components/ProfileView.tsx`, `modules/account/components/ProfileFieldDialog.tsx`
    - `modules/account/index.ts`
  - Ruta: `app/dashboard/profile/page.tsx`.
  - Flujo SDD:
    - `docs/specs/auth-clerk-neon.md`, `docs/specs/auth-clerk-neon.md.sig`, `docs/specs/approvals.jsonl`
    - `docs/evidence/auth-profile.md` (solo con orden del usuario)

  Verificación en Git Bash desde la raíz del worktree. PASS = sin salida:

  ```sh
  { git diff --name-only --no-renames 18a2414; git ls-files -o --exclude-standard; } | sort -u | grep -v -x -F \
    -e components/ui/dialog.tsx \
    -e db/migrations/0002_user_profiles.sql -e lib/auth.ts -e lib/auth.test.ts \
    -e modules/account/schemas/profile.schema.ts -e modules/account/schemas/profile.schema.test.ts \
    -e modules/account/types/profile.types.ts \
    -e modules/account/utils/profileFields.ts -e modules/account/utils/profileFields.test.ts \
    -e modules/account/services/profile.service.ts -e modules/account/services/profile.service.test.ts \
    -e modules/account/server.ts -e modules/account/actions/profile.actions.ts \
    -e modules/account/components/ProfileView.tsx -e modules/account/components/ProfileFieldDialog.tsx \
    -e modules/account/index.ts -e app/dashboard/profile/page.tsx \
    -e docs/specs/auth-clerk-neon.md -e docs/specs/auth-clerk-neon.md.sig -e docs/specs/approvals.jsonl \
    -e docs/evidence/auth-profile.md
  ```

  Se ejecuta al terminar T13 y T14, y en T15. Si el registro de shadcn genera otra ruta, el resultado es FAIL: la lista solo se amplía editando esta spec y aprobándola de nuevo.
- [ ] CA-9 y CA-10 sobre AUTH-2.2 (base `18a2414`).

Manuales (propietario, claves de desarrollo, rama de desarrollo de Neon):
- [ ] CA-42 — Migración: `npm run db:migrate` dos veces imprime `SKIP 0001_app_users.sql` y `OK 0002_user_profiles.sql`, y después `SKIP` para ambas.
- [ ] CA-43 — Perfil (R30, R31):
  - Encabezado con foto, nombre y correo, sin tarjeta ni rol.
  - Sin datos opcionales: Nombre, Apellido, "Añadir teléfono" y "+ Añadir información".
  - Añadir Cargo y Sitio web: aparecen como filas en Información personal; el menú deja de ofrecerlos. Recargar los conserva.
  - Editar y quitar un campo; guardar vacío lo quita. Con los cinco opcionales completos, "+ Añadir información" desaparece.
  - Un valor inválido muestra el error en el diálogo sin cerrarlo.
  - Correos: "Principal", secundarios solo si existen, "Añadir correo". Contraseña y Sesiones activas abren el modal de Clerk.
  - Teclado, foco, tema claro y oscuro, y 375 px de ancho sin desbordes.
- [ ] CA-44 — Privacidad: con otra cuenta activa, sus datos opcionales no aparecen en ninguna pantalla de la primera, y viceversa.
- [ ] CA-45 — Sincronización (D32):
  - Una invitación aceptada después de AUTH-2.2 deja nombre y apellido en `app_users` al vincular.
  - Cambiar el nombre en el modal de Clerk y volver a abrir el perfil actualiza `first_name` y `last_name` de su fila.
  - Cambiar el correo principal (verificado) actualiza `app_users.email`; `role` y `status` no cambian y el acceso se mantiene.
  - CA-30 a CA-33 de AUTH-2.1 siguen cumpliéndose, salvo el perfil, que ahora sigue R30.

### AUTH-3

Automáticos (Reviewer). Los tests del service simulan `@/lib/db` y `@clerk/nextjs/server` con `vi.mock`:
- [ ] CA-13 — Invitar (R42, D37), en `users.service.test.ts`:
  - Un admin invita a un `user`. Invitar `admin` o `superadmin` lanza `UsersError` sin llamar a Clerk ni a la base.
  - Un superadmin invita `user` o `admin`, nunca `superadmin`.
  - Con una fila `invited` o `active` para ese correo, falla sin llamar a Clerk.
  - Orden: Clerk primero, después el `insert ... on conflict (email) do nothing`. Si Clerk falla, no hay `insert`. Si el `insert` no devuelve fila, se revoca la invitación nueva.
  - La invitación usa el `redirectUrl` recibido, `notify: true` e `ignoreExisting: true`.
  - Reenviar (R46):
    - Orden: revocar la anterior, crear la nueva y después el `update`, cuyo SQL incluye `status = 'invited'` y `invitation_id is not distinct from` el id leído.
    - Si Clerk falla al crear, no hay `update`.
    - Conflicto concurrente: si el `update` no devuelve fila (la base simulada devuelve cero filas), revoca la invitación nueva creada en esa llamada, lanza `UsersError` y no hace más escrituras.
- [ ] CA-14 — Cambiar rol (R43): solo un superadmin cambia `user` ↔ `admin`. Un admin, la propia fila, una fila `superadmin` o el rol `superadmin` lanzan sin `update`. La sentencia lleva `id <> actor`, `role in ('user', 'admin')` y la cláusula de R12. Cero filas lanza `UsersError`.
- [ ] CA-15 — Inactivar (R6, R44): con una fila `invited`, revoca en Clerk antes del `update`. Un 404 o "ya revocada" de Clerk sigue adelante; otro error lanza sin `update`. Con una fila `active`, no llama a Clerk. El SQL del `update` pone `revoked` e incluye `status =` el estado leído e `invitation_id is not distinct from` el id leído. Concurrencia entre Inactivar y Reenviar: con una fila `invited` leída con la invitación X, si el `update` no devuelve fila (la base simulada simula que Reenviar ya la cambió a Y), `revokeUser` lanza "El usuario cambió mientras tanto. Recarga la página." sin más escrituras, y no se revoca ninguna invitación distinta de X. Ningún archivo de `modules/users` que no sea un test contiene `delete from`, `deleteUser` ni `deleteInvitation`.
- [ ] CA-16 — Errores (R47, D42): lectura de `users.actions.ts`. Sin actor o sin `users:manage`, devuelve el mensaje genérico sin llamar al service. Un error que no es `UsersError` devuelve el genérico. Los registros solo llevan `code` y `message`.
- [ ] CA-18 — Invitar un correo `revoked` lanza "Ese correo fue inactivado y no puede invitarse de nuevo.", sin llamar a Clerk y sin `insert` (R11).
- [ ] CA-19 — R12: las sentencias de cambiar rol, inactivar y activar contienen la cláusula del último superadmin activo; ninguna acción opera sobre filas `superadmin` (test con la base simulada que inspecciona el texto SQL).
- [ ] CA-46 — Activar (R45, D36): una sola sentencia con `status = 'revoked'`, `clerk_user_id is not null`, `id <> actor` y los roles gestionables, sin llamar a Clerk. Si no devuelve fila (por ejemplo, una invitación revocada que nunca se aceptó), lanza "Solo se puede activar a quien ya había entrado al panel." `rowActions` no ofrece Activar para una fila `revoked` sin vincular.
- [ ] CA-47 — Lista (R39):
  - `users.schema.test.ts`: valores por defecto, valores inválidos que vuelven al defecto, `q` recortado a 100, `page` no numérico o menor que 1 → 1. `inviteInputSchema` pone el correo en minúsculas y rechaza correos inválidos; los esquemas de entrada rechazan claves extra e ids que no son UUID.
  - `users.service.test.ts`:
    - `listUsers` ejecuta exactamente una sentencia, con `limit 8`, la página pedida como parámetro, `%` y `_` escapados en la búsqueda, y el `order by` del mapa cerrado para cada `SortKey`. Todos los valores van como parámetros.
    - El recorte a la última página está en esa misma sentencia (`least(...)` sobre el `count(*)` filtrado). No hay segunda consulta.
    - Con la base simulada:
      - Una respuesta de una fila con `total` 0 y columnas de usuario en `null` da `rows: []`, `total: 0`, `page: 1` y `pageCount: 1`.
      - Una respuesta con `total` 20 y `page` 3, pedida como página 9, da `page: 3` y `pageCount: 3`, con sus filas.
- [ ] CA-48 — Matriz (D37), en `userPermissions.test.ts`: un caso por celda de la tabla de D37 y por regla (propia fila, fila `superadmin`, Activar solo `revoked` vinculada, Reenviar solo `invited`, Cambiar rol solo superadmin sobre filas no `revoked`), más `assignableRoles` para los tres roles.
- [ ] CA-49 — Clerk solo para mostrar (D38):
  - `listUsers` devuelve los `clerk_user_id` solo en `clerkUserIds`; ninguna `UserRow` los contiene.
  - `getClerkActivity` hace una sola llamada `getUserList` con todos los ids recibidos, ninguna si no hay, y devuelve la actividad con clave el id de la fila. Si falla, devuelve `{}` sin lanzar.
  - Lectura: la página no pasa `clerkUserIds` a `UsersView`. `countActiveSessions` devuelve `null` sin `clerk_user_id` o si Clerk falla. Ninguna de las dos escribe en la base.
- [ ] CA-50 — Lectura del código:
  - La página llama a `requirePermission("dashboard:view")` y, sin `users:manage`, solo renderiza `UsersNoAccess` (D39).
  - Cada acción llama a `getActor()`, comprueba `users:manage`, valida con su esquema estricto y hace `revalidatePath` solo si sale bien (R47).
  - SQL parametrizado; ningún nombre de columna ni fragmento de orden sale de la entrada.
  - `modules/users` no escribe `first_name`, `last_name`, `email` ni `clerk_user_id` en un `update`, y solo usa `createInvitation`, `revokeInvitation`, `getUserList` y `getSessionList` de Clerk (R48).
- [ ] CA-51 — Privacidad (R36): `git grep -n "user_profiles" -- . ':(exclude)docs'` solo muestra `db/migrations/0002_user_profiles.sql`, `db/migrations/0003_user_profiles_phone_type.sql`, `modules/account/services/profile.service.ts` y su test.
- [ ] CA-52 — Navegación: `lib/navigation.test.ts` comprueba que `NAV_ITEMS` contiene `/dashboard/users` con `users:manage`, después de "Inicio", y que `visibleNavItems` lo oculta a `user`. Sustituye la última comprobación de CA-12 (D12 cumplida).
- [ ] CA-53 — Diseño (R49): sin colores sueltos (criterio de CA-27); botones de solo icono con `aria-label`; badges con texto.
- [ ] CA-54 — Alcance cerrado de archivos respecto a `6885cc1`, con el método de CA-22. Rutas permitidas:
  - shadcn (`npx shadcn@latest add table alert-dialog select`, sin `--overwrite` ni ediciones manuales; registro `base-nova` consultado el 2026-11-08 con `--dry-run`: crea `table.tsx`, `select.tsx` y `alert-dialog.tsx`, omite `button.tsx` por idéntico y su única dependencia, `cn`, ya está instalada): `components/ui/table.tsx`, `components/ui/select.tsx`, `components/ui/alert-dialog.tsx`.
  - Navegación: `lib/navigation.ts`, `lib/navigation.test.ts`.
  - Módulo:
    - `modules/users/schemas/users.schema.ts`, `modules/users/schemas/users.schema.test.ts`
    - `modules/users/types/users.types.ts`
    - `modules/users/utils/userPermissions.ts`, `modules/users/utils/userPermissions.test.ts`
    - `modules/users/services/users.service.ts`, `modules/users/services/users.service.test.ts`
    - `modules/users/server.ts`, `modules/users/index.ts`, `modules/users/actions/users.actions.ts`
    - `modules/users/components/UsersView.tsx`, `modules/users/components/InviteUserDialog.tsx`, `modules/users/components/ChangeRoleDialog.tsx`
    - `modules/users/components/UserDetailSheet.tsx`, `modules/users/components/UsersNoAccess.tsx`
  - Ruta: `app/dashboard/users/page.tsx`.
  - Flujo SDD:
    - `docs/specs/auth-clerk-neon.md`, `docs/specs/auth-clerk-neon.md.sig`, `docs/specs/approvals.jsonl`
    - `docs/evidence/auth-users.md` (solo con orden del usuario)

  Verificación en Git Bash desde la raíz del worktree. PASS = sin salida:

  ```sh
  { git diff --name-only --no-renames 6885cc1; git ls-files -o --exclude-standard; } | sort -u | grep -v -x -F \
    -e components/ui/table.tsx -e components/ui/select.tsx -e components/ui/alert-dialog.tsx \
    -e lib/navigation.ts -e lib/navigation.test.ts \
    -e modules/users/schemas/users.schema.ts -e modules/users/schemas/users.schema.test.ts \
    -e modules/users/types/users.types.ts \
    -e modules/users/utils/userPermissions.ts -e modules/users/utils/userPermissions.test.ts \
    -e modules/users/services/users.service.ts -e modules/users/services/users.service.test.ts \
    -e modules/users/server.ts -e modules/users/index.ts -e modules/users/actions/users.actions.ts \
    -e modules/users/components/UsersView.tsx -e modules/users/components/InviteUserDialog.tsx \
    -e modules/users/components/ChangeRoleDialog.tsx -e modules/users/components/UserDetailSheet.tsx \
    -e modules/users/components/UsersNoAccess.tsx -e app/dashboard/users/page.tsx \
    -e docs/specs/auth-clerk-neon.md -e docs/specs/auth-clerk-neon.md.sig -e docs/specs/approvals.jsonl \
    -e docs/evidence/auth-users.md
  ```

  Se ejecuta al terminar T16 y T17, y en T18. Si el registro de shadcn genera otra ruta, el resultado es FAIL: la lista solo se amplía editando esta spec y aprobándola de nuevo.
- [ ] CA-9 y CA-10 sobre AUTH-3 (base `6885cc1`).

Manuales (propietario, claves de desarrollo, rama de desarrollo de Neon, Clerk en modo Restricted):
- [ ] CA-17 — Invitar y aceptar: un superadmin invita un correo nuevo como `user`. Llega el correo de Clerk, el enlace abre `/sign-up` de la app y, al entrar, la fila pasa a `active` con nombre y apellido (R2, D32). La lista muestra su "Último acceso".
- [ ] CA-55 — Superadmin:
  - Búsqueda, filtros, orden y paginación (con más de 8 filas o con filtros), y "Sin resultados" con "Quitar filtros".
  - El detalle muestra las sesiones activas y no muestra datos de `user_profiles`.
  - Cambiar rol `user` ↔ `admin`.
  - Inactivar a un usuario activo: en su siguiente petición llega a `/` con "Tu cuenta no tiene acceso". Activarlo: recupera el acceso.
  - Inactivar una invitación pendiente: queda revocada en Clerk (el enlace ya no sirve) y su fila no ofrece Activar ni Reenviar.
  - Reenviar una invitación: llega un correo nuevo y el enlace anterior ya no sirve.
  - Ningún menú sobre la propia fila ni sobre filas `superadmin`.
- [ ] CA-56 — Admin: "Invitar" solo ofrece "Usuario"; sin "Cambiar rol"; menú solo en filas `user`; subtítulo "Puedes gestionar a quienes tienen rol Usuario".
- [ ] CA-57 — User: el sidebar no muestra "Usuarios" y `/dashboard/users` muestra la vista "No tienes acceso a Usuarios" dentro del shell, con "Volver al inicio".
- [ ] CA-58 — Regresión y diseño: CA-30 a CA-33, CA-43 a CA-45 y los manuales de CONTACT-1 siguen cumpliéndose. Pantallas 01, 04, 07, 11, 12, 14, 15 y 16 en tema claro y oscuro, con teclado y a 375 px de ancho sin desbordes.

## Diseño técnico

- Rutas (`app/`): AUTH-1 `app/page.tsx` (pública: botón de sign-in, `UserButton` y rol del actor o aviso "sin acceso"; sin botón de registro), `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`. AUTH-2 `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`. AUTH-3 `app/dashboard/users/page.tsx`.
- `proxy.ts`: `clerkMiddleware` con `createRouteMatcher(["/dashboard(.*)"])` y `auth.protect()`; matcher del respaldo.
- `app/layout.tsx`: envolver `body` con `ClerkProvider`; `lang="es"`; metadata genérica.
- AUTH-2: `components/shared/AppSidebar.tsx` (cliente) con `NavItem = { title; href; icon; permission? }`; `lib/navigation.ts` con `APP_NAME`, `NAV_ITEMS` y `visibleNavItems(role)`.
- AUTH-2, `app/dashboard/layout.tsx` (Server Component): `const actor = await requirePermission("dashboard:view")`; `SidebarProvider` > `AppSidebar role={actor.role}` + `SidebarInset` con cabecera (`SidebarTrigger`, `Separator`, `APP_NAME`, `UserButton` a la derecha) y `children`. Basado en `app/(dashboard)/layout.tsx` del respaldo sin marca y sin `requireUserManager`.
- AUTH-2, `app/dashboard/page.tsx` (Server Component): `requirePermission("dashboard:view")`, título "Inicio" y texto con `ROLE_LABELS[actor.role]`. Layout y página consultan `app_users` por separado (dos lecturas por petición); se acepta para no tocar `lib/auth.ts` (D15).
- AUTH-2, `AppSidebar`: `usePathname()` para el ítem activo; `SidebarMenuButton` con `render={<Link href />}` (Base UI, como el respaldo); `Badge` con el rol en el pie. Sin estado propio.
- AUTH-2, `app/dashboard/loading.tsx` y `app/error.tsx`: los mínimos de R16 y R17. El developer lee antes `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` y `loading.md` (Next 16 cambió las props de `error.js`).
- AUTH-2 empieza con `npm ci` en el worktree nuevo (no tiene `node_modules`).
- AUTH-2.1 no empieza con `npm ci`: el worktree ya tiene `node_modules` y coincide con `package-lock.json` (`npm ls --depth=0` sin errores, comprobado el 2026-11-08). Solo se ejecuta `npm ci` si esa comprobación falla. El developer lee antes la spec visual (D17) y la guía de temas de Clerk (`color-scheme`, B2).
- AUTH-2.1, `app/dashboard/layout.tsx`: mantiene `requirePermission("dashboard:view")`. `UiPreferencesRoot` envuelve el panel; `AppSidebar role={actor.role}` (contraíble, con `NavUser` en el pie); `SidebarInset` sobre `--muted`; barra móvil `md:hidden` con `SidebarTrigger`. Desaparecen la cabecera y el `UserButton` (D19).
- AUTH-2.1, páginas de cuenta (Server Components): cada una llama a `requirePermission("dashboard:view")` y pasa `actor.role` y el estado `active` a un componente cliente de `modules/account` (`AccountSummary`, `ProfileView`, `SettingsView`, `SignOutCard`). Ese componente lee la identidad con `useUser()` y abre `openUserProfile()` y `signOut()` con `useClerk()` (D23, D24).
- AUTH-2.1, tema: script en línea en `<head>` de `app/layout.tsx` + `useUiPreferences` (lectura y escritura validadas con `parseUiPreferences`, R26 y R27). Sin `next-themes`.
- AUTH-2.2 empieza con `npm ci` en el worktree nuevo (no tiene `node_modules`). El developer lee antes la spec visual (pantallas 08 y 19), la guía de Server Actions en `node_modules/next/dist/docs/` y la de `currentUser()` de Clerk.
- AUTH-2.2, `app/dashboard/profile/page.tsx` (Server Component): `const actor = await requirePermission("dashboard:view")`; `await syncOwnIdentity(actor)`; `const profile = await getOwnProfile(actor.id)` desde `@/modules/account/server`; `<ProfileView profile={profile} />`.
- AUTH-2.2, `ProfileView` (cliente): identidad con `useUser()` y `openUserProfile()` (D23, D24); estado local con el `Profile` inicial, que sustituye por el que devuelve la acción. `ProfileFieldDialog` usa `dialog`, `input` (o `textarea` nativo para la nota y `<input type="date">` para el cumpleaños), `label` y `button`, valida con `profileFieldInputSchema` antes de enviar y llama a `updateProfileFieldAction` dentro de `useTransition`.
- AUTH-2.2, `syncOwnIdentity`: lee `currentUser()` y calcula nombre, apellido y correo (este solo si el principal está verificado). Después, dos sentencias independientes (cada una se confirma sola con el cliente HTTP de Neon), cada una en su propio `try/catch`:
  1. `update app_users set first_name = $n, last_name = $a, updated_at = now() where id = ${actor.id} and (first_name is distinct from $n or last_name is distinct from $a)`.
  2. Solo si hay correo verificado: `update app_users set email = $c, updated_at = now() where id = ${actor.id} and email is distinct from $c and not exists (select 1 from app_users where email = $c and id <> ${actor.id})`.

  El `not exists` cubre la colisión normal (cero filas afectadas, sin error). Si una carrera la salta y la sentencia 2 viola `unique` (`23505`), se registra y se ignora: la sentencia 1 ya quedó confirmada (D32).
- AUTH-2.2, `setOwnProfileField`: una sola sentencia atómica por llamada, sin lectura previa. El mapa cerrado de campos asocia cada `ProfileFieldKey` a su sentencia fija, por ejemplo para `phone`:

  ```sql
  insert into user_profiles (user_id, phone) values (${userId}, ${value})
  on conflict (user_id) do update set phone = excluded.phone, updated_at = now()
  returning phone, job_title, company, birthday, website, note
  ```

  Solo cambia la columna elegida; las otras cinco conservan lo que tenga la fila en ese momento, así que guardados concurrentes de campos distintos no se pisan. Dos guardados del mismo campo dejan el último (lo esperado). El perfil devuelto sale del `returning` de esa misma sentencia.
- AUTH-3 empieza con `npm ci` en el worktree nuevo (no tiene `node_modules`). Antes de escribir, el developer lee la spec visual (pantallas 01, 03, 04, 05, 07, 11, 12, 14, 15 y 16), la guía de `page.js` en `node_modules/next/dist/docs/` (`searchParams` es una promesa en Next 16), la de Server Actions y `revalidatePath`, y los tipos de `InvitationApi`, `UserApi` y `SessionApi` en `node_modules/@clerk/backend`.
- AUTH-3, `app/dashboard/users/page.tsx`: `const actor = await requirePermission("dashboard:view")`. Si `!can(actor.role, "users:manage")`, `return <UsersNoAccess />`. Si no, `usersQuerySchema.parse(await searchParams)`, `const listing = await listUsers(actor, query)` y `const activity = await getClerkActivity(listing.clerkUserIds)` desde `@/modules/users/server`, y `<UsersView actor={{ id: actor.id, role: actor.role }} page={listing.page} query={query} activity={activity} />`.
- AUTH-3, `listUsers`: una sola sentencia con este esquema. El `order by` sale del mapa cerrado, `$patron` es `'%' || $q_escapado || '%'` y `$page` es la página pedida (entero ≥ 1):

  ```sql
  with filtered as (
    select id, email, first_name, last_name, role, status, clerk_user_id, created_at
    from app_users
    where ($status = 'all' or status = $status)
      and ($role = 'all' or role = $role)
      and ($q = '' or email ilike $patron escape '\' or first_name ilike $patron escape '\'
           or last_name ilike $patron escape '\' or (first_name || ' ' || last_name) ilike $patron escape '\')
  ),
  paging as (
    select count(*)::int as total,
           least($page, greatest(ceil(count(*) / 8.0)::int, 1)) as page
    from filtered
  )
  select p.total, p.page, f.*
  from paging p
  left join lateral (
    select filtered.*, row_number() over (order by <fragmento del mapa>, id) as position
    from filtered
    order by <fragmento del mapa>, id
    limit 8 offset (p.page - 1) * 8
  ) f on true
  order by f.position
  ```

  El `order by f.position` exterior garantiza el orden final: Postgres no asegura que un `join` conserve el orden de la subconsulta. `position` no sale del service.

  - `paging` siempre devuelve una fila, así que el total y la página efectiva llegan aunque no haya resultados: con total 0 sale una sola fila con `f.*` en `null`, que el service descarta (`rows: []`, `page: 1`, `pageCount: 1`).
  - `pageCount = max(ceil(total / 8), 1)`.
  - El service devuelve `UsersListing` (ver "Contratos"). `clerk_user_id` nunca llega al cliente.
- AUTH-3, cláusula de R12 en las sentencias de cambiar rol, inactivar y activar: `and not (role = 'superadmin' and status = 'active' and (select count(*) from app_users where role = 'superadmin' and status = 'active') <= 1)`.
- AUTH-3, roles gestionables en SQL: `role = any(${assignableRoles(actor.role)})`, la misma lista que usa la UI.
- AUTH-3, errores de Clerk al revocar: se detectan con `isClerkAPIResponseError` de `@clerk/nextjs/errors` (export comprobado en 7.9.25).
  - Cuentan como hecho: HTTP 404, y un 400 cuyo `errors[0].code` indique "ya revocada" según la documentación de Clerk. El developer anota en la evidencia el código exacto y su fuente.
  - Si no encuentra ese código documentado, solo el 404 cuenta como hecho: cualquier otro error aborta sin tocar la base, que es el lado seguro.
- AUTH-3, `UsersView` (cliente): estado de diálogos y del detalle; la barra y la paginación cambian la URL con `useRouter().replace` y `useSearchParams`, y cada acción va en `useTransition`. Tras un `ok`, el `revalidatePath` de la acción refresca la lista. Si falla, el diálogo sigue abierto con el error. Sin TanStack Table (YAGNI).
- Antes de escribir código, el developer lee la guía de `proxy` en `node_modules/next/dist/docs/` y la de Clerk para Next.js.

## Reutilización

- Del respaldo: `lib/db.ts`, `lib/roles.test.ts` como base, `proxy.ts`, páginas de sign-in/sign-up, estructura de `modules/users`, `AppSidebar`, `UsersTable` y `UserDialog` como referencia de UI.
- Del proyecto: `cn()` de `@/lib/utils`, `components/ui/button.tsx`, zod v4.
- De shadcn: `sidebar`, `badge`, `sheet`, `tooltip`, `separator`, `skeleton` e `input` (AUTH-2); `avatar`, `dropdown-menu`, `switch`, `toggle-group`, `label` y `card` (AUTH-2.1); `table`, `dialog`, `alert-dialog` y `select` (AUTH-3).
- AUTH-2.1: `requirePermission`, `ROLE_LABELS`, `visibleNavItems`, `APP_NAME`, `useIsMobile` y `AppSidebar` de AUTH-2; patrón nav-user del bloque sidebar de shadcn.
- AUTH-2.2: `getActor`, `requirePermission`, `getDb` y el runner `db:migrate` de AUTH-1; `UserAvatar`, `SectionLabel`, `Card`, `Skeleton`, `dropdown-menu`, `input`, `label` y `button` ya instalados; zod v4. Solo se añade `dialog` (también lo usará AUTH-3).
- AUTH-3: `getActor`, `requirePermission`, `getDb`, `can`, `canManageRole` y `ROLE_LABELS` sin cambios; `NAV_ITEMS` y `visibleNavItems`; `UserAvatar` y `SectionLabel`; `dialog`, `sheet`, `dropdown-menu`, `toggle-group`, `badge`, `input`, `label`, `button`, `card` y `skeleton` ya instalados. Del respaldo, solo como referencia de UI: `UsersTable` y `UserDialog`. No se porta su service (E3 a E8).

## Archivos sensibles

Fase AUTH-3: ninguno. Ninguna ruta permitida de CA-54 coincide con el patrón sensible del hook (`modules/users/*`, `lib/navigation*`, `app/dashboard/users/*` y `components/ui/*` no contienen `auth`, y no hay `db/`, `proxy.*`, `scripts/db-*` ni `lib/roles|db`).

Fase AUTH-2.2 (cerrada). Se citan en línea y sin viñetas para que el hook no las desbloquee mientras el plan de AUTH-3 esté abierto: `db/migrations/0002_user_profiles.sql`, `lib/auth.ts`, `lib/auth.test.ts`.

Fase AUTH-2.1 (cerrada): ninguno. Ninguna ruta permitida de CA-29 coincide con el patrón sensible del hook (`modules/account/*` no contiene `auth`, y no hay `db/`, `proxy.*`, `scripts/db-*` ni `lib/roles|db`).

Fase AUTH-2 (cerrada): ninguno. Ningún archivo de AUTH-2 coincide con las rutas sensibles de `docs/SETUP.md` (comprobado contra el patrón del hook para las rutas permitidas de CA-22).

Fase AUTH-1 (cerrada). Se citan en línea y sin viñetas para que el hook no las desbloquee mientras el plan de AUTH-2 esté abierto: `proxy.ts`, `lib/auth.ts`, `lib/auth.test.ts`, `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `db/migrations/0001_app_users.sql`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs`.

## Cambios de gobierno

Ninguno.

## Tests

- `lib/roles.test.ts`: CA-4.
- `lib/auth.test.ts`: CA-5, con `@clerk/nextjs/server`, `next/navigation` y `@/lib/db` simulados con `vi.mock`.
- AUTH-2: `lib/navigation.test.ts` (CA-12). Sin tests de `AppSidebar`, layout, página, `loading.tsx`, `error.tsx` ni `hooks/use-mobile.ts` (D16: sin lógica propia más allá de `matchMedia`): no tienen lógica propia más allá de `visibleNavItems` y `requirePermission` (ya probado en CA-5); los Server Components async no se pueden probar con Vitest.
- AUTH-2.1: `modules/account/utils/uiPreferences.test.ts` (CA-26). Sin tests de componentes, páginas ni del script de tema: no tienen lógica propia más allá de `parseUiPreferences`.
- AUTH-2.2: `profile.schema.test.ts` (CA-34), `profileFields.test.ts` (CA-35), `profile.service.test.ts` (CA-36) y los casos nuevos de `lib/auth.test.ts` (CA-37). Sin tests de `ProfileView`, `ProfileFieldDialog`, la página ni la acción: la acción solo encadena `getActor`, el esquema y el service, ya probados, y se revisa por lectura (CA-38).
- AUTH-3: `users.schema.test.ts` (CA-47), `userPermissions.test.ts` (CA-48), `users.service.test.ts` (CA-13 a CA-15, CA-18, CA-19, CA-46, CA-47 y CA-49) y `lib/navigation.test.ts` (CA-52). Sin tests de componentes, la página ni las acciones: las acciones solo encadenan `getActor`, el esquema y el service, ya probados, y se revisan por lectura (CA-16, CA-50).
- Sin tests de páginas, layouts ni componentes `components/ui/`.

## Plan de tareas

### Fase AUTH-1

- [x] T1 — Dependencias y entorno: `npm install @clerk/nextjs @neondatabase/serverless`, scripts en `package.json`, `.env.example`, `!.env.example` en `.gitignore`; `npm audit` antes y después · archivos: `package.json`, `package-lock.json`, `.gitignore`, `.env.example` · depende de: — · secuencial (base)
- [x] T2 — Datos y roles: `lib/db.ts`, `lib/roles.ts` y su test, migración `0001`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs` · archivos: `lib/db.ts`, `lib/roles.ts`, `lib/roles.test.ts`, `db/migrations/0001_app_users.sql`, `scripts/db-migrate.mjs`, `scripts/db-grant-superadmin.mjs` · depende de: T1 · secuencial
- [x] T3 — Sesión: `lib/auth.ts` y su test, `proxy.ts` · archivos: `lib/auth.ts`, `lib/auth.test.ts`, `proxy.ts` · depende de: T2 · secuencial
- [x] T4 — UI mínima: `ClerkProvider` en layout, páginas de sign-in/sign-up, home pública con rol · archivos: `app/layout.tsx`, `app/page.tsx`, `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` · depende de: T3 · secuencial
- [x] T5 — Verificación: reviewer con CA-1 a CA-5, CA-9 y CA-10; el usuario ejecuta CA-6, CA-7, CA-8, CA-8b y CA-8c con claves de desarrollo, Clerk en modo Restricted y orden expresa para migrar · archivos: ninguno · depende de: T4 · secuencial

### Fase AUTH-2

- [x] T6 — Base y navegación: `npm ci`; `npx shadcn@latest add sidebar badge` sin `--overwrite` (R18); comprobación CA-22 inmediatamente después, y si falla se detiene; reescritura de `hooks/use-mobile.ts` según D16; `lib/navigation.ts` y su test; CA-22 de nuevo al terminar · archivos: `components/ui/sidebar.tsx`, `components/ui/badge.tsx`, `components/ui/input.tsx`, `components/ui/separator.tsx`, `components/ui/sheet.tsx`, `components/ui/skeleton.tsx`, `components/ui/tooltip.tsx`, `hooks/use-mobile.ts`, `lib/navigation.ts`, `lib/navigation.test.ts` · depende de: — · secuencial (base)
- [x] T7 — Shell y estados: `components/shared/AppSidebar.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/loading.tsx`, `app/error.tsx`; CA-22 al terminar · archivos: esos cinco · depende de: T6 · secuencial
- [x] T8 — Verificación: reviewer con CA-9, CA-10, CA-12, CA-20, CA-21 y CA-22; el usuario ejecuta CA-11, CA-23 y CA-24 con claves de desarrollo · archivos: ninguno (evidencia en `docs/evidence/auth-dashboard.md` solo con orden del usuario) · depende de: T7 · secuencial

### Fase AUTH-2.1

- [x] T9 — Tokens, fuente, tema y componentes:
  - `npm ls --depth=0` sin errores; `npm ci` solo si falla.
  - `:root`, `.dark` y `@theme inline` (D20).
  - Fuente y script de tema en `app/layout.tsx` (D20b, D21).
  - `npx shadcn@latest add avatar dropdown-menu switch toggle-group label card`.
  - CA-25 y CA-29.
  - Archivos: `app/globals.css`, `app/layout.tsx` y los 7 `components/ui/*` listados.
  - Depende de: —. Secuencial (base).
- [x] T10 — Shell y preferencias:
  - `AppSidebar` contraíble, `NavUser`, `UserAvatar`, `UiPreferencesRoot`.
  - `uiPreferences.ts` y su test, `useUiPreferences`, layout.
  - Archivos: los 4 `components/shared/*`, `modules/account/utils/*`, `modules/account/hooks/useUiPreferences.ts`, `app/dashboard/layout.tsx`.
  - Depende de: T9. Secuencial.
- [x] T11 — Páginas:
  - Inicio, perfil, configuración y cerrar sesión, con sus componentes.
  - Archivos: `app/dashboard/{page,profile/page,settings/page,sign-out/page}.tsx`, `modules/account/components/*`, `modules/account/index.ts`.
  - Depende de: T10. Secuencial.
- [x] T12 — Verificación:
  - El reviewer comprueba CA-9, CA-10 y CA-25 a CA-29.
  - El usuario ejecuta CA-30 a CA-33.
  - Archivos: ninguno.
  - Depende de: T11.

### Fase AUTH-2.2

- [x] T13 — Datos, validación y sincronización:
  - `npm ci`.
  - Migración `0002_user_profiles.sql` (sin ejecutarla).
  - `profile.schema.ts`, `profile.types.ts`, `profileFields.ts`, `profile.service.ts`, `server.ts` y sus tests.
  - `lib/auth.ts`: copia del nombre en la vinculación y `syncOwnIdentity`, con sus tests.
  - CA-41 al terminar.
  - Archivos: `db/migrations/0002_user_profiles.sql`, `lib/auth.ts`, `lib/auth.test.ts`, `modules/account/schemas/*`, `modules/account/types/profile.types.ts`, `modules/account/utils/profileFields*`, `modules/account/services/*`, `modules/account/server.ts`.
  - Depende de: —. Secuencial (base).
- [x] T14 — Interfaz y acción:
  - `npx shadcn@latest add dialog` sin `--overwrite`; CA-41 inmediatamente después.
  - `profile.actions.ts`, `ProfileFieldDialog`, `ProfileView` reescrito, `index.ts` y la página.
  - CA-41 al terminar.
  - Archivos: `components/ui/dialog.tsx`, `modules/account/actions/profile.actions.ts`, `modules/account/components/ProfileView.tsx`, `modules/account/components/ProfileFieldDialog.tsx`, `modules/account/index.ts`, `app/dashboard/profile/page.tsx`.
  - Depende de: T13. Secuencial.
- [x] T15 — Verificación:
  - El reviewer comprueba CA-9, CA-10 y CA-34 a CA-41.
  - El propietario ejecuta la migración (orden expresa suya) y CA-42 a CA-45.
  - Archivos: ninguno (evidencia en `docs/evidence/auth-profile.md` solo con orden del usuario).
  - Depende de: T14.

### Fase AUTH-3

- [x] T16 — Datos, permisos y service:
  - `npm ci`.
  - `users.schema.ts`, `users.types.ts`, `userPermissions.ts`, `users.service.ts` y `server.ts`, con sus tests (CA-13 a CA-15, CA-18, CA-19 y CA-46 a CA-49).
  - CA-54 al terminar.
  - Archivos: `modules/users/schemas/*`, `modules/users/types/users.types.ts`, `modules/users/utils/*`, `modules/users/services/*`, `modules/users/server.ts`.
  - Depende de: —. Secuencial (base).
- [x] T17 — Interfaz, acciones y navegación:
  - `npx shadcn@latest add table alert-dialog select` sin `--overwrite`; CA-54 inmediatamente después.
  - `users.actions.ts`, `UsersView`, `InviteUserDialog`, `ChangeRoleDialog`, `UserDetailSheet`, `UsersNoAccess`, `index.ts` y la página.
  - Ítem "Usuarios" en `NAV_ITEMS` y su test (CA-52).
  - CA-54 al terminar.
  - Archivos: `components/ui/table.tsx`, `components/ui/select.tsx`, `components/ui/alert-dialog.tsx`, `modules/users/actions/users.actions.ts`, `modules/users/components/*`, `modules/users/index.ts`, `app/dashboard/users/page.tsx`, `lib/navigation.ts`, `lib/navigation.test.ts`.
  - Depende de: T16. Secuencial.
- [x] T18 — Verificación:
  - El reviewer comprueba CA-9, CA-10, CA-13 a CA-16, CA-18, CA-19 y CA-46 a CA-54.
  - El propietario ejecuta CA-17 y CA-55 a CA-58 con claves de desarrollo. Sin migraciones.
  - Archivos: ninguno (evidencia en `docs/evidence/auth-users.md` solo con orden del usuario).
  - Depende de: T17.

## Preguntas abiertas

Cerradas por el usuario el 2026-11-07: D8 a D11.

Cerradas por el usuario el 2026-11-07 para AUTH-2:

- P1 — Enlace "Ir al panel" en la home: **no**. `app/page.tsx` (AUTH-1) no se modifica; se entra al panel por URL.
- P2 — Ítem "Usuarios": **no** hasta AUTH-3 (D12).

Cerradas por el usuario para AUTH-2.1:
- B1, el 2026-11-07: el nombre se edita solo en el modal de Clerk (D24).
- B2, el 2026-11-08: Clerk sigue el tema con `color-scheme`, y en claro como respaldo (D21).
- Tipografía y tema oscuro, el 2026-11-08: se adopta la spec visual tal cual (D20, D20b).

Cerradas por el propietario para AUTH-2.2, el 2026-11-08:
- O1: tipografía D20b sin cambios (D33).
- O2: encabezado sin tarjeta, sin rol ni estado (D29).
- O3: P-POST-2 se implementa en AUTH-2.2 (D32).
- Dirección para AUTH-3 (A1 a A8): ver "Propuestas para AUTH-3".

Cerradas por el propietario para AUTH-3, el 2026-11-08:
- A1 a A8, formalizadas en D34 a D41.
- "Activar" solo para filas `revoked` ya vinculadas, con la condición en SQL; sin "Reinvitar"; R11 sin cambios (D36).
- Valores por defecto: reenviar como sustitución controlada (D40), "—" sin último acceso (D38), inactivar sin cerrar sesiones de Clerk (D36), cláusula SQL de R12 (R43 a R45) y SDD por encima de la spec visual (D34).

Ninguna abierta. La zona horaria y el formato de fecha editables siguen pospuestos (P-POST-1).
