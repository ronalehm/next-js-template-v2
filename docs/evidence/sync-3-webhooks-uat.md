# SYNC-3 — Registro de UAT (webhook Clerk user.deleted)

- **Fecha de la ronda:** 10–11 de noviembre de 2026 (America/Lima).
- **Modo:** build (registro documental, sin edición del comportamiento).
- **Alcance:** PR #31 — [feat(sync-3): webhooks Clerk y señales persistentes](https://github.com/ronalehm/next-js-template-v2/pull/31).
- **Rama:** `feat/sync-3-webhooks` → `main`. **Commit funcional revisado antes de esta evidencia:** `ac7996ad3d65e166e81c444199faf9272ffbea44`.
- **Spec aprobada:** `docs/specs/sync-3-webhooks.md`, hash registrado `83c3d67398237f293171644c388aacce5ee8a353727f157c006e95ebaae9d4d2`.
- **Entorno:** Next.js 16.4.5 local (puerto 3003), Clerk **Development**, endpoint de webhook vía ngrok y Neon **development** (`neondb`). PostgreSQL desechable separado para AC-21. **Producción excluida.**
- **Origen de evidencia:** pruebas del propietario con capturas del panel Clerk, respuestas HTTP y logs en terminal; verificaciones puntuales de solo lectura en Neon DEV. Las capturas y la transcripción original están en la sesión UAT; **no** se adjuntan a GitHub ni se reproducen firmas, secretos, correos ni IDs de Clerk.
- **Resultado global:** U-1 a U-6 y U-10 PASS; U-7 PASS CON OBSERVACIÓN; U-8 y U-9 PASS **reportados por el propietario**. La aceptación funcional no es autorización para merge ni sustituye los gates técnicos.

## Gate y trazabilidad

| Condición de `docs/forms/uat.md` | Resultado |
|---|---|
| PR, rama y commit identificables | PR #31, `feat/sync-3-webhooks`, SHA funcional indicado arriba |
| Revisión técnica previa | Reviewer Opus sin bloqueantes, según descripción original del PR; CI de ese SHA con conclusión `success` (run 42899546524) |
| Copia de prueba | Worktree local `template-v2-sync-webhooks` usado en las pruebas; el SHA exacto en ejecución **no se capturó con `git rev-parse`** en esta conversación |
| Aislamiento | Clerk Development, Neon development y PostgreSQL desechable; sin operaciones en producción en esta ronda |
| Casos definidos | U-1 a U-10 en `docs/specs/sync-3-webhooks.md` |
| Validación humana | Instrucciones ejecutadas y resultados comunicados por el propietario |

**Verificación funcional previa:** `POST /api/webhooks/clerk`, `/dashboard/users` y `modules/users/services/users.service.ts`; especificación y código consultados sobre `ac7996ad3...`. Los resultados UAT quedan ligados a esa versión de la rama **con la salvedad** de que no se obtuvo el SHA de ejecución local. Ante cambios de implementación, verificar impacto y revalidar las pruebas afectadas.

## Registro compacto de casos manuales

