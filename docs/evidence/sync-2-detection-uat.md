# Registro UAT: sync-2-detection (SYNC-2)

Formato: `docs/forms/uat.md` (secciones 5 y 6). Checkpoint de cierre de ronda, previo al merge. Iniciativa SYNC-2 (spec `sync-2-detection`) · PR #30 · rama feat/sync-2-detection · commit probado 2c42f3228ea1fb01dbeb594a1c1fac5707925fe5 · fecha 2026-11-10 · alcance: PR. Este registro es un archivo informativo nuevo: no altera la spec firmada ni `approvals.jsonl`, no equivale a `apruebo`, no sustituye la aceptación funcional del propietario y ninguna de sus notas habilita el merge.

## Gate de inicio de ronda

- gate: obligatorio
- Justificación: el PR añade detección de identidades huérfanas de Clerk en la lista y el detalle de usuarios, con consultas a un proveedor externo y presupuesto de tiempo.
- alcance: PR
- PR: #30 · Rama: feat/sync-2-detection · Commit exacto: 2c42f3228ea1fb01dbeb594a1c1fac5707925fe5

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | CUMPLE: PR #30, rama feat/sync-2-detection, commit 2c42f32 |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | CUMPLE en cuanto a CI: PASS. Aprobación del reviewer no verificada por este registro (ver Pendientes documentales) |
| 3 | Copia local o entorno de pruebas del commit del PR | CUMPLE: copia local del commit, entorno DEV |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | CUMPLE (declarado por el propietario): entorno DEV de Clerk y Neon |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | CUMPLE: casos U-1 a U-8 definidos en la spec `sync-2-detection` |
| 6 | Instrucciones sencillas para el usuario funcional | CUMPLE (declarado): pruebas ejecutadas por el propietario |

## Registro UAT compacto

Entorno: DEV (Clerk y Neon de desarrollo), app local con `npm run dev`. alcance: PR.

Verificación de código: detección de identidades huérfanas · /dashboard/users (lista, detalle y «Recuperar acceso») · commit 2c42f32.

### Pruebas

| Prueba | Tipo | Estado de resultado | Commit exacto | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| U-1 | manual | PASS | 2c42f32 | Objetivo: con cuenta viva en Clerk, sin advertencia, detalle «Verificada», fila invitada «Sin vincular». Declarado: identidad existente «Verificada»; «Sin vincular» observado durante U-5 | ajena → PASS vigente (sin commits posteriores a 2c42f32 en la ronda) |
| U-2 | manual | PASS CON OBSERVACIÓN | 2c42f32 | Objetivo: cuenta eliminada de Clerk detectada, Neon sin cambios, demás filas verificadas. Declarado: identidad eliminada detectada en tabla y detalle; la fila conservó estado Activo (comprobado visualmente). Sin evidencia directa contemporánea de Neon | ajena → PASS vigente; observación menor SYNC-2-ADJ-01 (limitación de evidencia) incluida |
| U-3 | manual | PASS | 2c42f32 | Objetivo: «Recuperar acceso» presente y sin efectos por solo cargar. Declarado: «Recuperar acceso» disponible; la recuperación no debía ejecutarse en esta prueba (se cubre en U-5) | ajena → PASS vigente |
| U-4 | manual | PASS | 2c42f32 | Declarado (rol admin): 5/5 comprobaciones PASS, desglose en «Detalle U-4»; «Recuperar acceso» no ejecutado | afectada si un commit toca permisos → revalidar siempre |
| U-5 | manual | PASS | 2c42f32 | Objetivo: recuperación como en SYNC-1; fila pasa a Invitado y la advertencia desaparece. Declarado: recuperación del usuario «marketing dev» PASS, invitación creada, estado Invitado, «Sin vincular» | ajena → PASS vigente |
| U-6 | manual (observación) | PASS | 2c42f32 | Objetivo: log sin emails, ids de Clerk ni `DATABASE_URL`. Declarado: sin información sensible en los logs del flujo normal. No se provocaron errores reales ni se exigía (límite de cobertura SYNC-2-ADJ-02) | ajena → PASS vigente |
| U-7 | automatizada | PASS | 2c42f32 | Observado/automatizado: `vitest` 174/174 PASS | ajena → PASS vigente |
| U-8 | manual | PASS | 2c42f32 | Objetivo: carga ≈5 s, filas «Sin verificar», sin falsos positivos. Declarado: DNS desviado a 127.0.0.1, timeout ≈5 s y «Sin verificar» confirmados; sin advertencia falsa; logs seguros; `hosts` restaurado | ajena → PASS vigente |

### Datos por caso

Fecha de todas las pruebas: 2026-11-10. «No registrada» = el propietario no lo declaró.

