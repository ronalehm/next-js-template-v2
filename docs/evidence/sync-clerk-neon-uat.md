# Registro UAT: sync-clerk-neon (SYNC-1)

Formato: `docs/forms/uat.md` (secciones 5 y 6). Checkpoint de cierre de ronda, previo al merge. Iniciativa SYNC-1 · PR #24 · rama feat/sync-1-analysis · commit probado 036781c12cc81a1402fabde26c801f4bac79d09a · fecha 2026-11-10 · alcance: PR. Este registro es un archivo informativo nuevo: no altera la spec firmada ni `approvals.jsonl`, no sustituye la aceptación funcional del propietario ni habilita el merge.

## Gate de inicio de ronda

- gate: obligatorio
- Justificación: el PR añade una acción que cambia estado, roles e invitaciones.
- alcance: PR
- PR: #24 · Rama: feat/sync-1-analysis · Commit exacto: 036781c12cc81a1402fabde26c801f4bac79d09a

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | CUMPLE: PR #24, rama feat/sync-1-analysis, commit 036781c |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | CUMPLE: CI GitHub checks, audit y Dependabot SUCCESS; reviewer técnico APROBADO (revisión completa, merge con origin/main/SEC-1 y focalizadas) |
| 3 | Copia local o entorno de pruebas del commit del PR | CUMPLE: copia local del commit con `.env.local` de desarrollo |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | CUMPLE: Clerk (sk_test_/pk_test_, environment_type development) y Neon (base neondb, project_id withered-dawn-78610039, endpoint ep-raspy-truth-b642kk9x) confirmados como DEV por el propietario, aislados de producción (no existe PROD). La rama de Neon no se pudo determinar por API (sin NEON_API_KEY); la confirmó el propietario |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | CUMPLE: alcance funcional y casos UAT-1…UAT-6 |
| 6 | Instrucciones sencillas para el usuario funcional | CUMPLE: instrucciones entregadas una por vez |

## Registro UAT compacto

Entorno verificado: variables presentes e iguales entre template-v2-sync y template-v2-sec (verificado por hash, sin exponer valores); app con `npm run dev` en http://localhost:3000; Clerk DEV y Neon DEV. Cuentas iniciales: 1 superadmin activo vinculado, 1 admin activo vinculado, 1 user invitado sin vincular (no se reutilizó ni modificó). Cuenta descartable nueva: rol user, id8 38e8d9f0; validada APTA en solo lectura (única fila user activa vinculada, cuenta viva en Clerk, correo verificado coincidente). alcance: PR.

Verificación de código: Recuperar acceso · /dashboard/users (menú «Más acciones para <nombre>» en UsersView.tsx; diálogo RecoverUserDialog.tsx; action recoverUserAccessAction; service recoverUserAccess) · commit 036781c

### Pruebas

Todas las pruebas de esta tabla son manuales, validadas por el propietario en DEV sobre el commit 036781c. Las automatizadas no se cuentan como validación manual.

| Prueba | Tipo | Estado de resultado | Commit exacto | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| UAT-1 | manual | PASS | 036781c | Solo lectura. Superadmin (fila propia) sin «Recuperar acceso»; usuario Invitado sin; admin Activo con | ajena → PASS vigente (sin commits posteriores a 036781c en la ronda) |
| UAT-2 | manual | PASS | 036781c | Cuenta existente en Clerk: la recuperación se rechaza sin cambios | ajena → PASS vigente (sin commits posteriores) |
| UAT-3 | manual | PASS funcional | 036781c | Identidad descartable eliminada de Clerk DEV; recuperación exitosa; la fila pasó a Invitado | ajena → PASS vigente (sin commits posteriores) |
| UAT-4 | manual | PASS parcial | 036781c | Validado: tras recuperar, la fila pasó a Invitado y «Recuperar acceso» desapareció (protección de UI, rowActions.recover). NO ejecutado manualmente: el reintento directo a la server action sobre la fila ya recuperada; cobertura solo por la prueba automatizada AC-11 (RN-07), que no cuenta como validación manual. Evaluado y aceptado como PASS parcial por el reviewer | ajena → PASS vigente (sin commits posteriores) |
| UAT-5 | manual | PASS funcional | 036781c | Aceptada la nueva invitación: nueva identidad en Clerk, usuario de nuevo Activo; el propietario verificó que no hay duplicados en Neon | ajena → PASS vigente (sin commits posteriores) |
| UAT-6 Parte A | manual | PASS | 036781c | Para la fila admin la casilla de identidad es obligatoria y el botón queda deshabilitado hasta marcarla. Además (fuera de lo planeado) el propietario marcó la casilla y confirmó: la operación se rechazó por existir la cuenta en Clerk (sin cambios) | ajena → PASS vigente (sin commits posteriores) |
| UAT-6 Parte B | manual | PASS | 036781c | Como admin, no hay «Recuperar acceso» sobre el superadmin ni sobre sí mismo; sí sobre un user activo. Al pulsarlo sobre ese user: «La cuenta todavía existe en el proveedor de acceso. No hay nada que recuperar.» (sin cambios) | ajena → PASS vigente (sin commits posteriores) |