| Caso / objetivo | Medio / rol | Estado inicial y pasos | Esperado | Observado y estado | Evidencia / recuperación | Dependencia |
|---|---|---|---|---|---|---|
| **U-1** Entrega firmada | Clerk DEV, endpoint público / propietario | Enviar ejemplo firmado y POST sin firma | 200 `ok`/`ignored`; sin firma 400 | **PASS**: firmado 200 `ok`, sin firma 400 | Panel Clerk y terminal; ID sintético sin fila correspondiente | — |
| **U-2** Eliminación real | Clerk DEV y Neon DEV / superadmin | Cuenta descartable `active`; eliminar solo identidad Clerk | 200; señal persiste; rol, estado y `updated_at` no cambian | **PASS**: señal registrada; estado/rol preservados | Lectura Neon y log de entrega; cuenta tratada por SYNC-1 posteriormente | U-1 |
| **U-3** Advertencia UI | `/dashboard/users` / superadmin | Tras U-2, cargar usuarios con Clerk sano | «Identidad no encontrada» y «Recuperar acceso» | **PASS visual**: ambos visibles | Observación del propietario; fusión con Clerk no disponible cubierta **solo** por pruebas automatizadas AC-14 | U-2 |
| **U-4** Idempotencia en identidad vinculada | Clerk Message Attempts y Neon DEV / propietario | Cuenta descartable `user/active` aún vinculada; eliminar identidad y reproducir **el mismo** evento antes de recuperar acceso | 200 en ambas entregas; segunda actualización 0 filas | **PASS**: 8:51 y replay 8:56, ambos HTTP 200 `ok` | Capturas Clerk; `xmin` 69636→70657 en primera entrega y **70657** tras replay; `updated_at` y rol/estado intactos; no ejecutar recuperación todavía | U-2 |
| **U-5** Recuperación y replay antiguo | `/dashboard/users`, Clerk DEV y Neon DEV / superadmin | Recuperar acceso de primera cuenta desechable y reenviar evento antiguo | Estado `invited`, `clerk_user_id` nulo; replay 200 sin efectos | **PASS** según ejecución previa: señal antigua inerte y recuperación preservada | Revisión Neon en la ronda anterior; cuenta se revinculó posteriormente y cambió de estado | U-4 (flujo conceptual; validada en ciclo anterior) |
| **U-6** Firma inválida | `curl` hacia ruta / propietario | Firmas inválidas y cabeceras `svix-*` ausentes | HTTP 400, sin efectos | **PASS**: HTTP 400 en ambas variantes | Terminal y lectura Neon | U-1 |
| **U-7** Sin signing secret | Servidor local temporal DEV / propietario | Proceso de prueba sin `CLERK_WEBHOOK_SIGNING_SECRET` efectivo | HTTP 500 `misconfigured` y log `missing_secret` | **PASS CON OBSERVACIÓN**: 500 `misconfigured` confirmado; **no** se verificó de forma independiente el log `missing_secret` | Respuesta HTTP de instancia temporal; secreto restaurado en principal | U-1 |
| **U-8** Privacidad de logs | Terminal Next.js / propietario | Inspeccionar logs del webhook de la ronda | Solo códigos, pasos y estado, sin PII ni credenciales | **PASS reportado por propietario** | Muestra observada: `{ code: 'invalid_signature', status: 400 }`; U-10 mostró `{ code: 'db_error', step: 'record', status: 500 }`; la inspección exhaustiva de todos los logs no fue auditada independientemente | U-2 |
| **U-9** Autorización por rol | `/dashboard/users` / admin y superadmin | Revisar listado, diagnósticos de identidad y acciones permitidas sin ejecutarlas | Admin gestiona solo `user`; superadmin conforme a matriz; no se filtra diagnóstico a roles no gestionables | **PASS reportado por propietario** para ambos roles | Confirmación funcional del propietario; sin capturas técnicas de cada permiso en el repositorio | U-2 |
| **U-10** Fallo y reintento | Servidores locales 3010/3003 / propietario | Enviar **el mismo payload firmado** primero con DB inaccesible (3010), luego con Neon DEV funcional (3003) | Primero 500 `retry`, después 200 `ok` | **PASS**: 500→200; log `db_error` en 3010 | Terminal; ID de evento sintético sin coincidencia en `app_users`: valida recuperación de ruta, **no** creación de señal de fila real (esa persistencia se acredita en U-2/U-4) | U-2 |

### Detalle adicional verificable: U-4

La fila descartable usada para U-4 permaneció `role=user`, `status=active` y con identidad almacenada. Antes de la primera entrega no existía señal de eliminación vigente. Tras la primera entrega la señal coincidía con la identidad vinculada; al revisar Neon después del replay, `xmin=70657` permaneció igual y `updated_at` seguía sin cambios. La fila usada para esta prueba debe tratarse como **dato desechable pendiente de limpieza autorizada**; no se eliminó la fila ni se ejecutó «Recuperar acceso» en esta etapa de U-4.

