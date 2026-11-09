# Evidencia: AUTH-3 (gestión de usuarios en `/dashboard/users`)

**Estado: AUTH-3 COMPLETADA — VALIDACIÓN LOCAL (2026-11-09).** Automáticas y manuales (CA-17 y CA-55 a CA-58) en PASS, sin bloqueantes. Sin migraciones. Commit `08b0ec8` en `feat/auth-users`, subido a `origin` e integrado en `main` por el PR #11 (merge `eada81d812ea4081aa3abf4f98b0a08552714b4b`). T16, T17 y T18 marcadas en la spec.

- Spec: `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-3`, aprobada el 2026-11-09T04:39:26Z.
  - Hash de la declaración: `35f6ae42…f2e0` (coincide con la línea AUTH-3 de `docs/specs/approvals.jsonl`).
  - Firma SSH: `docs/specs/auth-clerk-neon.md.sig`.
- Rama `feat/auth-users`, worktree `C:/Users/ronal/template-v2-users`, base `main` en `6885cc1`.

Origen de cada resultado:
- **Verificado:** lo ejecutó un agente y su salida estaba a la vista.
- **Informado:** lo ejecutó el propietario y lo comunicó en el chat.

## 1. Aprobación (verificado)

- `ssh-keygen -Y verify` sobre la declaración del hook: `Good "spec-approval" signature for approver`.
- Modo `gate` del hook con `Fase: AUTH-3`: exit 0.
- La spec no cambió después de la aprobación. Sin cambios en archivos de gobierno ni en rutas sensibles.

## 2. Automáticas (verificado)

Dictamen del Reviewer:
- T16: APROBADO en el ciclo 1.
- T17: APROBADO en el ciclo 2. El ciclo 1 detectó que CA-51 fallaría al versionar los archivos y una carrera en el buscador. El arreglo del buscador introdujo un bucle de render con `q` terminado en espacio, que se corrigió en el ciclo 2.

| Criterio | Resultado |
|---|---|
| CA-13 | PASS. Invitar: primero Clerk, después `insert … on conflict do nothing`. Si devuelve 0 filas o falla, se revoca la invitación nueva. Reenviar: revocar, crear y `update` con `status = 'invited'` e `invitation_id is not distinct from`, con compensación si el `update` devuelve 0 filas. |
| CA-14 | PASS con el criterio del propietario (ver la sección 4). Una fila `superadmin` ejecuta un único `update` con `role in ('user', 'admin')`, que afecta 0 filas y lanza `UsersError`. El test lo comprueba de forma explícita: `writes()` con longitud 1, el SQL y el error. Admin, propia fila y rol `superadmin` lanzan sin llamada SQL. |
| CA-15 | PASS. Inactivar revoca en Clerk antes del `update`. Solo un 404 cuenta como hecho (ver la sección 4). Sin `delete from`, `deleteUser` ni `deleteInvitation` fuera de los tests. |
| CA-16 | PASS por lectura. Cada acción hace `getActor()` y `can(…, "users:manage")` antes de validar y devuelve el mensaje genérico sin llamar al service. Los errores se registran solo con `{ code, message }`, sin el `detail` de Postgres. |
| CA-18, CA-19 | PASS. Cambiar rol, inactivar y activar llevan la cláusula de R12. |
| CA-46 a CA-48 | PASS. `users.schema.test.ts`, `userPermissions.test.ts` y `users.service.test.ts`. Una sola sentencia para la lista, con `least(...)`: 0 filas dan `rows: []` y página 1, y la página 9 de 3 da la página 3. `page` con tope en 2^31-1. |
| CA-49 | PASS. `clerkUserIds` no sale de la página. Ningún componente ni `index.ts` contiene ids de Clerk. |
| CA-50 | PASS por lectura. La página llama a `requirePermission("dashboard:view")` y, sin `users:manage`, solo devuelve `<UsersNoAccess />`. Las seis acciones validan con `z.strictObject` y UUID. De Clerk solo se usan `createInvitation`, `revokeInvitation`, `getUserList` y `getSessionList`. |
| CA-51 | PASS. `git grep -n --untracked "user_profiles" -- . ':(exclude)docs'`: solo las migraciones 0002 y 0003, `profile.service.ts` y su test. |
| CA-52 | PASS. `lib/navigation.test.ts`: "Usuarios" justo después de "Inicio", con `/dashboard/users` y `users:manage`, y oculto para `user`. |
| CA-53 | PASS. Sin colores sueltos; botones de solo icono con `aria-label`; badges con texto. |
| CA-54 | PASS. Comando literal sin salida tras shadcn y al terminar. `shadcn add table select alert-dialog --dry-run --diff`: sin cambios. |
| CA-9 | PASS. Sin coincidencias. |
| CA-10 | PASS. `npx vitest run` 309/309; `npx vitest run .claude/hooks` 47/47; `npm run lint` exit 0; `npm run build` exit 0, con `/dashboard/users` dinámica. |

