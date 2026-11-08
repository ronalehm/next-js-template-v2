# Evidencia: AUTH-2.2 (perfil personal, persistencia y sincronización de identidad)

**Estado: AUTH-2.2 COMPLETADA — VALIDACIÓN LOCAL (2026-11-08).** Automáticas y manuales (CA-42 a CA-45) en PASS, sin bloqueantes. Sin commit, push ni merge.

- Spec: `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-2.2`, aprobada el 2026-11-08T17:39:48Z.
  - Hash de la declaración: `0a9ec4e8…3da8c` (coincide con la línea de `docs/specs/approvals.jsonl`).
  - Firma SSH: `docs/specs/auth-clerk-neon.md.sig`.
- Rama `feat/auth-profile`, worktree `C:/Users/ronal/template-v2-profile`, base `main` en `18a2414`.

Origen de cada resultado:
- **Verificado:** lo ejecutó un agente y su salida estaba a la vista.
- **Informado:** lo ejecutó el propietario y lo comunicó en el chat.

## 1. Aprobación (verificado)

- `ssh-keygen -Y verify` sobre la declaración del hook: `Good "spec-approval" signature`.
- La spec no cambió después de la aprobación. Sin cambios en archivos de gobierno.

## 2. Automáticas (verificado; dictamen del Reviewer: APROBADO en el ciclo 1, sin bloqueantes)

| Criterio | Resultado |
|---|---|
| CA-34 | PASS. `profile.schema.test.ts`: recorte, vacío a `null`, límites de longitud, fecha inválida, futura o anterior a 1900, URL `javascript:`, `ftp:` y sin protocolo, `field` desconocido y clave extra `userId`. |
| CA-35 | PASS. `profileFields.test.ts`: orden de R30 y fecha larga en español. |
| CA-36 | PASS. `profile.service.test.ts`: una sentencia por campo sin `select` previo, solo su columna, `userId` como parámetro, clave fuera del mapa lanza sin llamar a la base. |
| CA-37 | PASS. `lib/auth.test.ts`: vinculación con nombres, `syncOwnIdentity` en dos sentencias filtradas por `actor.id`, correo sin verificar, colisión `not exists`, `23505` concurrente, fallos de Clerk o de la base sin lanzar. CA-5 sigue en PASS. |
| CA-38 | PASS por lectura. La acción llama a `getActor()`, comprueba `dashboard:view`, valida con `profileFieldInputSchema` y solo usa `actor.id`. La página encadena `requirePermission`, `syncOwnIdentity` y `getOwnProfile(actor.id)`. SQL parametrizado. |
| CA-39 | PASS con `git grep --untracked`: solo `db/migrations/0002_user_profiles.sql`, `profile.service.ts` y su test. |
| CA-40 | PASS. Tres grupos, encabezado sin tarjeta, sin nota con candado, chevrons solo en filas con acción, sin colores sueltos. |
| CA-41 | PASS. Comando literal, incluidos archivos sin seguimiento: sin salida. `dialog.tsx` idéntico al registro (`shadcn add dialog --dry-run`: `skip (identical)`). |
| CA-9 | PASS. Sin coincidencias. |
| CA-10 | PASS. `npx vitest run` 172/172; `npx vitest run .claude/hooks` 47/47; `npm run lint` exit 0; `npm run build` exit 0, con `/dashboard/profile` dinámica. |

Desviaciones declaradas por los developers y aceptadas por el Reviewer como dentro de la spec:
- `syncOwnIdentity` no escribe si `currentUser()` es `null` o no coincide con el actor.
- Los errores se registran solo con `code` y `message`.
- `birthday` se lee con `to_char(birthday, 'YYYY-MM-DD')`.
- Sin "••••••••" en la fila Contraseña; título del diálogo "Añadir/Editar <campo>"; botón superpuesto a la fila para no anidar el enlace; sitio web enlazado solo si es `http(s)://`; `showCloseButton={false}`; `modules/account/index.ts` sin cambios.

Sugerencia 1 del Reviewer, aplicada con autorización del propietario: `ProfileFieldDialog` fija el valor inicial al montar, así el título y "Quitar" no cambian durante la animación de cierre. Después del ajuste: `npx vitest run` 172/172, `npm run lint` exit 0, `npm run build` exit 0, CA-39 y CA-41 en PASS.

Sugerencia 2 del Reviewer, no aplicada (exige editar la spec): el comando de CA-39 debería usar `git grep --untracked` en fases futuras.

## 3. Manuales (propietario, claves de desarrollo, rama de desarrollo de Neon)

| Criterio | Resultado |
|---|---|
| CA-42 | PASS (informado). `npm run db:migrate` primera ejecución: `SKIP 0001_app_users.sql`, `OK 0002_user_profiles.sql`. Segunda: `SKIP 0001_app_users.sql`, `SKIP 0002_user_profiles.sql`. |
| CA-43 | PASS (informado). Perfil según R30 y R31. |
| CA-44 | PASS (informado). Sin fuga de datos opcionales entre cuentas. |
| CA-45 | PASS (informado). Sincronización de nombre y correo principal según D32; CA-30 a CA-33 siguen en PASS. |

## 4. Alcance posterior al cierre (no forma parte de AUTH-2.2)

Pedido por el propietario el 2026-11-08. No se implementa sin una spec nueva aprobada, porque incluye una migración (`db/migrations/` es ruta sensible).

- **Teléfono:** selector de país con Perú (+51) por defecto; celulares peruanos mostrados como `987 654 321`; guardado en formato internacional (E.164, por ejemplo `+51987654321`); tipo Personal, Trabajo o Casa; un solo teléfono. El tipo necesita la migración incremental `0003` (`0002` ya está aplicada y no se modifica).
- **Sitio web:** anteponer `https://` cuando el valor no trae esquema, sin duplicar protocolos y manteniendo la validación de URL.
- **Correos:** Clerk sigue siendo la fuente y la gestión es con su modal oficial. Solo se listan los secundarios verificados. «That email address is taken» indica que la dirección pertenece a otro usuario de Clerk; no se fusionan ni reasignan cuentas.

Regla funcional confirmada por el propietario: varios correos verificados del mismo Clerk User ID inician sesión en la misma cuenta y resuelven la misma fila de `app_users`; solo el principal se sincroniza con `app_users.email`.