### Detalle adicional verificable: U-10

Se evitó interferencia de procesos Next.js locales al reiniciar el servidor principal con entorno limpio y usar `localhost`. La conexión independiente a Neon DEV devolvió `DB_CONNECTION_PASS`. Con el **mismo mensaje firmado**, el servicio con base deliberadamente inaccesible devolvió 500 `retry` y el servidor principal devolvió 200 `ok`. El log del fallo fue `{ code: 'db_error', step: 'record', status: 500 }`. El evento sintético no correspondía a una cuenta real.

## Verificaciones técnicas separadas de la UAT

| Verificación | Evidencia y límite |
|---|---|
| AC-21 — migración en PostgreSQL desechable | **PASS reportado en ronda técnica previa:** aplicar `0005` → SKIP en segunda ejecución → down manual transaccional → reaplicar. La salida detallada permanece en el registro de ejecución local; no se incorpora como log versionado aquí |
| AC-07 — duplicados y concurrencia | **PASS en prueba SQL previa**: primera actualización 1 fila, segundo concurrente 0, replay 0; U-4 confirma además duplicado real desde Clerk DEV |
| Integración Neon DEV | Migración `0005_app_users_clerk_deleted_user_id.sql` aplicada **solo en development** por autorización previa del propietario. Lectura de solo consulta el 11/11: una fila en `schema_migrations` para `0005`; columna `clerk_deleted_user_id` tipo `text`, nullable; 5 `app_users` tras crear la cuenta de U-4 |
| Tests y build previos al UAT | Según descripción original del PR: Vitest 854 PASS / 7 skipped preexistentes, TypeScript, lint, hooks y build Webpack PASS. Re-ejecutados el 2026-11-11 sobre `ac7996a`: ver fila «Re-verificación independiente» |
| GitHub Actions del código probado | Workflow CI, run 42899546524, `completed/success` sobre `ac7996ad3d65e166e81c444199faf9272ffbea44` |
| Re-verificación independiente (2026-11-11, agente, worktree con `node_modules` propio, sobre `ac7996a`) | `npm run lint` PASS; `npx tsc --noEmit` PASS; `npm run build` (`next build`, Next 16, sin junction) PASS, ruta `/api/webhooks/clerk` en el manifiesto; `npx vitest run` 854 PASS / 7 skipped en la última ejecución. En dos ejecuciones completas previas falló 1 prueba de `modules/users/components/DeleteUserDialog.test.tsx` (ajeno al diff; aislado pasa 3/3; sin análisis de causa), tratada como inestabilidad bajo carga |
| Build Turbopack limpio | **PASS** (ver fila anterior); sustituye la limitación previa de junction |
| Gobierno SDD | Especificación y firma sin editar; `docs/specs/approvals.jsonl` sin editar. Este documento es informativo, no sustituye el reviewer ni autorización de merge |

## Evaluación de impacto del commit documental

Este registro agrega exclusivamente `docs/evidence/sync-3-webhooks-uat.md`. No modifica endpoint, SQL, permisos, UI, dependencias, specs ni secretos; por ello los resultados funcionales previos no son afectados por el **contenido** de este commit documental. CI sobre el nuevo SHA, revisión de diff y condiciones de merge deben evaluarse de nuevo. Si hay cambios de implementación posteriores, se aplica la regla de revalidar lo afectado (en especial seguridad, integridad, aislamiento y permisos).

## Cierre / pendientes para autorización humana

- **Funcional:** U-1–U-10 ejecutados con matices de evidencia indicados (U-7 con observación; U-8 y U-9 reportados).
- **Pendiente técnico/documental:** verificar CI del nuevo commit, revisar diff del PR, y completar verificación/reviewer correspondiente.
- **Seguridad:** no publicar secretos ni headers de firma; no tocar producción. La cuenta descartable vinculada con señal vigente no se recupera ni elimina automáticamente.
- **Decisión:** este documento **no autoriza merge** a `main`, despliegues ni migraciones a producción. La decisión sigue en manos del propietario conforme a `docs/SETUP.md`.

