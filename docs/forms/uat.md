# Plantilla UAT

Formato operativo. Las reglas (gate, roles, autorizaciones, merge, UAT no aplicable, preliminar) viven solo en `docs/SETUP.md`, subsección «UAT y cambios solicitados». Registro por iniciativa: `docs/evidence/<slug>-uat.md`, escrito por un `developer` en `Modo: build` en checkpoints (pausa, cierre de ronda, antes de un PR).

## 1. Ficha de prueba (10 campos)

| # | Campo | Valor |
|---|---|---|
| 1 | ID y objetivo | |
| 2 | Pantalla y ruta verificadas | |
| 3 | Usuario y rol necesarios | |
| 4 | Estado inicial y datos de prueba | |
| 5 | Pasos humanos concretos, uno por uno | |
| 6 | Resultado esperado observable | |
| 7 | Resultado reportado por el usuario | |
| 8 | Evidencia disponible | |
| 9 | Recuperación del estado inicial y siguiente paso | |
| 10 | Depende de (ID de otra prueba o «—») | |

Verificación previa: se registra una vez por ronda y funcionalidad en el registro (sección 6), con el formato `<funcionalidad · rutas · commit | fecha o id de versión de prueba>`.

## 2. Estados de resultado

PASS · PASS CON OBSERVACIÓN · FAIL · BLOQUEADO · NO EJECUTADO

## 3. Ficha de observación (10 campos)

ID: `<INICIATIVA>-ADJ-nn`. La clasificación es un atributo; no renombra el ID.

| # | Campo | Valor |
|---|---|---|
| 1 | Qué ocurre | |
| 2 | Observado vs esperado | |
| 3 | Prueba relacionada | |
| 4 | Qué se propone | |
| 5 | Impacto / riesgo | |
| 6 | Archivos o módulos posiblemente afectados | |
| 7 | Dentro o fuera de la spec vigente | |
| 8 | Ruta aplicable tras la verificación previa | |
| 9 | Pruebas a repetir | |
| 10 | Bloquea el cierre o puede posponerse | |

Decisión del usuario (una): incluir en este ciclo · posponer al backlog · rechazar · solicitar reformulación.

## 4. Clasificación segura

| Tipo | Siguiente paso |
|---|---|
| BUG | Verificación previa |
| VISUAL | Verificación previa |
| UX | Verificación previa |
| FUNCTIONAL CHANGE | Verificación previa |
| TECHNICAL-CRITICAL | Verificación previa |

La ruta no se deriva del tipo ni del tamaño. La etiqueta es provisional.

## 5. Gate de inicio de ronda

Checklist; la regla está en `docs/SETUP.md`, «UAT y cambios solicitados».

- gate: obligatorio | UAT no aplicable
- Justificación: `<...>`
- alcance: PR | preliminar
- PR: `<...>` · Rama: `<...>` · Commit exacto: `<...>`

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | |
| 3 | Copia local o entorno de pruebas del commit del PR | |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | |
| 6 | Instrucciones sencillas para el usuario funcional | |

## 6. Registro UAT compacto

Una línea por prueba y por observación. Entorno verificado: `<...>`. alcance: PR | preliminar.

Verificación de código (una vez por ronda y funcionalidad): funcionalidad | rutas verificadas | commit (o versión preliminar | fecha)

### Pruebas

Separar automatizadas y manuales.

| Prueba | Tipo (automatizada \| manual) | Estado de resultado | Commit exacto (o fecha / id si preliminar) | Qué validó el usuario (cada PASS manual) | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| | | | | | «afectada → revalidar» \| «ajena → PASS vigente» + justificación |

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |

### Estados de ciclo de vida

1. resultado automatizado
2. resultado manual confirmado
3. evidencia pendiente
4. mejora solicitada
5. cambio autorizado
6. cambio implementado y revisado
7. revalidación funcional aceptada

## 7. Formatos breves

Reporte: `prueba · esperado · observado · estado · siguiente acción`

Entrada mínima de observación: `ID · prueba · qué se vio · estado · siguiente acción`

Instrucción al usuario: `pantalla · pasos · esperado · recuperación`