Decisiones de implementación aceptadas por el Reviewer, ninguna vulnera permisos, integridad de datos ni seguridad:
- `sql.unsafe` solo para el `order by` y la cláusula de R12, tomados de constantes fijas. El resto va como parámetro.
- Revocar y Reenviar leen la fila y aplican `rowActions` antes de llamar a Clerk. El `update` repite todas las condiciones.
- `role = any(assignableRoles)` en el `update` de Reenviar, por la sección "Seguridad".
- La compensación de D40 también cubre las excepciones de la base después de crear una invitación.
- Sin cabecera `Origin` válida, Invitar y Reenviar devuelven el mensaje genérico sin llamar al service. Next 16 ya rechaza `Origin` distinto de `Host`.
- Mensajes no definidos en la spec: "No tienes permiso para esta acción." y "El usuario cambió mientras tanto. Recarga la página."
- `usersQuerySchema` se exporta desde `modules/users/index.ts`, que es seguro para el cliente.
- `StatusBadge`, `displayName` y `formatLastAccess` viven en `UserDetailSheet.tsx`, por la lista cerrada de CA-54. La clase de `SectionLabel` está copiada.
- El resultado de cada acción se muestra en una región `role="status"` siempre montada (`empty:sr-only`), porque no hay toast.
- El detalle es un `sheet` modal con velo, porque R49 exige atrapar el foco (la spec visual decía "sin velo"; manda la SDD, D17).
- `suppressHydrationWarning` solo en "Último acceso".

## 3. Manuales (propietario, claves de desarrollo, sin migraciones)

| Criterio | Resultado |
|---|---|
| CA-17 | PASS (informado). Invitación como `user`, correo de Clerk, `/sign-up` de la app, fila `active` con nombre y apellido, "Último acceso". |
| CA-55 | PASS (informado). Superadmin: búsqueda, filtros, orden y paginación; "Sin resultados" con "Quitar filtros"; sesiones en el detalle; cambio de rol; inactivar y activar; inactivar y reenviar invitaciones; sin menú en la propia fila ni en filas `superadmin`. |
| CA-56 | PASS (informado). Admin: solo "Usuario" al invitar, sin "Cambiar rol", menú solo en filas `user`, subtítulo correcto. |
| CA-57 | PASS (informado). User: sin "Usuarios" en el sidebar y vista "No tienes acceso a Usuarios" con "Volver al inicio". |
| CA-58 | PASS (informado). Regresión de CA-30 a CA-33, CA-43 a CA-45 y CONTACT-1. Pantallas 01, 04, 07, 11, 12, 14, 15 y 16 en claro y oscuro, con teclado y a 375 px. |

## 4. Aclaraciones del propietario y criterios aplicados

- **CA-14.** El propietario aceptó en el chat (2026-11-09) que una sola sentencia `UPDATE` con condiciones que impiden modificar la fila `superadmin` y que afecta 0 filas cumple CA-14, con verificación por tests. La letra de la spec sigue diciendo "lanzan sin `update`"; la aceptación respeta R43 (una sola sentencia sin lectura previa).
- **"Ya revocada" en Clerk.** No hay un código de error documentado para una invitación ya revocada en `@clerk/backend` 7.9.25 ni en `@clerk/shared`. El comentario de `revokeInvitation` solo dice "Only active (i.e., non-revoked) invitations can be revoked.", y el único código parecido, `invitation_account_not_exists`, no aplica. Se aplica la alternativa segura de "Diseño técnico": solo HTTP 404 cuenta como hecho, y cualquier otro error aborta sin tocar la base.
- **Caso límite aceptado.** Si se escribe en el buscador y se pulsa un enlace externo antes de 300 ms, la búsqueda pendiente navega con los filtros anteriores.

## 5. Pendientes para una fase posterior (no forman parte de AUTH-3)

- Mover `displayName` y `formatLastAccess` a `modules/users/utils/`, con su test.
- Actualizar el contrato de `modules/users/index.ts` en la spec para incluir `usersQuerySchema`.
- Subir `SectionLabel` a `components/shared/`: su clase ya está en tres sitios (`AppSidebar`, `modules/account` y `modules/users`).
- Usar `git grep --untracked` en los comandos de alcance de las fases futuras.
- Opcional: comprobar con `Object.hasOwn` la clave de `ORDER_BY` si el `query` del service llega alguna vez por una vía sin validar.