| Prueba | Fecha / hora | Rol | Estado inicial | Resultado | Recuperación | Evidencia disponible |
|---|---|---|---|---|---|---|
| U-1 | 2026-11-10 / No registrada | superadmin (plan de la spec) | No registrada | PASS | No registrada | Solo declaración del propietario |
| U-2 | 2026-11-10 / No registrada | superadmin (plan de la spec) | No registrada | PASS CON OBSERVACIÓN | No registrada | Solo declaración; comprobación visual en UI; sin evidencia directa contemporánea de Neon |
| U-3 | 2026-11-10 / No registrada | superadmin (plan de la spec) | No registrada | PASS | No registrada (la acción no se ejecutó, por lo que no había nada que recuperar según lo declarado) | Solo declaración del propietario |
| U-4 | 2026-11-10 / No registrada | admin (declarado por el propietario) | No registrada | PASS 5/5 (desglose en «Detalle U-4») | No registrada (la recuperación no se ejecutó) | Solo declaración del propietario (confirmación funcional durante UAT) |
| U-5 | 2026-11-10 / No registrada | superadmin (plan de la spec) | No registrada | PASS | No registrada | Solo declaración del propietario |
| U-6 | 2026-11-10 / No registrada | propietario (plan de la spec) | No registrada | PASS | No registrada | Solo declaración del propietario |
| U-7 | 2026-11-10 / No registrada | No registrada | No registrada | PASS 174/174 | No registrada | Resultado automatizado de `vitest` (reportado) |
| U-8 | 2026-11-10 / inicio 13:53:25, fin 13:54:55 (declarado) | No registrada | No registrada | PASS | `hosts` restaurado (declarado) | Solo declaración del propietario |

### Detalle U-4

Fuente: confirmación funcional del propietario durante UAT (declarado; sin capturas ni logs). Rol: admin. Resultado de las 5 comprobaciones: todas PASS.

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Admin visualiza «Identidad no encontrada» en marketing dev | PASS |
| 2 | Admin visualiza «Identidad: No encontrada» en el detalle | PASS |
| 3 | Admin dispone de «Recuperar acceso», sin ejecutarlo | PASS |
| 4 | Admin no visualiza información de identidad ni recuperación de otros administradores | PASS |
| 5 | Admin no visualiza información de identidad de su propia fila | PASS |

### Evidencia directamente observada

Solo lo que consta objetivamente:

- CI del PR #30: PASS.
- `vitest`: 174/174 PASS (prueba U-7, automatizada). No cuenta como validación manual.

### Reporte del propietario

Todo lo siguiente es declarado por el propietario, sin capturas ni logs adjuntos:

- U-1 a U-6 y U-8 según las tablas anteriores (U-1 «Sin vincular» observado durante U-5).
- U-4: 5/5 comprobaciones PASS con rol admin, desglose en «Detalle U-4»; «Recuperar acceso» no se ejecutó.
- U-8: ventana de ejecución 13:53:25 a 13:54:55; restauración de `hosts` confirmada.

### Limitaciones residuales

- U-2: sin evidencia directa contemporánea de Neon; el estado Activo se comprobó visualmente en la UI (SYNC-2-ADJ-01, observación menor).
- U-6: límite de cobertura, no defecto: no se provocaron errores reales ni se exigía; solo se revisaron logs del flujo normal (SYNC-2-ADJ-02).
- No se adjuntaron capturas ni logs.

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SYNC-2-ADJ-01 | U-2 | Limitación de evidencia: el estado Activo en Neon no tiene evidencia directa contemporánea; solo se comprobó visualmente en la UI | Cobertura de evidencia (observación menor) | Baja | Incluida (propietario) | — | — | — | — | Propietario | resultado manual confirmado |
| SYNC-2-ADJ-02 | U-6 | Límite de cobertura, no defecto: no se provocaron errores reales ni se exigía; los logs revisados son del flujo normal | Límite de cobertura | Informativa | Reformulada (propietario) | — | — | — | — | Propietario | resultado manual confirmado |

Rechazada por el propietario: SYNC-2-ADJ-03 (U-3) no penaliza U-3. No figura en la lista activa.

## Pendientes documentales

- Confirmar y registrar la aprobación técnica del reviewer sobre el commit 2c42f32 (el gate 2 solo constata CI PASS).
- Horas de U-1 a U-7, roles de U-7 y U-8 y estados iniciales/recuperaciones no declarados («No registrada»).
- Capturas o logs de apoyo: no adjuntos.
- Evidencia directa de Neon para U-2: opcional, cubierta por la observación menor SYNC-2-ADJ-01.

## Informe de aceptación UAT

- Resultados: U-1, U-3, U-4, U-5, U-6, U-7, U-8 PASS; U-2 PASS CON OBSERVACIÓN (limitación de evidencia menor). Sin FAIL ni BLOQUEADO.
- Sin commits nuevos tras 2c42f32: ajena → PASS vigente.
- Aceptación funcional: decisión expresa del propietario, «UAT ACEPTADA», que cubre U-1 a U-8 incluida la observación menor de U-2 (SYNC-2-ADJ-01). La aceptación UAT no equivale a `apruebo` de spec ni autoriza merge; el merge lo decide el propietario. Las limitaciones de evidencia (sin capturas ni logs, horas «No registrada», Neon de U-2 vía SYNC-2-ADJ-01, aprobación del reviewer no verificada) siguen vigentes.

Decisión del propietario:

- [x] Acepto funcionalmente SYNC-2 con los riesgos residuales y pendientes descritos. Aceptada por el propietario en el chat, 2026-11-10; hora: No registrada.