Ante un commit nuevo: evaluar impacto y revalidar lo afectado; permisos y autorización se revalidan siempre si el cambio toca su área.

### Evidencia y alcance de la verificación

Evidencia: reporte del propietario en el chat de la ronda. NO se adjuntaron capturas.

**Verificado manualmente (propietario, DEV):** UAT-1 a UAT-6 según la tabla anterior.

**Cubierto por pruebas automatizadas (no cuenta como PASS manual):** Vitest 573 tests, eslint y build PASS, aprobados por el reviewer previamente; no repetidos en esta ronda. Incluye AC-11 (RN-07), AC-09, AC-20/AC-21 y los errores de Clerk.

**Verificado contra Clerk DEV por llamadas de solo lectura / limpieza controlada:** AC-05 (404 + resource_not_found); AC-19 (invitación pendiente duplicada: 400 duplicate_record).

### Reservas de cobertura manual

No probado manualmente (no son PASS):

- Reintento directo a la server action sobre una fila ya recuperada (UAT-4).
- Filas revoked.
- Rama «cuenta existente» de AC-19 con Clerk real (solo mock; la invitación pendiente duplicada sí se verificó contra Clerk DEV: 400 duplicate_record).
- Errores 401/403/429/5xx/red de Clerk (solo automatizados).
- Rechazo en servidor cuando falta la casilla de identidad de un admin (AC-20/AC-21 solo automatizado; la UI deshabilita el botón).
- Recuperación real de una cuenta admin huérfana.
- Carrera de dos ejecuciones simultáneas (AC-09 solo automatizado).
- Integración y E2E automatizados contra Neon/Clerk reales: NO EJECUTADO.

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SYNC-1-ADJ-01 | Verificación de entorno (seguimiento de seguridad, separado del PR) | Durante la verificación de entorno de esta ronda, un error de parseo imprimió la cadena de conexión de la base DEV de Neon en el log de la sesión del agente (no en informes ni en el repo). Recomendación: rotar la contraseña del rol DEV y actualizar los `.env.local` de template-v2-sync y template-v2-sec si el log se conserva. No se incluye ningún secreto en este registro | TECHNICAL-CRITICAL (seguridad) | Según criterio del propietario | Pendiente (propietario) | — | Fuera del alcance del PR #24 | — | — | Propietario | evidencia pendiente / decisión del propietario. No bloquea el código del PR |
| SYNC-1-ADJ-02 | UAT-3 | Texto de éxito «Acceso recuperado. Se envió una invitación nueva.» no fijado en la spec. Mejora menor no bloqueante; propuesta: registrarlo en la spec si se desea | UX | Baja | Pendiente (propietario) | — | — | — | — | Propietario | evidencia pendiente / decisión del propietario |
| SYNC-1-ADJ-03 | UAT-2 | AC-19 con evidencia real solo para invitación pendiente duplicada (400 duplicate_record); la rama «cuenta existente» solo con mock. No bloqueante | Cobertura de evidencia | Baja | Pendiente (propietario) | — | — | — | — | Propietario | evidencia pendiente / decisión del propietario |

## Cierre de ronda

- UAT-1, UAT-2, UAT-3, UAT-5, UAT-6 (A y B): PASS. UAT-4: PASS parcial.
- Sin commits nuevos tras 036781c: ajena → PASS vigente.
- Pendiente: aceptación funcional formal del propietario y decisión de merge (el APROBADO del reviewer no sustituye la aceptación funcional).
- Riesgos residuales: invitación huérfana en Clerk si fallan el UPDATE y la revocación compensatoria (RN-06/RN-07); ver reservas de cobertura manual.
